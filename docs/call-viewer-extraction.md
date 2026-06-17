# Extracción: "Call Viewer" (producto nuevo)

> Hand-off de la sesión `/grill-with-docs` (2026-06-16). Extraer la funcionalidad de
> registro + visualización de llamadas de **call-system** a un producto nuevo, sin billing.
> Este doc describe **otro producto** (repo nuevo); no modifica call-system.

## Qué es el nuevo producto

Un **visor de llamadas** standalone: recibe un webhook por cada llamada de Retell,
la registra, y la muestra (lista + detalle con transcript y audio). Pinta el **costo**
que Retell reporta por llamada. **No** cobra a nadie.

## Decisiones cerradas (grilling)

| # | Decisión | Resolución |
|---|----------|------------|
| 1 | Forma del destino | **Repo nuevo greenfield**, mismo stack (Next.js 16 + Drizzle + Postgres + Auth.js). Se copian los módulos de calls ~1:1 y se borra billing. |
| 2 | Multi-tenancy | **Single-account, lista plana.** No hay `companies`. `agent_id` queda como metadata, no resuelve nada. |
| 3 | Auth | **Lo provee el producto destino — NO entra en la extracción ni en el PRD.** El viewer vive detrás del login existente del host. Única regla que sobrevive: cualquier usuario autenticado ve todo, incluido el costo (sin gating por rol). |
| 4 | El costo | Es `retell_cost` (lo que Retell reporta por llamada, USD). Se **renombra a "Call cost"**, visible para todos. Se pinta en **columna de la lista + campo en el detalle**. |
| 5 | Fuente del webhook | **n8n en medio**, mismo contrato (ADR-004). Webhook + `map-call-ended-payload` se portan casi 1:1. |
| 6 | Superficies opcionales | Se lleva el **link público de audio** (`/audio-call/<id>`, ADR-009). **Se descarta** `/customers`. |
| 7 | Qué registrar | **Todas** las `call_ended` (incluye voicemail / no-answer / failed). Filtrar "solo conectadas" sería UI, no webhook. |
| 8 | Datos | **DB limpia.** Sin backfill. Solo llamadas nuevas. |

## La inversión semántica del costo (lo más sutil)

En **call-system** hay **dos** conceptos de dinero:

- `billing_price_cents` = lo que la agencia **cobra** a la compañía → **es billing, se va**.
- `retell_cost` = lo que **Retell nos cobra** → hoy es **secreto** (ADR-003 lo gatea a
  root/admin porque revela el margen).

En el nuevo producto no hay precio cobrado contra qué compararlo, así que `retell_cost`
**deja de ser margen secreto** y pasa a ser **el costo público de la llamada**. Por eso:
se renombra a **"Call cost"**, se **desgatea** (todos lo ven), y se **saca de la tab Billing**
(que muere) hacia la lista y el detalle.

## Esquema final `calls` (nuevo producto)

Una sola tabla nueva: `calls`. El login/usuarios los provee el producto destino (auth fuera de scope).

```
calls:
  id              uuid pk
  call_id         text          -- "Retell ID"
  agent_id        text          -- metadata (qué agente atendió); ya no resuelve compañía
  -- Cliente (extraídos por n8n del análisis de Retell)
  customer_name, customer_phone, customer_address,
  customer_city, customer_zipcode, service, summary, call_date
  -- Metadata de la llamada
  event, retell_event, call_status, disconnection_reason,
  start_timestamp, end_timestamp, duration_ms, audio_url
  -- Costo (antes retell_cost; numeric(10,6) USD). Visible para todos. Mapea de payload.call_cost
  call_cost       numeric(10,6)
  -- Transcript filtrado [{role, content}]
  transcript      jsonb
  created_at, updated_at
```

**Columnas eliminadas de `calls`:** `company_id`, `billing_price_cents`,
`billing_counted_at`, `invoice_id`.

**Tablas eliminadas por completo:** `companies`, `retell_numbers`, `billing_ledger`,
`invoices`, `business_config`, `stripe_webhook_events`.

## Qué se porta vs. qué se deja

**Se porta (sin billing):**
- `app/api/webhooks/call-ended/route.ts` → solo las líneas 56–135 (registrar la llamada).
  Se arranca todo lo de líneas 138–270 (resolución de compañía, ledger, void, balance).
