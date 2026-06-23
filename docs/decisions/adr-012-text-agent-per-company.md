# ADR-012: Text agent por compañía (1:1) supersede el prompt global por env

**Fecha:** 2026-06-22
**Estado:** Aceptado

## Contexto

El chat de IA nació como un blueprint single-tenant portado de Bulldog Chat: un
único System Prompt **global por env** (luego versionado en una tabla
`prompt_versions` con puntero activo) y conversaciones sin dueño. Call System es
multi-compañía: cada compañía cliente necesita su propio agente de texto, con su
voz, su lista de datos a captar y su propio historial aislado. ADR-011 ya dejó el
historial detrás del servidor y anticipó explícitamente que "el `companyId` se
cuelga sin rediseño". Había que materializar ese upgrade sin romper el contrato
de chat ya decidido.

## Decisión

El agente de texto es una entidad **`text_agents` 1:1 por Company** (PK
`company_id`), con `system_prompt` **plano** (editable in-place, no versionado),
`model`, `catalog` (`jsonb`, array de `{ name, description }`) y `enabled`. El
`embed_key` y los `allowed_origins` llegan en la Fase 2. `chat_conversations`
gana `company_id`, `status` (`pending | sent`) y `source` (`widget |
playground`), realizando el upgrade que ADR-011 anticipaba.

La mecánica code-owned (fecha/hora, catálogo, "no inventes") se antepone al
prompt editable en runtime (`buildSystemPrompt`): el panel da forma a la voz, no
rompe la mecánica.

## Razón

- Un agente por compañía es lo que pide el dominio (un negocio, un chat). El PK
  `company_id` hace que la relación 1:1 la garantice la base, no el código.
- **Plano basta**: para un único registro por compañía, el versionado con
  puntero activo es maquinaria sin pago. Versionar es un upgrade conocido si
  algún día se quiere historial de prompts.
- El costo del modelo lo **absorbe la agencia** (la feature de texto es gratis
  en F1), así que el selector de modelo es una **allowlist curada** y no texto
  libre: acota el costo del self-serve de `staff_admin`.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| N agentes de texto por compañía | El ticket implica uno; el modelo 1:1 (PK `company_id`) es más simple y cubre el caso. |
| Prompt versionado con puntero activo (`prompt_versions`) | Maquinaria innecesaria para un 1:1; el prompt plano editable basta. Versionar queda como upgrade conocido. |
| Reusar `retell_numbers` para el agente de texto | Son agentes de **voz** externos a Retell, sin prompt local ni catálogo; conceptos distintos (ver glosario). |

## Consecuencias

- El prompt global por env queda **jubilado**; cada compañía configura su agente.
- El catálogo tiene doble rol (guía el system prompt y viaja a n8n — ver
  ADR-013).
- **Acceso en F1**: la configuración del **Text agent** y el historial de
  **Chats** viven como tabs del detalle de compañía, hoy alcanzable solo por
  **Agency users** (root/admin). El backend ya autoriza la matriz completa
  (agency cualquiera; `staff_admin` su compañía edita; `staff` su compañía
  read-only; costo solo agency, como `retell_cost` en ADR-003). La **superficie
  self-service dedicada para company users** (que `staff_admin`/`staff` lleguen
  a su propia config/chats sin pasar por `/companies`, que el `proxy` les bloquea)
  queda como **follow-up**: requiere rutas top-level + nav + cambios de `proxy`
  no detallados en el PRD.
- El **playground** es per-company (`/chat-playground?companyId=`), detrás de la
  sesión, y pueden **usarlo** root/admin (cualquier compañía) y el `staff_admin`
  de su compañía. Esto **supersede** la nota de ADR-011 de que `/api/chat` era
  "solo agency users": el endpoint sigue gateado por sesión (no público), pero la
  autorización es per-company. La apertura pública anónima sigue atada a la
  validación de origen de la Fase 2.
