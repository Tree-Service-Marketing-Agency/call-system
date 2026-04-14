# PRD — Sistema de Billing por Umbral con Stripe

**Proyecto**: call-system
**Fecha**: 2026-04-12
**Status**: Draft v4
**Owner**: Arturo

---

## 1. Contexto y objetivo

El `call-system` actual registra llamadas y calcula un cobro operativo por llamada a partir de `business_config.price_per_call`, pero el cobro al cliente final sigue siendo manual / fuera del sistema.

Este PRD define un sistema de **cobro automatizado por umbral** usando Stripe, con estas metas:

- Cobrar automáticamente a compañías cuando su consumo acumulado cruce un umbral global
- No almacenar datos sensibles de tarjeta dentro del sistema
- Tener trazabilidad financiera exacta y auditable por llamada
- Resistir reintentos de webhooks, fallos parciales y duplicados sin generar doble cobro
- Exponer visibilidad de balance, invoices y estado de pago a `root`, `admin` y `staff_admin` según su alcance

La fuente de verdad financiera deja de ser un contador mutable y pasa a ser un **billing ledger**: cada llamada facturable genera un movimiento contable único y auditable.

---

## 2. Goals

- Cobro automatizado por umbral usando Stripe Invoices
- Contabilidad interna exacta por llamada mediante `billing_ledger`
- Idempotencia fuerte ante retries de Retell y Stripe
- Seguridad en webhooks con verificación de firma
- Balance visible por compañía y global
- Reintentos de cobro delegados a Stripe Smart Retries
- Customer Portal para actualización de método de pago

---

## 3. Non-goals

- Multi-moneda
- Stripe Connect / multi-account
- Reembolsos y disputas automáticas
- Suspensión automática del servicio por deuda
- Emails reales en esta primera versión
- Billing basado en `call_data`; solo `call_ended` será evento financiero
- Facturación de llamadas con `disconnection_reason != 'user_hangup'`
- Soporte de DST; el cron corre fijo a las `05:00 UTC`

---

## 4. Decisiones cerradas

| Decisión | Valor |
|---|---|
| Evento Retell que genera cobro | `call_ended` únicamente |
| Filtro de facturabilidad | Solo `disconnection_reason = "user_hangup"` |
| Seguridad Retell | Verificación de `x-retell-signature` con body crudo + `RETELL_API_KEY` (HMAC-SHA256, ventana 5 min) |
| Billing model | `billing_ledger` como fuente de verdad |
| Money storage | Centavos enteros (`integer`) |
| Stripe model | One-off Invoices + Smart Retries |
| Umbral | Global, configurable por `root`, default $50 USD |
| Trigger de cobro | Cron diario 05:00 UTC + trigger manual root |
| Recuperación de tarjeta | Stripe Billing Portal (hosted) |
| Resultado de pago | Fuente de verdad = webhooks de Stripe |
| Reporte histórico mensual | Se mantiene por separado |
| Plataforma cron | Vercel Cron |
| Migración del campo `billingPrice` decimal | Drop + recreate como `billing_price_cents` (sistema nuevo, sin datos en producción) |

---

## 5. Personas y permisos

| Rol | Acceso Billing |
|---|---|
| `root` | Vista global, historial global, configurar umbral, ejecutar cron manual, ver estados y deuda |
| `admin` | Vista global, sin editar umbral, sin trigger manual |
| `staff_admin` | Solo su compañía: balance, método de pago, estado, historial de invoices |
| `staff` | Sin acceso |

Reglas:

- `staff_admin` nunca puede consultar otra compañía por query param
- Todo alcance de compañía para `staff_admin` se deriva de `session.user.companyId`
- El endpoint del cron programado no usa sesión; usa secreto interno
- El trigger manual sí requiere sesión `root`

---

## 6. Principios del diseño

### 6.1 Fuente de verdad financiera

La fuente de verdad financiera será la tabla `billing_ledger`.

Cada llamada facturable genera un único movimiento `call_charge`.
Un invoice se construye seleccionando movimientos concretos del ledger.
Cuando el invoice se paga, esos movimientos quedan liquidados.

### 6.2 Idempotencia

El sistema debe ser idempotente en tres niveles:

- **Retell webhook**
  Una misma llamada no debe generar más de un cargo financiero aunque `call_ended` se reenvíe.
- **Stripe invoice creation**
  La creación remota del invoice debe usar idempotency key.
- **Stripe webhook**
  Un mismo `event.id` no debe reprocesarse.

### 6.3 Seguridad

- Retell webhook: verificar firma con body crudo
- Stripe webhook: verificar firma con `STRIPE_WEBHOOK_SECRET`
- Cron endpoint: proteger con `CRON_SECRET`
- Endpoints sensibles: validar rol explícitamente

---

## 7. Modelo de negocio

### 7.1 Diagrama del flujo

