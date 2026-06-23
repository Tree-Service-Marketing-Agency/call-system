# PRD — Agente de Texto Conversacional (chat IA embebible + panel)

> **Blueprint portable** extraído de la implementación viva de **Bulldog Chat**.
> Describe, para que **otro agente lo reconstruya en otro proyecto**, cómo está
> hecho hoy: el **agente de texto** (LLM + System Prompt versionado + tools), los
> **endpoints**, el **playground** de validación interna, la **visualización de
> mensajes** (lista + hilo + render en vivo) y la **entrega embebible** (widget).
>
> Los snippets son **fragmentos clave** (la función central de cada pieza), no
> archivos completos: muestran el patrón, no el copy-paste literal. Lo específico
> de Bulldog (nombre, zona horaria de Las Vegas, tool de citas contra n8n, idioma
> español) está marcado como tal en §13 — sustitúyelo al portar.
>
> Complementa, no reemplaza: el modelo de dominio canónico vive en `CONTEXT.md` y
> las decisiones en `docs/adr/`. El feature de **llamadas/voz** es otro producto
> (ver `prd-calls.md`) y queda **fuera de alcance** aquí.

---

## 0. Mapa mental

Una sola tubería, tres superficies que la alimentan, una verdad (la DB):

```
┌─────────────────┐     ┌──────────────────┐
│ Widget público  │     │ Playground (admin)│      Superficies de entrada
│ (iframe /widget)│     │ source=playground │
└────────┬────────┘     └─────────┬────────┘
         │ source=widget          │
         └──────────┬─────────────┘
                    ▼
          POST /api/chat  ──────────────►  LLM (OpenRouter, streaming)
          · origin allowlist + rate limit        ▲   │ tools (check_availability)
          · DB = única fuente de verdad           │   ▼
          · system = mecánica code-owned     getActiveSystemPrompt()
            + Active Version del prompt       (tabla prompt_versions)
                    │
                    ▼
          chat_conversations / chat_messages  ◄── editado en /admin/config
                    │
                    ▼
          Panel admin (read-only): lista maestro-detalle + hilo
```

Invariante rector (ADR-003): **el cliente solo manda su último mensaje**; el
servidor reconstruye el contexto leyendo la DB, genera el `conversationId` y lo
devuelve en `X-Conversation-Id`. Ids desconocidos → **404, nunca upsert**.

---

## 1. Alcance

### En alcance
1. **Agente de texto**: proveedor LLM, System Prompt **versionado en DB** con
   puntero activo, composición del `system` en runtime (fecha/hora + reglas
   code-owned), **tool calling** (patrón con `check_availability` de ejemplo).
2. **Endpoints**: `POST/OPTIONS /api/chat` (público, streaming) + server actions
   (guardar/activar prompt, resume del playground).
3. **Playground**: superficie interna donde el admin se hace pasar por visitante.
4. **Visualización de mensajes**: lista maestro-detalle, hilo read-only, render
   de chat en vivo (widget y playground).
5. **Widget embebible**: loader `widget.v1.js` (Shadow DOM + iframe lazy +
   postMessage), página `/widget`, gate `frame-ancestors`.

### Fuera de alcance
- **Llamadas/voz** (Retell, webhooks de call, audio): es otro producto
  (`prd-calls.md`).
- **Billing por mensaje**, **multi-tenant** (`tenant_id`), **RAG**, **roles**.
- **Auth/middleware**: solo se documenta el patrón (§11), no como feature.

---

## 2. Stack y notas de versión

- **Next.js (App Router, RSC)**. El middleware se exporta como `proxy` en
  `proxy.ts` (no `middleware.ts`). ⚠️ Este Next tiene cambios respecto a lo
  conocido: leer `node_modules/next/dist/docs/` antes de codear (ver `AGENTS.md`).
- **React + Tailwind v4 + shadcn/ui**.
- **Vercel AI SDK v6** (`ai`, `@ai-sdk/react`) + **OpenRouter**
  (`@openrouter/ai-sdk-provider`). Gotchas v6 que afectan este blueprint:
  - `useChat` **no** expone `input`/`handleSubmit`; se envía con
    `sendMessage({ text })` y el estado del input lo manejas tú.
  - La respuesta de stream es `result.toUIMessageStreamResponse(...)`.
  - Para que el modelo **redacte tras llamar una tool** hace falta `stopWhen`
    (`stepCountIs(n)`); sin él, el modelo llama la tool y no contesta.
