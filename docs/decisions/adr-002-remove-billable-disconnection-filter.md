# ADR-002: Eliminar filtro automático por `disconnection_reason`

**Fecha:** 2026-05-04
**Estado:** Aceptado — supersedea la decisión cerrada en `prd/stripe.md` §21

## Contexto

La regla original (PRD §21) restringía la creación de cargos a llamadas con `disconnection_reason = 'user_hangup'`. Cualquier otro disconnection reason hacía que el webhook handler hiciera un early-return sin tocar `billing_ledger`. La idea era proteger al cliente de cobros por llamadas "fallidas".

En operación esa regla generó dos problemas:

1. **Falsos negativos en cobro**: varios disconnection reasons no-`user_hangup` representan llamadas legítimamente cobrables. Ejemplo concreto: `agent_hangup` después de una conversación útil donde el agente cerró la llamada — eso hoy se descarta automáticamente y nunca se cobra. La lista de Retell (`retell-sdk`) tiene 30+ valores; cualquier curaduría manual se vuelve obsoleta cuando el SDK agrega nuevos.
2. **UX ruidosa**: el operador abre `/calls` y ve muchas llamadas en estado **Not billable** sin haber tomado decisión alguna. La columna deja de comunicar "yo decidí no cobrar esto" y pasa a comunicar "el sistema decidió por ti, basado en una regla que tal vez ya no aplica".

Con la acción manual **Mark non-billable** (ADR-001) ya disponible, el filtro automático se vuelve redundante.

## Decisión

**Eliminar el filtro `disconnection_reason !== 'user_hangup'`** del webhook handler. Toda `call_ended` con compañía resuelta crea una `billing_ledger` entry con status `pending`, sin importar el disconnection reason.

La acción manual **Void** (ADR-001) es la única ruta para excluir una llamada del cobro. El operador asume la responsabilidad explícita de revisar y voidear las llamadas que no deberían cobrarse.

El campo `disconnection_reason` se sigue almacenando en la fila de `calls` para auditoría y reporting, pero ya no afecta decisiones financieras automáticas.

## Razón

- **Coherencia con el modelo manual**: con Void disponible, no hay justificación para tener dos rutas a no-cobrable. Una sola fuente de decisión (el operador) es más claro y más auditable.
- **Resiliencia ante cambios upstream**: Retell puede agregar/renombrar disconnection reasons; nuestro código deja de ser sensible a esa lista.
- **UX más honesta**: la columna **Billing** ahora refleja decisiones humanas (`Pending` por default → `Marked non-billable` si root la marcó). El operador ve exactamente lo que él decidió.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Mantener el filtro y educar al operador | El filtro es una decisión de producto que el operador no puede revertir desde la UI. Si una llamada se filtró en el webhook, no aparece nunca en estado `Pending` y no hay forma de "desfiltrarla" sin SQL crudo. Eso es asimetría inaceptable. |
| Ampliar el filtro a más `disconnection_reasons` (ej.: incluir `agent_hangup`, `transfer_bridged` también) | Cualquier curaduría manual se vuelve obsoleta. Retell tiene 30+ valores y agrega más cada release. |
| Filtrar por duración mínima (ej.: < 5 segundos = no cobrable) | Heurística frágil. Una llamada de 4 segundos podría ser legítima ("¿Está abierto el local?"); una de 60 segundos podría ser ruido. Mejor que el operador decida con contexto completo en el sidebar. |

## Consecuencias

- **El operador asume nueva responsabilidad**: revisar llamadas `Pending` y voidear las que no deberían cobrarse. Se compensa con la visibilidad de la columna **Billing** y el flujo Void/Restore.
- **Datos históricos no se backfillean**: las llamadas que se filtraron antes de este ADR siguen sin `billing_ledger` entry y aparecen como **Not billable** indefinidamente. Hacer backfill cobraría retroactivamente y eso requiere consentimiento explícito del cliente — fuera de alcance de este ADR.
- **Caso huérfano persiste**: si llega un `call_ended` con un `agent_id` que no está en `company_agents`, no se puede crear ledger entry (FK NOT NULL en `billing_ledger.company_id`). Esa llamada aparece como **Not billable**. No es elección de producto — es restricción de schema. Si el caso se vuelve común, se trata como bug operativo (agente no registrado), no como diseño.
- **Sección §21 del PRD queda obsoleta** y se referencia este ADR como reemplazo. Las menciones del filtro en §3, §7.1, §8.1, §9.2, §12.2, §19, §20, §22, §23, §24 quedan obsoletas también — el PRD se actualiza en este mismo cambio para reflejar la nueva regla.
- Reversible: si el negocio decide volver al filtro, se restaura el bloque borrado en `app/api/webhooks/call-ended/route.ts` y se actualiza este ADR a "Superseded by ADR-00X".