```
┌──────────────────────────────────────────────────────────────────┐
│                       INGEST FINANCIERA                          │
│                                                                  │
│  Retell webhook call_ended                                       │
│    ├─ verifica firma HMAC-SHA256                                 │
│    ├─ filtra disconnection_reason = "user_hangup"                │
│    ├─ resuelve company_id por agent_id                           │
│    └─ inserta billing_ledger(call_charge) [UNIQUE call_id]       │
│         ↓                                                        │
│       suma current_balance_cents += amount_cents                 │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│                  COBRO DIARIO 05:00 UTC                          │
│                                                                  │
│  Cron / Trigger manual root                                      │
│    ├─ recovery: libera companies en charging > 1h                │
│    ├─ SELECT companies WHERE                                     │
│    │     current_balance_cents >= billing_threshold_cents        │
│    │     AND billing_status = 'idle'                             │
│    │     AND stripe_payment_method_id IS NOT NULL                │
│    │   FOR UPDATE SKIP LOCKED                                    │
│    │                                                             │
│    └─ por compañía:                                              │
│         ├─ reserva ledger entries (status: pending → reserved)   │
│         ├─ crea invoice local (status: pending)                  │
│         ├─ set billing_status = 'charging'                       │
│         ├─ crea Stripe Invoice (idempotency key)                 │
│         │   ├─ ✅ ok → persiste stripe_invoice_id                │
│         │   └─ ❌ fail → ledger vuelve a pending, status idle    │
│         └─ commit                                                │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│                   STRIPE WEBHOOKS                                │
│                                                                  │
│  invoice.paid                                                    │
│    ├─ liquida ledger reservado de ese invoice (paid)             │
│    ├─ asocia calls.invoice_id                                    │
│    ├─ resta amount_cents de current_balance_cents                │
│    └─ companies.billing_status = 'idle'                          │
│                                                                  │
│  invoice.payment_failed                                          │
│    ├─ companies.billing_status = 'payment_pending'               │
│    ├─ persiste attempt_count y next_attempt_at                   │
│    ├─ NOTIFICA root + staff_admin (console.log)                  │
│    └─ Stripe Smart Retries siguen activos en paralelo            │
│                                                                  │
│  invoice.marked_uncollectible                                    │
│    ├─ companies.billing_status = 'uncollectible'                 │
│    └─ NOTIFICA con severidad alta                                │
│                                                                  │
│  payment_method.detached                                         │
│    └─ limpia stripe_payment_method_id                            │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Análisis de costos Stripe

Stripe cobra dos fees apilados sobre cada invoice cobrado exitosamente:

- **Procesamiento de tarjeta**: `2.9% + $0.30` por cobro exitoso
- **Stripe Invoicing Starter**: `0.4%` por invoice pagado, capped at $2
- Smart Retries, dunning emails, Customer Portal, hosted invoice page, Card Updater: **gratis** (incluidos en Invoicing)

**Costo efectivo según umbral configurado**:

| Umbral | Costo Stripe total | % efectivo |
|---|---|---|
| $10 | $0.69 | 6.9% |
| $25 | $1.13 | 4.5% |
| **$50 (default)** | **$1.95** | **3.9%** |
| $100 | $3.60 | 3.6% |
| $250 | $8.35 | 3.3% |

**Implicación de producto**: el fee fijo de $0.30 muerde más fuerte cuanto más bajo es el umbral. El default de $50 da margen razonable; al subirlo a $100 se mejora ~0.3 puntos. La UI de root debe mostrar el % efectivo actual al lado del input del umbral para que la decisión sea informada.

---

## 8. Seguridad y webhooks externos

### 8.1 Retell webhook security

Esquema oficial de Retell (confirmado contra docs de Retell):

- Header: `x-retell-signature` con formato `v={timestamp_ms},d={hex_digest}`
- Algoritmo: `HMAC-SHA256(raw_body + timestamp, RETELL_API_KEY)`
- Ventana de validez del timestamp: **5 minutos** (anti-replay)
- Solo la API key con badge de webhook puede verificar
- IP allowlist `100.20.5.228` como defensa adicional, no como reemplazo

**Implementación recomendada**: usar el SDK oficial `retell-sdk` con `Retell.verify(rawBody, apiKey, signature)`. Para Next.js 16, el route handler debe leer el body como `Buffer` o `string` antes de cualquier `await req.json()` (re-serializar JSON cambia whitespace y rompe la firma).

**Pasos del handler**:

1. Leer raw body
2. Extraer header `x-retell-signature`
3. Llamar `Retell.verify(rawBody, RETELL_API_KEY, signature)`
4. Si falsa → 401, log de seguridad, return
5. Solo después de verificar, parsear JSON
6. Si `event !== 'call_ended'` → 204, salir
7. Si `call.disconnection_reason !== 'user_hangup'` → 204, salir (no facturable, pero sí almacenar la llamada para historial)
8. Procesar ingest financiera (ver 12.2)

**Consideraciones**:

- Retell reintenta el webhook hasta 3 veces si no recibe `2xx` en 10 segundos
- `call_id` es la llave base de idempotencia del cargo

### 8.2 Stripe webhook security

- Verificar firma con `STRIPE_WEBHOOK_SECRET` y body crudo
- Deduplicar por `event.id` en tabla `stripe_webhook_events`
- Si `event.id` ya está en la tabla → return 200 sin reprocesar

---

## 9. Data model

### 9.1 Convención de IDs

El proyecto actual usa IDs `text` con UUID serializado. Las tablas nuevas seguirán esa convención. No se introducirá `uuid` nativo solo para billing.

### 9.2 Cambios a tablas existentes

#### `companies`

Agregar columnas:

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| `stripe_customer_id` | text | yes | Stripe Customer ID |
| `stripe_payment_method_id` | text | yes | Default payment method |
| `billing_status` | enum | no | `idle` \| `charging` \| `payment_pending` \| `uncollectible` |
| `current_balance_cents` | integer | no | Balance pendiente actual materializado |
| `billing_updated_at` | timestamptz | yes | Última actualización de billing |
| `last_no_payment_warning_at` | timestamptz | yes | Throttle de notificaciones "sin tarjeta" |

`current_balance_cents` se mantiene como **caché materializado** del balance pendiente. La fuente de verdad sigue siendo `billing_ledger`.

#### `calls`

Cambios:

| Columna | Acción |
|---|---|
| `billingPrice` (decimal actual) | **DROP** |
| `billing_price_cents` | **CREATE** integer nullable — precio en centavos |
| `retell_event` | **CREATE** text nullable — evento que generó el registro |
| `invoice_id` | **CREATE** text FK nullable — invoice local asociado |
| `billing_counted_at` | **CREATE** timestamptz nullable — momento de creación del ledger entry |

Notas:

- `call-data` deja de tocar billing
- `call-ended` define el cargo (solo si `disconnection_reason = 'user_hangup'`)
- Como el sistema no tiene datos en producción, la migración es drop + recreate sin necesidad de data backfill

#### `business_config`

| Columna | Acción | Default |
|---|---|---|
| `pricePerCall` (decimal actual) | **DROP** | — |
| `price_per_call_cents` | **CREATE** integer | 100 ($1.00) |
| `billing_threshold_cents` | **CREATE** integer | 5000 ($50.00) |

---

## 10. Nuevas tablas

### 10.1 `billing_ledger`

Tabla fuente de verdad de cargos pendientes y liquidados.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text | PK |
| `company_id` | text FK | compañía dueña del cargo |
| `call_id` | text | referencia lógica a la llamada (Retell) |
| `call_row_id` | text FK | FK a `calls.id` |
| `entry_type` | enum | `call_charge` |
| `amount_cents` | integer | monto positivo del cargo |
| `status` | enum | `pending` \| `reserved` \| `paid` |
| `invoice_id` | text FK | local invoice reservado/liquidado |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Restricciones:

- `UNIQUE(call_id, entry_type)` para impedir doble cargo de una misma llamada
- índice por `(company_id, status, created_at)`

### 10.2 `invoices`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text | PK |
| `company_id` | text FK | |
| `stripe_invoice_id` | text | unique nullable hasta crear remote invoice |
| `amount_cents` | integer | suma de ledger reservado |
| `status` | enum | `pending` \| `paid` \| `failed` \| `uncollectible` \| `creation_failed` |
| `attempt_count` | integer | default 0 |
| `next_attempt_at` | timestamptz | nullable |
| `hosted_invoice_url` | text | nullable |
| `entry_count` | integer | número de ledger entries incluidas |
| `created_at` | timestamptz | |
| `paid_at` | timestamptz | nullable |
| `failed_at` | timestamptz | nullable |

### 10.3 `stripe_webhook_events`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text | PK = `event.id` |
| `type` | text | |
| `processed_at` | timestamptz | |

---

## 11. Índices

- `companies(billing_status)`
- `companies(current_balance_cents)`
- `billing_ledger(company_id, status, created_at)`
- `billing_ledger(invoice_id)`
- `billing_ledger(call_id, entry_type)` UNIQUE
- `invoices(company_id, status, created_at)`
- `invoices(stripe_invoice_id)` UNIQUE
- `calls(invoice_id)`
- `stripe_webhook_events(id)` PK

---

## 12. Flujo end-to-end

### 12.1 Onboarding de tarjeta

1. `staff_admin` entra a `/billing`
2. Si no hay método de pago, UI muestra "Agregar método de pago"
3. Backend crea Stripe Customer si no existe
4. Backend crea SetupIntent
5. Frontend renderiza Stripe `PaymentElement`
6. Usuario envía tarjeta
7. Stripe confirma SetupIntent
8. Webhook `setup_intent.succeeded` actualiza `stripe_payment_method_id`
9. UI refresca estado

### 12.2 Ingest financiera desde Retell: `call_ended`

Solo el webhook `call_ended` con `disconnection_reason = 'user_hangup'` tiene efecto financiero.

Flujo completo:

1. Recibir request en `POST /api/webhooks/call-ended`
2. Leer body crudo (Buffer / string sin parsear)
3. Verificar firma Retell con `Retell.verify(rawBody, RETELL_API_KEY, header)`
4. Si firma inválida → 401, log seguridad, return
5. Parsear JSON
6. Si `event !== 'call_ended'` → 204, salir
7. Resolver `company_id` por `agent_id` (vía `company_agents`)
8. **Upsert de `calls`** por `(call_id, agent_id)` siempre — guardamos el registro de la llamada incluso si no es facturable, para historial
9. Set `retell_event = 'call_ended'`
10. **Filtro de facturabilidad**: si `disconnection_reason !== 'user_hangup'` → 204, salir sin tocar ledger
11. Resolver `price_per_call_cents` desde `business_config`
12. En transacción:
    - Set `billing_price_cents = price_per_call_cents` en el row de `calls`
    - INSERT en `billing_ledger` con `entry_type = 'call_charge'`, `status = 'pending'`, `amount_cents = price_per_call_cents`
    - Si el INSERT viola `UNIQUE(call_id, entry_type)`:
      - Es un retry de Retell del mismo `call_id` — no sumar balance, no marcar `billing_counted_at`
      - Log: `ledger_duplicate_ignored`
    - Si el INSERT tuvo éxito:
      - `UPDATE companies SET current_balance_cents += amount_cents WHERE id = company_id`
      - Set `calls.billing_counted_at = now()`
13. Responder `204` lo antes posible

### 12.3 Cron diario de cobro

Schedule fijo: `0 5 * * *` (sin DST adjustment).

**Concurrencia con trigger manual**: el cron programado y el trigger manual de root invocan el mismo handler interno. La concurrencia entre ambos es segura porque el `SELECT FOR UPDATE SKIP LOCKED` por compañía garantiza que cada compañía sea procesada exactamente una vez por uno de los dos invocadores. Si root aprieta "Ejecutar cobro ahora" mientras el cron de las 05:00 UTC está corriendo, los dos se reparten las compañías sin pisarse.

**Pre-step recovery** (libera compañías colgadas):

```sql
UPDATE companies
SET billing_status = 'idle', billing_updated_at = now()
WHERE billing_status = 'charging'
  AND billing_updated_at < now() - interval '1 hour'
  AND NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.company_id = companies.id
      AND invoices.status = 'pending'
      AND invoices.stripe_invoice_id IS NOT NULL
  );