- **Drizzle ORM + Postgres (Neon)**. El cliente pg **no** corre en edge → el
  route de chat usa runtime Node (`maxDuration = 30`).
- **NextAuth (Auth.js v5)** — Credentials contra env (solo panel admin).
- **Upstash** (`@upstash/ratelimit` + `@upstash/redis`) — rate limit serverless.

---

## 3. Modelo de datos

Tres tablas. `chat_conversations` + `chat_messages` (historial) y
`prompt_versions` (el cerebro versionado).

```ts
// lib/db/schema.ts  (fragmento clave)
export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant"]);

// Origen: tráfico real del widget vs prueba interna del playground.
// Default 'widget' → migración no destructiva (filas viejas = widget).
export const chatConversationSourceEnum = pgEnum("chat_conversation_source", ["widget", "playground"]);

export const chatConversations = pgTable("chat_conversations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: chatConversationSourceEnum("source").notNull().default("widget"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversation_id").notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: chatMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // Reconstruye el historial cronológicamente por conversación.
  index("chat_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
]);

// System prompt versionado. Append-only; exactamente UNA versión activa.
export const promptVersions = pgTable("prompt_versions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // Invariante: a lo sumo una activa (índice único PARCIAL).
  uniqueIndex("prompt_versions_active_unique").on(t.isActive).where(sql`is_active`),
  index("prompt_versions_created_idx").on(t.createdAt),
]);
```

**Decisiones que carga el esquema:**
- `id` = UUID generado en app (`crypto.randomUUID()`), no autoincrement.
- `source` con default permite **migración no destructiva** y separar pruebas del
  tráfico real (ADR-0002).
- El **índice único parcial** `WHERE is_active` hace imposible tener dos versiones
  activas a la vez: la invariante la garantiza la DB, no el código.
- No se desnormaliza `last_message_at`: el listado lo calcula con SQL (§4). Si el
  volumen crece, añadirlo es el upgrade conocido.

---

## 4. Capa de persistencia

`lib/chat/persistence.ts` — desacoplada de HTTP y del AI SDK; devuelve `{ role,
content }` planos. Reglas que conserva siempre:

- **id desconocido → `ConversationNotFoundError`** (nunca upsert). El id lo crea
  el servidor; el cliente no elige el suyo.
- `loadHistory` ordena por `createdAt` asc, **desempatado por `id`** (orden
  estable aunque dos mensajes compartan timestamp).

```ts
// Fragmento clave: el contrato de "resolver o crear" la conversación.
export async function resolveConversation(
  id?: string | null,
  source?: ConversationSource,
): Promise<{ id: string }> {
  if (id === undefined || id === null) {
    // Sin id → nace una conversación nueva; el `source` solo aplica al crear.
    const conv = await createConversation(source);
    return { id: conv.id };
  }
  const existing = await getConversation(id);
  if (!existing) throw new ConversationNotFoundError(id); // ← nunca upsert
  return { id: existing.id };
}
```

**Listado con preview (`listConversationsWithTail`)** — patrón en dos pasos para
mostrar en cada fila los **2 mensajes más recientes** sin traer todo el historial:

1. Agregado por conversación (conteo + `max(createdAt)` para ordenar por última
   actividad).
2. **Window function** `row_number() over (partition by conversation_id order by
   created_at desc) where rn <= 2` para el "tail" de cada hilo.

```sql
-- Fragmento clave del paso 2 (los últimos 2 mensajes por conversación):
select conversation_id, role, content from (
  select conversation_id, role, content,
    row_number() over (
      partition by conversation_id order by created_at desc, id desc
    ) as rn
  from chat_messages where conversation_id in (:ids)
) t where rn <= 2 order by conversation_id, rn desc
```

---

## 5. El agente de texto (el cerebro)

### 5.1 Proveedor LLM — `lib/ai.ts`

