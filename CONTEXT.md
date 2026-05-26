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

**Retell phone number**:
El número con el que la compañía está dada de alta en Retell — el que su voice agent usa para hacer/recibir llamadas. Se almacena en `companies.retell_phone_number` (`text`, nullable), normalizado a E.164 US (`+1XXXXXXXXXX`) reusando `normalizeUsPhone()`. Único por compañía. **No** participa en onboarding: nace `null` y se llena después. Este sistema solo lo almacena y expone; la compra/aprovisionamiento real del número ocurre fuera (Retell dashboard / n8n), igual que el **Area code**. Editable de dos formas equivalentes que escriben la misma columna vía `PATCH /api/companies/[id]`: inline en el header del detalle de compañía (igual que el nombre) y como campo en Settings.
_Avoid_: "Notification phone" (ese recibe alertas de lead, no es el número del agente), "phone number" a secas, "company phone", "agent phone" (se confunde con `agentId`).

**Area code**:
Código de área US de 3 dígitos (NANP, ej. `415`, `786`) que indica **dónde** debe comprarse el **Retell phone number** de la compañía. Se almacena en `companies.area_code` (`text`, nullable a nivel DB para no romper compañías previas al campo, que quedan en `null`), validado como exactamente 3 dígitos (`/^[0-9]{3}$/`). Descriptivo: el sistema no compra nada, solo registra dónde localizar la compra. La obligatoriedad vive en la aplicación, no en la columna: onboarding siempre lo exige (única vía de captura inicial) y el `PATCH` de Settings rechaza vaciarlo al editar. Editable después solo desde Settings — nunca desde el header.
_Avoid_: "prefijo", "código de ciudad", "lada".

## Relationships

- Una **Call** tiene cero o una **Ledger entry** (`UNIQUE(call_id, entry_type)` en `billing_ledger`).
- Una **Call** tiene cero o una **Recording**; el **Public recording link** resuelve la **Call** por `calls.id` y solo reproduce su **Recording** (nada más del payload de la **Call** llega al navegador).
- El webhook `call_ended` devuelve en su respuesta `{ id, url }` — el **Public recording link** ya armado — para que n8n lo distribuya. Se emite para toda **Call** registrada, sin importar su estado de billing (`pending`, `void` o sin ledger). Ver ADR-009.
- Sólo las **Calls** con `disconnection_reason ∈ {'user_hangup', 'agent_hangup'}` (ver `lib/billing/rules.ts`) **y** compañía resuelta producen **Ledger entries**.
- Precedencia al ingerir (ADR-007): `disconnection` no-billable → sin ledger, celda `—`. Sin compañía → sin ledger, celda `—`. Duración `< ` **Minimum billable duration** → **Ledger entry** insertada **directamente** en `void` (balance intacto, `billing_counted_at = null`), badge **Marked non-billable**. En otro caso → `pending`.
- Transiciones legales del status del ledger:
  - `pending → reserved → paid` (camino del cron)
  - `pending ↔ void` (Void / Restore manuales por root)
- Una entry en `void` no puede llegar a `reserved` ni a `paid` sin pasar primero por `pending` vía **Restore**.
- El cron dispara cobro cuando **Pending calls count** ≥ **Billing threshold**. El **Pending balance** define el monto del **Invoice**, no el trigger. **Void** y **Restore** modifican ambos (count y balance) al cambiar el status del ledger.
- Una **Company** tiene cero o más **Notification phones** en `companies.notification_phones`. La API externa `by-agent` los expone **todos**, incluidos los **Disabled**; n8n decide a quién notifica filtrando por `disabled`.
- Una **Company** tiene a lo sumo un **Retell phone number** (`companies.retell_phone_number`, nullable) y un **Area code** (`companies.area_code`). El **Area code** se captura obligatorio en onboarding; el **Retell phone number** no entra en onboarding y se llena después. Ninguno dispara llamadas a Retell — son descriptivos, como los **Notification phones**.
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
- **"Status"** estaba sobrecargado en `/calls`: la columna existente muestra `callStatus` de Retell, y los billing states también son "estados". Resuelto: la columna existente sigue siendo "Status" (Retell); la nueva columna se llama "Billing".
- **"Charge"** vs **"Bill"**: el código usa `charge` para la operación de cobro vía Stripe (`charge-cron.ts`); la UI usa "Billing" como sección. Mantener: `charge` = verbo/operación; "Billing" = concepto/sección de UI.
- **"Partial call" / badge "Partial"** existían porque una **Call** se llenaba en dos webhooks (`call_data` luego `call_ended`) y podía quedar a medias. Resuelto: `call_data` se deprecó; ahora `call_ended` trae todo en un solo payload. El concepto, el badge, y las columnas `webhook1_received`/`webhook2_received` se eliminaron. Ver ADR-006.
- **"Threshold"** originalmente era un monto en dólares (`billing_threshold_cents`); ahora es un conteo de llamadas (`billing_threshold_calls`, default 25). El `current_balance_cents` ya no participa en el trigger — sólo determina el monto del **Invoice** una vez que el conteo dispara el cobro. Ver ADR-005.
- **"comentario" / "descripción" / "label"** se usaban indistintamente para el texto libre de un **Notification phone** — resuelto: el término es **Note**, máximo 150 caracteres, opcional.
- **"isDisabled" / "enabled"** para el estado de un **Notification phone** — resuelto: el campo es **Disabled** (booleano, default `false`, `true` = no notificar). Se descartó polaridad positiva para no invertir el enunciado en n8n.
- **"call_id"** en la URL `/audio-call/<call_id>` era ambiguo entre el `calls.id` interno (UUID) y el `callId` de Retell (`call_…`, único solo junto con `agentId`). Resuelto: el **Public recording link** usa el **`id` interno (UUID)** — es la clave que ya usa `/api/calls/[id]`, garantiza unicidad y es imposible de adivinar (requisito al ser link-llave público). Ver ADR-009.
- **"Phone number"** era ambiguo entre el número que recibe alertas de lead (**Notification phone**, array `notification_phones`) y el número del agente en Retell. Resuelto: el número del agente es **Retell phone number** (columna única `retell_phone_number`, nullable); los de alertas siguen siendo **Notification phones**. Conceptos distintos, columnas distintas, no se mezclan.