```

Solo libera si no hay un invoice `pending` con `stripe_invoice_id` válido (ese caso significa que el invoice sí se creó en Stripe y simplemente estamos esperando webhook de resultado).

**Selección de candidatas**:

```sql
SELECT id FROM companies
WHERE current_balance_cents >= (SELECT billing_threshold_cents FROM business_config)
  AND billing_status = 'idle'
  AND stripe_payment_method_id IS NOT NULL
FOR UPDATE SKIP LOCKED;
```

**Compañías skipeadas con log informativo** (en una segunda query, no en el lock):

- `stripe_payment_method_id IS NULL` AND `current_balance_cents >= threshold`:
  - Si `last_no_payment_warning_at IS NULL` o `< now() - interval '7 days'`:
    - Log warning + notificación a staff_admin
    - `UPDATE companies SET last_no_payment_warning_at = now()`
  - Si no, skip silencioso (throttle de 7 días para evitar ruido)
- `billing_status = 'payment_pending'`: log info "esperando Smart Retries"
- `billing_status = 'uncollectible'`: log warning "requiere acción manual"

**Proceso por compañía elegible** (en transacción):

1. Lockear compañía (`SELECT ... FOR UPDATE`)
2. Re-verificar condiciones (balance, status, payment method)
3. SELECT `billing_ledger` WHERE `company_id` = X AND `status = 'pending'`
4. Crear row local en `invoices` con `status = 'pending'`, `amount_cents = SUM(ledger.amount_cents)`, `entry_count = COUNT(*)`
5. UPDATE ledger entries seleccionadas: `status = 'reserved'`, `invoice_id = local_invoice_id`
6. UPDATE `companies SET billing_status = 'charging', billing_updated_at = now()`
7. Commit

**Después del commit** (fuera de transacción, llamadas a Stripe API):

8. Crear Stripe `InvoiceItem` con `amount = amount_cents`, descripción `"Servicio de llamadas — N llamadas"`
9. Crear Stripe `Invoice` con:
   - `customer = stripe_customer_id`
   - `auto_advance: true`
   - `collection_method: 'charge_automatically'`
   - `default_payment_method = stripe_payment_method_id`
   - **Idempotency key**: `invoice-{local_invoice_id}`
10. Persistir `stripe_invoice_id` y `hosted_invoice_url` en la row local

**Si Stripe API falla en pasos 8–10** (rollback financiero):

- UPDATE invoice local: `status = 'creation_failed'`
- UPDATE ledger entries del invoice: `status = 'pending'`, `invoice_id = NULL`
- UPDATE compañía: `billing_status = 'idle'`
- Log error con `run_id`, `company_id`, error de Stripe
- La compañía será re-elegible en el siguiente cron run o trigger manual

### 12.4 Trigger manual root

`POST /api/billing/run-cron` — solo `root`. Invoca el mismo handler interno que el cron programado.

### 12.5 Webhook de Stripe

`POST /api/webhooks/stripe`

Eventos manejados:

| Evento | Acción |
|---|---|
| `setup_intent.succeeded` | Persistir `stripe_payment_method_id` en la compañía. |
| `invoice.paid` | Marcar invoice local `paid`, `paid_at = now()`. UPDATE ledger entries reservadas para ese invoice → `status = 'paid'`. UPDATE `calls` que apuntan a esas entries → `invoice_id = local_invoice_id`. UPDATE `companies SET current_balance_cents -= invoice.amount_cents, billing_status = 'idle'`. |
| `invoice.payment_failed` | Marcar invoice local `failed`, persistir `attempt_count` y `next_attempt_at` del payload. UPDATE `companies SET billing_status = 'payment_pending'`. **Notificar root + staff_admin** (sección 18). |
| `invoice.marked_uncollectible` | Marcar invoice local y compañía como `uncollectible`. **Notificar con severidad alta**. |
| `payment_method.detached` | Limpiar `stripe_payment_method_id` en la compañía. **Tolerante**: si llega mientras `billing_status = 'charging'`, limpiamos el campo y dejamos que el invoice en flight siga su curso natural. Si Stripe rechaza el cobro por la tarjeta removida, llegará `invoice.payment_failed` y entrará al flujo normal de recuperación. |

**Reglas críticas**:

- Nunca marcar ledger por `company_id + invoice_id IS NULL` masivamente
- Solo liquidar el ledger que fue **reservado explícitamente** para ese invoice
- Restar `invoice.amount_cents` (lo que realmente se cobró), no resetear `current_balance_cents` a 0 — entre la creación del invoice y el `invoice.paid` puede haber entrado más volumen al ledger

---

## 13. Estados

### 13.1 `companies.billing_status`

- `idle` — puede ser considerada por cron
- `charging` — tiene invoice en proceso de creación / cobro
- `payment_pending` — Stripe falló, Smart Retries activos
- `uncollectible` — requiere resolución manual

### 13.2 `billing_ledger.status`

- `pending` — aún no facturado
- `reserved` — seleccionado para un invoice en curso
- `paid` — ya liquidado

### 13.3 `invoices.status`

- `pending`
- `paid`
- `failed`
- `uncollectible`
- `creation_failed`

---

## 14. UI / UX

### 14.1 Sidebar

Nueva entrada **Billing** visible para `root`, `admin`, `staff_admin`. No visible para `staff`.

### 14.2 Vista `/billing` para `staff_admin`

Layout: 3 cards arriba en grid, tabla abajo.

**Card "Balance actual"**
- Monto grande en USD: `$XX.XX`
- Subtítulo: "de $50.00 (umbral global)"
- Barra de progreso del balance contra el umbral, color verde si < 80%, ámbar si 80–100%, rojo si ≥ 100%
- Helper text: "Tu próximo cobro se procesará automáticamente cuando tu balance alcance el umbral."

**Card "Método de pago"**
- Si hay tarjeta guardada:
  - Icono de brand (Visa/MC/Amex)
  - `•••• 4242` (last4)
  - Texto secundario: "Expira XX/YY"
  - Botón secundario: "Actualizar tarjeta" → abre Customer Portal en nueva pestaña
- Si no hay tarjeta:
  - Estado vacío con icono
  - Texto: "Sin método de pago"
  - Botón primario: "Agregar tarjeta" → abre dialog con `<CardSetupForm>` (Stripe `PaymentElement`)

**Card "Estado"**
- Badge según `billing_status`:
  - `idle` → verde "Al corriente"
  - `charging` → azul "Procesando cobro"
  - `payment_pending` → ámbar "Pago pendiente — actualiza tu tarjeta"
  - `uncollectible` → rojo "Requiere atención — contacta soporte"
- Si `payment_pending`, mostrar link "Actualizar tarjeta" prominente

**Tabla "Historial de pagos"**
- Columnas: Fecha, Monto, Estado (badge), # Llamadas, Acciones
- Acción por row: link "Ver invoice" → abre `hosted_invoice_url` en nueva pestaña
- Paginación 15 por página
- Empty state: "Aún no hay cobros registrados"

### 14.3 Vista `/billing` para `root` y `admin`

**Tarjeta resumen global** (4 stats en grid):
- Total cobrado mes actual: `$X,XXX.XX`
- Invoices pagados (mes): `N`
- Invoices fallidos (mes): `N` (link a filtro)
- Compañías en `uncollectible`: `N` (link a filtro)
- Bloque inferior: "Próxima ejecución del cron: 05:00 UTC (en Xh Ym)"

**Solo `root`** — Panel "Configuración global":
- Input `Umbral global` con valor actual en USD
- Helper text dinámico: "Costo efectivo Stripe a este umbral: ~X.X%" (calculado en cliente)
- Botón "Guardar"
- Botón "Ejecutar cobro ahora" con `AlertDialog` de confirmación: "¿Ejecutar el proceso de cobro inmediatamente? Esto procesará todas las compañías elegibles."

**Tabla "Compañías"**
- Columnas: Compañía, Balance pendiente, Estado, Último invoice (fecha + monto + status badge), Método de pago (✓/✗), Acciones
- Filtros: por estado, por método de pago presente/ausente
- Acción por row: ir a `/companies/{id}` para detalle existente
- Sortable por balance descendente

**Tabla "Historial global de pagos"**
- Columnas: Fecha, Compañía, Monto, Estado, Intentos, Acciones
- Filtros: compañía, estado, rango de fechas
- Acción: link a `hosted_invoice_url`

### 14.4 Reporte histórico mensual

El reporte actual de consumo por llamadas se mantiene como vista separada en `/reports/calls`. No debe confundirse con la vista operativa de billing/invoices.

---

## 15. API surface

### Billing

- `GET /api/billing` — staff_admin: solo su compañía. admin/root: vista global o por compañía.
- `POST /api/billing/setup-intent` — staff_admin/admin/root
- `POST /api/billing/customer-portal` — staff_admin/admin/root
- `GET /api/billing/cron` — protegido por `CRON_SECRET`
- `POST /api/billing/run-cron` — `root` only

### Business config

- `GET /api/business-model`
- `PUT /api/business-model` — solo `root`. Ahora actualiza `price_per_call_cents` y `billing_threshold_cents`.

### Webhooks

- `POST /api/webhooks/call-ended` — firma Retell obligatoria
- `POST /api/webhooks/stripe` — firma Stripe obligatoria

`call-data` deja de modificar billing.

---

## 16. Variables de entorno

```bash
RETELL_API_KEY=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CRON_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Notas:

