# ADR-003: Columna `retell_cost` (numeric USD) y visibilidad solo agencia

**Fecha:** 2026-05-09
**Estado:** Aceptado

## Contexto

La agencia (Tree Service Marketing Agency) cobra a cada compañía cliente un **precio fijo por llamada** (`calls.billing_price_cents`, ver `lib/billing/state.ts`). El **costo real de Retell** por llamada es información de margen interno de la agencia: la diferencia entre `billing_price_cents` (lo que cobramos) y el costo Retell (lo que pagamos al proveedor) es el margen bruto del modelo.

Hoy `calls.retell_cost` existe como `text` y guarda el `JSON.stringify` del objeto entero `call_cost` que Retell mandaba en su webhook (incluyendo `combined_cost` en **centavos**, `product_costs[]`, `total_duration_seconds`, etc.). El campo nunca se expone en API ni en UI.

Dos cambios concurrentes lo fuerzan a evolucionar:

1. **n8n se interpone entre Retell y el webhook** para preprocesar. El nuevo payload manda `call_cost` como un **número plano en dólares decimales** (ej. `0.230749999`), no el objeto Retell. El shape JSON original deja de llegar.
2. **Necesidad de UI**: `root` y `admin` deben poder ver "Real Cost" por llamada en la lista de calls y en el detail sheet. `staff_admin` y `staff` (usuarios de la compañía cliente) **no deben verlo** — revelaría el markup.

## Decisión

1. **Reemplazar `calls.retell_cost text`** (JSON crudo) **por `calls.retell_cost numeric(10, 6)`** que guarda el costo en **dólares USD decimales**, tal cual lo manda n8n.
2. **Romper la convención `_cents`** que sigue `billing_price_cents`: el costo Retell se almacena en dólares como `numeric`, no en centavos como `integer`.
3. **Gating server-side**: el campo solo entra al `SELECT` de `/api/calls` y `/api/calls/[id]` cuando `isAgencyRole(user.role)`. Para `staff_admin`/`staff` el campo nunca cruza el wire.
4. **UI condicional**: la columna "Real Cost" en `calls-client.tsx` y la fila correspondiente en `call-detail-sheet.tsx` se renderizan solo cuando `user.role` es `root` o `admin`, replicando el patrón de `showCompanyColumn`.
5. **Backfill one-shot**: script `scripts/backfill-retell-cost.ts` parsea el JSON viejo (`retell_cost_legacy`), extrae `combined_cost` (cents), divide entre 100 y escribe la columna nueva en dólares.

## Razón

- **Match al shape de entrada.** n8n ya parsea y agrega los costos de Retell a un decimal en dólares antes de mandarlo. Guardarlo en `numeric` dólares es lectura-escritura sin transformación: el webhook recibe `0.230749999`, lo persiste tal cual.
- **Precisión sin lossy rounding.** Convertir a `integer` cents (`Math.round(call_cost * 100)`) descarta sub-centavos. Acumulado sobre miles de llamadas, distorsiona el margen agregado en reportes (~$0.50 por cada 10k llamadas, no enorme pero evitable a costo cero).
- **Seguridad por construcción.** Filtrar el campo en el `SELECT` (no en la respuesta serializada) garantiza que ni siquiera está en la respuesta JSON que viaja al browser cuando el usuario es `staff_admin`. Cualquier inspector de network del cliente lo confirma.
- **El dato perdido es desechable.** El JSON crudo de Retell tenía `product_costs` y `total_duration_seconds`, pero nunca se consultaron desde el código y la fuente de verdad para detalle por costo es el dashboard de Retell. No hay query, reporte ni feature que dependa de ese desglose.
- **Reversible con costo bajo.** Si en el futuro queremos volver a guardar el objeto Retell crudo, agregamos `retell_cost_raw text` y dejamos `retell_cost` como el número resumen. La columna de dólares ya estará alineada con el modelo de billing.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Mantener `retell_cost text` como JSON y parsear en cada read | Lectura más cara (parsing JSON por fila), no permite agregaciones SQL para reportes de margen, y el JSON dejará de llegar (n8n manda flat number). Postpone el problema sin resolverlo. |
| `retell_cost_cents integer` (consistente con `billing_price_cents`) | Pierdes precisión sub-centavo. Para márgenes agregados, el drift es real aunque pequeño. Y obliga a una conversión `Math.round(call_cost * 100)` en el webhook que no agrega valor. |
| `retell_cost real` (float8) | Binary float introduce el clásico problema de `0.1 + 0.2 ≠ 0.3` en sumas. Inapropiado para datos financieros aunque la magnitud sea mínima. |
| Gating solo en UI (campo siempre en API) | El campo viajaría en la respuesta JSON al `staff_admin`. Con devtools abiertos, queda visible. Romper la confidencialidad del margen vía network inspector es una falla trivial. |
| Tabla aparte `call_costs` con FK a `calls` | Overkill: 1:1 relation con cero datos extra que justifiquen la separación. Joins innecesarios para todas las queries de listado. |

## Consecuencias

- **Inconsistencia de unidades en `calls`**: `billing_price_cents` (integer cents) coexiste con `retell_cost` (numeric dollars). Cualquier cálculo de margen requiere convertir: `billing_price_cents / 100 - retell_cost`. Lectores nuevos del schema deben notarlo — el comentario inline en `schema.ts` lo deja explícito.
- **El cambio de `text → numeric` no es auto-generable por Drizzle** sin una migración SQL custom. Drizzle vería el cambio de tipo y emitiría `ALTER COLUMN ... TYPE numeric USING (retell_cost::numeric)`, lo cual **falla** porque el `text` actual son JSON objects, no números. Por eso la migración es manual: rename a `retell_cost_legacy`, add new column, backfill via script, drop legacy en migración posterior.
- **Dos columnas existen temporalmente** (`retell_cost` y `retell_cost_legacy`) hasta que se confirme el backfill. La cleanup migration que dropea `retell_cost_legacy` se hace explícita después de validar el script.
- **El webhook `call-ended` ya no acepta el objeto Retell crudo**. Si por accidente vuelve a llegar el shape viejo (objeto), el campo se persiste como `NULL` (validación `typeof === "number"`). Esto se loggea para detectar regresiones.
- **Cambio de contrato con n8n**: el flow de n8n se vuelve dependencia hard. Si n8n cae o cambia de shape, las llamadas nuevas amanecen con `retell_cost = NULL`. Aceptable porque las facturas al cliente NO dependen de este campo (dependen de `billing_price_cents`).
- **Reporte de margen futuro** (no implementado en esta ADR) podría agregarse con `SELECT SUM(billing_price_cents)/100 - SUM(retell_cost) FROM calls WHERE company_id = ... AND created_at > ...`.
