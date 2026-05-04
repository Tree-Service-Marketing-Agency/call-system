# ADR-001: Marcar llamadas no cobrables como nuevo status `void` en `billing_ledger`

**Fecha:** 2026-05-04
**Estado:** Aceptado

## Contexto

`root` necesita poder excluir manualmente llamadas individuales del próximo cobro de Stripe. La regla de negocio: sólo las llamadas que aún no se han cobrado (ledger en `pending`) son excluibles, y la operación es reversible. La invariante que el sistema debe preservar es la del PRD `prd/stripe.md` sección 6.1: **`billing_ledger` es la fuente de verdad financiera**.

## Decision

Añadir un cuarto valor `void` al enum `ledger_status` y dos columnas de auditoría (`voidedAt`, `voidedBy`) en `billing_ledger`. Marcar como no cobrable = `UPDATE billing_ledger SET status = 'void'` + decremento de `companies.current_balance_cents`. Restaurar = `UPDATE … SET status = 'pending'` + incremento. Sin flags adicionales en `calls`, sin entries de reverso.

## Razón

- **Conserva la invariante del ledger.** `lib/billing/reconcile-balance.ts:30` ya filtra por `status IN ('pending', 'reserved')`; las entries `void` quedan automáticamente fuera del balance computado sin tocar ese archivo.
- **Cero cambios al cron.** `lib/billing/charge-cron.ts:194` selecciona ledger entries `WHERE status = 'pending'`. Una entry `void` queda fuera del cobro automáticamente, sin condicionales nuevas ni branch en el código del cron.
- **Audit trail trivial y queryable**: `SELECT * FROM billing_ledger WHERE status = 'void' AND voidedAt > now() - interval '30 days'`.
- **Reversibilidad sin overhead**: una sola UPDATE devuelve la entry a `pending` y limpia las columnas de auditoría. No hay que reconstruir nada.
- **Migración mínima**: `ALTER TYPE ledger_status ADD VALUE 'void'` + dos columnas nullable. Sin movimiento de datos.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| `DELETE` del ledger entry + flag `nonBillable: boolean` en `calls` | Rompe la invariante "el ledger es la fuente de verdad financiera". Una llamada que existió como cargo desaparece del ledger, así que `reconcile-balance.ts` ya no puede recomputar el histórico. La auditoría queda esparcida entre dos tablas. |
| Reversal entry (nuevo `entry_type = 'call_void'` con `amount_cents` negativo) | Requiere relajar el constraint `UNIQUE(call_id, entry_type)` y reescribir todas las queries de balance para sumar (cargo + reverso). Overkill para el modelo actual de un solo `entry_type`. |

## Consecuencias

- El badge de UI **"Marked non-billable"** se deriva de `billing_ledger.status = 'void'`. Si en el futuro se quiere capturar razón (`voidReason`) o conservar histórico de re-marcadas, requiere schema migration adicional — la versión actual sobrescribe `voidedAt`/`voidedBy` en cada Restore→Void.
- `void` es terminal sólo de cara al cron. Operacionalmente es reversible vía Restore. Si después se quiere bloquear la reversibilidad por antigüedad o por estado de la compañía, lógica nueva en el endpoint, no schema.
- El enum `ledger_status` ahora es `pending | reserved | paid | void`. Cualquier `switch` exhaustivo en TypeScript se romperá hasta agregar el caso — esto es deseable: fuerza al lector a considerar el nuevo estado.
- Los tests de `reconcile-balance` y `charge-cron` deben incluir un caso con entry `void` para verificar que ambos la ignoran.
- `staff_admin` puede ver el badge en la UI pero no puede mutar — la guardia de rol vive en el endpoint, no en el schema.
