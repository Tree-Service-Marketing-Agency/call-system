# Call System — Domain Context

Call System es el dashboard de la agencia para gestionar llamadas de voice agents (Retell) de compañías de tree service y cobrarles automáticamente vía Stripe cuando acumulan un cierto número de llamadas. Este documento fija el vocabulario de dominio que aparece tanto en el código como en la UI. Para el modelo financiero completo ver `prd/stripe.md`.

## Language

### Usuarios

**Agency user**:
Un usuario interno de la agencia con acceso transversal a todas las compañías. Cubre los roles `root` y `admin`. No tiene `companyId`. Se gestiona en `/users`. El helper `isAgencyRole(role)` (en `lib/auth-helpers.ts`) es la fuente de verdad.
_Avoid_: "administrative user" (se confunde con el rol `admin`), "internal user".

**Company user**:
Un usuario asociado a una compañía cliente, con acceso limitado a su propio dashboard. Cubre los roles `staff_admin` y `staff`. Tiene `companyId` no nulo. Se gestiona desde el detalle de cada compañía (`/companies/[id]?tab=users`), no desde `/users`.
_Avoid_: "tenant user", "client user".

**Roles** (enum `userRoleEnum`):
- `root` — agency user con poderes destructivos (delete, void, deactivate). Inmutable desde la UI: ningún rol puede borrarlo o desactivarlo.
- `admin` — agency user sin poderes destructivos sobre otros agency users. Puede crear nuevos agency users (root o admin) pero no borrarlos ni desactivarlos.
- `staff_admin` — company user con permisos elevados dentro de su compañía (gestionar staff, ver billing).
- `staff` — company user de solo lectura sobre los datos de su compañía.

**Password reset**:
Reemplazo manual de la contraseña de un **Agency user** cuando la agencia necesita recuperar acceso; solo `root` puede ejecutarlo sobre usuarios `admin` o sobre su propia cuenta `root`.
_Avoid_: "actualizar contraseña" (se confunde con cambio hecho por el propio usuario), "change password".

**Temporary password**:
Contraseña nueva que el sistema muestra una sola vez al crear un usuario o ejecutar **Password reset**; la contraseña actual nunca es visible porque se almacena hasheada.
_Avoid_: "ver password actual", "consultar password".

### Llamadas

**Call**:
Una conversación entre un cliente final y un Retell voice agent, registrada en la tabla `calls`. Se llena en una sola fase: el webhook `call_ended`, que llega cuando termina la llamada con **todos** los datos (cliente + audio + duración + costo + transcript). El webhook `call_data` fue deprecado y eliminado (ver ADR-006).
_Avoid_: "registro", "interacción", "webhook de Encode" (alias informal del webhook `call_ended`; usar el nombre real).

**Recording**:
El audio de una **Call**, guardado como URL de Retell en `calls.audio_url`. Se considera **expirada** 30 días después de `calls.created_at` (regla del sistema; la propia URL de Retell también deja de servir pasado ese tiempo). Una **Call** puede no tener **Recording** (`audio_url` nulo).
_Avoid_: "grabación permanente" (expira), "el audio de Encode".

**Public recording link**:
La página pública y sin password `/audio-call/<id>` cuya única función es reproducir la **Recording** de una **Call** con el mismo reproductor del detalle (`InlineAudioPlayer`). `<id>` es el `calls.id` interno (UUID), **no** el `callId` de Retell. El servidor resuelve la **Call** y renderiza; el UUID actúa como llave (quien tiene el link escucha el audio). No muestra PII en texto ni billing/costo/transcript, es `noindex`, y reusa la regla de expiración de 30 días de la **Recording**. Ver ADR-009.
_Avoid_: "página de audio" (ambiguo), "compartir la llamada" (se confunde con el detalle interno autenticado).

