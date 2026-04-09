# Spec - `customer-registry`

## ADDED Requirements

### Requirement: Vista de clientes agrupados por telefono

El sistema DEBE mostrar una vista de clientes agrupados por numero de telefono. Si el mismo numero llamo multiples veces, aparece una sola fila.

#### Scenario: Cliente con multiples llamadas

- **WHEN** el numero 17174213719 ha realizado 3 llamadas
- **THEN** se muestra una sola fila con: Customer, Phone, Address, City, Total Calls (3)

#### Scenario: Mismo nombre desde diferente numero

- **WHEN** "Maria" llama desde el numero A y luego desde el numero B
- **THEN** se muestran como dos clientes distintos (uno por cada numero)

### Requirement: Detalle expandible de llamadas por cliente

Al hacer click en un cliente, el sistema DEBE mostrar el historial de llamadas de ese numero.

#### Scenario: Expandir historial de cliente

- **WHEN** el usuario hace click en una fila de cliente
- **THEN** se despliegan todas las llamadas realizadas desde ese numero

### Requirement: Filtrado por compania para admin/root

Los usuarios admin y root DEBEN poder filtrar la vista de clientes por compania.

#### Scenario: Vista admin/root con filtro

- **WHEN** un admin o root accede al registro de clientes
- **THEN** ve clientes de todas las companias con un Combobox para filtrar

#### Scenario: Vista staff/staff_admin

- **WHEN** un staff o staff_admin accede al registro de clientes
- **THEN** solo ve clientes de su compania

### Requirement: Paginacion de clientes

La tabla de clientes DEBE tener paginacion de 15 registros por pagina.

#### Scenario: Mas de 15 clientes

- **WHEN** hay mas de 15 clientes en la vista
- **THEN** se muestra paginacion con 15 registros por pagina
