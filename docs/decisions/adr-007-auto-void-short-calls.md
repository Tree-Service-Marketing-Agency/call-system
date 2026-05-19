# ADR-007: Auto-void de llamadas más cortas que un umbral configurable

**Fecha:** 2026-05-18
**Estado:** Aceptado — re-resuelve la ambigüedad "Non-billable" fijada en torno a ADR-001 (matiza, no supersede, ADR-001)

## Contexto

`root` quiere que las **Calls** muy cortas no se cobren: una llamada que dura segundos rara vez tiene valor para el cliente de tree service y genera fricción de soporte. El umbral debe ser **configurable** desde la UI (no hardcodeado) por si cambia el criterio.

El sistema ya filtra **Calls** no cobrables por `disconnection_reason` y por compañía no resuelta: esas **no** generan **Ledger entry** y la columna Billing queda en `—`. `CONTEXT.md` tenía resuelta la ambigüedad "Non-billable" así: celda `—` = el sistema la filtró; badge **Marked non-billable** (`ledger.status = 'void'`, ADR-001) = un humano (`root`) la excluyó manualmente. Aplicar una regla automática de duración choca de frente con esa frontera: o se trata como "filtro de sistema" (celda `—`, invisible) o se reusa el badge existente.

## Decisión

1. **Nueva config global** `business_config.min_billable_duration_seconds`, entero `NOT NULL DEFAULT 20`. `0` desactiva la regla (ninguna **Call** se considera corta). Fila existente backfilled a `20` en la migración.
2. **Disparador**: tras pasar los filtros existentes (disconnection billable **y** compañía resuelta), si `calls.duration_ms < min_billable_duration_seconds * 1000` (estricto), la **Call** es corta. `duration_ms` nulo/ausente ⇒ **no** se filtra (fail-open: no se castiga por dato faltante).
3. **Mecánica de ledger**: la **Ledger entry** se inserta **directamente** con `status = 'void'`, `amount_cents` = precio snapshot, `voided_at = now()`, `voided_by = NULL`. **Nunca** se toca `companies.current_balance_cents` ni `calls.billing_counted_at` (queda `null`). Se sigue guardando `calls.billing_price_cents`.
4. **Badge reusado**: la **Call** muestra **Marked non-billable**, el mismo badge que el **Void** manual. `voided_by = NULL` distingue origen-sistema de origen-humano (`= userId`) a nivel de dato + el `console.log` del webhook. Sin columna de motivo, sin UI extra.
5. **Override**: `root` puede hacer **Restore** sobre una **Call** corta auto-voided sin cambios al endpoint actual (`void → pending`, `+amount_cents` al balance — correcto porque el auto-void nunca sumó).
6. **Precedencia**: `disconnection` no-billable → `—`. Sin compañía → `—`. Corta → ledger `void` (badge). En otro caso → `pending`. La regla de duración solo actúa sobre **Calls** por lo demás cobrables y con compañía.
7. **UI**: nueva card en `/business-model`, **solo `root`** (sin cambios de gating en página, sidebar ni `/api/business-model`). Cambiarla no re-evalúa **Calls** ya registradas (igual que el snapshot de `price_per_call_cents`).

## Razón

