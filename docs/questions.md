# Questions — Call System

Preguntas para definir y refinar el sistema. Tanto tu como el agente pueden
agregar preguntas. Tu respondes. El agente actualiza el estado y mueve el
bloque a Respondidas.

**Estados:** ⏳ Pendiente · ✅ Respondido · 🚫 Descartado

---

## Pendientes

#### ¿Hay deadline para el proyecto?
- **Area:** Planificacion
- **Estado:** ⏳ Pendiente
- **Impacto:** Define la estructura del roadmap y prioridades de sprints
- **Respuesta:** —

#### ¿Donde se va a hostear PostgreSQL?
- **Area:** Infraestructura
- **Estado:** ⏳ Pendiente
- **Impacto:** Define la configuracion de Drizzle y las connection strings
- **Respuesta:** —

#### ¿Se despliega en Vercel?
- **Area:** Infraestructura
- **Estado:** ⏳ Pendiente
- **Impacto:** Define limites de API routes (timeout, tamanio de payload) y configuracion de webhooks
- **Respuesta:** —

#### ¿Que pasa si llega el webhook 2 antes que el webhook 1?
- **Area:** Arquitectura
- **Estado:** ⏳ Pendiente
- **Impacto:** Define si se necesita manejo de race conditions o si n8n garantiza el orden
- **Respuesta:** —

#### ¿El registro de clientes necesita edicion o solo es lectura?
- **Area:** Funcionalidad
- **Estado:** ⏳ Pendiente
- **Impacto:** Define si se necesitan endpoints de UPDATE para datos de clientes
- **Respuesta:** —

#### ¿Se necesita exportar datos (CSV, PDF)?
- **Area:** Funcionalidad
- **Estado:** ⏳ Pendiente
- **Impacto:** Define si se agrega funcionalidad de export en las tablas
- **Respuesta:** —

---

## Respondidas

#### ¿Que tipo de sistema de llamadas es este?
- **Area:** Definicion del producto
- **Estado:** ✅ Respondido
- **Impacto:** Define toda la arquitectura, integraciones y flujos del sistema
- **Respuesta:** Dashboard para agencia de marketing que ofrece agentes de voz (Retell AI) a empresas de tree service. Los agentes actuan como recepcionistas virtuales.

#### ¿Quien es el cliente o usuario final?
- **Area:** Definicion del producto
- **Estado:** ✅ Respondido
- **Impacto:** Define prioridades, UX y requisitos de negocio
- **Respuesta:** Empresas de tree service que contratan servicios de marketing de la agencia. Hay 4 roles: root (dueno agencia), admin (equipo agencia), staff_admin (admin de empresa), staff (empleado de empresa).

#### ¿Hay integracion con algun proveedor de telefonia o Voice AI?
- **Area:** Integraciones
- **Estado:** ✅ Respondido
- **Impacto:** Define el stack de backend y las APIs necesarias
- **Respuesta:** Si, Retell AI para los agentes de voz. n8n como intermediario que procesa y envia los webhooks al dashboard.

#### ¿Se necesita base de datos? ¿Cual?
- **Area:** Infraestructura
- **Estado:** ✅ Respondido
- **Impacto:** Desbloquea database.md y el esquema de datos
- **Respuesta:** Si. PostgreSQL con Drizzle ORM.