- Solo una API key de Retell con badge de webhook puede verificar firma
- `CRON_SECRET` debe ir también en Vercel para el cron route

---

## 17. Configuración externa manual

### Stripe Dashboard

- Settings → Billing → Invoices → Advanced invoicing features → Enable Smart Retries
- Retry policy: **8 intentos en 2 semanas**
- Acción tras fallo final: **Mark as uncollectible**
- Settings → Billing → Subscriptions and emails → Enable failed payment emails
- Personalizar templates de email (logo, español)
- Settings → Billing → Customer Portal → Enable, permitir update de payment methods
- Registrar webhook Stripe apuntando a `/api/webhooks/stripe` con eventos:
  - `setup_intent.succeeded`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `invoice.marked_uncollectible`
  - `payment_method.detached`
- Copiar `STRIPE_WEBHOOK_SECRET` al `.env`

### Retell

- Registrar webhook con firma habilitada (API key con webhook badge)
- Configurar agent/account webhook para enviar `call_ended`
- Reducir eventos innecesarios si no se usarán
- Verificar que el endpoint responda `2xx` en menos de 10 segundos

### Vercel

```json
{
  "crons": [
    {
      "path": "/api/billing/cron",
      "schedule": "0 5 * * *"
    }
  ]
}
```

---

## 18. Notificaciones (placeholder con console.log)