OpenRouter como gateway; modelo por env con default; el System Prompt **ya no
vive en env** (quedó jubilado, ver ADR-0001) — su fuente es la DB (§5.2) y esta
constante es solo el **fallback** cuando no hay versión activa.

```ts
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const openrouter = createOpenRouter({ apiKey: apiKey ?? "or-unset" });
export const chatModel = openrouter(process.env.OPENROUTER_MODEL || DEFAULT_MODEL);

// Fallback cuando NO hay Active Version en prompt_versions.
export const DEFAULT_SYSTEM_PROMPT =
  "Eres un asistente de IA útil, claro y conciso. Responde en el mismo idioma del usuario.";

export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY no está configurada");
}
```

### 5.2 System Prompt versionado — `lib/prompt/repository.ts`

El cuerpo del System Prompt es la **Active Version** de `prompt_versions`. El
repositorio expone: `getActiveVersion`, `getActiveSystemPrompt` (lo que lee el
endpoint), `listVersions`, `saveNewActiveVersion` y `activateVersion`.

```ts
// El endpoint llama ESTO en cada request (sin cache → cambios al instante).
export async function getActiveSystemPrompt(): Promise<string> {
  const active = await getActiveVersion();
  return active?.body ?? DEFAULT_SYSTEM_PROMPT; // ← fallback hardcodeado
}

// Guardar = crear versión nueva y activarla, en una transacción.
export async function saveNewActiveVersion(rawBody: string): Promise<{ created: boolean }> {
  const body = rawBody.trim();
  if (body.length === 0) throw new Error("El prompt no puede estar vacío.");

  const active = await getActiveVersion();
  if (active && active.body.trim() === body) return { created: false }; // dedupe

  await db.transaction(async (tx) => {
    // Apagar la activa ANTES de prender la nueva: nunca dos activas (respeta el índice único parcial).
    await tx.update(promptVersions).set({ isActive: false }).where(eq(promptVersions.isActive, true));
    await tx.insert(promptVersions).values({ body, isActive: true });
  });
  return { created: true };
}
```

`activateVersion(id)` hace lo mismo pero **mueve el puntero** a una versión
existente (no duplica texto): apaga la activa y prende la del `id` en una
transacción; lanza (y revierte) si el id no existe.

**Por qué así (ADR-0001):** se eligió **puntero activo explícito** (`is_active`)
en vez de "la más reciente gana", para poder **reactivar cualquier versión
pasada sin duplicar su texto**. Nunca se borra una versión (append-only).

### 5.3 Composición del `system` en runtime — `lib/chat/system.ts`

El `system` que recibe el modelo **no** es solo el prompt del admin. Se antepone
una **mecánica code-owned** que el admin no puede romper editando: la fecha/hora
actual (el modelo no sabe qué día es "hoy") y las reglas para usar las tools.

```ts
// Fragmento clave: mecánica ARRIBA, Active Version del admin ABAJO.
export function buildSystemPrompt(activePrompt: string): string {
  return [
    `Fecha y hora actual del negocio: ${formatBusinessNow()} (${BUSINESS_TIMEZONE}).`,
    ``,
    `Tienes la herramienta "${CHECK_AVAILABILITY_TOOL}" para consultar cupos.`,
    `El parámetro "date" va en ISO 8601 con sufijo Z, resuelto con la fecha de arriba:`,
    `- "el martes a las 2pm" → ese instante:  2026-06-23T14:00:00.000Z`,
    `- "el sábado" (solo día) → medianoche:   2026-06-20T00:00:00.000Z`,
    `Solo consultas disponibilidad; no agendas. No inventes cupos: si falla, dilo.`,
    ``,
    activePrompt, // ← el System Prompt del admin, intacto
  ].join("\n");
}

// La zona es un nombre IANA (no offset fijo) → el DST se resuelve solo.
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";
```

**Principio portable:** todo lo que el modelo debe obedecer *con certeza*
(formato de fechas, contrato de tools, "no inventes") vive en código, **encima**
del prompt editable. Un edit del panel da forma a la voz, no rompe la mecánica.

### 5.4 Tool calling — patrón (`lib/chat/tools/check-availability.ts`)

