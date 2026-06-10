# Spec - `user-management`

## ADDED Requirements

### Requirement: Creacion de usuarios por admin/root

Los usuarios root y admin DEBEN poder crear usuarios staff_admin y staff desde el detalle de una compania.

#### Scenario: Crear usuario desde detalle de compania

- **WHEN** un admin o root crea un usuario desde el detalle de una compania
- **THEN** se asigna email + password auto-generado (editable antes de confirmar)
- **THEN** el usuario se asocia a esa compania con el rol seleccionado (staff_admin o staff)

### Requirement: Creacion de usuarios por staff_admin

Los usuarios staff_admin DEBEN poder crear usuarios staff_admin y staff dentro de su compania desde la seccion "Usuarios" en el sidebar.

#### Scenario: staff_admin crea usuario

- **WHEN** un staff_admin crea un usuario
- **THEN** el nuevo usuario se asocia automaticamente a la misma compania del staff_admin
- **THEN** puede asignar rol staff_admin o staff

### Requirement: Editar usuario

El sistema DEBE permitir editar usuarios a traves de un Sheet (shadcn) con confirmacion via AlertDialog.

#### Scenario: Editar usuario

- **WHEN** se hace click en "Editar" en la tabla de usuarios
- **THEN** se abre un Sheet con los datos editables
- **THEN** al confirmar, se muestra un AlertDialog de confirmacion

### Requirement: Reset de password para agency users

El sistema DEBE permitir que `root` reemplace la contrasenia de usuarios agency desde `/users`.

#### Scenario: root resetea password de admin

- **WHEN** un `root` resetea la contrasenia de un usuario `admin`
- **THEN** se genera una contrasenia temporal editable antes de confirmar
- **THEN** la contrasenia temporal se muestra una sola vez despues de confirmar
- **THEN** la contrasenia actual nunca se muestra

#### Scenario: root resetea su propio password

- **WHEN** un `root` resetea su propia contrasenia
- **THEN** no se requiere capturar la contrasenia actual
- **THEN** las sesiones activas no se revocan en esta iteracion

#### Scenario: reset no permitido

- **WHEN** un usuario distinto de `root` intenta resetear una contrasenia
- **THEN** el sistema responde Forbidden
- **WHEN** un `root` intenta resetear la contrasenia de otro `root`
- **THEN** el sistema responde Forbidden

### Requirement: Desactivar usuario

El sistema DEBE permitir desactivar usuarios a traves de un Switch (shadcn).

#### Scenario: Desactivar usuario

- **WHEN** se cambia el Switch de un usuario a off
- **THEN** el usuario queda desactivado y no puede iniciar sesion

#### Scenario: Reactivar usuario

- **WHEN** se cambia el Switch de un usuario a on
- **THEN** el usuario puede volver a iniciar sesion

### Requirement: Eliminar usuario

El sistema DEBE permitir eliminar usuarios con confirmacion via AlertDialog (shadcn).

#### Scenario: Eliminar usuario

- **WHEN** se hace click en "Eliminar" en la tabla de usuarios
- **THEN** se muestra un AlertDialog pidiendo confirmacion
- **THEN** al confirmar, el usuario se elimina

### Requirement: No existe auto-registro

El sistema NO DEBE permitir auto-registro. Todos los usuarios son creados manualmente.

#### Scenario: Intento de registro publico

- **WHEN** alguien intenta acceder a una ruta de registro
- **THEN** el sistema no expone ninguna ruta de registro publica