En esta primera versión las notificaciones se emiten como `console.log` estructurados. El contrato del payload se diseña pensando en el reemplazo futuro por un `NotificationService` (email/Slack/in-app).

### 18.1 Payment failed (intento intermedio)

```js
console.log('[BILLING_NOTIFY:ROOT]', JSON.stringify({
  event: 'payment_failed',
  severity: 'warning',
  company_id,
  company_name,
  invoice_id,                 // local
  stripe_invoice_id,
  amount_usd,                 // formato decimal "25.00"
  attempt_count,
  next_attempt_at_iso,
  message: `Cobro fallido para ${company_name}. Intento ${attempt_count}.`
}))

console.log('[BILLING_NOTIFY:STAFF_ADMIN]', JSON.stringify({
  event: 'payment_failed',
  severity: 'warning',
  recipient_company_id: company_id,
  amount_usd,
  customer_portal_url,        // pre-generado vía billingPortal.sessions.create
  message: 'Tu cobro falló. Actualiza tu tarjeta para evitar interrupciones.'
}))
```

### 18.2 Marked uncollectible (fallo final tras Smart Retries)

```js
console.log('[BILLING_NOTIFY:ROOT]', JSON.stringify({
  event: 'uncollectible',
  severity: 'critical',
  company_id,
  company_name,
  invoice_id,
  stripe_invoice_id,
  amount_usd,
  total_attempts,
  message: `Invoice incobrable tras todos los reintentos. Acción manual requerida para ${company_name}.`
}))

console.log('[BILLING_NOTIFY:STAFF_ADMIN]', JSON.stringify({
  event: 'uncollectible',
  severity: 'critical',
  recipient_company_id: company_id,
  amount_usd,
  customer_portal_url,
  message: 'No pudimos cobrar tu factura tras varios intentos. Contacta a soporte para regularizar.'
}))
```

