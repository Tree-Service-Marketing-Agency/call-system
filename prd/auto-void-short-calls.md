# PRD: Auto-void de Calls más cortas que un umbral configurable

> Labels: `needs-triage`
> Decisión de referencia: ADR-007 (`docs/decisions/adr-007-auto-void-short-calls.md`). Glosario: `CONTEXT.md`.

## Problem Statement

Como `root` de la agencia, recibo **Calls** muy cortas (el cliente final cuelga a los pocos segundos, sin conversación real). Hoy esas llamadas, si tienen un `disconnection_reason` cobrable y compañía resuelta, generan una **Ledger entry** en `pending`, suman al **Pending balance** de la compañía y terminan cobrándose vía Stripe. Eso me genera fricción de soporte con clientes de tree service que reclaman cargos por llamadas sin valor, y no tengo forma de excluirlas salvo hacer **Void** manual una por una. Además, el criterio de "qué es demasiado corta" puede cambiar y no quiero que viva hardcodeado en el código.

## Solution

Cuando una **Call** llega por el webhook `call_ended` (informalmente "el webhook de Encode") y dura menos que un umbral configurable, el sistema la excluye automáticamente del cobro: crea su **Ledger entry** directamente como `void` y la muestra con el badge **Marked non-billable** en `/calls`, igual que un **Void** manual. El umbral —**Minimum billable duration**— se configura en segundos desde una card en `/business-model`, accesible solo para `root`, y puede cambiarse cuando haga falta sin tocar código. Si en algún momento quiero desactivar la regla, pongo el umbral en `0`. Como `root`, conservo el override: puedo hacer **Restore** sobre una **Call** corta auto-excluida para cobrarla de todos modos.

## User Stories

1. Como `root`, quiero que las **Calls** que duran menos que un umbral entren automáticamente como **Marked non-billable**, para no cobrar llamadas sin valor a los clientes de tree service.
2. Como `root`, quiero configurar el umbral en segundos desde una card en `/business-model`, para ajustar el criterio sin pedir un cambio de código.
3. Como `root`, quiero que el valor por defecto del umbral sea 20 segundos, para tener un comportamiento razonable desde el primer deploy.
4. Como `root`, quiero poner el umbral en `0` para desactivar por completo la regla, para tener una válvula de escape sin necesidad de un toggle aparte.
5. Como `root`, quiero que cambiar el umbral solo afecte **Calls** futuras y no re-evalúe las ya registradas, para que el comportamiento sea predecible (igual que el snapshot de **Price per call**).
6. Como `root`, quiero que una **Call** corta auto-excluida muestre el badge **Marked non-billable** en `/calls`, para ver explícitamente que fue excluida y no confundirla con una llamada sin registrar.
7. Como `root`, quiero poder hacer **Restore** sobre una **Call** corta auto-excluida, para cobrarla manualmente si decido que sí tenía valor (override de falso positivo).
8. Como `root`, quiero que el **Restore** de una **Call** corta sume correctamente su `amount_cents` al **Pending balance**, para que el balance quede consistente tras el override.
9. Como `root`, quiero que una **Call** corta auto-excluida no sume al **Pending balance** ni al **Pending calls count**, para que no influya en el disparo del cron de cobro.
10. Como `root`, quiero que una **Call** corta auto-excluida nunca entre al cron de cobro, para que no se facture por accidente.
11. Como `root`, quiero que la **Call** corta conserve el snapshot de **Price per call** (`billing_price_cents`), para saber cuánto se habría cobrado si decido hacer **Restore**.
12. Como `root`, quiero que una **Call** sin `duration_ms` (dato ausente en el payload) se trate como cobrable normal, para no perder ingresos por un dato faltante (fail-open).
13. Como `root`, quiero que el límite sea estrictamente "menor que" (una **Call** de exactamente el umbral sí se cobra), para tener un criterio inequívoco en el borde.
14. Como `root`, quiero que una **Call** con `disconnection_reason` no cobrable siga sin generar **Ledger entry** (celda `—`) aunque sea corta, para mantener la precedencia de reglas existente.
15. Como `root`, quiero que una **Call** sin compañía resuelta siga sin generar **Ledger entry** (celda `—`) aunque sea corta, para no crear ledgers huérfanos.
16. Como `root`, quiero que la regla de duración solo se aplique a **Calls** por lo demás cobrables y con compañía, para que la precedencia sea: disconnection no-billable → sin compañía → corta → normal.
17. Como `admin`, quiero **no** ver ni configurar la card de **Minimum billable duration**, porque esta configuración financiera es exclusiva de `root` (igual que **Price per call** y **Billing threshold**).
18. Como `staff_admin`/`staff`, quiero seguir viendo el badge **Marked non-billable** en mi dashboard sin poder mutarlo, igual que hoy.
19. Como `root`, quiero ver la fecha de última actualización de la configuración, para saber cuándo se cambió el umbral por última vez.
20. Como `root`, quiero que la card valide que el valor es un entero ≥ 0, para no guardar configuraciones inválidas.
21. Como operador del sistema, quiero que un reproceso/retry de n8n sobre la misma **Call** corta no duplique la **Ledger entry**, para mantener la idempotencia del webhook.
22. Como operador del sistema, quiero un log cuando una **Call** se auto-excluye por duración, para poder auditar el comportamiento sin una columna nueva.
23. Como `root`, quiero distinguir a nivel de dato una auto-exclusión del sistema (`voided_by = null`) de un **Void** manual (`voided_by = userId`), para auditar el origen sin UI extra.
24. Como `root`, quiero que el webhook siga respondiendo `204` para las **Calls** cortas, para no cambiar el contrato con n8n.

