# ADR-006: Consolidación en un solo webhook `call_ended` — deprecación de `call_data` y eliminación del concepto "Partial"

**Fecha:** 2026-05-18
**Estado:** Aceptado — supersede parcialmente a ADR-004 (alternativa "consolidar" e impacto sobre la regla no-sobrescribir)

## Contexto

ADR-004 dejó dos webhooks vivos: `call_data` (datos del cliente, durante la llamada) y `call_ended` (audio, duración, costo, transcript, al terminar). En su tabla de alternativas descartadas, ADR-004 rechazó *"Consolidar `call-data` y `call-ended` en un solo endpoint"* con esta razón textual:

> "El nuevo payload de n8n no incluye `address`, `zipcode`, `city`, `service`, `callDate`."

Esa premisa cambió. El nuevo payload de n8n para `call_ended` **sí** incluye los datos del cliente (`full_name`, `service_needed`, `address`, `city`, `zip_code`, `phone`/`from_number`, `summary`) además de los metadatos. El análisis post-llamada se hará una sola vez, al terminar la llamada. Tener dos webhooks dejó de aportar valor y agrega una ventana de inconsistencia (**Partial call**).

Consecuencia de dominio: si `call_data` desaparece, toda **Call** nace directo de `call_ended` con el equivalente a `webhook2_received = true`. El estado **Partial** de `deriveBillingState` (`lib/billing/state.ts`) se vuelve inalcanzable, y las columnas `webhook1_received`/`webhook2_received` quedan sin propósito.

## Decisión

1. **Eliminar `/api/webhooks/call-data/route.ts`.** n8n deja de llamarlo (está bajo control operativo propio, ADR-004); no hay consumidores externos. Un POST extraviado da 404.
2. **`call_ended` sigue recibiendo objeto plano, no array.** El payload crudo de Retell viene envuelto en `[{...}]`; **n8n lo desenvuelve** antes de mandarlo a Lola. La decisión #4 de ADR-004 (rechazar arrays con 400) **se mantiene intacta**.
3. **n8n es el único responsable del mapeo de nombres de campo.** Lola lee los nombres ya normalizados por n8n (`name`, `service`, `address`, `city`, `zipcode`, `phone`, `summary`, `recording_url`, `call_cost`, `transcription_object`, etc.). Consistente con ADR-004 (n8n ya es la capa de transformación).
4. **n8n convierte el sentinel `"Not provided"` de Retell a `null` (u omite el campo).** Lola no conoce ese sentinel. Mantiene la columna en `NULL` → UI muestra `—` → la regla no-sobrescribir sigue permitiendo corrección manual futura.
5. **`call_ended` puebla los campos de cliente** (`customerName`, `service`, `customerAddress`, `customerCity`, `customerZipcode`, `customerPhone`) que antes ponía `call_data`.
6. **`callDate` se deriva de `start_timestamp`** dentro de `call_ended` (epoch ms → fecha), reemplazando el `date` que mandaba `call_data`.
7. **Eliminar el concepto "Partial" por completo:** quitar el valor `"Partial"` de `BillingState` y de `deriveBillingState` (que deja de depender de webhooks y pasa a ser puramente función del ledger), hacer `DROP COLUMN` de `webhook1_received` y `webhook2_received`, y borrar los términos `Partial call` / badge `Partial` de `CONTEXT.md`.

## Razón

