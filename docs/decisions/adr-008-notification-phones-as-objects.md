# ADR-008: Notification phones como objetos `{ phone, note, disabled }`

**Fecha:** 2026-05-19
**Estado:** Aceptado

## Contexto

`companies.notification_phones` es hoy una columna `text[]`: un array plano de números E.164 US que la agencia configura para que se notifique a esas personas ante un nuevo lead. El operador no recuerda **de quién** es cada número, y quiere poder silenciar uno sin borrarlo. La lógica de a quién se notifica vive en n8n, que lee estos números vía `GET /api/external/companies/by-agent/[agentId]` (hoy devuelve `notificationPhones: string[]`).

Pide dos cosas por número: una **Note** de texto libre (máx. 150 caracteres) para identificarlo, y un flag **Disabled** que excluya ese número de las notificaciones — sin que este sistema implemente el filtrado, que se queda en n8n.

Esto obliga a que cada teléfono deje de ser un `string` y pase a ser un objeto, lo que cambia tanto el almacenamiento interno como el **contrato de la API externa que n8n ya consume**.

## Decisión

1. **Almacenamiento**: `companies.notification_phones` cambia de `text[]` a `jsonb`, array de objetos `{ phone, note, disabled }`. Migración: cada string `s` → `{ phone: s, note: "", disabled: false }`; array vacío → `[]`.
2. **`phone`**: se sigue normalizando con `normalizeUsPhone` (E.164 US). Entrada con `phone` inválido/vacío se descarta entera (con su nota). No se permiten dos entradas con el mismo `phone` normalizado: el API responde **400**.
3. **`note`**: string, `trim`, vacío permitido, **máx. 150 caracteres**. Validado en cliente (contador en vivo) y servidor (400).
4. **`disabled`**: booleano, default `false`. `true` = n8n no debe notificar. Este sistema **solo almacena y expone** el flag; no filtra.
5. **Contrato externo (cambio incompatible)**: `GET /api/external/companies/by-agent/[agentId]` devuelve `notificationPhones` como array de objetos **incluyendo los `disabled`**. n8n filtra por `disabled` del lado de su workflow.
6. **UI**: el tab de Settings de la compañía expone los tres campos (phone, note, toggle disabled). El onboarding expone solo phone + note (los teléfonos nacen `disabled: false`).

## Razón

- **jsonb de objetos** en vez de tabla separada: la lista es chica, acotada y siempre se edita en bloque; una tabla añade joins, otra migración y CRUD para algo que nunca se consulta relacionalmente.
- **Exponer los `disabled` y que n8n filtre** respeta la frontera que pidió el usuario: la lógica de notificación es de n8n. Filtrar server-side metería decisión de notificación en este backend y ocultaría datos útiles para depurar el workflow.
- **`disabled` (no `enabled`)** evita el doble negativo en n8n: el enunciado del usuario es "si está disabled, no notificar"; invertir la polaridad invita a errores en el filtro.
- **150 caracteres (no 150 palabras)**: contar palabras es ambiguo (puntuación, saltos de línea) y no enforceable a nivel de dato; un límite de caracteres es exacto e idéntico en cliente y servidor.
- **Rechazar duplicados (no deduplicar silencioso)**: deduplicar last-wins haría perder una nota sin avisar; permitirlos deja a n8n con `disabled` contradictorio para el mismo número.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Tabla `notification_phones` separada | Más relacional pero innecesario: la lista se edita siempre completa; añade joins, migración y CRUD. |
| API externa filtra y devuelve solo activos | Mete lógica de notificación en este backend (contradice "n8n lleva la lógica") y oculta los disabled para debugging. |
| Mantener `string[]` + arrays/columnas paralelas para note/disabled | Frágil: desalinea índices entre arrays; modela mal una entidad que es un objeto. |
| `enabled` (polaridad positiva) | Invierte el enunciado del usuario y obliga a n8n a chequear `!enabled`, más propenso a error. |
| Límite por palabras (150 palabras) | Definición de "palabra" ambigua y no enforceable; ~igual de útil que un tope de caracteres exacto. |
| Deduplicar duplicados last-wins | Silencioso: el usuario pierde una nota sin enterarse. |

## Consecuencias

- **Contrato externo roto.** El workflow de n8n que hoy lee `notificationPhones` como `string[]` debe actualizarse para leer `.phone` de cada objeto y filtrar por `.disabled`. Coordinar el deploy con el cambio en n8n.
- **Migración**: `notification_phones` `text[]` → `jsonb` con transformación (`jsonb_agg(jsonb_build_object('phone', p, 'note', '', 'disabled', false))` sobre `unnest`, `COALESCE` a `'[]'::jsonb` para arrays vacíos).
- **Validación nueva** en PATCH `/api/companies/[id]` y POST `/api/onboarding`: array de objetos; `phone` requerido y normalizable; `note` ≤150 chars; `disabled` booleano opcional (default false); rechazo 400 ante duplicados de `phone` normalizado.
- **Tipos a actualizar**: `CompanyForSettings`, `CompanyDetail`, `OnboardCompanyInput`, y la respuesta del endpoint externo `by-agent`.
- **UI**: `settings-tab.tsx` (textarea con contador + toggle por fila) y `onboarding-client.tsx` (textarea por fila, sin toggle).
- **`CONTEXT.md` actualizado**: añadidos los términos **Notification phone**, **Note**, **Disabled**; relación Company→Notification phones; resueltas las ambigüedades "comentario/descripción/label" y "isDisabled/enabled".
- **Docs pendientes**: `docs/database.md` (cambio de tipo de columna). Se difiere al PR de implementación.
