# ADR-009: Página pública sin password para escuchar la Recording de una Call

**Fecha:** 2026-05-26
**Estado:** Aceptado

## Contexto

Se necesita una página para escuchar la **Recording** de una **Call** **sin login**, compartible por link, pensada para una audiencia amplia (puede llegar al cliente final). La URL esperada es `/audio-call/<call_id>`: el servidor resuelve la **Call** y renderiza el mismo reproductor que ya existe en el detalle.

Esto choca de frente con el modelo actual: la app es **enteramente autenticada**. `proxy.ts` redirige a `/login` cualquier ruta fuera de un allowlist acotado (`/login`, `/api/auth`, `/api/webhooks`, `/api/external`); `/api/calls/[id]` exige sesión, gatea por rol, y hasta oculta `retell_cost` a staff (ADR-003). Introducir una superficie **pública** que sirve audio con PII es una desviación deliberada que un lector futuro cuestionará.

El término "call_id" de la petición era ambiguo entre el `calls.id` interno (UUID) y el `callId` de Retell (`call_…`, único solo junto con `agentId`).

## Decisión

1. **Ruta** `app/audio-call/[id]/page.tsx`, **server component**, fuera de `(dashboard)`. Lee la **Call** directo de la DB por `calls.id`; **no** se crea ningún endpoint público de API.
2. **`proxy.ts`**: añadir `/audio-call` al allowlist público (primera ruta de *página* pública del sistema).
3. **Identificador**: el `<id>` de la URL es el **`calls.id` interno (UUID)**, no el `callId` de Retell.
4. **Minimización de datos**: el servidor selecciona **solo** lo necesario para reproducir (`audio_url`, `created_at` para expiración, fecha/duración neutrales). Nunca transcript, costo, billing ni campos de cliente.
5. **UI**: logo de Lola + título neutro ("Grabación de llamada") + fecha + el mismo reproductor del detalle (`InlineAudioPlayer`, **extraído** a componente compartido con `className` configurable). **Sin** botón de descarga. Mobile-first, tokens de diseño existentes, tema claro como `/login`.
6. **Entrega del audio**: el `<audio src>` apunta **directo a la URL de Retell**, igual que hoy en el detalle.
7. **Estados no reproducibles** (UUID inexistente, **Call** sin `audio_url`, o **Recording** expirada >30 días): un **único mensaje genérico** "Esta grabación no está disponible"; no se revela cuál de los tres ni si la **Call** existe.
8. **Indexación**: `robots: noindex, nofollow` en el metadata de la ruta.
9. **Distribución por n8n**: el webhook `call-ended` (que ya recibe cada llamada terminada de Retell vía n8n) devuelve en su respuesta `{ id, url }`, donde `id` es `calls.id` y `url = ${process.env.AUTH_URL}/audio-call/${id}` (mismo patrón de base URL que el `return_url` del webhook de Stripe). Se devuelve en los **tres** caminos que crean/actualizan una **Call** (`pending`, `void`, `no_ledger`) con status `200`; el caso `event ≠ call_ended` sigue en `204`. Así n8n obtiene el **Public recording link** ya armado para cualquier llamada terminada, independiente del billing.

## Razón