Cómo se le dan herramientas al agente. El ejemplo concreto consulta cupos de
citas contra un webhook de n8n, pero el **patrón reutilizable** es: tool con
`jsonSchema`, `execute` que llama un servicio externo con **timeout**, parseo
**defensivo**, y un **sentinela `{ ok: false }`** para que el asistente nunca
invente cuando el backend falla.

```ts
export const CHECK_AVAILABILITY_TOOL = "check_availability";

export const checkAvailabilityTool = tool({
  description: "Consulta cupos disponibles para un día. Solo consulta; no agenda.",
  inputSchema: jsonSchema<{ date: string }>({
    type: "object", additionalProperties: false,
    properties: { date: { type: "string", description: "ISO 8601 con sufijo Z" } },
    required: ["date"],
  }),
  execute: async ({ date }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000); // timeout duro
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }), signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: "unavailable" }; // sentinela
      return normalize(await res.json()); // parseo defensivo de la forma { data: {...} }
    } catch {
      return { ok: false, reason: "unavailable" }; // timeout/red/JSON inválido
    } finally {
      clearTimeout(timer);
    }
  },
});
```

`normalize()` es defensivo a propósito: un objeto vacío `{}` es válido ("sin
disponibilidad"); `data` ausente o no-objeto = respuesta ininteligible → `ok:
false` (no se afirma nada); valores basura se ignoran. Las "franjas" se tratan
como **dinámicas** (se itera lo que venga) y solo se traducen a lenguaje humano.

> **Específico de Bulldog** (§13): el dominio de citas (franjas mañana/tarde,
> cupos, Las Vegas, n8n). **Reutilizable**: inyectar la fecha en el system + tool
> read-only con timeout + sentinela + multi-step (`stopWhen`).

---

## 6. Endpoints

### 6.1 Endpoints sugeridos (la superficie de API)

| Método · ruta | Auth | Body / input | Devuelve | Propósito |
|---|---|---|---|---|
| `POST /api/chat` | **Público** (origin allowlist + rate limit por IP) | `{ conversationId?, source?, message \| text }` | Stream UI-message + header `X-Conversation-Id` | Chatear con el agente (widget y playground) |
| `OPTIONS /api/chat` | Público | — | `204` + headers CORS (o `403`) | Preflight CORS cross-origin |
| `savePrompt(formData)` *(server action)* | **Admin** | `body` (texto del prompt) | redirect con `?status=` | Crear + activar versión de prompt |
| `activatePrompt(formData)` *(server action)* | **Admin** | `id` | redirect con `?status=` | Mover el puntero activo a una versión existente |
| `loadPlaygroundThread(id)` *(server action)* | **Admin** | `id` | `HistoryMessage[]` | Resume: recuperar el hilo en curso del playground |

> Las superficies de **lectura del admin** (lista y hilo) no son endpoints: son
> **RSC** que leen la DB directo (§9). Solo hay endpoint donde hay mutación o
> tráfico público.

### 6.2 `POST /api/chat` — anatomía

Orden estricto (cada paso corta temprano con su status):

1. **Origin allowlist** → `403` si no permitido.
2. **Rate limit por IP** → `429` si excede.
3. **Parse + validación manual** (sin zod, como el repo): JSON inválido → `400`;
   body no-objeto → `400`; `conversationId` no-string → `400`; `source` inválido
   → `400`.
4. **`extractUserText`**: acepta `body.text` **o** `body.message.parts[].text`
   (el SDK manda el último como UI-message). Vacío → `400`.
5. **`resolveConversation(id, source)`**: id desconocido → `404`; sin id → crea
   con `source`.
6. **`saveMessage(user)` ANTES del stream**, luego **`loadHistory`** (la DB es el
   contexto; el cliente solo aportó su último turno).
7. **`getActiveSystemPrompt()` + `buildSystemPrompt()`** (se lee la versión activa
   en cada request, sin cache).
8. **`streamText`** con tools y persistencia diferida del assistant.

```ts
// Fragmento clave: el corazón del handler (pasos 7–8).
const activePrompt = await getActiveSystemPrompt();      // versión activa, sin cache
const system = buildSystemPrompt(activePrompt);          // mecánica + prompt admin

const result = streamText({
  model: chatModel,
  system,
  messages: history.map((m) => ({ role: m.role, content: m.content })),
  tools: { [CHECK_AVAILABILITY_TOOL]: checkAvailabilityTool },
  stopWhen: stepCountIs(5),     // multi-step: tras la tool, el modelo redacta
  abortSignal: request.signal,
  onFinish: async ({ text }) => {
    const assistantText = text.trim();
    if (assistantText.length === 0) return;
    await saveMessage({ conversationId: id, role: "assistant", content: assistantText });
  },
});

result.consumeStream(); // corre en background (sin await): persiste aunque el cliente se desconecte
return result.toUIMessageStreamResponse({
  headers: { ...headers, "X-Conversation-Id": id }, // CORS + id de la conversación
});
```

**Invariantes (ADR-003):** DB = única verdad; el cliente manda **solo su último
mensaje**; el `conversationId` lo genera **siempre** el backend y viaja en
`X-Conversation-Id`; ids desconocidos → `404`; el `user` se persiste **antes** de
abrir el stream y el `assistant` en `onFinish`; `consumeStream()` + `abortSignal`
garantizan guardar aunque el cliente cierre.

> **Nota `source`:** lo manda el cliente y **solo se usa al crear** una
> conversación. Es **falsificable** (riesgo aceptado, ADR-0002): degrada la
> calidad del listado, no es un fallo de seguridad. Upgrade conocido: derivarlo
> de `auth()` en el handler.

### 6.3 Endurecimiento público

**CORS + origin allowlist (`lib/cors.ts`):** el self-origin (`AUTH_URL`) siempre
va en la lista (caso same-origin del iframe). Sin header `Origin` (curl,
same-origin) se **permite** — el rate limit sigue aplicando; la protección
cross-site real es la lista.

```ts
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // sin Origin → permitido; el rate limit cubre el abuso
  return allowedOrigins().includes(origin.replace(/\/$/, ""));
}
```

**Rate limit (`lib/rate-limit.ts`):** Upstash sliding window **20 / 10 min / IP**,
con **degradación elegante** (sin Upstash configurado no bloquea, solo `warn` — no
rompe dev/build). La IP se saca de `x-forwarded-for`.

```ts
const ratelimit = hasUpstash
  ? new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(20, "10 m"), prefix: "bulldog-chat" })
  : null;

