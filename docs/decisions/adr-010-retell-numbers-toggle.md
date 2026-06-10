# ADR-010: Retell numbers como pares número↔agente togglables (primera integración outbound a Retell)

**Fecha:** 2026-06-09
**Estado:** Aceptado

## Contexto

Hasta ahora el sistema modelaba el teléfono de Retell de una compañía como un descriptor: una columna única `companies.retell_phone_number` (un solo número por compañía, texto libre, sin efecto operativo) y una tabla `company_agents` aparte que mapeaba `agent_id → company_id` para que la ingesta (`call_ended`) y el endpoint externo `by-agent` resolvieran compañía. Ninguna de las dos superficies *hacía* nada hacia Retell: toda la relación con Retell era **inbound** (webhooks vía n8n).

La realidad operativa cambió (PRD #41): una compañía puede tener **varios** números, cada número pertenece a **un** agente, y la agencia necesita **encender/apagar** un número — que Retell deje de atender llamadas entrantes en él — desde este dashboard, sin entrar al dashboard de Retell. Eso convierte al número en una entidad accionable y obliga a la **primera llamada saliente** de este sistema a la API de Retell.

Además, el dato legacy estaba fragmentado: el número vivía en `companies` y el agente en `company_agents`, sin relación entre sí, con compañías de 3 agentes y 1 número donde el par real era indeterminable desde los datos.

## Decisión

1. **Tabla nueva `retell_numbers`** — `{ company_id, agent_id, phone_number, enabled }` — que **reemplaza** a `companies.retell_phone_number` y **absorbe** a `company_agents` (ambas dropeadas al final de la migración). `agent_id` es único y requerido; `phone_number` es único pero **nullable** (un agente puede existir antes de que su número esté aprovisionado). Una compañía tiene cero o más filas; cada número tiene exactamente un agente.
2. **Primera integración outbound a Retell**: cliente propio en `lib/retell-client.ts` que hace `PATCH https://api.retellai.com/update-phone-number/{phone}` con bearer `RETELL_API_KEY`. Encender = `inbound_agents: [{ agent_id, agent_version: "latest", weight: 1 }]`; apagar = `inbound_agents: null`. Módulo profundo: expone solo `enableAgentOnNumber` / `disableAgentOnNumber` con resultado discriminado `{ ok } | { ok: false, error }`, nunca lanza, timeout de 10s.
3. **`enabled` es cache local con write-through**: el toggle llama a Retell **primero** y persiste el flag en la DB **solo** si Retell respondió 2xx. Ninguna pantalla lee el estado live de Retell — la lista y el detalle pintan desde la DB.
4. **Resolución de compañía por `agent_id`** contra `retell_numbers`: la ingesta del webhook `call_ended` y el endpoint externo `by-agent` dejan de leer `company_agents` y resuelven contra la tabla nueva (mismo contrato externo).
5. **Toggle root-only**: solo `root` puede accionar el Switch (gate en `canToggleRetellNumber` + `requireRole("root")` en `POST .../toggle`). `admin` gestiona filas (alta/edición/borrado, solo DB) pero ve el toggle deshabilitado. Apagar pide confirmación (AlertDialog); encender no.
6. **Siempre `agent_version: "latest"`, sin pin**: nunca se fija una versión del agente al encender.
7. **Status agregado por compañía** en `/companies`: columna **Status** derivada de los `enabled` de sus filas — todos `true` → **Active**; mezcla → **Partial**; todos `false` → **Inactive**; sin filas → `—` (`deriveRetellStatus` en `lib/retell-numbers.ts`).

## Razón

- **Una tabla con `phone_number` nullable** en vez de mantener `company_agents` aparte: el agente y su número son la misma entidad operativa (el par es 1:1); dos tablas duplicarían `agent_id` y reabrirían la fragmentación que hizo indeterminable el par legacy. El nullable permite migrar las filas de `company_agents` sin número conocido **sin romper la ingesta** (que solo necesita `agent_id → company_id`).
- **Write-through (Retell primero, DB después)**: el flag `enabled` nunca afirma un estado de ruteo que Retell no confirmó. Si Retell falla, la DB no cambia y la UI revierte.
- **Cache local en vez de lectura live**: la lista de `/companies` no puede pagar N llamadas a Retell por render (latencia, rate limits, dependencia dura de un tercero para pintar una tabla). Se acepta el **drift** si alguien edita inbound agents directamente en el dashboard de Retell — sin reconciliación por ahora.
- **Siempre `latest`**: la agencia republica agentes en Retell con frecuencia; un pin de versión convertiría cada republicación en mantenimiento manual aquí. Con `latest`, republicar surte efecto sin tocar este sistema.
- **Root-only para el toggle**: apagar un número detiene llamadas entrantes reales de un cliente — mismo nivel destructivo que **Void** o desactivar usuarios, que ya son privilegios de `root`.
- **Resolución por `agent_id` (no por número)**: es la clave que Retell manda en el webhook y la que `by-agent` ya usa; el número puede ser null y no identifica al agente.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Leer el estado live de Retell al pintar (sin cache) | N llamadas a Retell por render de la lista; latencia y rate limits; la UI quedaría rehén de la disponibilidad de Retell. El cache write-through pinta desde DB y solo habla con Retell al accionar. |
| Mantener `company_agents` + tabla nueva solo para números | Duplica `agent_id` en dos tablas y deja el par número↔agente otra vez partido — exactamente el problema del modelo legacy. |
| Conservar `companies.retell_phone_number` como columna | Un solo número por compañía contradice la realidad (compañías con varios números) y la columna no conocía a qué agente pertenecía. |
| Persistir `enabled` antes de llamar a Retell (write-back / optimista en DB) | Si Retell falla, la DB afirmaría un ruteo falso. El flag solo se escribe tras 2xx; el optimismo se queda en la UI, que revierte. |
| Pin de versión del agente (`agent_version: N`) | Cada republicación del agente en Retell exigiría actualizar el pin aquí. `latest` hace que republicar surta efecto sin mantenimiento. |
| Job de reconciliación contra Retell (cron) | Más superficie para un drift que hoy es aceptado y poco frecuente. Documentado como caveat; migrable después sin cambiar el modelo. |
| Toggle para `admin` también | Detener llamadas entrantes de un cliente es destructivo; el patrón del sistema reserva lo destructivo a `root` (Void, deactivate). |

## Consecuencias

- **Nuevo punto de integración externo** (el primero outbound a Retell): requiere `RETELL_API_KEY` en el entorno, manejo de error explícito (el endpoint devuelve `502` con el mensaje de Retell truncado) y **reversión optimista** en la UI — el Switch se mueve al instante y vuelve a su posición si el POST falla, mostrando el error.
- **Drift posible y aceptado**: cambios hechos directamente en el dashboard de Retell no se reflejan en `enabled`. Caveat documentada; sin reconciliación en esta iteración. El siguiente toggle desde aquí re-impone el estado local.
- **Toggle root-only**: `admin` queda en solo lectura sobre el estado del número (Switch deshabilitado con hint); puede gestionar las filas pero no el ruteo.
- **Migración en dos pasos** con runbook (`docs/runbooks/retell-numbers-migration.md`): primero la migración **aditiva** (`drizzle/0010`) + backfill idempotente desde `company_agents` (+ fixup manual de los pares ambiguos), y solo tras smoke tests el **drop** destructivo (`drizzle/0011`: `DROP TABLE company_agents` + `DROP COLUMN retell_phone_number`).
- **Filas legacy sin número**: un **Retell number** con `phone_number` null no es togglable (`canToggleRetellNumber` → `no_phone`); la UI muestra "No phone yet" y el Switch deshabilitado hasta que se capture el número.
- **`/companies` gana la columna Status** (Active/Partial/Inactive/—) y la columna de números muestra el primer phone (+N si hay más).
- **Docs**: término **Retell number** redefinido en `CONTEXT.md` (entidad accionable múltiple, antes descriptor único), términos **Active/Inactive** distinguidos de `isActive` de usuarios y **Disabled** de notification phones, y caveat de drift en Flagged ambiguities.