- **UUID aleatorio como llave-portadora**: es imposible de adivinar y ya es la clave de `/api/calls/[id]`; garantiza unicidad (el `callId` de Retell no es único por sí solo en el schema). El propio link es el control de acceso.
- **Server component, sin API pública**: la query queda server-side; al navegador solo llega el `audioUrl` final como prop, no un JSON fetchable con datos de la **Call**.
- **Mensaje genérico único**: no filtra existencia ni estado de una **Call** en una página sin auth.
- **`noindex`**: evita que el link aparezca en buscadores si se filtra a un lugar rastreable, pese a que el UUID ya lo hace indescubrible por fuerza bruta.
- **URL directa de Retell**: simplicidad y consistencia con "el mismo reproductor de hoy"; el reproductor funciona igual con o sin proxy.
- **Sin descarga**: reduce la redistribución trivial del archivo en un link público de audiencia amplia (el detalle autenticado sí la conserva).
- **`url` ya armado (no solo `id`)**: n8n lo pidió listo para usar, así no hardcodea el host en su flujo. Coste asumido: acopla el webhook a `AUTH_URL`.
- **`AUTH_URL` y no el `origin` del request**: el webhook es server-to-server (Retell → n8n → Lola); el header `origin` no es fiable. `AUTH_URL` es la convención ya usada (`return_url` del webhook de Stripe).
- **Link en todos los caminos con fila de Call**: la **Recording** existe independientemente del billing, así que n8n recibe el link igual en `pending`, `void` y `no_ledger`.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Endpoint público `/api/audio-call/[id]` + fetch desde el cliente | Expone un JSON con `audioUrl` (y lo que se le agregue) a cualquiera que lo llame. El RSC mantiene la query server-side y solo emite la prop necesaria. |
| Resolver por `callId` de Retell | En el schema no es único solo (único con `agentId`), podría devolver >1 fila. El `id` interno garantiza unicidad y ya es la clave existente. |
| Token firmado con expiración (signed URL / JWT en la ruta) | Más seguro, pero más trabajo. UUID imposible de adivinar + `noindex` + expiración de 30 días se consideró suficiente para este caso. Migrable después **sin cambiar la forma de la URL**. |
| Proxy del audio por nuestro servidor (`/audio-call/[id]/stream`) | Ocultaría la URL de Retell y forzaría la expiración server-side, pero más trabajo. Se eligió URL directa, igual que hoy. |
| Diferenciar mensajes (expirada vs no encontrada vs sin audio) | Filtra existencia/estado de la **Call**; el mensaje único filtra menos. |
| Mostrar PII en texto (nombre/teléfono/dirección/servicio) | Audiencia amplia/pública: se minimiza el texto con PII. El audio ya contiene la conversación, pero no se añade PII impresa encima. |
| Botón de descarga (como en el detalle) | Facilita redistribuir el archivo desde un link público. |
| Reutilizar el `AudioPlayer` simple de `components/ui/audio-player.tsx` | No es "el mismo reproductor de hoy": le faltan scrub, velocidad y navegación por teclado. Se extrae el `InlineAudioPlayer` real. |
| Que el webhook devuelva solo `{ id }` y n8n arme el link | n8n lo pidió listo (`url`); evita duplicar/hardcodear el host en el flujo de n8n. |
| Construir el `url` desde `request.headers` origin | Webhook server-to-server, `origin` no fiable; `AUTH_URL` es estable y ya es la convención. |
| Devolver el link solo en caminos cobrables (`pending`/`void`) | El audio no depende del billing; se emite en toda **Call** registrada, incluida `no_ledger`. |

## Consecuencias

- **Modelo de seguridad = link-llave**: quien tiene la URL escucha el audio (que contiene PII hablada). **Aceptado explícitamente.** No hay revocación de links individuales en esta iteración.
- **`proxy.ts`** gana `/audio-call` en el allowlist — primera ruta de *página* pública. Cualquier auditoría de auth debe contemplarla.
- **`InlineAudioPlayer`** se extrae de `call-detail-sheet.tsx` a un componente compartido (con `className` configurable); el detalle lo sigue usando igual. Una sola fuente de verdad para el reproductor.
- **`components/ui/audio-player.tsx`** (el `AudioPlayer` simple, sin uso) queda obsoleto; candidato a borrar o reemplazar por el extraído.
- **Expiración**: el umbral de 30 días se computa **server-side** en la página (mismo criterio que `isAudioExpired`, hoy client-side en el detalle).
- **Tests**: (a) UUID válido con audio vigente → player; (b) UUID inexistente → mensaje genérico; (c) `audio_url` nulo → genérico; (d) `created_at` > 30 días → genérico; (e) la ruta **no** exige sesión (no redirige a `/login`); (f) la respuesta HTML no contiene transcript/costo/billing/PII de texto.
- **Docs**: término **Recording** y **Public recording link** añadidos a `CONTEXT.md`, más la resolución de la ambigüedad "call_id".
- **`/api/webhooks/call-ended`** pasa de `204 No Content` a `200 { id, url }` en los tres caminos que crean/actualizan una **Call** (`pending`, `void`, `no_ledger`); el caso `event ≠ call_ended` sigue en `204`. n8n debe **capturar** la respuesta (puede, ya que es el caller del webhook). En reproceso/retry de una **Call** existente el `id` es estable (= `existing.id`), así que el `url` es idempotente.
- **Dependencia de entorno**: el `url` requiere `AUTH_URL` seteado en prod (`https://call-system-silk.vercel.app`). Si falta, el link saldría mal formado — la implementación debe validar o definir un fallback (hoy el webhook de Stripe usa `?? ""`, que aquí produciría un link relativo inútil para n8n).
