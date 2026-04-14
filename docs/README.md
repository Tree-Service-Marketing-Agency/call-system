# Call System

> Dashboard para gestionar llamadas de agentes de voz (Retell AI) para empresas de tree service. Producto de una agencia de marketing que centraliza leads capturados por recepcionistas virtuales.

**Estado:** 🟡 En desarrollo
**Tipo:** Dashboard / SaaS interno
**Cliente:** Empresas de tree service (clientes de la agencia)
**Deadline:** Por definir

---

## Documentacion

| Archivo | Que encuentras ahi |
|---|---|
| [brief.md](brief.md) | Que es, problema que resuelve, estado actual |
| [stack.md](stack.md) | Tecnologias y justificacion de cada una |
| [flows.md](flows.md) | Flujos del sistema con diagramas Mermaid |
| [database.md](database.md) | Esquema de base de datos, tablas y relaciones |
| [roadmap.md](roadmap.md) | Sprints y tareas por semana |
| [questions.md](questions.md) | Preguntas abiertas y respondidas |
| [resources.md](resources.md) | Links y materiales de referencia |

---

## Decisiones Tecnicas

| # | Decision | Estado |
|---|---|---|
| — | Sin decisiones registradas aun | |

-> Ver indice completo en [decisions/README.md](decisions/README.md)

---

## Stack Rapido

- **Framework:** Next.js 16 — App Router, SSR, API routes
- **UI:** React 19 + shadcn/ui — componentes e interactividad
- **Estilos:** Tailwind CSS 4 — utilidades CSS
- **Auth:** Auth.js — autenticacion con JWT
- **ORM:** Drizzle — type-safe queries
- **Base de datos:** PostgreSQL — almacenamiento relacional
- **Lenguaje:** TypeScript 5 — tipado estatico
