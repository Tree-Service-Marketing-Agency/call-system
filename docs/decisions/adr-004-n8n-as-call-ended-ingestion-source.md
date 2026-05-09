# ADR-004: n8n como fuente de ingesta para `call_ended` — auth por shared secret, transcript persistido y campos protegidos

**Fecha:** 2026-05-09
**Estado:** Aceptado

## Contexto

El webhook `/api/webhooks/call-ended` hoy recibe directamente desde Retell:

- Verifica firma con `Retell.verify(rawBody, RETELL_API_KEY, x-retell-signature)`.
- Lee el shape original de Retell (`payload.call ?? payload`) con `event`, `agent_id`, `call_id`, `duration_ms`, `disconnection_reason`, etc.
- Persiste audio/duration/cost y dispara la entrada de ledger si `isBillableDisconnection`.
- No persiste `transcription_object` ni toca `customerName`/`summary` (esos los pone `/api/webhooks/call-data`, ver Flujo 1 en `docs/flows.md`).

Dos cambios fuerzan la evolución:

1. **n8n se intercala como capa de preprocesamiento.** El nuevo flujo es `Retell → n8n → Lola`. n8n masajea el payload de Retell antes de mandarlo: aplana el array de `transcription_object` a `[{role, content}]`, normaliza `call_cost` a decimal en dólares (ya cubierto por ADR-003), y agrega `name`, `summary`, `from_number` extraídos de la conversación.
2. **Necesidad de persistir el transcript** para pintarlo en el detail sheet a futuro. Hoy se pierde al ack del webhook.

Como el payload ya no viene de Retell, la firma `x-retell-signature` deja de existir. El endpoint quedaría abierto sin reemplazo, lo cual es serio: un POST con un `agent_id` válido y un `disconnection_reason` facturable inserta una entrada de ledger, mueve `current_balance_cents`, y la siguiente corrida de cron factura al cliente real. (`/api/webhooks/call-data` ya está sin auth — deuda preexistente que se hereda al call-ended si no se cierra.)

## Decisión

1. **Reemplazar `Retell.verify(...)` por shared secret.** Header `Authorization: Bearer ${N8N_WEBHOOK_SECRET}`, comparado con `crypto.timingSafeEqual` para evitar timing attacks. Fail-closed con 401 si falta o no matchea.
2. **Aplicar la misma autenticación a `/api/webhooks/call-data`.** Mismo secret, misma comparación. Cierra la deuda preexistente sin costo adicional — es el mismo n8n el que llama a ambos endpoints.
3. **Mantener el path `/api/webhooks/call-ended`.** No se renombra. n8n cambia de payload pero apunta al mismo URL.
4. **Aceptar solo objeto plano en el body**, no array. Si llega array, devolver 400 con `"expected object, got array"`. n8n se configura para des-envolver.
5. **Persistir `transcription_object`** filtrado a `[{role, content}]` en una columna nueva `calls.transcript jsonb`, nullable, tipada `TranscriptTurn[]`. Filtrar turnos con `content` vacío o whitespace; **no** consolidar turnos consecutivos del mismo rol (preserva fidelidad de la conversación).
6. **Regla "no sobrescribir" para `customerName`, `summary` y `customerPhone`:** si la columna ya tiene valor (no-null Y trimmed no-vacío), el webhook ignora el del payload. Solo escribe si la columna está nula o vacía. Aplica también a `customerPhone` por consistencia (ya tenía esta semántica parcial vía `existing.customerPhone ?? from_number`).
7. **`transcript` siempre se pisa con la versión del payload** si trae array no-vacío; si el payload no trae transcript, el valor previo se conserva. No aplica la regla de no-sobrescribir porque el transcript no se edita a mano y queremos la versión más fresca cuando hay reproceso.

## Razón

