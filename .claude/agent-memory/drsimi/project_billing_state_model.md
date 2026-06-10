---
name: Billing state model — derived, not persisted
description: Cómo se calcula el estado Billing (Pending/Charged/Marked non-billable/Not billable/Partial) en call-system y dónde vive cada pieza
type: project
---

El estado de Billing visible en la tabla de Calls NO está persistido en `calls`. Se deriva en runtime a partir de dos señales:

1. `calls.webhook2Received` (boolean en DB)
2. `billing_ledger.status` para esa call_row_id — si no existe row de ledger, se considera `null`

Función central: `deriveBillingState({ webhook2Received, ledgerStatus })` en `lib/billing/state.ts:10`. Reglas:
- `!webhook2Received` → "Partial"
- `ledgerStatus === null` (no hay ledger) → "Not billable"
- `ledgerStatus === "void"` → "Marked non-billable"
- `ledgerStatus === "paid"` → "Charged"
- otro (`pending`/`reserved`) → "Pending"

Quién crea el ledger: solo `app/api/webhooks/call-ended/route.ts` y solo si `disconnection_reason === "user_hangup"` (línea ~152). Cualquier otro disconnection_reason (`agent_hangup`, `dial_no_answer`, `error_*`, etc.) deja la call sin ledger → frontend muestra "Not billable".

**Why:** PRD `prd/stripe.md` define que solo `user_hangup` cuenta como billable; el resto se almacena para historial pero no genera ledger.
**How to apply:** Si una llamada aparece como "Not billable" inesperadamente, NO buscar campo en DB — verificar `calls.disconnection_reason` y la existencia (o no) de un row en `billing_ledger`. Para "rescatarla" basta con insertar un ledger entry; no requiere migración de schema.