- `lib/calls/map-call-ended-payload.ts` (intacto).
- `lib/webhook-auth.ts` (`verifyN8nSecret`).
- `lib/public-recording-link.ts`, `lib/recording.ts` (`isAudioExpired`, regla 30 días), `lib/phone.ts`.
- `app/(dashboard)/calls/*` → quitar columnas **Company** y **Billing** de la lista; quitar
  la **tab Billing** del detail sheet; añadir **Call cost** a lista y detalle.
- `components/calls/inline-audio-player.tsx`, `components/calls/call-transcript.tsx`, `components/ui/audio-player.tsx`.
- `app/audio-call/[id]/page.tsx` (link público).

> **Auth NO se porta:** el producto destino ya tiene login. El PRD no debe incluir
> autenticación; se asume que el viewer queda detrás del auth del host.

**Se deja (no se porta):**
- `lib/billing/*`, `lib/stripe.ts`, `lib/notifications/billing.ts`, `lib/retell-client.ts`,
  `lib/retell-numbers.ts`, `lib/notification-phones.ts`, `lib/area-code.ts`, `lib/onboarding/*`.
- `/companies`, `/users` (gestión multi-tenant), `/business-model`, `/billing`, `/onboarding`.
- Stripe webhook, cron de cobro, invoices.

## Comportamientos que sobreviven (heredados, ojo)

- **El webhook devuelve `{ id, url }`** (el link público de audio) para que n8n lo
  distribuya (ADR-009). Se mantiene porque conservas `/audio-call`.
- **`disconnection_reason` pasa a ser puro display.** Ya no es un gate de billing; solo
  metadata que puede pintarse en el Status.
- **Audio expira a 30 días** (regla de Retell + sistema). Se hereda `isAudioExpired`.
- **Columnas de la lista nuevas:** Customer, Phone, Status, Duration, Date, **Cost**.

## Stack y construcción de la UI (para replicar el mismo estilo)

### Librerías (de `package.json`)

| Capa | Librería | Versión | Nota |
|------|----------|---------|------|
| Framework | `next` | 16.2.3 | App Router + RSC. **No es el Next que conoces** (ver `AGENTS.md`): `middleware.ts`→`proxy.ts`, breaking changes. |
| UI runtime | `react` / `react-dom` | 19.2.4 | React 19. |
| Estilos | `tailwindcss` v4 + `@tailwindcss/postcss` | ^4 | **CSS-first**: no hay `tailwind.config.js`. Todo el tema vive en `app/globals.css` con `@import "tailwindcss"` + `@theme inline`. |
| Componentes | `shadcn` v4 | ^4.2.0 | Estilo **`base-nova`** (ver `components.json`). |
| Primitivos | `@base-ui/react` | ^1.3.0 | **NO es Radix.** shadcn v4 corre sobre Base UI. Sin prop `asChild` → se usa el patrón `render={<.../>}` + `useRender`/`mergeProps`. |
| Variants | `class-variance-authority` | ^0.7.1 | `cva()` para variantes de componente. |
| className merge | `clsx` + `tailwind-merge` | — | Combinados en `cn()` (`lib/utils.ts`). |
| Iconos | `lucide-react` | ^1.8.0 | `iconLibrary: "lucide"`. |
| Fuentes | `geist` | ^1.7.0 | Geist Sans + Geist Mono self-hosted vía `geist/font/sans` y `geist/font/mono`. |
| Toasts | `sonner` | ^2.0.7 | `<Toaster richColors position="bottom-right" />` en el root layout. |
| Command/combobox | `cmdk` | ^1.1.1 | Base del `Command` (usado por filtros). |
| Fechas | `date-fns` + `react-day-picker` | — | `Calendar` + `date-range-picker`. |

> **No se necesitan** para el viewer: `stripe`, `@stripe/*` (billing), `retell-sdk` (era para el toggle), `bcryptjs`/`next-auth`/`@auth/drizzle-adapter` (auth la da el host). `agentation` es solo dev.

### Tema (copiar `app/globals.css` tal cual)

