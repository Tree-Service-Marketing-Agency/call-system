# Spec - `company-management`

## ADDED Requirements

### Requirement: Crear compania

Los usuarios root y admin DEBEN poder crear companias con nombre y uno o mas `agent_id`.

#### Scenario: Creacion exitosa

- **WHEN** un admin o root crea una compania con nombre "Buffalo Tree Co." y agent_id "agent_abc"
- **THEN** la compania se crea y se redirige a la pagina de detalle de la compania

### Requirement: Tabla de companias

El sistema DEBE mostrar una tabla de companias con: Company, Agents (cantidad), Users (cantidad), Billing (mes actual).

#### Scenario: Tabla con datos

- **WHEN** un admin o root accede a la seccion de companias
- **THEN** ve la tabla con todas las companias y su informacion

#### Scenario: Billing en tabla

- **WHEN** se muestra la columna Billing
- **THEN** muestra el acumulado desde el 1ro del mes hasta hoy

### Requirement: Detalle de compania

El detalle de una compania DEBE mostrar: info de la empresa, tabla de usuarios con acciones, y llamadas relacionadas.

#### Scenario: Ver detalle

- **WHEN** un admin o root hace click en una compania
- **THEN** ve la pagina de detalle con info, usuarios y llamadas

### Requirement: Asociacion de agent_ids

Cada compania DEBE tener uno o mas `agent_id` asociados. Todas las llamadas de esos agentes pertenecen a la compania.

#### Scenario: Multiples agentes

- **WHEN** una compania tiene agent_id "agent_a" y "agent_b"
- **THEN** las llamadas de ambos agentes aparecen como llamadas de esa compania

### Requirement: Acceso restringido

Solo usuarios root y admin DEBEN poder acceder a la gestion de companias.

#### Scenario: Staff intenta acceder

- **WHEN** un usuario staff o staff_admin intenta acceder a gestion de companias
- **THEN** el sistema deniega el acceso