## Implementation Decisions

- **Módulo profundo nuevo `resolveBillingOutcome` (puro, sin DB)**: dada la entrada `(disconnectionReason, companyId, durationMs, minBillableSeconds)` devuelve una decisión `'no_ledger' | 'void' | 'pending'`. Encapsula toda la precedencia de ADR-007 y la semántica del umbral: comparación estricta `durationMs < minBillableSeconds * 1000`; `durationMs` nulo ⇒ no se filtra (fail-open); `minBillableSeconds === 0` ⇒ la regla nunca marca corta. Interfaz simple y estable. Sigue el patrón de módulos puros existentes del proyecto (mapeo de payload y derivación de estado de billing).
- **Modificación de la capa de ledger**: nueva operación `insertVoidedCallChargeLedgerEntry` que inserta la **Ledger entry** directamente con `status = 'void'`, `voided_at = now()`, `voided_by = null`, `amount_cents` = **Price per call** snapshot. **No** modifica `companies.current_balance_cents` ni `calls.billing_counted_at`. Conserva el `onConflictDoNothing` sobre el `UNIQUE(call_id, entry_type)` para idempotencia ante retry de n8n.
- **Modificación del webhook `call_ended`**: tras resolver compañía y antes de la inserción de la **Ledger entry** `pending`, se consulta `resolveBillingOutcome`. Rama `'no_ledger'` → comportamiento actual (sin ledger, celda `—`, `204`). Rama `'void'` → `insertVoidedCallChargeLedgerEntry` + snapshot de `billing_price_cents` en la **Call** + log. Rama `'pending'` → flujo actual sin cambios (insert `pending`, +balance, `billing_counted_at`). El webhook sigue devolviendo `204`.
- **Cambio de schema + migración**: nueva columna `business_config.min_billable_duration_seconds`, entero `NOT NULL DEFAULT 20`. La fila única existente hereda el default (backfill a 20). Sin movimiento de datos.
- **Contrato de API `/api/business-model`**: `GET` añade `minBillableDurationSeconds` al payload. `PUT` acepta `minBillableDurationSeconds`, validándolo como entero ≥ 0 (rechazo `400` si no). La autenticación sigue siendo **root-only**; sin cambios de gating en página, sidebar ni endpoint.
- **UI `/business-model`**: la card existente (o una card hermana) gana un input numérico de segundos para **Minimum billable duration**, con su estado de "dirty"/"guardado" y la fecha de última actualización, dentro del mismo patrón de la card de **Pricing**. Página y nav siguen root-only.
- **Precedencia (regla de negocio fijada en ADR-007)**: `disconnection` no cobrable → sin ledger (`—`); sin compañía → sin ledger (`—`); duración `< ` umbral → ledger `void` (badge **Marked non-billable**); en otro caso → `pending`.
- **Reuso de badge**: no se crea estado de UI nuevo. `deriveBillingState` sigue siendo función pura del ledger (`status = 'void'` → **Marked non-billable**). La distinción sistema vs humano vive solo en `voided_by` (`null` vs `userId`) y en el log.
- **Override**: el endpoint de **Restore** existente no cambia; `void → pending` con `+amount_cents` al balance funciona correctamente porque la auto-exclusión nunca sumó al balance.
- **Glosario**: término **Minimum billable duration** añadido a `CONTEXT.md`; **Marked non-billable** redefinido (dos orígenes); ambigüedad "Non-billable" re-resuelta; alias "webhook de Encode" registrado como `call_ended`.