export async function rateLimit(key: string) {
  if (!ratelimit) return { success: true }; // degradación elegante
  return { success: (await ratelimit.limit(key)).success };
}
```

---

## 7. Transporte cliente (`useChat`) — patrón compartido

Widget y playground comparten el mismo patrón de transporte: un
`DefaultChatTransport` que (a) **manda solo el último mensaje** + `conversationId`
(+ `source` en el playground), y (b) un **`fetch` envuelto** que captura
`X-Conversation-Id` para persistir el id en `localStorage` y maneja el `404`
(limpia el id viejo y arranca limpio). Resume = guardar el id en `localStorage`.

```ts
// Fragmento clave (playground; el widget es idéntico salvo la clave y sin `source`).
const transport = new DefaultChatTransport<UIMessage>({
  api: "/api/chat", // same-origin (iframe o panel)
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      conversationId: idHolder.current ?? undefined,
      source: "playground",                  // marca la conversación (solo al crear)
      message: messages[messages.length - 1], // solo el último (DB = verdad)
    },
  }),
  fetch: async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 404) {                 // id viejo/desconocido → empezar limpio
      idHolder.current = null;
      window.localStorage.removeItem(STORAGE_KEY);
    }
    const headerId = res.headers.get("X-Conversation-Id");
    if (headerId) {                           // persistir id para el resume
      idHolder.current = headerId;
      window.localStorage.setItem(STORAGE_KEY, headerId);
    }
    return res;
  },
});
```

> **Claves de `localStorage` separadas** por superficie
> (`bulldog-conversation-id` vs `bulldog-playground-conversation-id`): sirviendo
> ambas desde el mismo origen, una prueba del admin no debe pisar la conversación
> del visitante.

---

## 8. Playground (validación interna del admin)

Tercer ítem del nav (Conversaciones · Calls · **Playground** · Configuración).
El admin se hace pasar por visitante y chatea con el agente para validar la
**Active Version** del prompt antes/después de cambios. Reusa el **endpoint
público** marcando `source: "playground"` (ADR-0002), en vez de crear una ruta
autenticada dedicada.

- **RSC (`page.tsx`)**: carga `getActiveVersion()` + `listVersions()` y arma un
  `versionLabel` ("Versión vN" / "Prompt por defecto"); pasa un `promptPreview`
  (primeras ~150 chars en una línea) al client.
- **Client**: chat con `useChat` (§7), sugerencias clicables, card "Prompt
  activo", botón "Nueva conversación" (abandona el hilo en pantalla — **queda
  guardado** — y el nuevo id nace en el primer mensaje).
- **Resume**: al montar, si hay id en `localStorage`, recupera el hilo desde la
  DB con la server action `loadPlaygroundThread` (un F5 no borra la prueba).

```ts
// Resume del playground: la server action re-verifica auth por sí misma.
export async function loadPlaygroundThread(id: string): Promise<HistoryMessage[]> {
  const session = await auth();
  if (!session) return [];
  return loadHistory(id);
}
```

```tsx
// Fragmento clave: rehidratar el hilo en curso al montar (solo una vez).
useEffect(() => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  void loadPlaygroundThread(stored).then((history) => {
    setConversationId(stored);
    setMessages(history.map((m, i) => ({
      id: `restored-${i}`, role: m.role, parts: [{ type: "text", text: m.content }],
    })));
  });
}, []);
```

> **Por qué persistir las pruebas (ADR-0002):** quedan en las **mismas tablas**
> que el tráfico real, marcadas con `source`. Alternativas descartadas: store
> efímero (contradice el requisito de que queden en el historial) y mezclar sin
> columna (contamina irreversiblemente el historial de clientes).

---

## 9. Visualización de mensajes

Tres vistas distintas para tres contextos.

### 9.1 Lista maestro-detalle (admin)

- **`(conversations)/layout.tsx` (RSC)**: llama `listConversationsWithTail()` y
  mapea cada conversación a una `ConversationRow` (href, `timeLabel` relativo —
  hora hoy / "ayer" / fecha, `tail` en una línea, `search` en minúsculas para el
  buscador client-side).
- **`ConversationsShell` (client)**: split responsive. En `md+` lista + detalle
  conviven; en móvil se ve **uno**: lista en `/admin`, detalle en `/admin/[id]`
  (se decide comparando `pathname` con `/admin`).
- **`ConversationList` (client)**: buscador + filtros (Todas / Clientes /
  Playground con conteos) + filas. Cada fila muestra el **tail de 2 mensajes** con
  prefijo de rol; el último marcado, el penúltimo en gris.

```tsx
// Fragmento clave: lógica del tail (penúltimo gris arriba, último marcado abajo).
const penultimate = len >= 2 ? row.tail[len - 2] : null;
const last = len >= 1 ? row.tail[len - 1] : null;
const top = penultimate ?? last;               // si solo hay 1, va arriba marcado
const topMarked = penultimate === null && top !== null;
const bottom = penultimate ? last : null;      // el último (marcado) cuando hay 2
```

### 9.2 Hilo read-only — `(conversations)/[id]/page.tsx` (RSC)

`getConversation(id)` (→ `notFound()` si no existe) + `loadHistory(id)`. Burbujas
con avatar (User/Bot), etiqueta de rol ("Cliente"/"Asistente"), **badge de
source** (Playground gris / Cliente verde), fecha, y `whitespace-pre-wrap` para
respetar saltos de línea. Es **solo lectura**: no hay composer.

```tsx
// Fragmento clave: una burbuja (alineación + estilo por rol).
<div className={cn("flex items-start gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
  <span>{isUser ? <User/> : <Bot/>}</span>
  <div className={cn("rounded-[15px] px-[15px] py-[11px] text-sm",
    isUser ? "bg-primary text-primary-foreground" : "border bg-card text-foreground")}>
    <p className="whitespace-pre-wrap break-words">{m.content}</p>
  </div>
</div>
```

### 9.3 Render de chat en vivo (widget y playground)

Mismo lenguaje visual: `user` alineado a la derecha (`self-end`, color primary),
`assistant` a la izquierda (`self-start`, card). Detalles compartidos:

- **`messageText(message)`**: concatena las **partes de tipo `text`** del
  UIMessage (ignora otras partes).
- **Indicador de escritura**: cuando `status === "submitted"` se muestran 3 puntos
  animados (aún no llega el primer token).
- **Auto-scroll** al final en cada mensaje/token (`useEffect` sobre
  `[messages, status]`).
- **Error inline**: `error` → línea "Ocurrió un error. Intenta de nuevo."

```ts
function messageText(message: UIMessage): string {
  return message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}
```

---

## 10. Widget embebible (entrega)

Bulldog pega **un solo `<script>`**:

```html
<script src="https://<host>/widget.v1.js" data-color="#3f5ec2" data-title="Bulldog" defer></script>
```

**Loader `public/widget.v1.js`** (vanilla, ~50 líneas, estático y **versionado**:
si cambia, publicas `widget.v2.js` y los embebidos viejos no se rompen). Su único
trabajo: pintar la bolita en **Shadow DOM** (aísla el CSS del sitio anfitrión) y,
**en el primer click**, montar **lazy** un `<iframe>` a `/widget`. Loader↔iframe
hablan por **`postMessage`** validando `event.origin`.

```js
// Fragmento clave: iframe lazy + handshake postMessage.
function mountIframe() {
  iframe = document.createElement("iframe");
  iframe.src = base + "/widget?title=" + encodeURIComponent(title);
  root.appendChild(iframe); // root = shadowRoot
}
function setOpen(next) {
  open = next;
  if (open && !iframe) mountIframe();   // ← la app de Next se carga SOLO aquí
  if (iframe) iframe.style.display = open ? "block" : "none";
}
window.addEventListener("message", function (e) {
  if (e.origin !== base || typeof e.data !== "object") return; // valida origin
  if (e.data.type === "bulldog-chat:close") setOpen(false);
  if (e.data.type === "bulldog-chat:resize" && iframe && e.data.height)
    iframe.style.height = Math.min(e.data.height, window.innerHeight - 120) + "px";
});
```

**Página `/widget`** (`app/widget/page.tsx`): full-page, sin app shell, pensada
para vivir en el iframe; renderiza solo `<ChatWidgetClient/>` (el transporte de
§7 + render de §9.3). El botón "cerrar" hace
`window.parent.postMessage({ type: "bulldog-chat:close" }, "*")`.

**Quién puede embeber — `frame-ancestors` (`next.config.ts`):** el gate **real**
de embed lo da el navegador vía CSP, alimentada por `ALLOWED_ORIGINS`. CORS +
rate limit son **defensa en profundidad** y control de costo, no el gate.

```ts
// next.config.ts — headers() para /widget
{ key: "Content-Security-Policy", value: `frame-ancestors ${ancestors || "'none'"}` }
// ⚠️ NO poner X-Frame-Options: DENY en /widget (rompería el embed).
```

> Como el chat vive en el iframe servido desde **nuestro** origen, las llamadas a
> `/api/chat` son **same-origin** → no ejercen CORS. Por eso el gate es
> `frame-ancestors`, no CORS.

---

## 11. Auth + middleware (nota de patrón)

> No es feature de este PRD; se documenta el patrón porque gatea las superficies
> admin. Sin código completo.

- **`lib/auth.ts`**: NextAuth (Auth.js v5) provider **Credentials** contra
  `AUTH_EMAIL`/`AUTH_PASSWORD` (texto plano por env, **sin tabla `users` ni
  roles**), sesión JWT, comparación de **tiempo constante**. Detalle clave: el
  `safeEq` se implementa con `TextEncoder` (no `node:crypto`) para que el módulo
  sea **seguro de importar desde el middleware** (corre en edge). Sesión =
  `{ id: "admin", email }`.
- **`proxy.ts`** (middleware exportado como `proxy`): rutas públicas
  (`/login`, `/widget`, `/api/chat`, `/api/auth`, …) pasan; el resto (`/admin`)
  exige sesión o redirige a `/login`. `widget.v1.js` vive en `public/` y queda
  fuera del matcher de assets.
- **Server actions = endpoints POST por sí solos**: cada uno re-verifica `auth()`;
  no basta el guard de la página/layout.

---

## 12. Variables de entorno

```bash
# Postgres (Neon)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# NextAuth (solo panel admin). AUTH_URL es además el "self origin" de CORS.
AUTH_SECRET=...
AUTH_URL=https://<host>
AUTH_EMAIL=admin@example.com
AUTH_PASSWORD=cambia-esto

# IA (OpenRouter vía Vercel AI SDK). El system prompt NO va aquí: se edita en
# /admin/config y se versiona en prompt_versions (fallback = DEFAULT_SYSTEM_PROMPT).
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-haiku-4.5

# Orígenes permitidos (coma-separados, sin slash final). Gate principal =
# frame-ancestors del iframe /widget; también alimentan el CORS del endpoint.
ALLOWED_ORIGINS=https://example.com,https://www.example.com

# Rate limit (Upstash). Sin estas, no bloquea (degradación elegante).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Tool de disponibilidad + zona del negocio (específico de Bulldog — ver §13)
AVAILABILITY_WEBHOOK_URL=https://.../webhook/availability-text
BUSINESS_TIMEZONE=America/Los_Angeles
```

---

## 13. Portabilidad: qué es específico de Bulldog

Sustituir al portar el blueprint:

| Específico | Dónde | Reutilizable / generalización |
|---|---|---|
| Nombre "Bulldog", color `#3f5ec2`, 💬 | loader, branding, títulos | Tu marca; `data-color`/`data-title` ya lo parametrizan |
| Idioma **español** | copy de UI y `DEFAULT_SYSTEM_PROMPT` | El prompt responde "en el idioma del usuario"; traduce la UI |
| Zona **Las Vegas** (`America/Los_Angeles`) | `lib/chat/system.ts`, env | `BUSINESS_TIMEZONE` (nombre IANA); inyectar la fecha es el patrón |
| Tool **`check_availability`** (citas, n8n, franjas/cupos) | `lib/chat/tools/*` | El **patrón** (tool read-only + timeout + parseo defensivo + sentinela + multi-step) es lo que se reusa |
| Webhook de n8n | env | Cualquier servicio externo detrás de una tool |

---

## 14. Decisiones clave (semillas de ADR)

1. **DB = única fuente de verdad del historial** (ADR-003 del `prd.md`). El
   cliente manda solo su último mensaje; id server-side en `X-Conversation-Id`;
   404 nunca upsert; `user` antes del stream, `assistant` en `onFinish`,
   `consumeStream()` para sobrevivir desconexión.
2. **System Prompt versionado con puntero activo explícito** (ADR-0001).
   Append-only; índice único parcial `WHERE is_active`; reactivar sin duplicar;
   `CHAT_SYSTEM_PROMPT` jubilada; fallback = `DEFAULT_SYSTEM_PROMPT`.
3. **Mecánica code-owned encima del prompt editable** (`buildSystemPrompt`): la
   fecha/hora y el contrato de tools no se pueden romper desde el panel.
4. **Playground reusa el endpoint público + discriminador `source`** (ADR-0002).
   `source` falsificable = riesgo aceptado (calidad de datos, no seguridad).
5. **Widget loader + iframe lazy protegido por `frame-ancestors` + rate limit**.
   Same-origin dentro del iframe; CORS = defensa en profundidad.
6. **Admin único por env** (sin tabla `users` ni roles); `safeEq` edge-safe.

---

## 15. Deuda y fuera de alcance

- **Historial completo al LLM**: hoy se manda todo (`loadHistory`). En
  conversaciones largas crece costo/contexto → futuro: ventana deslizante o
  resumen.
- **`source` falsificable**: upgrade = derivarlo de `auth()` en el handler.
- **Sin `last_message_at` desnormalizado**: el listado ordena con agregado SQL;
  añadir la columna si el volumen lo pide.
- **Llamadas/voz, multi-tenant, RAG, billing, roles**: fuera de alcance (ver
  `prd-calls.md` para el feature de llamadas).
```

