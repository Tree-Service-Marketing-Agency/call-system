# Design: Call System MVP

## Context

Proyecto greenfield sobre Next.js 16 (App Router) con un `create-next-app` recien inicializado. No hay codigo existente — todo se construye desde cero. El sistema recibe datos de llamadas via webhooks de n8n, los almacena en PostgreSQL, y los presenta en un dashboard multi-tenant con 4 roles.

## Goals / Non-Goals

**Goals:**
- Dashboard funcional con auth, roles, y vistas diferenciadas
- Ingesta confiable de webhooks con soporte para registros parciales
- Billing informativo con historial via date range picker
- UI consistente usando shadcn/ui

**Non-Goals:**
- Procesamiento de pagos (billing es solo informativo)
- Notificaciones en tiempo real (no websockets)
- App movil o PWA
- Integracion directa con Retell API (todo llega via n8n)
- Descarga/almacenamiento de audio (se usa el link de Retell hasta que expire)

## Decisions

### 1. Estructura de base de datos

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   users     │────▶│  companies       │◀────│company_agents│
│             │     │                  │     │              │
│ id          │     │ id               │     │ id           │
│ email       │     │ name             │     │ company_id   │
│ password    │     │ created_at       │     │ agent_id     │
│ role        │     │ updated_at       │     └──────────────┘
│ company_id  │     └──────────────────┘            │
│ is_active   │                                     │
│ created_at  │     ┌──────────────────┐            │
└─────────────┘     │     calls        │◀───────────┘
                    │                  │      (via agent_id)
                    │ id               │
                    │ call_id          │ ← unique con agent_id
                    │ agent_id         │
                    │ company_id       │ ← derivado de agent_id
                    │ -- webhook 1 --  │
                    │ customer_name    │
                    │ customer_phone   │
                    │ customer_address │
                    │ customer_zipcode │
                    │ customer_city    │
                    │ service          │
                    │ summary          │
                    │ call_date        │
                    │ -- webhook 2 --  │
                    │ event            │
                    │ call_status      │
                    │ start_timestamp  │
                    │ end_timestamp    │
                    │ duration_ms      │
                    │ audio_url        │
                    │ retell_cost      │ ← referencia interna
                    │ -- billing --    │
                    │ billing_price    │ ← precio vigente al registrar
                    │ webhook1_received│
                    │ webhook2_received│
                    │ created_at       │
                    │ updated_at       │
                    └──────────────────┘

                    ┌──────────────────┐
                    │ business_config  │
                    │                  │
                    │ id               │
                    │ price_per_call   │
                    │ updated_at       │
                    │ updated_by       │
                    └──────────────────┘
```

**Rationale**: Una sola tabla `calls` con flags `webhook1_received` / `webhook2_received` simplifica el cruce de datos. El `billing_price` se captura al momento del registro para respetar precios historicos. No se crea tabla separada de "customers" — la agrupacion por telefono se hace con queries.

**Alternativa descartada**: Dos tablas separadas (webhook1_data + webhook2_data) con merge en lectura. Mas complejo sin beneficio real dado que ambos webhooks comparten `call_id`.

### 2. Estrategia de auth

Auth.js con credenciales (email/password) y JWT. El JWT incluye: `userId`, `role`, `companyId`.

**Rationale**: No se necesita OAuth ni proveedores externos. Los usuarios son creados manualmente. JWT permite validacion stateless en middleware.

**Alternativa descartada**: Session-based auth. No tiene ventaja cuando no hay necesidad de revocacion inmediata y el deploy es serverless (Vercel).

### 3. Estructura de rutas (App Router)

```
app/
├── login/page.tsx                    ← pagina publica
├── (dashboard)/                      ← layout con sidebar + auth guard
│   ├── layout.tsx                    ← sidebar, billing en sidebar
│   ├── calls/page.tsx                ← registro de llamadas
│   ├── customers/page.tsx            ← registro de clientes
│   ├── companies/
│   │   ├── page.tsx                  ← tabla de companias
│   │   └── [id]/page.tsx             ← detalle de compania
│   ├── users/page.tsx                ← gestion de usuarios (staff_admin)
│   ├── billing/page.tsx              ← vista global billing (admin/root)
│   └── business-model/page.tsx       ← config precio (root)
├── api/
│   ├── auth/[...nextauth]/route.ts   ← Auth.js
│   ├── webhooks/
│   │   ├── call-data/route.ts        ← webhook 1
│   │   └── call-ended/route.ts       ← webhook 2
│   ├── calls/route.ts
│   ├── customers/route.ts
│   ├── companies/route.ts
│   ├── users/route.ts
│   └── business-model/route.ts
└── ...
```

**Rationale**: Route group `(dashboard)` permite un layout compartido con sidebar y auth sin afectar la URL. Cada seccion tiene su pagina. Los webhooks estan separados para claridad.

### 4. Sidebar dinamico por rol

El sidebar se renderiza condicionalmente segun el rol del usuario:

| Seccion         | root | admin | staff_admin | staff |
|-----------------|------|-------|-------------|-------|
| Llamadas        | ✓    | ✓     | ✓           | ✓     |
| Clientes        | ✓    | ✓     | ✓           | ✓     |
| Companias       | ✓    | ✓     | ✗           | ✗     |
| Usuarios        | ✓    | ✓     | ✓           | ✗     |
| Business Model  | ✓    | ✗     | ✗           | ✗     |
| Billing (sidebar)| ✗   | ✗     | ✓           | ✓     |
| Billing (pagina)| ✓    | ✓     | ✗           | ✗     |

### 5. Audio expiration

La expiracion se calcula client-side comparando `created_at` + 30 dias vs fecha actual. No se necesita cron ni job de limpieza.

**Rationale**: Retell maneja la expiracion. Solo necesitamos indicar visualmente cuando el link ya no es valido.

### 6. Webhooks sin autenticacion (MVP)

Los endpoints de webhook son publicos en el MVP. n8n los invoca directamente.

**Alternativa futura**: Agregar un shared secret o API key para validar que el webhook viene de n8n.

## Risks / Trade-offs

- **[Webhooks publicos]** → Cualquiera podria enviar datos falsos. Mitigacion: aceptable para MVP, agregar API key en fase 2.
- **[Audio link expiration client-side]** → Si el reloj del usuario esta desfasado, podria mostrar estado incorrecto. Mitigacion: riesgo bajo, 30 dias da mucho margen.
- **[Sin tabla de customers]** → Queries de agrupacion por telefono pueden ser lentas con muchos registros. Mitigacion: indice en `customer_phone` + `company_id`. Si crece, se materializa una tabla.
- **[Registros parciales]** → Pueden quedar llamadas incompletas permanentemente si un webhook nunca llega. Mitigacion: aceptable, se muestran como parciales en el UI.
- **[Single business_config row]** → No hay historial de cambios de precio. Mitigacion: el precio se captura en cada registro de llamada, asi que el historial se reconstruye desde `calls.billing_price`.

## Open Questions

_(Ninguna por ahora — todas las dudas fueron resueltas en la fase de discovery)_