- **Reusar el badge en vez de celda `—`** lo pidió `root` explícitamente: una **Call** corta excluida debe ser **visible** como excluida, no indistinguible de un filtro silencioso. La celda `—` se reservaría a lo verdaderamente sin-ledger.
- **Insert directo en `void`, balance intacto** evita churn: el flujo "insert pending → +balance → void → -balance" deja el mismo neto pero con `billing_counted_at` poblado y dos movimientos de balance que se cancelan, ensuciando auditoría.
- **`voided_by = NULL` como discriminador** evita una migración de columna de motivo. `reconcile-balance.ts` y `charge-cron.ts` ya ignoran `status = 'void'` (ADR-001) — cero cambios en cron y balance.
- **Fail-open en `duration_ms` nulo** evita no cobrar **Calls** legítimas por un dato ausente del payload; el riesgo de cobrar alguna corta sin duración es menor que el de perder ingresos sistemáticamente.
- **`0` = desactivado** da una válvula de escape sin añadir un toggle separado (decisión de producto: solo un número en la card).
- **Solo `root`** revierte la petición inicial ("root y admin"): el propio `root` la corrigió en la entrevista. Mantiene la exclusividad de `root` sobre lo financiero (consistente con ADR-001 y el rol `root` en `CONTEXT.md`) y deja `/business-model` sin tocar.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Sin ledger, celda `—` (como el filtro de `disconnection_reason`) | Consistente con el patrón existente, pero hace la exclusión **invisible**: `root` no puede ver que una **Call** corta fue descartada ni revertirla. `root` pidió visibilidad explícita. |
| Nuevo badge propio "Too short" | Requiere un estado de UI nuevo y que `deriveBillingState` deje de ser función pura del ledger (volvería a depender de un input externo, justo lo que ADR-006 eliminó). Sobrecoste para una distinción que `root` no necesita ver separada. |
| Columna `void_reason ('auto_short' \| 'manual')` en `billing_ledger` | Auditoría más formal pero añade migración y escritura; `voided_by = NULL` + log ya distingue origen. YAGNI hasta que se pida auditoría formal. |
| Toggle on/off + número | Más flexible, pero `root` pidió "solo un número". `0` cubre el apagado sin UI extra. |
| Config por compañía | Rompe el patrón global de `business_config` (una fila) y añade scope/UI. No pedido. |
| Insert `pending` y luego `void` (suma y resta de balance) | Mismo neto pero deja `billing_counted_at` poblado y movimientos de balance que se cancelan — ruido de auditoría sin beneficio. |
| Card en `/business-model` abierta a `root + admin` (petición inicial) | `root` la corrigió a solo-`root` en la entrevista. Abrirla expondría `price_per_call_cents` y `billing_threshold_calls` a `admin`, ampliando el control financiero más allá de `root`. |

## Consecuencias

- **ADR-001 se matiza, no se supersede.** El badge **Marked non-billable** sigue siendo `ledger.status = 'void'`; lo que cambia es que ya no implica "un humano lo hizo". Cualquier lectura que asuma "void ⇒ acción de `root`" es ahora incorrecta: hay que mirar `voided_by`.
- **`CONTEXT.md` actualizado**: redefinido **Marked non-billable** (dos orígenes), añadido el término **Minimum billable duration**, re-resuelta la ambigüedad "Non-billable" y registrado el alias "webhook de Encode".
- **Migración**: `ALTER TABLE business_config ADD COLUMN min_billable_duration_seconds integer NOT NULL DEFAULT 20`. Sin movimiento de datos; la fila única hereda el default.
- **`/api/webhooks/call-ended`**: nueva rama entre el check de compañía y el insert del ledger. Necesita una variante de `insertCallChargeLedgerEntry` (o un flag) que inserte con `status = 'void'` + `voided_at` y **no** toque balance ni `billing_counted_at`. El `onConflictDoNothing` sobre `UNIQUE(call_id, entry_type)` sigue protegiendo reproceso/retry de n8n.
- **`/api/business-model`**: GET y PUT añaden `minBillableDurationSeconds` (validación entero ≥ 0). Auth sigue **root-only**, sin cambios.
- **UI `/business-model`**: la card de Pricing gana (o se le añade hermana) un input de segundos. Sin cambios de rol/nav.
- **Restore de una `void` con `voided_by = NULL`** funciona sin cambios y suma `amount_cents` al balance — comportamiento deseado (override de falso positivo).
- **Tests**: cubrir (a) corta < umbral → ledger `void`, balance sin cambio; (b) `duration_ms` null → `pending`; (c) `min_billable_duration_seconds = 0` → nunca filtra; (d) corta + disconnection no-billable → `—` (sin ledger); (e) Restore de auto-void → `pending` + balance.
- **Docs pendientes:** `docs/flows.md` (Flujo 1 debe describir la rama de auto-void) y `docs/database.md` (nueva columna en `business_config`). Se difiere al PR de implementación.