- **Paleta verde sobre neutral cálido.** `--primary: rgb(21,84,58)` (verde profundo), `--background: rgb(250,250,247)` (off-white cálido), `--card: #fff`. Acentos verdes.
- **Token propio `--muted-foreground-2`** (un gris aún más tenue que `muted-foreground`) — se usa muchísimo para metadata secundaria (horas, separadores `·`, placeholders).
- `--radius: 0.5rem`; escala `radius-sm/md/lg/xl`.
- **Tracking global negativo:** `--tracking-normal: -0.01em` aplicado al `body`. Titulares con `tracking-tight`.
- Sombras custom suaves teñidas de verde (`--shadow-*`). Las tablas usan `shadow-xs`.
- **Dark mode** vía clase `.dark` + `@custom-variant dark`. Todos los tokens tienen su variante.
- Números siempre con `tabular-nums`; teléfonos / IDs con `font-mono`.

### Shell y patrones (de `components/`)

- **Layout dashboard:** `SidebarProvider` + `<AppSidebar>` + `<SidebarInset>`, envuelto en `TooltipProvider` (`app/(dashboard)/layout.tsx`). El sidebar es el primitivo `components/ui/sidebar.tsx`.
- **Encabezado de página:** `<PageHeader title subtitle actions />` (título 22px semibold tracking-tight, subtítulo muted, `border-b`) + `<PageBody>` para el contenido.
- **Lista:** `FilterBar` (search + filtros) arriba → `Table` dentro de `div.overflow-hidden.rounded-xl.border.bg-card.shadow-xs` → `DataTablePagination` abajo. Empty state muted "No calls found".
- **Detalle:** click en fila abre un `Sheet` lateral derecho (`CallDetailSheet`) con `Tabs` (Call / Transcript) + reproductor de audio embebido (`InlineAudioPlayer`).
- **Badges de estado:** variantes `success / warning / destructive / secondary / outline / ghost / link / default` (`components/ui/badge.tsx`). Helper `statusBadge()` mapea el `call_status` de Retell → variante.
- **Métricas (opcional):** `<StatCard label value trend />` (label 11px uppercase tracking-wider, valor 3xl tabular-nums).
- **Inventario de primitivos en `components/ui/`** (copiar los que uses): `alert-dialog, audio-player, avatar, badge, button, calendar, card, command, dialog, dropdown-menu, input-group, input, label, popover, select, separator, sheet, sidebar, skeleton, switch, table, tooltip`.

### Cómo arrancar el look-and-feel en el repo nuevo

1. `npx create-next-app` (Next 16) + Tailwind v4, y **copiar `app/globals.css` completo** (es el tema entero).
2. Copiar `components.json` (style `base-nova`, baseColor `neutral`, alias).
3. Copiar `lib/utils.ts` (`cn`) y los primitivos de `components/ui/` que necesites.
4. Fuentes: `geist` + el patrón del root layout (`GeistSans.variable` / `GeistMono.variable` + `font-sans`).
5. Copiar los patrones de layout: `app/(dashboard)/layout.tsx`, `components/app-sidebar.tsx`, `components/layout/page-header.tsx`, `page-body.tsx`, `components/dashboard/filter-bar.tsx`, `data-table-pagination.tsx`, `stat-card.tsx`.

## Pendientes / a tener en cuenta (no bloquean el diseño)

- **n8n:** hay que montar (o ramificar) un flujo n8n que apunte al nuevo endpoint con su
  propio secreto. El nuevo producto depende del mismo contrato de payload.
- **No se necesita Retell API client** en el nuevo producto (no hay toggle enable/disable).
  Es un receptor de webhook puro.
- **Dominio/URL:** el link público arma su URL desde la base del nuevo producto
  (`NEXT_PUBLIC_APP_URL` o equivalente).
- **Campos del cliente siguen siendo tree-service** (address, city, zipcode, service)
  porque n8n los extrae igual. Si el nuevo producto es de otra vertical, habría que
  ajustar la extracción en n8n y, opcionalmente, generalizar los campos.
- **¿ADR en el repo nuevo?** La decisión "single-account sin billing" y "el costo deja de
  ser margen secreto" valen un ADR en el repo nuevo (hard-to-reverse + sorprendente).
