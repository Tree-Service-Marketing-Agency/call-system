# PRD — Call System

## 1. Vision General

**Producto:** Dashboard para gestionar llamadas de agentes de voz (Retell AI) para empresas de tree service.

**Modelo de negocio:** Somos una agencia de marketing que ofrece agentes de voz a empresas de tree service. El agente actua como recepcionista virtual: toma los datos del cliente cuando el negocio no puede contestar, asegurando que no pierdan ningun lead. Este dashboard es el producto que entregamos a cada cliente para que vea quien les llamo.

**Problema que resuelve:** Las empresas de tree service pierden clientes potenciales cuando no pueden contestar el telefono. El agente de voz captura los datos y el dashboard centraliza toda esa informacion para que el negocio le de seguimiento.

**Flujo en una linea:** Cliente llama → Retell toma datos → n8n procesa y envia webhook con datos → llamada termina → n8n envia segundo webhook con audio y costo → dashboard guarda y muestra todo.

---

## 2. Usuarios y Roles

| Rol | Quien es | Que puede hacer |
|---|---|---|
| **root** | Dueno de la agencia (unico) | Todo lo que admin + configurar precio por llamada en "Business Model" |
| **admin** | Equipo de la agencia | Ver todas las companias, crear companias, crear usuarios staff_admin/staff, ver todas las llamadas, ver billing global |
| **staff_admin** | Admin de una empresa cliente | Ver llamadas de su compania, ver registro de clientes, crear usuarios staff_admin y staff para su compania |
| **staff** | Empleado de una empresa cliente | Ver llamadas de su compania, ver registro de clientes |

**Creacion de usuarios:**
- `root` y `admin` crean companias y sus usuarios (`staff_admin`, `staff`)
- `staff_admin` puede crear otros `staff_admin` y `staff` dentro de su compania
- No existe auto-registro. Todo es manual
- Al crear usuario: email + password auto-generado (editable antes de confirmar)

---

## 3. Arquitectura de Datos

### 3.1 Webhook 1 — Datos del cliente (enviado por n8n durante la llamada)

```json
{
  "call_id": "call_f11573017997c612116dc7405ee",
  "agent_id": "agent_09789bdf3d275cb69450ab54df",
  "date": "04/03/2026, 12:01",
  "name": "Maria",
  "phone": "17174213719",
  "address": "1560 Harlem Road",
  "zipcode": "14470",
  "city": "Buffalo",
  "service": "tree removal",
  "summary": "User wants an estimate for tree removal of a dead tree at 1560 Harlem Road, Buffalo."
}
```

### 3.2 Webhook 2 — Datos de la llamada (enviado por n8n al terminar la llamada)

```json
{
  "call_id": "call_f11573017997c612116dc7405ee",
  "agent_id": "agent_09789bdf3d275cb69450ab54df",
  "event": "call_ended",
  "call_status": "ended",
  "start_timestamp": 1767817769221,
  "end_timestamp": 1767817954390,
  "duration_ms": 185169,
  "audio_url": "https://...",
  "call_cost": "12"
}
```

### 3.3 Cruce de datos

Ambos webhooks se cruzan por `call_id` + `agent_id`. El registro final en base de datos contiene todos los campos combinados.

### 3.4 Vinculo llamada → compania

Cada compania tiene uno o mas `agent_id` asociados. Todas las llamadas de cualquiera de esos agentes pertenecen a la misma compania.

---

## 4. Secciones del Dashboard

### 4.1 Registro de Llamadas

**Acceso:** Todos los roles

**Vista staff / staff_admin:**

| Customer | Phone | Status | Duration | Date |
|---|---|---|---|---|
| John Doe | +1 (555) 123-4567 | Completed | 4m 32s | Oct 24, 10:30 AM |

- Click en una fila abre un **Sheet** (shadcn) con todos los datos de la llamada
- El audio se muestra como link que abre en nueva tab
- Solo ven llamadas de su compania

**Vista root / admin:**

Misma tabla + columna extra con **nombre de la empresa**. Incluye un **Combobox** (shadcn) para filtrar por compania.

**Paginacion:** 15 registros por pagina.

---

### 4.2 Registro de Clientes

**Acceso:** staff, staff_admin (su compania) / root, admin (todas o filtradas)

Vista agrupada por persona que llamo. Si Maria llamo 3 veces, aparece una sola fila de Maria. Al hacer click, se despliegan sus 3 llamadas.

**Tabla principal:**

| Customer | Phone | Address | City | Total Calls |
|---|---|---|---|---|
| Maria | 17174213719 | 1560 Harlem Road | Buffalo | 3 |

---

### 4.3 Gestion de Companias

**Acceso:** root, admin

**Crear compania:**
- Campos: nombre de la empresa, agent_id(s)
- Al crear, redirige a la pagina de detalle de la compania

**Tabla de companias:**

| Company | Agents | Users | Billing (mes actual) |
|---|---|---|---|
| Buffalo Tree Co. | 2 | 4 | $156.00 |

- Billing muestra el acumulado del 1ro del mes hasta hoy. Se resetea cada mes.

**Detalle de compania:**
- Info de la empresa
- Tabla de usuarios (con acciones)
- Llamadas relacionadas

---

### 4.4 Gestion de Usuarios

**Crear usuario (root/admin desde detalle de compania):**
- Campos: email + password auto-generado (editable antes de confirmar)
- Roles asignables: staff_admin, staff

**Crear usuario (staff_admin desde seccion "Usuarios" en sidebar):**
- Mismo flujo, mismos roles asignables (staff_admin, staff)

**Acciones en tabla de usuarios:**
- Editar → abre **Sheet** (shadcn) + confirmacion con **AlertDialog**
- Desactivar → **Switch** (shadcn)
- Eliminar → confirmacion con **AlertDialog** (shadcn)

---

### 4.5 Billing — "Por Pagar"

**Sidebar (staff / staff_admin):**
- Siempre visible en la parte inferior del sidebar
- Muestra el monto acumulado del mes actual de su compania

**Vista root / admin:**
- Tarjeta resumen con billing total del mes en curso
- Columna "Billing" en tabla de companias con desglose por empresa

**Calculo:**
- Cada llamada tiene un costo fijo definido por el root en "Business Model"
- `billing_mes = cantidad_de_llamadas_del_mes × precio_por_llamada`
- Si se actualiza el precio, solo afecta llamadas nuevas (las anteriores conservan el precio con el que entraron)

---

### 4.6 Business Model

**Acceso:** Solo root

**Ubicacion:** Seccion en el sidebar

**Contenido:** Un input para definir el precio fijo por llamada. Al actualizarlo, solo aplica a llamadas futuras.

---

## 5. Stack Tecnico

| Capa | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + shadcn/ui |
| Estilos | Tailwind CSS 4 |
| Auth | Auth.js + JWT |
| ORM | Drizzle |
| Base de datos | PostgreSQL |
| Lenguaje | TypeScript 5 |

---

## 6. Notas Tecnicas

- Todas las tablas: paginacion de 15 en 15
- Componentes shadcn: Sheet (detalle), AlertDialog (confirmaciones), Switch (desactivar), Combobox (filtros)
- Ambos webhooks llegan de n8n, no directamente de Retell
- El `call_cost` que llega en el webhook es el costo de Retell (referencia interna), el billing al cliente usa el precio fijo definido en Business Model
- Antes de crear un componente custom, verificar si shadcn/ui ya tiene uno que cubra la necesidad. Solo crear desde cero si no existe alternativa en shadcn