- **La premisa que mató la consolidación en ADR-004 ya no aplica.** El payload nuevo trae los datos de cliente. Mantener dos webhooks ahora solo conserva la ventana **Partial** sin ningún beneficio.
- **n8n desenvuelve el array (no Lola)** preserva la decisión #4 de ADR-004 sin reabrirla: el contrato de Lola ("solo objeto plano, array → 400") no se toca; el cambio queda contenido en n8n, que ya es la capa de transformación.
- **n8n dueño del mapeo y del sentinel** mantiene a Lola desacoplada del shape crudo de Retell, exactamente el espíritu de ADR-004 (Lola no debe conocer `full_name` ni `"Not provided"`).
- **Eliminar "Partial" entero, no dejarlo como código muerto.** Sin `call_data` el estado es inalcanzable; un badge que nunca se pinta y dos columnas siempre-constantes son deuda que confunde al próximo lector. Drop limpio.
- **`callDate` desde `start_timestamp`** es más preciso que el fallback a `createdAt` (que es el momento de inserción del row, no el inicio real de la llamada) y el dato ya viaja en el payload.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Aceptar array `[{...}]` en `call_ended` (Lola lo desenvuelve) | Reabriría la decisión #4 de ADR-004 (rechazada ahí con razones aún válidas). n8n ya transforma el payload — desenvolver ahí es de menor costo y no acopla Lola al shape de Retell. |
| Lola mapea nombres crudos (`full_name`→`customerName`, etc.) | Acopla Lola al shape de Retell. ADR-004 ya estableció a n8n como la capa de normalización; partir esa responsabilidad es incoherente. |
| Guardar el literal `"Not provided"` | Es string no-vacío → `hasValue()` lo trata como dato real → bloquea edición manual futura (rationale (2) de ADR-004) y la UI muestra "Not provided" en vez de `—`. |
| Conservar `webhook1_received`/`webhook2_received` como histórico | Sin `call_data` nunca vuelven a variar. Columnas constantes que sugieren un flujo de dos fases que ya no existe. |
| Tombstone 410 en `call-data` por un ciclo | n8n está bajo control propio; se reconfigura en el mismo deploy. El 410 solo difiere el borrado sin agregar señal real. |
| Dejar `callDate` en `null` y caer a `createdAt` | `createdAt` ≈ fin de llamada (inserción del row), no inicio real. `start_timestamp` ya está en el payload y es exacto — usarlo es costo casi nulo. |

## Consecuencias

- **ADR-004 queda parcialmente supersedido:** su alternativa descartada "consolidar" se invierte, y su regla "no-sobrescribir" (#6) pierde el rationale (1) ("`call_data` ya pobló el campo antes que `call_ended`") porque ya no hay carrera entre dos webhooks. La regla se conserva igual: ahora protege solo contra reproceso/retry de n8n y contra edición manual futura (rationale (2) de ADR-004).
- **Migración con `DROP COLUMN`.** Las **Calls** históricas que quedaron genuinamente parciales (solo `call_data`, sin `call_ended`, sin **Ledger entry**) pierden la marca de webhook; su badge pasa a computarse solo desde el ledger → `null` → celda `—`. Aceptado por la decisión de limpieza completa.
- **`deriveBillingState` cambia de firma:** ya no recibe `webhook2Received`. Todos los call sites (`/api/calls`, `/api/calls/[id]`, `calls-client.tsx`, `call-detail-sheet.tsx`) deben dejar de pasar/leer ese campo.
- **Contrato con n8n se endurece más.** n8n ahora es responsable de: desenvolver el array, normalizar nombres, convertir `"Not provided"`→null, e inyectar `phone`/`from_number`. Si n8n falla o cambia shape, las **Calls** nuevas amanecen sin datos de cliente (igual que ADR-004; las facturas no dependen de estos campos).
- **`/customers` depende de `customerPhone`.** El payload incluye `phone` y `from_number` (mismo valor); n8n debe mandarlo siempre como `phone` o la página de Customers queda vacía para llamadas nuevas.
- **Docs pendientes:** `docs/flows.md` (Flujo 1 describe dos webhooks — debe pasar a uno) y `docs/database.md` (filas `webhook1_received`/`webhook2_received` a remover). Se difiere al PR de implementación.

## Tabla de renombrado para n8n (Retell crudo → lo que debe mandar a Lola)

| Campo Retell (crudo) | Campo a mandar a Lola | Nota |
|---|---|---|
| `full_name` | `name` | `"Not provided"` → `null` |
| `service_needed` | `service` | `"Not provided"` → `null` |
| `address` | `address` | `"Not provided"` → `null` |
| `city` | `city` | `"Not provided"` → `null` |
| `zip_code` | `zipcode` | `"Not provided"` → `null` |
| `phone` / `from_number` | `phone` | siempre presente; llave de Customers |
| `summary` | `summary` | — |
| `call_cost` | `call_cost` | número decimal USD (ADR-003) |
| `recording_url` | `recording_url` | Lola también acepta `audio_url` |
| `transcription_object` | `transcription_object` | Lola lo filtra a `[{role, content}]` |
| `start_timestamp` | `start_timestamp` | Lola deriva `callDate` de aquí |
| `end_timestamp`, `duration_ms`, `disconnection_reason`, `call_status`, `event`, `call_id`, `agent_id` | (igual) | sin cambio |
| (el array envoltorio `[ … ]`) | — | **n8n lo desenvuelve**: manda `{...}`, no `[{...}]` |