### 18.3 No payment method (throttled, max 1 cada 7 días por compañía)

```js
console.log('[BILLING_NOTIFY:ROOT]', JSON.stringify({
  event: 'no_payment_method',
  severity: 'info',
  company_id,
  company_name,
  balance_usd,
  threshold_usd,
  message: `${company_name} cruzó el umbral pero no tiene tarjeta guardada.`
}))

console.log('[BILLING_NOTIFY:STAFF_ADMIN]', JSON.stringify({
  event: 'no_payment_method',
  severity: 'warning',
  recipient_company_id: company_id,
  balance_usd,
  threshold_usd,
  setup_url: '/billing',
  message: 'Tu compañía tiene un balance pendiente de cobro pero no tienes método de pago guardado. Agrega una tarjeta para evitar interrupciones.'
}))
```

### 18.4 Convenciones

- Todos los logs son JSON-parseables (single-line)
- `event` y `severity` son siempre obligatorios
- `recipient_company_id` permite al futuro NotificationService rutear al destinatario correcto
- `amount_usd` siempre como string decimal con 2 dígitos para evitar floating point en consumidores

---

## 19. Logging y observabilidad

Todo flujo debe usar logs estructurados con:

- `run_id`
- `company_id`
- `call_id`
- `invoice_id`
- `stripe_invoice_id`
- `event_type`
- `status`

