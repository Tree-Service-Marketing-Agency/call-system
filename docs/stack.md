# Stack Tecnico — Call System

## Resumen

| Capa | Tecnologia | Para que |
|---|---|---|
| Framework | Next.js 16 | App Router, SSR, API routes (webhooks) |
| UI | React 19 + shadcn/ui | Componentes, tablas, sheets, dialogs |
| Estilos | Tailwind CSS 4 | Utilidades CSS, theming |
| Auth | Auth.js | Autenticacion con JWT, roles |
| ORM | Drizzle | Queries type-safe a PostgreSQL |
| Base de datos | PostgreSQL | Almacenamiento relacional |
| Lenguaje | TypeScript 5 | Tipado estatico |
| Linting | ESLint 9 | Calidad de codigo |

---

## Detalle por tecnologia

### Next.js 16

Framework fullstack con App Router y React Server Components. Maneja tanto el frontend (dashboard) como el backend (API routes para webhooks de n8n).

**Por que se eligio:**
Permite tener frontend y backend en un solo proyecto. Las API routes reciben los webhooks de n8n sin necesitar un servidor separado.

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| Express + React SPA | Dos proyectos separados, mas complejidad de deploy |

### shadcn/ui

Libreria de componentes accesibles construida sobre Radix UI. No es una dependencia — copia los componentes al proyecto.

**Por que se eligio:**
Componentes de alta calidad (Sheet, AlertDialog, Switch, Combobox, DataTable) que cubren las necesidades del dashboard sin crear componentes custom.

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| Material UI | Mas pesado, estilos opinionados dificiles de customizar con Tailwind |
| Componentes custom | Mas tiempo de desarrollo sin beneficio claro |

### Auth.js

Framework de autenticacion para Next.js con soporte nativo de JWT.

**Por que se eligio:**
Integracion nativa con Next.js App Router. JWT permite autenticacion stateless con roles embebidos en el token.

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| Clerk | Costo adicional por usuario, menos control sobre el flujo |
| NextAuth v4 | Version anterior, Auth.js es la evolucion |

### Drizzle ORM

ORM type-safe para TypeScript con soporte nativo de PostgreSQL.

**Por que se eligio:**
Queries type-safe que se validan en compilacion. Migraciones declarativas. Lightweight comparado con Prisma.

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| Prisma | Mas pesado, genera un cliente que agrega overhead |
| SQL directo | Sin type safety, propenso a errores |

### PostgreSQL

Base de datos relacional robusta.

**Por que se eligio:**
Los datos son inherentemente relacionales (companias → agentes → llamadas → usuarios). Soporte maduro para queries complejas y agregaciones (billing mensual).

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| MySQL | PostgreSQL tiene mejor soporte en el ecosistema Drizzle/Vercel |
| MongoDB | Datos relacionales no encajan bien en modelo de documentos |

### Tailwind CSS 4

Framework de utilidades CSS.

**Por que se eligio:**
Incluido en el template de Next.js. Compatibilidad nativa con shadcn/ui.

**Alternativas descartadas:**

| Alternativa | Por que se descarto |
|---|---|
| CSS Modules | Mas verbose, no se integra tan bien con shadcn |