**Transcript**:
El diálogo turno-a-turno de una **Call**, guardado en `calls.transcript` (`jsonb`, nullable) como `TranscriptTurn[]` = `{ role: "agent" | "user", content }[]`. n8n lo aplana desde el `transcription_object` de Retell y lo filtra a `{role, content}` (sin timestamps por palabra; ver ADR-004). Cada turno tiene rol **Agent** (el voice agent de Retell) o **Customer** (quien llamó — el rol crudo es `"user"`). Una **Call** puede no tener **Transcript** (`null`): llamadas previas a ADR-004 o que n8n no mandó. Se muestra en la tab **Transcript** del detalle de la **Call**; sin él, un empty state. ADR-004 persistió el dato explícitamente "para pintarlo en el detail sheet a futuro".
_Avoid_: "Transcription" (es el proceso de transcribir y el nombre del campo crudo de Retell `transcription_object`; el artefacto que guardamos y mostramos es el **Transcript**), "conversación" / "diálogo" a secas.

### Estados de billing de una Call

Tres valores derivados que se muestran como badges en la columna **Billing** de `/calls`. Se computan desde `billing_ledger.status` y `calls.invoiceId`; no se almacenan como columna explícita. Una **Call** sin **Ledger entry** no muestra badge — la celda queda como `—`. (El cuarto estado, **Partial**, fue eliminado junto con `call_data`; ver ADR-006.)

**Pending**:
La **Call** tiene una **Ledger entry** en `pending` o `reserved`. Va a entrar al próximo cron de cobro.

**Charged**:
La **Call** ya fue liquidada — su **Ledger entry** está en `paid` y `calls.invoiceId` apunta a un **Invoice** pagado.

**Marked non-billable**:
La **Call** está excluida del cobro: su **Ledger entry** está en `void`, no entra al cron y no suma al balance. Dos orígenes, mismo badge (ver ADR-007):
- **Humano**: un `root` hizo **Void** manual (`voidedBy = userId`).
- **Sistema**: la **Call** duró menos que la **Minimum billable duration** y se auto-voidó al ingerir (`voidedBy = null`). `root` puede revertirla con **Restore** como override.
_Avoid_: "cancelada", "rechazada" (se confunden con `disconnection_reason`).

**Minimum billable duration**:
Umbral global en **segundos** bajo el cual una **Call** por lo demás cobrable se auto-voida al llegar por `call_ended`. Se almacena en `business_config.min_billable_duration_seconds` (default `20`, `0` = regla desactivada). Compara contra `calls.duration_ms` con criterio **estricto** (`duration_ms < umbral·1000`); `duration_ms` nulo ⇒ se trata como billable (fail-open). Cambiarlo no afecta **Calls** ya registradas. Configurable solo por `root` en `/business-model`.
_Avoid_: "límite de duración", "duración mínima de cobro" (ambiguo con tiempo de conversación).

### Pricing & threshold

**Price per call**:
Precio en centavos que se aplica a una **Call** al momento de crear su **Ledger entry** (snapshot en `calls.billing_price_cents`). Se configura globalmente en `business_config.price_per_call_cents`. Cambiarlo no afecta llamadas ya registradas.
_Avoid_: "rate", "tarifa".

**Billing threshold**:
Cantidad de **Calls** con **Ledger entry** en `pending` que una compañía debe acumular para que el cron la considere candidata a cobro. Se almacena como conteo entero en `business_config.billing_threshold_calls` (default `25`). **No** es un monto en dólares.
_Avoid_: "límite de saldo", "umbral en dólares".

**Pending balance**:
Suma denormalizada en centavos de las **Ledger entries** en `pending` de la compañía, almacenada en `companies.current_balance_cents`. Es el monto que se facturará cuando se dispare el cobro; **no** participa en la decisión de cuándo dispararlo.
_Avoid_: "saldo deudor", "monto a cobrar" (este último se confunde con un **Invoice** ya emitido).

**Pending calls count**:
Conteo de **Ledger entries** en `pending` para una compañía. Métrica comparada contra el **Billing threshold** en el cron. No se almacena como columna — se calcula on-the-fly desde el ledger.

### Acciones sobre el ledger

**Void** (verbo):
Marcar manualmente una **Ledger entry** en `pending` como `void`, restando su `amount_cents` del `current_balance_cents` de la compañía. Sólo `root`. Se almacena `voidedAt` y `voidedBy`.
_Avoid_: "cancelar" (se confunde con cancelar un Stripe invoice).

**Restore** (verbo):
Operación inversa de **Void**: devolver una entry de `void` a `pending` y sumar de vuelta al balance. Limpia `voidedAt` y `voidedBy`. Sin histórico de re-marcadas.

