# ADR-013: La extracción de leads ocurre en n8n, no en la app

**Fecha:** 2026-06-22
**Estado:** Aceptado

## Contexto

El **Text agent** conversa con el visitante para captar sus datos (el **Lead**,
definido por el **Catalog**). Esos datos hay que extraerlos del transcript y
enviarlos a un CRM. La pregunta es **dónde** corre esa extracción: dentro de
esta app (una llamada LLM estructurada sobre el transcript) o en n8n, que ya es
el orquestador de integraciones (rutea destinos y notificaciones por compañía,
ya consume `/api/external/*`).

## Decisión

La app **no** corre ninguna llamada LLM de extracción. Expone, vía
`GET /api/external/chats/pending` (auth `x-api-key`), las **Chat conversations**
en `status = pending` **y** `source = widget`, cada una con su **Catalog**, sus
**Chat messages** y `last_interaction_at`. **n8n** extrae las variables, las
envía al CRM y marca la conversación `sent` vía `PATCH /api/external/chats/status`.
Este sistema **no** persiste el `lead_data` extraído (v1).

## Razón

- Mantiene la app **delgada**: sin un segundo pipeline LLM, sin esquema de
  `lead_data`, sin versionar la lógica de extracción.
- **Centraliza la lógica de CRM en n8n**, que ya decide destinos y
  notificaciones por compañía. Partirla entre app y n8n duplicaría reglas.
- El **Catalog** ya existe para guiar al agente; reusarlo como contrato de
  extracción ("qué campos") evita una segunda fuente de verdad.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Extracción post-hoc in-app (un pase estructurado sobre el transcript al cerrar el chat) | Mete un segundo pipeline LLM y un esquema de `lead_data` en un sistema que quiere quedarse delgado; duplica la lógica de CRM que ya vive en n8n. |
| Extracción incremental con una tool (`save_lead_data`) durante el chat | Acopla el agente a un esquema de extracción y obliga a manejar tools/costo de tools en v1; n8n hace el trabajo igual de bien fuera del camino caliente. |

## Consecuencias

- El **Catalog** tiene **doble rol**: se inyecta en el system prompt para que el
  agente *pida* esos datos, y viaja en `/chats/pending` para que n8n sepa qué
  *extraer*.
- El agente de texto v1 **no necesita tools**; la pregunta "¿las tools tienen
  costo?" queda *moot* en v1.
- El `Chat status` (`pending → sent`, terminal) es el handshake con n8n: una vez
  `sent`, mensajes posteriores se anexan pero la conversación no reaparece en
  `/chats/pending`.