## Testing Decisions

Un buen test verifica **comportamiento externo observable**, no detalles de implementación: dada una entrada, se asume una salida/efecto, sin acoplarse a nombres internos ni a la estructura del código. Prior art en el repo: los módulos puros descritos como "razonables/testeables en aislamiento" (mapeo del payload de `call_ended` y derivación del estado de billing) — mismos patrones de test (función pura, tabla de casos).

Módulos a testear (confirmados con el usuario):

- **`resolveBillingOutcome` (unitario, puro)**: tabla de casos cubriendo la precedencia completa — disconnection no cobrable → `'no_ledger'`; sin compañía → `'no_ledger'`; `durationMs` < umbral → `'void'`; `durationMs` exactamente el umbral → `'pending'` (borde estricto); `durationMs` null → `'pending'` (fail-open); `minBillableSeconds = 0` → nunca `'void'`; caso combinado corta + disconnection no cobrable → `'no_ledger'` (gana disconnection).
- **`insertVoidedCallChargeLedgerEntry`**: inserta con `status = 'void'`, `voided_at` seteado, `voided_by = null`; no modifica `current_balance_cents` ni `billing_counted_at`; un segundo insert con el mismo `(call_id, entry_type)` no duplica (idempotencia/retry).
- **Webhook `call_ended` (integración)**: payload corto → **Ledger entry** `void`, **Pending balance** intacto, `204`; payload sin `duration_ms` → ledger `pending` (flujo normal); payload corto + `disconnection_reason` no cobrable → sin **Ledger entry** (celda `—`); **Restore** sobre una corta auto-excluida → `pending` + `+amount_cents` al balance.
- **API `/api/business-model`**: `PUT` con valor válido (entero ≥ 0) persiste; `PUT` con valor inválido (negativo / no entero) → `400`; acceso no-`root` → `403`; `GET` devuelve `minBillableDurationSeconds`.

## Out of Scope

- Toggle on/off separado: se decidió que `0` desactiva la regla; no se añade un switch.
- Configuración por compañía: el umbral es **global** (`business_config`, una fila); no hay override por compañía.
- Columna de motivo (`void_reason`) en `billing_ledger`: la distinción origen-sistema vs origen-humano se infiere de `voided_by`; no se añade columna ni auditoría formal.
- Indicador de UI "Too short" distinto: se reusa el badge **Marked non-billable**; no hay tooltip/etiqueta diferenciada.
- Re-evaluación retroactiva de **Calls** ya registradas al cambiar el umbral: explícitamente fuera de alcance.
- Abrir `/business-model` (Price per call / Billing threshold) a `admin`: la petición inicial se corrigió a **solo root**; sin cambios de gating.
- Cambios en el cron de cobro o en `reconcile-balance`: ya ignoran `status = 'void'` (ADR-001), no requieren tocarse.
- Publicación automática de este PRD en Zenboard: bloqueada por falta de credenciales (ver Further Notes).

## Further Notes

- **Bloqueo de publicación**: el skill `to-prd` indica publicar en el issue tracker y que el vocabulario/credenciales "should have been provided ... run `/setup-matt-pocock-skills`". Ese comando no existe en este entorno y no hay token de Zenboard en el repo, en las skills ni en `~/.claude`. La API `https://zenboard-agents.vercel.app/api/boards/01KQ0X4M0F706XNPSSAH02DJVX/tasks/01KQYTB67NA4HVGA3CWCKXQ3KK` responde `401 No autorizado`. Este PRD queda guardado localmente; la subida a Zenboard requiere que se provea un token/credencial o se ejecute el setup.
- ADR-007 documenta la decisión y matiza ADR-001 (el badge **Marked non-billable** ya no implica "acción humana"; mirar `voided_by`).
- Documentación diferida al PR de implementación: `docs/flows.md` (Flujo 1 debe describir la rama de auto-void) y `docs/database.md` (nueva columna en `business_config`).