### Disparo de cobro

**Charge run**:
Una corrida del proceso de cobro que toma las **Companies** candidatas, reserva su ledger `pending`, crea el **Invoice** local y lo emite en Stripe (`runBillingChargeRun` → `chargeOneCompany` en `lib/billing/charge-cron.ts`). El resultado del pago llega **después**, asíncrono, por el webhook de Stripe (`invoice.paid` → **Charged**; `invoice.payment_failed` → vuelve a `pending`). Tiene dos disparadores de alcance **global** que recorren todas las compañías elegibles: el **cron** diario (`GET /api/billing/cron`, `triggeredBy: "cron"`) y el botón **"Run billing now"** de root (`POST /api/billing/run-cron`, `triggeredBy: "manual"`).
_Avoid_: "webhook de cobro" / "flujo de cobro del webhook" (el cobro lo dispara el **cron** o un disparo **manual**, nunca un webhook entrante; el webhook de Stripe solo **finaliza** el resultado de un **Charge run** ya emitido).

**Manual company charge**:
Un **Charge run** acotado a **una sola Company**, disparado desde el icono de la última columna de la tabla de companies en `/billing` (`runBillingChargeForCompany`). Aplica **exactamente los mismos requisitos** que el cron —`billing_status = 'idle'`, tarjeta on file (`stripe_payment_method_id` + `stripe_customer_id`), **Pending calls count** ≥ **Billing threshold**, y **Pending balance** > 0— re-chequeados dentro de la transacción con row-lock. **No** hay bypass del threshold: si los requisitos no se cumplen el icono queda **deshabilitado** con un tooltip que explica el faltante (sin tarjeta, faltan N llamadas, ya se está cobrando…). Ejecutable por cualquier **Agency user** (`root` **y** `admin`) — **a diferencia** del **Charge run** global "Run billing now", que sigue siendo solo `root`. La asimetría es deliberada: cobrar una compañía puntual (con su gate completo intacto) es operación de agencia normal; disparar el cobro de **todas** a la vez se reserva a `root`. Sirve para cobrar una compañía puntual sin esperar al cron ni cobrar a todas.
_Avoid_: "cobro forzado" (no fuerza nada por debajo del threshold), "reintento"/"retry" (no reintenta un cobro fallido; una compañía en `payment_pending`/`uncollectible` no es elegible).

### Notificaciones de lead

**Notification phone**:
Una entrada de `companies.notification_phones` (columna `jsonb`, array) que representa un número que recibe alertas de un nuevo lead. Forma: `{ phone, note, disabled }`. `phone` normalizado a E.164 US (`+1XXXXXXXXXX`); una entrada con `phone` inválido se descarta entera al guardar. No puede haber dos entradas con el mismo `phone` normalizado (el API responde 400). La lógica de a quién se notifica vive en n8n, no en este sistema.
_Avoid_: "notification number", "lead phone".

**Note** (de un **Notification phone**):
Texto libre, máximo 150 caracteres, para identificar de quién es el número. Opcional (puede ser `""`). No lo consume ninguna lógica de notificación; es solo para que el operador de la agencia reconozca el número.
_Avoid_: "comentario", "descripción", "label".

**Disabled** (de un **Notification phone**):
Booleano por número; `true` = n8n no debe notificar a ese número. Default `false`. Este sistema solo almacena y expone el flag; el filtrado ocurre en n8n. Un número `disabled` igual debe tener un `phone` válido.
_Avoid_: "isDisabled" (uso informal del campo), "enabled" (polaridad invertida), "inactive".

### Teléfono de Retell

