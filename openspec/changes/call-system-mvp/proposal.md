# Proposal: Call System MVP

## Why

Las empresas de tree service pierden clientes potenciales cuando no pueden contestar el telefono. Somos una agencia de marketing que ofrece agentes de voz (Retell AI) como recepcionista virtual. Necesitamos un dashboard para que cada empresa cliente vea quien les llamo, los datos capturados, y el billing mensual. Sin este sistema, la informacion queda dispersa y no hay forma de entregar un producto visible al cliente.

## What Changes

- **Ingesta de llamadas via webhooks**: Dos endpoints que reciben datos de n8n (datos del cliente durante la llamada + metadata al terminar). Se cruzan por `call_id` + `agent_id`. Se aceptan registros parciales si solo llega uno de los dos webhooks.
- **Dashboard de llamadas**: Tabla paginada (15/pagina) con detalle en Sheet. Vista filtrada por compania para staff, vista global con filtro por compania para admin/root. Audio como link externo con Badge de expiracion (30 dias) y mensaje informativo.
- **Registro de clientes**: Vista agrupada por numero de telefono. Si el mismo numero llamo multiples veces, se muestra una fila con el total de llamadas y detalle expandible.
- **Gestion de companias**: CRUD de companias con `agent_id`(s) asociados. Tabla con conteo de agentes, usuarios y billing del mes.
- **Gestion de usuarios**: Creacion manual (email + password auto-generado). Roles: root, admin, staff_admin, staff. Sin auto-registro.
- **Sistema de autenticacion**: Auth.js con JWT. 4 roles con permisos diferenciados.
- **Billing informativo**: Calculo basado en cantidad de llamadas × precio fijo por llamada. Date range picker (default: 1ro del mes actual → hoy) para consultar periodos anteriores. Solo informativo, sin procesamiento de pagos.
- **Business Model**: Seccion exclusiva para root donde define el precio fijo por llamada. Cambios solo aplican a llamadas futuras.

## Capabilities

### New Capabilities

- `webhook-ingestion`: Recepcion y procesamiento de webhooks de n8n. Dos endpoints: datos del cliente (webhook 1) y metadata de llamada (webhook 2). Cruce por `call_id` + `agent_id`. Soporte para registros parciales.
- `call-registry`: Registro de llamadas con tabla paginada, detalle en Sheet, filtrado por compania (admin/root), audio con indicador de expiracion (30 dias), y mensaje informativo sobre expiracion.
- `customer-registry`: Vista de clientes agrupados por numero de telefono. Historial de llamadas por cliente. Paginacion.
- `company-management`: CRUD de companias. Asociacion de `agent_id`(s). Vista con billing, agentes y usuarios. Detalle de compania con info, usuarios y llamadas.
- `user-management`: Creacion manual de usuarios con email + password auto-generado. Roles asignables segun el rol del creador. Editar, desactivar (Switch), eliminar (AlertDialog).
- `auth-system`: Autenticacion con Auth.js + JWT. 4 roles (root, admin, staff_admin, staff) con permisos diferenciados por seccion y accion.
- `billing`: Calculo de billing por compania: llamadas del periodo × precio por llamada al momento del registro. Date range picker para consultar periodos. Vista en sidebar para staff. Vista global para admin/root.
- `business-model`: Configuracion del precio fijo por llamada. Solo accesible por root. Cambios aplican solo a llamadas futuras.

### Modified Capabilities

_(No hay capabilities existentes — proyecto nuevo)_

## Impact

- **API**: 2 endpoints de webhook (POST), endpoints CRUD para companias, usuarios, llamadas. API de auth (login).
- **Base de datos**: PostgreSQL con Drizzle ORM. Tablas: users, companies, company_agents, calls, customers (derivado), business_model_config.
- **Dependencias**: Next.js 16, React 19, Auth.js, Drizzle, shadcn/ui (Sheet, AlertDialog, Switch, Combobox, Badge, DateRangePicker), Tailwind CSS 4.
- **Infraestructura**: Deploy en Vercel. Endpoints de webhook expuestos en dominio default de Vercel.
- **Sistemas externos**: n8n envia ambos webhooks. Retell AI provee los agentes de voz y audio URLs (expiran a 30 dias).
