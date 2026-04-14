# Spec - `business-model`

## ADDED Requirements

### Requirement: Configuracion de precio por llamada

El usuario root DEBE poder definir un precio fijo por llamada desde la seccion Business Model.

#### Scenario: Actualizar precio

- **WHEN** el root actualiza el precio por llamada a $2.50
- **THEN** el nuevo precio se guarda y aplica a todas las llamadas futuras

#### Scenario: Precio no retroactivo

- **WHEN** el root cambia el precio de $2.00 a $3.00
- **THEN** las llamadas registradas antes del cambio conservan el precio de $2.00
- **THEN** las llamadas nuevas se registran con $3.00

### Requirement: Acceso exclusivo para root

Solo el usuario root DEBE tener acceso a la seccion Business Model.

#### Scenario: Admin intenta acceder

- **WHEN** un admin intenta acceder a Business Model
- **THEN** el sistema deniega el acceso

#### Scenario: Root accede

- **WHEN** el root accede a Business Model
- **THEN** ve un input con el precio actual y puede editarlo

### Requirement: Seccion en sidebar

Business Model DEBE aparecer como seccion en el sidebar, visible solo para el usuario root.

#### Scenario: Sidebar del root

- **WHEN** el root ve el sidebar
- **THEN** Business Model aparece como opcion de navegacion

#### Scenario: Sidebar de otros roles

- **WHEN** un admin, staff_admin o staff ve el sidebar
- **THEN** Business Model NO aparece en la navegacion
