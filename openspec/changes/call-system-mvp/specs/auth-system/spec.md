# Spec - `auth-system`

## ADDED Requirements

### Requirement: Autenticacion con Auth.js y JWT

El sistema DEBE autenticar usuarios usando Auth.js con estrategia JWT.

#### Scenario: Login exitoso

- **WHEN** un usuario ingresa email y password validos
- **THEN** el sistema emite un JWT y redirige al dashboard

#### Scenario: Login fallido

- **WHEN** un usuario ingresa credenciales invalidas
- **THEN** el sistema muestra un error y no emite JWT

### Requirement: Roles y permisos

El sistema DEBE soportar 4 roles con permisos diferenciados: root, admin, staff_admin, staff.

#### Scenario: Permisos de root

- **WHEN** un usuario root accede al sistema
- **THEN** tiene acceso a: Llamadas (todas), Clientes (todos), Companias, Usuarios, Business Model, Billing global

#### Scenario: Permisos de admin

- **WHEN** un usuario admin accede al sistema
- **THEN** tiene acceso a: Llamadas (todas), Clientes (todos), Companias, Usuarios, Billing global
- **THEN** NO tiene acceso a Business Model

#### Scenario: Permisos de staff_admin

- **WHEN** un usuario staff_admin accede al sistema
- **THEN** tiene acceso a: Llamadas (su compania), Clientes (su compania), Usuarios (su compania, crear staff_admin/staff), Billing (su compania en sidebar)
- **THEN** NO tiene acceso a Companias ni Business Model

#### Scenario: Permisos de staff

- **WHEN** un usuario staff accede al sistema
- **THEN** tiene acceso a: Llamadas (su compania), Clientes (su compania), Billing (su compania en sidebar)
- **THEN** NO tiene acceso a Companias, Usuarios, ni Business Model

### Requirement: Root es unico

Solo DEBE existir un usuario con rol root en el sistema.

#### Scenario: Unicidad del root

- **WHEN** se intenta crear un segundo usuario root
- **THEN** el sistema lo impide

### Requirement: Proteccion de rutas

El sistema DEBE proteger todas las rutas del dashboard. Solo usuarios autenticados con permisos adecuados pueden acceder.

#### Scenario: Acceso sin autenticacion

- **WHEN** un usuario no autenticado intenta acceder al dashboard
- **THEN** el sistema redirige a la pagina de login

#### Scenario: Acceso a seccion no autorizada

- **WHEN** un usuario autenticado intenta acceder a una seccion para la cual no tiene permisos
- **THEN** el sistema deniega el acceso (redirect o 403)
