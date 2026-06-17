# ADR-011: El historial del chat se reconstruye desde la base; el cliente solo manda el último mensaje

**Fecha:** 2026-06-09
**Estado:** Aceptado

## Contexto

El endpoint `/api/chat` (Route Handler, Vercel AI SDK + OpenRouter) es la base de un chat embebible en páginas de terceros vía iframe. El default de `useChat` es mandar el array **completo** de mensajes en cada request, y el PRD original era ambiguo: pedía que el cliente mandara `messages` y a la vez que el backend "cargara el historial desde la base". En el destino final del producto, el cliente es una burbuja anónima en una página que no controlamos — es decir, un cliente no confiable.

## Decision

La base es la única fuente de verdad del historial. El request lleva `conversationId` + el último mensaje del Customer, nada más (en el cliente, `prepareSendMessagesRequest` del AI SDK recorta el payload — patrón de persistencia documentado del SDK). El servidor reconstruye el contexto del LLM leyendo `chat_messages` ordenado por `created_at`.

Complementos del contrato que fijan la autoridad del servidor:

- El `conversationId` lo genera **siempre** el backend (primer mensaje sin id → inserta en `chat_conversations` y lo devuelve en el header `X-Conversation-Id`, presente en toda respuesta). Un id que no existe en la base → 404. Nunca upsert: el cliente no inventa ids.
- El mensaje del Customer se persiste **antes** de abrir el stream; el del Chat assistant, en el `onFinish` del stream con el texto acumulado (sobrevive al cierre de la burbuja a media respuesta).

## Razón

- **El historial deja de ser manipulable por el cliente.** Con el default de `useChat`, cualquiera puede inyectar/alterar turnos previos (incluido el system-adjacent context) en cada request. Cuando la burbuja sea pública y multi-tenant, eso sería un agujero directo; cerrarlo después implicaría romper el contrato del widget ya desplegado en páginas de clientes.
- **Los criterios de aceptación ya exigen la base como verdad** ("al revisar la base, existen los registros… ligados al conversationId correcto"). Tener dos fuentes (payload del cliente + base) garantiza drift entre lo que el LLM vio y lo que quedó registrado.
- **Payloads constantes y chicos**, independientes del largo de la conversación — relevante para un widget embebido en páginas ajenas.
- **La futura asociación por compañía cuelga natural**: la creación de conversaciones ya pasa por el servidor, así que `companyId` + validación de origen se agregan en ese único punto.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Default de `useChat`: el cliente manda todo el historial y la base solo persiste | Historial del LLM manipulable por un cliente que será anónimo y de terceros; drift posible entre lo persistido y lo enviado; habría que revertirlo (rompiendo el contrato del widget) antes de la fase pública. |
| El cliente genera el `conversationId` (UUID local) y el backend hace upsert | Cualquier string del cliente se vuelve fila en la base; la validación por tenant futura tendría que lidiar con ids creados fuera del control del servidor. |
| Devolver el `conversationId` como data part al inicio del stream | Idiomático del AI SDK pero acopla el contrato al protocolo de stream del SDK y es más ceremonia para leerlo desde curl/tests. El header `X-Conversation-Id` es out-of-band y trivial; cuando haya cross-origin se expone con `Access-Control-Expose-Headers`. |

## Consecuencias

- El widget/página de prueba necesita transport custom de `useChat` (`prepareSendMessagesRequest` + captura del header) — no funciona el wiring default de los ejemplos del SDK. Este ADR existe para que nadie lo "simplifique" de vuelta.
- Features tipo editar/regenerar/branchear un mensaje requerirán soporte explícito del servidor (no basta con que el cliente reescriba su array local).
- El servidor paga una lectura de `chat_messages` por request — irrelevante a esta escala; índice por `(conversation_id, created_at)`.
- En esta fase `/api/chat` queda detrás de la sesión del dashboard (solo agency users), sin tocar `proxy.ts`; abrirlo al público es un cambio puntual que debe llegar **junto con** la validación de origen por dominio, nunca antes.