- **Shared secret > HMAC con timestamp** para este caso. n8n y Lola están bajo el mismo control operativo, no hay terceros consumiendo. HMAC + timestamp tolerance defiende contra replay attacks que hoy no son un vector real (n8n no expone su outbound payload a terceros). Costo de fricción extra (manejo de timestamp + tolerance + clock skew) sin beneficio concreto.
- **Eliminar firma Retell sin reemplazo no es opción.** El endpoint dispara cargas reales a clientes vía `billing_ledger`. Dejarlo abierto es regalar un vector de fraude trivial.
- **Cubrir `call-data` en el mismo PR** evita una ventana donde solo uno de los dos webhooks está protegido. Si fixeamos solo `call-ended`, el atacante apunta a `call-data` y igual mete registros falsos en `calls` (sin ledger entry, pero contaminando la tabla).
- **`jsonb` para `transcript`** alinea con ADR-003: dato estructurado, queryable, tipado nativamente por Drizzle. `text` con `JSON.stringify` repite el patrón que ADR-003 ya señaló como deuda.
- **Filtrar a `[{role, content}]` server-side** descarta `words`, `metadata.response_id` y otros campos del shape Retell que no se van a renderizar. Si el día de mañana se necesitan timestamps por palabra, la fuente de verdad siguen siendo los logs de Retell — no los reemplazamos.
- **No-overwrite en name/summary/phone** protege dos casos: (1) `call-data` ya pobló el campo durante la llamada y `call-ended` llega después con el mismo o distinto valor, y (2) un futuro flujo de edición manual en el dashboard donde un humano corrige el nombre — un reproceso del webhook no debe pisarlo.
- **Aceptar solo objeto plano** fuerza una decisión explícita en n8n. Aceptar `Array.isArray(body) ? body[0] : body` esconde la decisión y abre la puerta a recibir arrays multi-item que no sabemos qué semántica tienen.
- **Path sin renombrar** evita un punto de coordinación cross-service (n8n actualiza payload sin tocar URL).

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Dejar `call-ended` abierto sin auth | Inserta ledger entries → mueve balance → factura. Vector de fraude trivial con la URL pública y un agent_id válido (no es secreto). |
| HMAC con timestamp y tolerancia | Defensa contra replay no aplica al threat model actual (n8n controla su outbound, no expone). Fricción de implementación + clock skew sin beneficio. |
| IP allowlist de n8n | n8n cloud no garantiza IP estables. Vercel ve la IP del CDN, no la real, lo cual rompe el chequeo. |
| Renombrar el path a `/api/webhooks/n8n/call-ended` | Beneficio cosmético. Costo: coordinar update de URL en n8n al deploy. La fuente real (n8n) es detalle de transporte, no debería filtrarse al naming. |
| Aceptar array `[{...}]` o objeto plano indistintamente | Esconde la decisión de shape en n8n. Si llega array de >1 item, el comportamiento queda implícito. |
| Consolidar `call-data` y `call-ended` en un solo endpoint | El nuevo payload de n8n no incluye `address`, `zipcode`, `city`, `service`, `callDate`. Consolidar implicaría parsearlos del transcript en server (frágil) o pedirle a n8n que los inyecte (cambio mayor en n8n). Cero beneficio sobre mantener dos webhooks. |
| `transcript text` con `JSON.stringify` | ADR-003 ya pagó esa deuda con `retell_cost`. Repetir el anti-patrón en una columna nueva es deliberadamente regresar. |
| Última-escritura-gana para name/summary/phone | Pisa ediciones manuales y pisa el primer dato de `call-data` con el de `call-ended` que llega después, sin razón concreta para preferir el segundo. |
| Filtrar transcript en cliente al renderizar | Persistirías 5–10× más bytes por llamada (`words[]` con timestamps por token). Y filtras igual al render. Sin upside. |
| Consolidar turnos consecutivos del mismo rol al filtrar | El payload actual tiene segmentaciones reales (response_id distintos, interrupciones del usuario en medio). Concatenarlos pierde la pausa que el agent hizo cuando el usuario interrumpió. |

## Consecuencias

- **Cambio de contrato con n8n.** Si n8n cae o cambia el shape del payload, las llamadas nuevas amanecen con `transcript = NULL` y posiblemente `name`/`summary`/`from_number` faltantes. Aceptable porque las facturas al cliente no dependen de estos campos (dependen de `billing_price_cents` y `disconnection_reason`).
- **`retell-sdk` pierde su único call site.** El paquete sigue en `package.json` por si se usa para algo más a futuro; si en revisión se confirma que no, se puede remover en un PR de cleanup separado.
- **`RETELL_API_KEY` queda huérfano.** Sigue en `.env.example` como referencia pero el código no lo lee. Se elimina del runtime check.
- **`N8N_WEBHOOK_SECRET` se vuelve dependencia hard.** Si no está configurado, los dos webhooks devuelven 500 y todas las llamadas paran de persistirse. Documentado en `.env.example`.
- **Una columna nueva `calls.transcript jsonb`.** Migración auto-generada, nullable, sin backfill (las llamadas previas quedan con `NULL`; el dashboard se rinde con "—" cuando llegue la UI).
- **Regla de no-sobrescribir asimétrica.** `name`/`summary`/`phone` están protegidos; `address`, `zipcode`, `city`, `service`, `audio_url`, `duration_ms`, `retell_cost`, `call_status`, `disconnection_reason`, etc. siguen pisándose con cada webhook. Lectores nuevos deben notarlo: la asimetría se justifica porque solo los tres protegidos son candidatos a edición manual o a colisión cross-webhook.
- **Documentación pendiente** (no incluida en este ADR): `docs/database.md` debe sumar la fila `transcript`, `docs/flows.md` debe reflejar el shape unificado del payload de n8n, y `docs/decisions/README.md` debe registrar este ADR-004 en su índice. Se difiere a un commit posterior.
