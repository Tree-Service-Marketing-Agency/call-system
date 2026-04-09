# Tasks: Call System MVP

## 1. Setup del proyecto y dependencias

- [ ] 1.1 Instalar dependencias: drizzle-orm, drizzle-kit, pg, @auth/core, @auth/drizzle-adapter, bcrypt
- [ ] 1.2 Instalar y configurar shadcn/ui (init + componentes: Sheet, AlertDialog, Switch, Badge, Combobox, DateRangePicker, Table, Button, Input, Card)
- [ ] 1.3 Crear drizzle.config.ts y configurar conexion a PostgreSQL
- [ ] 1.4 Configurar variables de entorno (.env.example): DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

## 2. Schema de base de datos

- [ ] 2.1 Crear schema Drizzle: tabla `companies`
- [ ] 2.2 Crear schema Drizzle: tabla `company_agents` (company_id, agent_id)
- [ ] 2.3 Crear schema Drizzle: tabla `users` (email, password, role, company_id, is_active)
- [ ] 2.4 Crear schema Drizzle: tabla `calls` (todos los campos de ambos webhooks + billing_price + flags webhook1/2_received)
- [ ] 2.5 Crear schema Drizzle: tabla `business_config` (price_per_call)
- [ ] 2.6 Generar y ejecutar migracion inicial
- [ ] 2.7 Crear seed: usuario root con credenciales iniciales + business_config con precio default

## 3. Autenticacion

- [ ] 3.1 TEST: Login con credenciales validas retorna JWT con userId, role, companyId
- [ ] 3.2 TEST: Login con credenciales invalidas retorna error
- [ ] 3.3 TEST: Usuario desactivado no puede hacer login
- [ ] 3.4 Implementar Auth.js con credentials provider y JWT strategy
- [ ] 3.5 Crear pagina de login (email + password)
- [ ] 3.6 Implementar middleware de proteccion de rutas (redirect a /login si no autenticado)

## 4. Webhook ingestion

- [ ] 4.1 TEST: POST /api/webhooks/call-data crea registro parcial con datos del cliente
- [ ] 4.2 TEST: POST /api/webhooks/call-data actualiza registro existente si call_id+agent_id ya existe
- [ ] 4.3 TEST: POST /api/webhooks/call-ended crea registro parcial con metadata
- [ ] 4.4 TEST: POST /api/webhooks/call-ended actualiza registro existente con metadata
- [ ] 4.5 TEST: Llamada se vincula a compania via agent_id en company_agents
- [ ] 4.6 TEST: billing_price se captura del precio vigente en business_config al momento del registro
- [ ] 4.7 Implementar POST /api/webhooks/call-data (webhook 1)
- [ ] 4.8 Implementar POST /api/webhooks/call-ended (webhook 2)

## 5. Layout del dashboard y sidebar

- [ ] 5.1 Crear layout `(dashboard)/layout.tsx` con sidebar y auth guard
- [ ] 5.2 Implementar sidebar dinamico segun rol del usuario
- [ ] 5.3 Implementar billing del mes actual en la parte inferior del sidebar (staff/staff_admin)

## 6. Registro de llamadas

- [ ] 6.1 TEST: GET /api/calls retorna llamadas de la compania del usuario (staff/staff_admin)
- [ ] 6.2 TEST: GET /api/calls retorna todas las llamadas para admin/root, con filtro opcional por company_id
- [ ] 6.3 TEST: GET /api/calls soporta paginacion de 15 registros
- [ ] 6.4 Implementar GET /api/calls con filtrado por rol y paginacion
- [ ] 6.5 Crear pagina calls/page.tsx con tabla, paginacion, y columna Company (admin/root)
- [ ] 6.6 Implementar Combobox de filtro por compania (admin/root)
- [ ] 6.7 Implementar Sheet de detalle de llamada al hacer click en fila
- [ ] 6.8 Implementar link de audio con Badge de expiracion (30 dias) y mensaje informativo

## 7. Registro de clientes

- [ ] 7.1 TEST: GET /api/customers retorna clientes agrupados por telefono con total de llamadas
- [ ] 7.2 TEST: GET /api/customers filtra por compania segun rol del usuario
- [ ] 7.3 Implementar GET /api/customers con agrupacion y paginacion
- [ ] 7.4 Crear pagina customers/page.tsx con tabla agrupada y detalle expandible
- [ ] 7.5 Implementar filtro por compania (admin/root)

## 8. Gestion de companias

- [ ] 8.1 TEST: POST /api/companies crea compania con agent_ids (solo admin/root)
- [ ] 8.2 TEST: GET /api/companies retorna lista con conteos de agentes, usuarios, y billing
- [ ] 8.3 TEST: Staff/staff_admin no puede acceder a endpoints de companias
- [ ] 8.4 Implementar CRUD /api/companies
- [ ] 8.5 Crear pagina companies/page.tsx con tabla de companias
- [ ] 8.6 Crear pagina companies/[id]/page.tsx con detalle (info, usuarios, llamadas)
- [ ] 8.7 Implementar formulario de creacion de compania con agent_id(s)

## 9. Gestion de usuarios

- [ ] 9.1 TEST: POST /api/users crea usuario con email + password auto-generado (admin/root, dentro de compania)
- [ ] 9.2 TEST: staff_admin solo puede crear usuarios en su propia compania
- [ ] 9.3 TEST: Editar, desactivar, y eliminar usuario
- [ ] 9.4 Implementar CRUD /api/users
- [ ] 9.5 Crear tabla de usuarios con acciones (Sheet para editar, Switch para desactivar, AlertDialog para eliminar)
- [ ] 9.6 Implementar pagina users/page.tsx para staff_admin (usuarios de su compania)

## 10. Billing

- [ ] 10.1 TEST: GET /api/billing retorna billing por compania calculado como sum(billing_price) en rango de fechas
- [ ] 10.2 TEST: Date range por defecto es 1ro del mes actual hasta hoy
- [ ] 10.3 Implementar GET /api/billing con date range
- [ ] 10.4 Implementar Date Range Picker en vista de billing/companias
- [ ] 10.5 Implementar tarjeta resumen de billing total (admin/root)

## 11. Business Model

- [ ] 11.1 TEST: GET /api/business-model retorna precio actual (solo root)
- [ ] 11.2 TEST: PUT /api/business-model actualiza precio (solo root)
- [ ] 11.3 TEST: Admin/staff no pueden acceder a /api/business-model
- [ ] 11.4 Implementar GET y PUT /api/business-model
- [ ] 11.5 Crear pagina business-model/page.tsx con input de precio