Casos a loguear:

- firma inválida Retell
- `call_ended` con `disconnection_reason != user_hangup` ignorado
- `call_ended` duplicado por `call_id`
- ledger insert exitoso
- ledger duplicate ignored
- cron run start / end con stats
- cron candidate selected
- company skipped no payment method (throttled)
- company skipped payment_pending
- Stripe invoice creation failed
- Stripe webhook duplicate ignored
- invoice paid
- invoice payment_failed
- invoice marked_uncollectible
- payment_method.detached durante charging (caso edge)

---

## 20. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Retell reenvía `call_ended` | firma + idempotencia por `call_id` + `UNIQUE(call_id, entry_type)` |
| Doble cargo por bug en ingest | constraint DB `UNIQUE(call_id, entry_type)` |
| Inconsistencia entre invoice y llamadas cobradas | ledger reservado por invoice, no update masivo por compañía |
| Crash durante creación de invoice | reservar ledger en transacción; si Stripe falla, regresar ledger a `pending` y status a `idle` |
| Webhook Stripe duplicado | tabla `stripe_webhook_events` deduplicación por `event.id` |
| Balance desalineado respecto al ledger | `current_balance_cents` se trata como caché derivado; `lib/billing/reconcile-balance.ts` puede recalcular |
| Compañía sin tarjeta | cron la skipea, notificación throttled (1x/7 días) |
| Smart Retries en progreso | `billing_status = payment_pending` bloquea nuevo invoice |
| Método de pago removido durante charging | `payment_method.detached` limpia el campo, invoice en flight sigue su curso, fallo entra a flujo normal |
| Cron caído | trigger manual root + healthcheck + alerta si no corre antes de 06:00 UTC |
| DST genera shift de 1h en hora local | aceptado por diseño, cron siempre 05:00 UTC |
| Llamadas no `user_hangup` ocupan storage | aceptado: se guardan para historial, no generan ledger |
| Cron + trigger manual concurrentes | `SELECT FOR UPDATE SKIP LOCKED` por compañía garantiza procesamiento único |

---

## 21. Decisión de facturabilidad de `call_ended`

**Cerrada**: solo se factura `call_ended` con `disconnection_reason = "user_hangup"`.

Esta regla se implementa como filtro en el handler del webhook (sección 12.2 paso 10), **antes** de insertar en el ledger. Las llamadas con otros disconnection reasons (`dial_failed`, `dial_busy`, `dial_no_answer`, `agent_hangup`, `error`, etc.) **sí se almacenan** en la tabla `calls` para historial pero **no generan ledger entry** ni afectan al balance.

Esta es una regla de producto. Si se decide cambiarla en el futuro (ej: cobrar también `agent_hangup`), el cambio es mínimo: ampliar el conjunto de valores aceptados en el filtro.

---

## 22. Tests requeridos

### Retell webhook

- Rechaza firma inválida con 401
- Rechaza timestamp fuera de ventana de 5 minutos
- Ignora eventos distintos de `call_ended` con 204
- Procesa `call_ended` con `disconnection_reason = 'user_hangup'`: crea call + ledger
- Almacena `call_ended` con `disconnection_reason != 'user_hangup'`: crea call, NO crea ledger
- Retry del mismo `call_id` no duplica ledger ni balance
- Body re-serializado con whitespace distinto rechaza firma

### Ledger

- Una llamada crea exactamente un `call_charge`
- `current_balance_cents` sube solo una vez por llamada
- Recalculo desde ledger coincide con balance materializado
- `UNIQUE(call_id, entry_type)` bloquea inserts duplicados a nivel DB

### Cron

- Crea invoice con entries `pending` y las marca `reserved`
- Reserva solo entries de la compañía correcta
- Skipea compañías sin tarjeta
- Skipea compañías con `status != 'idle'`
- Throttle de warning "no payment method" respeta los 7 días
- Recovery libera `charging` colgado > 1 hora
- Recovery NO libera si hay invoice `pending` con `stripe_invoice_id` válido
- Si Stripe falla al crear invoice, ledger vuelve a `pending`, compañía vuelve a `idle`, invoice queda como `creation_failed`
- Cron + trigger manual concurrentes no producen doble cargo (test de concurrencia con 2 invocaciones simultáneas)

### Stripe webhooks

- Firma inválida rechaza con 400
- Evento duplicado por `event.id` retorna 200 sin reprocesar
- `invoice.paid` liquida solo ledger reservado para ese invoice
- `invoice.paid` resta `amount_cents` del balance, no reset a 0
- `invoice.payment_failed` mueve compañía a `payment_pending` y emite notificaciones
- `invoice.marked_uncollectible` marca compañía e invoice y emite notificación crítica
- `payment_method.detached` durante `charging` limpia campo sin tirar el invoice en flight
- `setup_intent.succeeded` persiste `stripe_payment_method_id`

### Permisos

- `staff` no accede a `/api/billing/*`
- `staff_admin` no puede consultar otra compañía vía query param
- Solo `root` puede `PUT /api/business-model` con `billing_threshold_cents`
- Solo `root` puede `POST /api/billing/run-cron`