**Retell number**:
Un par número↔agente (1:1) con el que la compañía opera en Retell — el número que su voice agent usa para hacer/recibir llamadas. Vive en la tabla `retell_numbers` (ADR-010, PRD #41): `agent_id` (único, requerido), `phone_number` (`text`, nullable mientras se aprovisiona, único, E.164 US `+1XXXXXXXXXX` vía `normalizeUsPhone()`) y `enabled` (toggle live: enable/disable del inbound agent directamente en Retell, write-through, solo root). Una compañía tiene cero o más. **No** participa en onboarding: los números se gestionan después desde la tarjeta "Retell numbers" en Settings del detalle de compañía (root y admin gestionan; solo root acciona el toggle). La compra real del número ocurre fuera (Retell dashboard / n8n), igual que el **Area code**. Reemplazó a la tabla `company_agents` y a la columna `companies.retell_phone_number`, dropeadas en fase 3.
_Avoid_: "Notification phone" (ese recibe alertas de lead, no es el número del agente), "phone number" a secas, "company phone", "agent phone" (se confunde con `agentId`), "Retell phone number" (nombre del modelo legacy de un solo número por compañía).

**Active / Inactive** (de un **Retell number**):
El estado on/off de un **Retell number**, pintado desde el flag `retell_numbers.enabled` (cache local write-through; ver ADR-010). **Active** (`enabled = true`) = el número tiene su agente asignado como inbound agent en Retell y atiende llamadas; **Inactive** = sin inbound agent, las llamadas entrantes no se atienden. En `/companies` la columna **Status** agrega los flags de la compañía: todos activos → **Active**; mezcla → **Partial**; todos apagados → **Inactive**; sin números → `—`. **No** confundir con el `isActive` de un usuario (`users.is_active`, login habilitado) ni con el **Disabled** de un **Notification phone** (excluir de alertas de lead, sin efecto en Retell): tres estados de entidades distintas.
_Avoid_: "enabled/disabled" en UI (el flag de DB es `enabled`, pero la copy usa Active/Inactive), "encendido/apagado" en docs formales, "isActive" (eso es de usuarios).

**Area code**:
Código de área US de 3 dígitos (NANP, ej. `415`, `786`) que indica **dónde** deben comprarse los **Retell numbers** de la compañía. Se almacena en `companies.area_code` (`text`, nullable a nivel DB para no romper compañías previas al campo, que quedan en `null`), validado como exactamente 3 dígitos (`/^[0-9]{3}$/`). Descriptivo: el sistema no compra nada, solo registra dónde localizar la compra. La obligatoriedad vive en la aplicación, no en la columna: onboarding siempre lo exige (única vía de captura inicial) y el `PATCH` de Settings rechaza vaciarlo al editar. Editable después solo desde Settings — nunca desde el header.
_Avoid_: "prefijo", "código de ciudad", "lada".

### Chat embebible

**Chat conversation**:
El hilo persistente de **Chat messages** entre un **Customer** y el **Text agent** de una **Company** en la burbuja embebible (tabla `chat_conversations`). El id lo genera **siempre** el backend al recibir el primer mensaje sin `conversationId` y regresa en el header `X-Conversation-Id`; un id que no existe en la base es 404 — nunca upsert, el cliente no inventa ids (ADR-011). Pertenece a exactamente una **Company** (`company_id`), lleva un **Chat status** y un `last_interaction_at` denormalizado (fecha del último **Chat message**) que n8n usa para decidir cuándo enviar el **Lead**.
_Avoid_: "conversación" a secas (en una **Call** eso es el **Transcript**), "chat session", "thread".

**Chat message**:
Un turno persistido de una **Chat conversation** (tabla `chat_messages`): `role` (`user` | `assistant`) + `content` en texto plano. El rol `user` es el **Customer**; `assistant` es el **Chat assistant**. El mensaje del **Customer** se guarda antes de abrir el stream; el del **Chat assistant** se guarda al terminar la generación aunque la burbuja se haya cerrado a media respuesta.
_Avoid_: "message" a secas, "TranscriptTurn" (ese es el formato del **Transcript** de una **Call**).

**Chat assistant**:
La IA que responde en la burbuja — un LLM vía OpenRouter (default `anthropic/claude-haiku-4.5`). Su configuración (prompt, modelo, **Catalog**) ya **no** es global por env: la aporta el **Text agent** de la **Company**. No es un **Agency user** ni el voice agent de Retell. Término preferente: **Text agent** (el `assistant` de un **Chat message** es el **Text agent**).
_Avoid_: "bot", "el agente" (colisiona con el voice agent de una **Call**).

**Text agent**:
La configuración 1:1 de una **Company** para su **Chat assistant** (tabla `text_agents`, PK `company_id`): `system_prompt` (editable in-place; fallback `DEFAULT_SYSTEM_PROMPT` si vacío), `model`, **Catalog** de extracción y `enabled`. En **Fase 2** (implementada) se suman `embed_key` (id público opaco y rotable del widget; nunca sale `company_id` al navegador) y `allowed_origins` (allowlist de embed/origen por compañía: alimenta el `frame-ancestors` dinámico de `/widget` y el chequeo de origen del flujo público de chat). Ver ADR-014. Una **Company** tiene exactamente un **Text agent**. Reemplaza al prompt global por env del diseño Bulldog. El feature de texto **no entra en billing** (gratis por ahora).
_Avoid_: "voice agent" / `agentId` de Retell (otro canal), "bot", "Chat assistant" como entidad aparte (es el runtime del **Text agent**).

**Catalog**:
La lista de campos que el **Text agent** debe captar de una **Chat conversation**, en `text_agents.catalog` (`jsonb`, array de `{ name, description }`). Doble rol: (1) se inyecta en el system prompt para que el agente *pida* esos datos, y (2) viaja en `GET /chats/pending` para que n8n sepa qué extraer. La extracción ocurre en **n8n**, no en este sistema.
_Avoid_: "schema", "form", "campos del lead" a secas.

**Lead**:
Los datos del **Customer** que el **Text agent** busca captar en una **Chat conversation** (definidos por el **Catalog**) y que **n8n** extrae del transcript y envía al CRM. Este sistema **no** almacena los valores extraídos (v1); solo expone **Catalog** + **Chat messages** vía `GET /chats/pending`.
_Avoid_: "contacto", "prospecto", confundir con **Notification phone** (alerta de lead de voz).

**Chat status**:
El estado de envío al CRM de una **Chat conversation** (`chat_conversations.status`, enum `pending` | `sent`, default `pending`). `pending` = aún no enviado; `sent` = ya enviado por n8n. **Terminal**: una vez `sent`, mensajes posteriores se anexan pero no lo regresan a `pending` ni reaparece en `GET /chats/pending`. Lo mueve n8n vía `PATCH /chats/status`.
_Avoid_: confundir con los **Estados de billing** de una **Call** o con el `status` del ledger; enums de entidades distintas.

## Relationships

- Una **Call** tiene cero o una **Ledger entry** (`UNIQUE(call_id, entry_type)` en `billing_ledger`).
- Una **Call** tiene cero o una **Recording**; el **Public recording link** resuelve la **Call** por `calls.id` y solo reproduce su **Recording** (nada más del payload de la **Call** llega al navegador).
- Una **Call** tiene cero o un **Transcript** (`calls.transcript` nullable). El **Public recording link** público **nunca** lo expone; sí lo ve cualquier usuario autenticado con acceso a la **Call** en el detalle interno.
- El webhook `call_ended` devuelve en su respuesta `{ id, url }` — el **Public recording link** ya armado — para que n8n lo distribuya. Se emite para toda **Call** registrada, sin importar su estado de billing (`pending`, `void` o sin ledger). Ver ADR-009.
- Sólo las **Calls** con `disconnection_reason ∈ {'user_hangup', 'agent_hangup'}` (ver `lib/billing/rules.ts`) **y** compañía resuelta producen **Ledger entries**.
- Precedencia al ingerir (ADR-007): `disconnection` no-billable → sin ledger, celda `—`. Sin compañía → sin ledger, celda `—`. Duración `< ` **Minimum billable duration** → **Ledger entry** insertada **directamente** en `void` (balance intacto, `billing_counted_at = null`), badge **Marked non-billable**. En otro caso → `pending`.
- Transiciones legales del status del ledger:
  - `pending → reserved → paid` (camino del cron)
  - `pending ↔ void` (Void / Restore manuales por root)
- Una entry en `void` no puede llegar a `reserved` ni a `paid` sin pasar primero por `pending` vía **Restore**.
- El cron dispara cobro cuando **Pending calls count** ≥ **Billing threshold**. El **Pending balance** define el monto del **Invoice**, no el trigger. **Void** y **Restore** modifican ambos (count y balance) al cambiar el status del ledger.
- Un **Manual company charge** dispara el mismo **Charge run** que el cron pero sobre una sola **Company**, con el mismo gate de elegibilidad (mismo threshold, misma tarjeta, mismo `billing_status = 'idle'`). No es un camino paralelo con reglas propias: es el cron aplicado a una fila. Por eso el estado del icono en la tabla es derivable de los datos que ya expone `GET /api/billing` (`billingStatus`, `hasPaymentMethod`, `pendingCallsCount` vs `thresholdCalls`, `balanceCents`).
- Una **Company** tiene cero o más **Notification phones** en `companies.notification_phones`. La API externa `by-agent` los expone **todos**, incluidos los **Disabled**; n8n decide a quién notifica filtrando por `disabled`.
- Una **Company** tiene cero o más **Retell numbers** (`retell_numbers`: par único agente↔número, `enabled` por fila) y a lo sumo un **Area code** (`companies.area_code`). El **Area code** se captura obligatorio en onboarding; los **Retell numbers** no entran en onboarding y se gestionan después desde Settings. El toggle `enabled` sí dispara llamadas a Retell (write-through, solo root); el resto (alta/edición/borrado de filas) es solo DB. La ingesta (`call_ended`) y el endpoint externo `by-agent` resuelven la compañía por `agent_id` contra `retell_numbers` (antes `company_agents`). Ver ADR-010.
- Una **Chat conversation** tiene cero o más **Chat messages**, ordenados por `created_at`. El contexto que ve el LLM se reconstruye **siempre** desde `chat_messages`; el cliente solo manda el último mensaje del **Customer** + `conversationId` (ADR-011).
- El playground es una **tab** del detalle de compañía (`/companies/[id]?tab=playground`) que reusa el componente de chat (`chat-playground-client.tsx`); el `source` se fuerza a `playground`. Reemplazó a la ruta standalone `/chat-playground?companyId=` (su `page.tsx` se eliminó junto con el botón "test" de la tab **Text agent**, que era su único enlace). La tab **muestra el modelo en uso** (leído de `text_agents.model` vía `GET /api/companies/[id]/text-agent`) pero **no** muestra costo — decisión deliberada, a diferencia de la tab **Chats** y el detalle de un **Chat**, donde el costo es métrica agency-only (ADR-003). La tab no tiene gate propio: hereda el acceso **agency-only** de `/companies` (el `proxy` redirige a los company users fuera), así que en la práctica solo root/admin la ven. El backend sigue autorizando la matriz completa (agency cualquiera; `staff_admin` su compañía edita; `staff` su compañía read-only; costo solo agency), pero la superficie self-service dedicada para company users queda como follow-up (ADR-012).
- **RESUELTO en Fase 2** (antes "future"): `/api/chat` y `/widget` son ahora **públicos** (sin sesión). El flujo widget de `POST /api/chat` se detecta por `body.embedKey`, resuelve la **Company** por `embed_key`, fuerza `source = widget`, revalida origen contra `allowed_origins` (defensa en profundidad; el gate real es el `frame-ancestors` dinámico que el `proxy` pone en `/widget?key=`) y aplica rate limit por IP+`embed_key` (Upstash, falla abierto). `GET /api/chat?conversationId=` reanuda una conversación widget (público, gateado por el id inadivinable; solo `source = widget`; devuelve solo `role`+`content`). El loader `public/widget.v1.js` monta la burbuja en un Shadow DOM y carga `/widget` en un iframe. La rama playground del POST (sesión + `companyId`) queda intacta. **Nunca** se pone `X-Frame-Options`; solo `frame-ancestors`. Ver ADR-014.
- Una **Company** tiene exactamente un **Text agent** (`text_agents`, PK `company_id`); el **Text agent** produce cero o más **Chat conversations**, cada una con cero o más **Chat messages** ordenados por `created_at`.
- Transiciones legales del **Chat status**: `pending → sent` (terminal; lo mueve n8n vía `PATCH /chats/status`). No hay retorno a `pending`.
- `GET /chats/pending` (consumo de n8n) devuelve las **Chat conversations** en `pending` **y de `source` = `widget`** (las de `playground` nunca llegan al CRM) con su **Catalog**, sus **Chat messages** y `last_interaction_at`; n8n extrae el **Lead**, lo envía al CRM y marca `sent`.
- El **Text agent** lo editan `root`, `admin` y el `staff_admin` de su propia **Company**; `staff` lo ve read-only. El **costo** acumulado de una **Chat conversation** (y por **Chat message**) es métrica interna visible **solo a Agency users** (como `retell_cost`, ADR-003).
- Un **Password reset** cambia la contraseña que se usará en próximos logins, pero no revoca sesiones activas en esta iteración.
- Un **Password reset** ejecutado por `root`, incluso sobre su propia cuenta, no requiere capturar la contraseña actual; se confirma la generación de una **Temporary password**.

## Example dialogue

> **Dev:** "Un cliente dice que tiene una llamada que no debería contar en su próximo cobro. ¿Qué hacemos?"
> **Domain expert:** "Si la **Call** está en **Pending** y root está de acuerdo, hace **Void** sobre la **Ledger entry**. Sale del próximo cron y resta del `current_balance_cents`. Si ya está **Charged**, esa llamada ya entró a un invoice de Stripe pagado — no se toca."

> **Dev:** "¿Y si la **Call** acaba de pasar a `reserved` porque el cron corrió?"
> **Domain expert:** "No es marcable. Esperamos al webhook de Stripe. Si llega `invoice.paid` queda **Charged** y se acabó. Si llega `invoice.payment_failed`, la entry vuelve a `pending` y entonces sí podemos hacer **Void**."

## Flagged ambiguities

- **"Non-billable"** se usaba ambiguo para "sistema la filtró" y "humano la excluyó". Resolución original (ADR-001 era): celda `—` = sistema; badge **Marked non-billable** = humano. **Re-resuelto por ADR-007**: el badge **Marked non-billable** (`ledger.status = 'void'`) ahora cubre **ambos** orígenes — humano (`voidedBy = userId`) y sistema por **Minimum billable duration** (`voidedBy = null`). La celda `—` queda solo para llamadas sin **Ledger entry** (disconnection no-billable o sin compañía).
- **"Webhook de Encode"** es un alias informal del webhook de ingesta real `call_ended` (Retell → n8n → Lola). No existe ningún "Encode" en código. Resuelto: usar siempre `call_ended`.
- **"Flujo de cobro del webhook"** sugería que el cobro lo dispara un webhook entrante. No es así: el **Charge run** lo dispara el **cron** o un disparo **manual** (global vía "Run billing now", o por compañía vía **Manual company charge**). El único webhook involucrado es el de **Stripe**, que llega *después* a finalizar el resultado (`invoice.paid`/`invoice.payment_failed`), no a iniciarlo. Resuelto: el término es **Charge run** (y **Manual company charge** para el de una sola compañía).
- **"Status"** estaba sobrecargado en `/calls`: la columna existente muestra `callStatus` de Retell, y los billing states también son "estados". Resuelto: la columna existente sigue siendo "Status" (Retell); la nueva columna se llama "Billing".
- **"Charge"** vs **"Bill"**: el código usa `charge` para la operación de cobro vía Stripe (`charge-cron.ts`); la UI usa "Billing" como sección. Mantener: `charge` = verbo/operación; "Billing" = concepto/sección de UI.
- **"Partial call" / badge "Partial"** existían porque una **Call** se llenaba en dos webhooks (`call_data` luego `call_ended`) y podía quedar a medias. Resuelto: `call_data` se deprecó; ahora `call_ended` trae todo en un solo payload. El concepto, el badge, y las columnas `webhook1_received`/`webhook2_received` se eliminaron. Ver ADR-006.
- **"Threshold"** originalmente era un monto en dólares (`billing_threshold_cents`); ahora es un conteo de llamadas (`billing_threshold_calls`, default 25). El `current_balance_cents` ya no participa en el trigger — sólo determina el monto del **Invoice** una vez que el conteo dispara el cobro. Ver ADR-005.
- **"comentario" / "descripción" / "label"** se usaban indistintamente para el texto libre de un **Notification phone** — resuelto: el término es **Note**, máximo 150 caracteres, opcional.
- **"isDisabled" / "enabled"** para el estado de un **Notification phone** — resuelto: el campo es **Disabled** (booleano, default `false`, `true` = no notificar). Se descartó polaridad positiva para no invertir el enunciado en n8n.
- **"call_id"** en la URL `/audio-call/<call_id>` era ambiguo entre el `calls.id` interno (UUID) y el `callId` de Retell (`call_…`, único solo junto con `agentId`). Resuelto: el **Public recording link** usa el **`id` interno (UUID)** — es la clave que ya usa `/api/calls/[id]`, garantiza unicidad y es imposible de adivinar (requisito al ser link-llave público). Ver ADR-009. En la UI del detalle de **Call** (header del `CallDetailSheet`) los dos identificadores se muestran con labels explícitos para no reabrir esta ambigüedad: **"Internal ID"** = `calls.id` (UUID, sirve para localizar la llamada en este sistema / `/audio-call/<id>`) y **"Retell ID"** = `calls.callId` (para localizarla en el dashboard de Retell). Cada uno con botón de copiar al clipboard. **No** se usa el label "Call ID" a secas para ninguno.
- **"Phone number"** era ambiguo entre el número que recibe alertas de lead (**Notification phone**, array `notification_phones`) y el número del agente en Retell. Resuelto: el número del agente es un **Retell number** (fila de `retell_numbers`, antes la columna única company-level eliminada en PRD #41 fase 3); los de alertas siguen siendo **Notification phones**. Conceptos distintos, tablas/columnas distintas, no se mezclan.
- **"Retell phone number"** pasó de descriptor a entidad accionable. El modelo legacy era una columna única company-level (`companies.retell_phone_number`, texto descriptivo, sin efecto operativo) más la tabla `company_agents` (solo mapeo `agent_id → company_id`). Resuelto (ADR-010, PRD #41): la entidad es el **Retell number** — múltiples por compañía, par 1:1 con su agente, con toggle que **sí** ejecuta acciones en Retell. `company_agents` quedó **absorbida** por `retell_numbers` y ambas superficies legacy fueron dropeadas; cualquier mención a ellas como entidades vivas es stale.
- **`enabled` de un Retell number puede driftear del estado real en Retell.** Es un cache local write-through: se escribe solo tras confirmación 2xx de Retell, pero nunca se lee de vuelta. Si alguien edita inbound agents directamente en el dashboard de Retell, este sistema no se entera. **Aceptado** — sin reconciliación en esta iteración; ante duda, el dashboard de Retell es la verdad del ruteo y el siguiente toggle desde aquí re-impone el estado local. Ver ADR-010.
- **"Transcription"** vs **"Transcript"**: el código, la tabla (`calls.transcript`), el tipo (`TranscriptTurn`), el helper (`filterTranscript`) y ADR-004 usan **transcript**; la tarjeta original y Retell (`transcription_object`) decían "transcription". Resuelto: el término canónico —glosario, label de la tab y toda la copy— es **Transcript** (el artefacto). "Transcription" se reserva para el proceso de transcribir y el campo crudo de Retell.
- **"Customer" ahora cruza dos canales.** En las **Calls** es quien llamó (con teléfono/nombre capturados); en el chat es quien escribe en la burbuja — ahora con el propósito de captar su identidad como **Lead** (vía el **Catalog**). Resuelto: mismo término — la misma persona del negocio (el cliente final de la compañía) por canal distinto. Frontera explícita: `/customers` lista solo los de voz; un **Customer** de chat **no** aparece ahí porque los valores del **Lead** los extrae y guarda **n8n**, no este sistema. Se descartó "Visitor" para no partir la persona en dos términos.
- **El rol `'user'` de un `chat_message` NO es un "User" del glosario** — misma trampa que `TranscriptTurn`, misma resolución: en UI y docs es el **Customer**. Y `'assistant'` es el **Chat assistant** (LLM), no un **Agency user** ni el rol `"agent"` de un **Transcript** (voice agent de Retell).
- **El rol `"user"` de un `TranscriptTurn` NO es el "User" del glosario.** En el transcript `"user"` = quien llamó (el cliente final); en el resto del sistema "User" = **Agency user** / **Company user** (un login). Resuelto: en la UI el rol `"user"` se muestra como **Customer** (consistente con el campo "Customer" del propio sheet y con `/customers`) y el rol `"agent"` como **Agent** (el voice agent de Retell, no un **Agency user**).
