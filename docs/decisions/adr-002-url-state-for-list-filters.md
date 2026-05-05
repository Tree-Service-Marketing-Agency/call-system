# ADR-002: Estado de filtros en URL para listas del dashboard

**Fecha:** 2026-05-04
**Estado:** Aceptado

## Contexto

`/calls` necesita aceptar varios filtros simultáneos (`companyId`, `billing`) y se anticipan páginas adicionales del dashboard con filtros propios. Hoy el estado de filtros vive en `useState` local: refrescar la página los borra y los links no son compartibles. La pregunta operativa es para `root`: cuando investiga una llamada y quiere mandar el contexto a un compañero, debe poder copiar el link.

## Decision

Mover el estado de los filtros, búsqueda y paginación a la URL como query params, leyendo con `useSearchParams()` y escribiendo con `router.replace(..., { scroll: false })` **inline** dentro de `calls-client.tsx`. Sin abstracción a un hook compartido todavía.

Convención de codificación:
- Sin valor: param ausente (no `?billing=` ni `?billing=all`).
- Single-valor (caso actual): `?companyId=uuid&billing=pending`. Naming en singular.
- Multi-valor (cuando aplique en el futuro): comma-separated y naming plural. Ej: `?ids=a,b`.

## Razon

- **Refresh-safe y compartible**: caso de uso real para operación — `root` investiga, copia link, lo manda. Local state pierde esto.
- **Browser back/forward**: aplicar/deshacer filtros pasa a ser una acción del navegador, no requiere UI extra.
- **Sienta precedente para el dashboard**: cuando se agreguen `/billing`, `/customers` con filtros, ya hay un patrón.
- **Inline, no hook**: con un solo consumidor (`calls-client.tsx`) un hook generico es abstraccion prematura. Una abstraccion construida con un solo ejemplo casi siempre no encaja con el segundo. Mejor inline ahora, extraer cuando exista una segunda pagina con filtros.

## Alternativas descartadas

| Alternativa | Por que se descarto |
|---|---|
| Estado local con `useState` (status quo) | Pierde refresh-safety y links compartibles. Migrar despues es mecanico pero deja en deuda los links que el equipo ya hubiera compartido. |
| URL state con hook `useUrlFilters<T>()` generico desde el inicio | Abstraccion prematura. La forma del hook se moldea por un solo caso de uso; el segundo caso casi siempre rompe la API y obliga a refactor. Costo > beneficio hasta tener 2+ ejemplos reales. |
| Repeated params (`?companyId=a&companyId=b`) en lugar de comma-separated | Genera URLs mas largas y menos legibles al copiar/pegar. La forma repetida solo gana cuando los valores pueden contener comas, lo cual no aplica (UUIDs y enums fijos). |

## Consecuencias

- `app/api/calls/route.ts` mantiene `companyId` (single) y agrega `billing` (single). Si en el futuro algun filtro se vuelve multi-valor, se renombra a plural (`companyIds`) y se serializa comma-separated.
- Cualquier filtro futuro en `/calls` debe seguir el mismo patron (URL inline, comma-separated si multi, plural si multi). Un filtro nuevo que viva solo en `useState` rompe la consistencia de la pagina.
- **Trigger para extraer un hook compartido**: cuando una segunda pagina del dashboard agregue filtros tipo lista, comparar las dos implementaciones y extraer el patron real. No antes.
- El debounce de ~250ms en cada cambio implica que la URL puede no reflejar exactamente el estado UI durante ese intervalo. Aceptable: nadie comparte un link en la mitad de un toggle.
- Filtros que vivan fuera de la URL (ej. estado UI puro como "qual sheet esta abierto") no aplican a este patron — solo filtros que afectan el dataset visible.
- **Multi-select se evaluo y se descarto** para Company y Billing en esta iteracion: un dropdown estandar resulto mas legible para esta tabla. Si la necesidad regresa (ej. comparar dos compañias), volver a evaluar — la convencion plural+comma ya esta documentada.
