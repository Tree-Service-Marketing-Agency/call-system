# ADR-005: Cambiar el billing threshold de monto en dólares a conteo de llamadas

**Fecha:** 2026-05-11
**Estado:** Aceptado

## Contexto

El cron de cobro decidía si una compañía estaba lista para facturarse comparando `companies.current_balance_cents >= business_config.billing_threshold_cents` (default $50). El producto, sin embargo, razona y comunica el gatillo en llamadas, no en dólares: la regla acordada es "cuando una compañía acumula 25 llamadas pending, se cobran todas". Con el threshold en $ esa regla no es expresable directamente — depende del precio por llamada vigente, que ya puede haber cambiado y que se snapshot-ea por **Call** en `calls.billing_price_cents`. Una compañía con muchas llamadas baratas podía estar muy por encima de "25 calls" sin cruzar el umbral en $, y viceversa.

## Decision

Reemplazar `business_config.billing_threshold_cents` (integer en centavos) por `business_config.billing_threshold_calls` (integer, default `25`). El gatillo del cron pasa a ser:

```
COUNT(billing_ledger WHERE company_id = X AND status = 'pending') >= billing_threshold_calls
```

`companies.current_balance_cents` permanece sin cambios — sigue siendo la suma denormalizada de **Ledger entries** en `pending` y define el **monto** del invoice cuando se gatilla el cobro. Pierde su rol de comparador del trigger.

## Razón

- **Una sola fuente de verdad para el trigger.** El **Pending calls count** se deriva del ledger con un `COUNT(*)`; no requiere columna nueva ni denormalización adicional. La invariante "el ledger es la fuente de verdad financiera" (ADR-001) se preserva.
- **Coherente con el lenguaje del producto.** El owner razona en "25 llamadas"; la UI puede mostrar `13 / 25 calls` sin conversiones implícitas a dólares.
- **Resistente a cambios de pricing.** `pricePerCallCents` puede cambiar en `business_config` y eso no altera cuándo se gatilla el cobro de una compañía. Antes, subir/bajar el precio movía implícitamente el umbral efectivo para todas las compañías con entries pending.
- **Cron mínimamente afectado.** El query de candidatos pasa de `WHERE current_balance_cents >= threshold` a un `JOIN billing_ledger ... HAVING COUNT(*) >= threshold_calls`. El re-check dentro de la transacción ya computa `cnt` para `entryCount`; sólo se agrega la comparación contra el nuevo umbral.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Denormalizar `pending_calls_count` en `companies` (mantenerlo sincronizado en webhook + void + restore + paid) | Duplica estado del ledger en otra columna. Otro vector de drift que `reconcile-balance.ts` tendría que cubrir, además del balance. Cero ganancia: el `COUNT(*)` indexado por `(company_id, status)` ya es barato (índice existente: `billing_ledger_company_status_created_idx`). |
| Reemplazar también `current_balance_cents` por el conteo | Pierde el monto que se factura cuando se gatilla el cobro. Habría que recalcularlo on-the-fly al emitir cada invoice, y el dashboard de root pierde el dato "$X owed" que sigue siendo útil de un vistazo. |
| Renombrar la columna in-place (`billing_threshold_cents` → `billing_threshold_calls` sin migrar valor) | El valor numérico 5000 se reinterpretaría como "5000 llamadas". Footgun garantizado. |
| Mantener ambas columnas y permitir elegir modo (cents o calls) | Doble código de trigger + UI con switch. La regla de negocio es una sola; no hay caso de uso para volver a la versión en dólares. |
| Traducir el threshold actual a calls (`threshold_calls = floor(threshold_cents / price_per_call_cents)`) | Da continuidad numérica pero arrastra una conversión arbitraria. El valor declarado por el owner es `25`; un backfill literal a 25 es más honesto. |

## Consecuencias

- **Migración destructiva**: `DROP COLUMN billing_threshold_cents` + `ADD COLUMN billing_threshold_calls integer NOT NULL DEFAULT 25`. La única fila existente queda con threshold = 25, independientemente del valor previo en $. Roll-back requiere migración reversa + restaurar el valor anterior desde backup.
- **Re-check del trigger dentro de la transacción**: además del check de `current_balance_cents > 0` ya existente, el cron debe comparar `entryCount >= threshold_calls` después del `FOR UPDATE` sobre el row de `companies`. Si un Void se coló entre el candidate-select y el lock, la compañía puede haber caído por debajo del umbral y debe saltarse.
- **UI/API contract change**: el endpoint `/api/business-model` deja de aceptar `billingThresholdCents`; ahora acepta `billingThresholdCalls`. El endpoint `/api/billing` expone `thresholdCalls` y `pendingCallsCount` por compañía y deja de exponer `thresholdCents`. No hay clientes externos del endpoint billing.
- **Cálculo de fee efectivo en `agency-billing-client.tsx`**: el cálculo de la comisión efectiva de Stripe ahora necesita `threshold_calls × price_per_call_cents` para obtener el monto del invoice estimado antes de aplicar fees. Si `price_per_call_cents` cambia, el fee efectivo mostrado cambia también — antes era función sólo del threshold.
- **Notificación `no_payment_method`**: el payload expone `pending_calls_count` y `threshold_calls` como condición de disparo, conservando `balance_usd` como dato informativo del monto pendiente.
- **`current_balance_cents` queda con un solo rol** (monto del próximo invoice). Si en el futuro se quisiera dejar de denormalizarlo, sería más sencillo — pero implica recalcular el monto en cada cron run.
- **Interacción con ADR-001 + `lib/billing/rules.ts`**: las **Ledger entries** se siguen creando con la misma regla (disconnection_reason en `BILLABLE_DISCONNECTION_REASONS`). El threshold-in-calls sólo cambia cuándo se cobran, no qué cuenta como cobrable.