---

## 23. Tasks list

### Schema y migrations

- [ ] Migrar dinero a centavos enteros (drop + recreate, sistema sin datos en producción)
- [ ] Agregar `price_per_call_cents` y `billing_threshold_cents` a `business_config`
- [ ] Drop `pricePerCall` decimal de `business_config`
- [ ] Agregar columnas Stripe + billing a `companies` (incluyendo `last_no_payment_warning_at`)
- [ ] Agregar columnas `billing_price_cents`, `invoice_id`, `billing_counted_at`, `retell_event` a `calls`
- [ ] Drop `billingPrice` decimal de `calls`
- [ ] Crear `billing_ledger`
- [ ] Crear `invoices`
- [ ] Crear `stripe_webhook_events`
- [ ] Crear índices y constraints (incluido `UNIQUE(call_id, entry_type)`)
- [ ] Seed con `price_per_call_cents = 100` y `billing_threshold_cents = 5000`

### Seguridad y webhooks

- [ ] Verificar firma Retell con raw body usando `Retell.verify()` del SDK oficial
- [ ] Asegurar que el route handler de Next.js 16 lea raw body sin parsear
- [ ] Implementar filtro `disconnection_reason = 'user_hangup'` en `/api/webhooks/call-ended`
- [ ] Quitar todo impacto financiero de `/api/webhooks/call-data`
- [ ] Verificar firma Stripe con raw body
- [ ] Deduplicar Stripe webhook por `event.id` en tabla `stripe_webhook_events`

### Billing core

- [ ] Crear `lib/stripe.ts` (cliente singleton)
- [ ] Crear `lib/billing/ledger.ts` (insert/reserve/liquidate helpers)
- [ ] Crear `lib/billing/charge-cron.ts` (handler compartido cron + trigger manual)
- [ ] Crear `lib/billing/reconcile-balance.ts` (recalcular `current_balance_cents` desde ledger)
- [ ] Crear `lib/notifications/billing.ts` (`notifyRoot()` y `notifyStaffAdmin()` con shapes de sección 18)
- [ ] Implementar throttle de `last_no_payment_warning_at` (1x cada 7 días)

### Stripe flows

- [ ] `POST /api/billing/setup-intent`
- [ ] `POST /api/billing/customer-portal`
- [ ] `POST /api/webhooks/stripe`
- [ ] Handlers para `setup_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`, `invoice.marked_uncollectible`, `payment_method.detached`
- [ ] Tolerancia explícita de `payment_method.detached` durante `billing_status = 'charging'`

### Cron

- [ ] `GET /api/billing/cron` protegido con `CRON_SECRET`
- [ ] `POST /api/billing/run-cron` solo `root`
- [ ] `vercel.json` con cron schedule `0 5 * * *`
- [ ] Pre-step recovery de `charging` colgados > 1h

### UI

- [ ] Actualizar sidebar con entrada Billing por rol
- [ ] Página `/billing` para `staff_admin` (3 cards + tabla historial — specs sección 14.2)
- [ ] Página `/billing` para `root/admin` (resumen + panel root + tabla compañías + tabla historial global — specs sección 14.3)
- [ ] Componente `<CardSetupForm>` con Stripe `PaymentElement`
- [ ] Input umbral con helper de % efectivo dinámico (solo root)
- [ ] Botón "Ejecutar cobro ahora" con `AlertDialog` (solo root)
- [ ] Renombrar reporte histórico mensual a `/reports/calls`

### Tests

Ver sección 22.

### Pendientes para instrucciones finales (NO implementar todavía)

- [ ] Configurar Stripe Dashboard según checklist sección 17 (Smart Retries, emails, Customer Portal, webhook events, copiar `STRIPE_WEBHOOK_SECRET`)
- [ ] Configurar Retell webhook (registrar endpoint, habilitar firma, verificar API key con webhook badge)
- [ ] Documentar y crear video de onboarding del cliente para guardar tarjeta en sección Billing
- [ ] Definir si el rango de retry de Smart Retries (8 intentos / 2 semanas) se ajusta al modelo de negocio o se cambia por uno custom

---

## 24. Criterios de aceptación

El PRD se considera implementado cuando:

- Una llamada `call_ended` con `disconnection_reason = 'user_hangup'` crea exactamente un cargo financiero
- Una llamada `call_ended` con otro `disconnection_reason` se almacena pero no genera ledger
- Retries de Retell del mismo `call_id` no duplican balance
- El balance visible coincide con el ledger pendiente (`reconcile-balance` retorna 0 drift)
- El cron genera invoices solo para compañías elegibles
- Stripe `invoice.paid` liquida exactamente los cargos reservados, ni más ni menos
- `staff_admin` puede ver y gestionar el billing de su compañía
- `root` puede ver globalmente, configurar el umbral, y ejecutar el cron manual
- Todos los webhooks sensibles verifican firma con raw body
- Las notificaciones de fallo emiten payloads con la shape de sección 18
- Los warnings de "no payment method" están throttleados a max 1 cada 7 días por compañía
- Cron + trigger manual ejecutándose en paralelo no producen doble cargo
- Todos los tests críticos de idempotencia y cobro pasan
