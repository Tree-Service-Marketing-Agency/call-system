# Spec - `billing`

## ADDED Requirements

### Requirement: Calculo de billing por compania

El billing DEBE calcularse como: cantidad de llamadas en el periodo × precio por llamada registrado en cada llamada.

#### Scenario: Billing del mes actual

- **WHEN** se consulta el billing de una compania sin modificar el date range
- **THEN** se muestra el acumulado desde el 1ro del mes actual hasta hoy

#### Scenario: Precio historico respetado

- **WHEN** el precio por llamada cambio a mitad de mes
- **THEN** las llamadas anteriores al cambio usan el precio vigente al momento de su registro
- **THEN** las llamadas posteriores usan el nuevo precio

### Requirement: Date range picker para billing

El sistema DEBE incluir un Date Range Picker (shadcn) para consultar billing de periodos anteriores.

#### Scenario: Rango por defecto

- **WHEN** el usuario accede a la seccion de billing
- **THEN** el date range picker muestra por defecto: desde el 1ro del mes actual hasta hoy

#### Scenario: Consultar mes anterior

- **WHEN** el usuario selecciona un rango del 1 al 31 de marzo
- **THEN** se muestra el billing correspondiente a ese periodo

### Requirement: Billing en sidebar para staff/staff_admin

Los usuarios staff y staff_admin DEBEN ver el monto de billing de su compania en la parte inferior del sidebar.

#### Scenario: Sidebar con billing

- **WHEN** un staff o staff_admin esta en cualquier pagina del dashboard
- **THEN** ve en la parte inferior del sidebar el monto acumulado del mes actual de su compania

### Requirement: Vista global de billing para admin/root

Los usuarios admin y root DEBEN ver una tarjeta resumen con el billing total y desglose por compania.

#### Scenario: Vista global

- **WHEN** un admin o root accede a la vista de companias
- **THEN** ve una tarjeta resumen con el billing total del periodo seleccionado
- **THEN** la columna Billing en la tabla de companias muestra el desglose por empresa

### Requirement: Billing es informativo

El billing es solo informativo. El sistema NO procesa pagos.

#### Scenario: Sin accion de pago

- **WHEN** el usuario ve el billing
- **THEN** no existe boton de pago ni integracion con pasarela de pagos
