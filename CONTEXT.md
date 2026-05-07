# Call System — Domain Context

Call System es el dashboard de la agencia para gestionar llamadas de voice agents (Retell) de compañías de tree service y cobrarles automáticamente vía Stripe por umbral acumulado. Este documento fija el vocabulario de dominio que aparece tanto en el código como en la UI. Para el modelo financiero completo ver `prd/stripe.md`.

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

### Llamadas

**Call**:
Una conversación entre un cliente final y un Retell voice agent, registrada en la tabla `calls`. Se llena en dos fases: webhook `call_data` (cliente) y webhook `call_ended` (audio + duración).
_Avoid_: "registro", "interacción".

**Partial call**:
Una **Call** que sólo recibió `call_data` y aún no recibió `call_ended`. No tiene decisión de billing tomada.
_Avoid_: "incompleta" (la llamada en sí pudo haber durado cualquier cosa).

### Estados de billing de una Call

Cuatro valores derivados que se muestran como badges en la columna **Billing** de `/calls`. Se computan desde `billing_ledger.status` y `calls.invoiceId`; no se almacenan como columna explícita. Una **Call** sin **Ledger entry** y con `webhook2_received = true` no muestra badge — la celda queda como `—`.

**Pending**:
La **Call** tiene una **Ledger entry** en `pending` o `reserved`. Va a entrar al próximo cron de cobro.

**Charged**:
La **Call** ya fue liquidada — su **Ledger entry** está en `paid` y `calls.invoiceId` apunta a un **Invoice** pagado.

**Marked non-billable**:
Un `root` deliberadamente excluyó la **Call** del cobro. Su **Ledger entry** está en `void`. No entra al cron y no suma al balance.
_Avoid_: "cancelada", "rechazada" (se confunden con `disconnection_reason`).

**Partial**:
La **Call** sólo recibió `call_data` y aún no tiene `call_ended`. Puede transitar a **Pending** si después llega `call_ended` con un `disconnection_reason` facturable.

### Acciones sobre el ledger

**Void** (verbo):
Marcar manualmente una **Ledger entry** en `pending` como `void`, restando su `amount_cents` del `current_balance_cents` de la compañía. Sólo `root`. Se almacena `voidedAt` y `voidedBy`.
_Avoid_: "cancelar" (se confunde con cancelar un Stripe invoice).

**Restore** (verbo):
Operación inversa de **Void**: devolver una entry de `void` a `pending` y sumar de vuelta al balance. Limpia `voidedAt` y `voidedBy`. Sin histórico de re-marcadas.

## Relationships

- Una **Call** tiene cero o una **Ledger entry** (`UNIQUE(call_id, entry_type)` en `billing_ledger`).
- Sólo las **Calls** con `disconnection_reason ∈ {'user_hangup', 'agent_hangup'}` (ver `lib/billing/rules.ts`) **y** compañía resuelta producen **Ledger entries**.
- Transiciones legales del status del ledger:
  - `pending → reserved → paid` (camino del cron)
  - `pending ↔ void` (Void / Restore manuales por root)
- Una entry en `void` no puede llegar a `reserved` ni a `paid` sin pasar primero por `pending` vía **Restore**.

## Example dialogue

> **Dev:** "Un cliente dice que tiene una llamada que no debería contar en su próximo cobro. ¿Qué hacemos?"
> **Domain expert:** "Si la **Call** está en **Pending** y root está de acuerdo, hace **Void** sobre la **Ledger entry**. Sale del próximo cron y resta del `current_balance_cents`. Si ya está **Charged**, esa llamada ya entró a un invoice de Stripe pagado — no se toca."

> **Dev:** "¿Y si la **Call** acaba de pasar a `reserved` porque el cron corrió?"
> **Domain expert:** "No es marcable. Esperamos al webhook de Stripe. Si llega `invoice.paid` queda **Charged** y se acabó. Si llega `invoice.payment_failed`, la entry vuelve a `pending` y entonces sí podemos hacer **Void**."

## Flagged ambiguities

- **"Non-billable"** se usaba ambiguo para "sistema la filtró" y "humano la excluyó". Resuelto: las llamadas que el sistema descarta no muestran badge (celda `—`); **Marked non-billable** = humano (`ledger.status = 'void'`).
- **"Status"** estaba sobrecargado en `/calls`: la columna existente muestra `callStatus` de Retell, y los billing states también son "estados". Resuelto: la columna existente sigue siendo "Status" (Retell); la nueva columna se llama "Billing".
- **"Charge"** vs **"Bill"**: el código usa `charge` para la operación de cobro vía Stripe (`charge-cron.ts`); la UI usa "Billing" como sección. Mantener: `charge` = verbo/operación; "Billing" = concepto/sección de UI.
