# Spec - `call-registry`

## ADDED Requirements

### Requirement: Tabla de llamadas paginada

El sistema DEBE mostrar una tabla de llamadas con paginacion de 15 registros por pagina.

#### Scenario: Vista staff/staff_admin

- **WHEN** un usuario staff o staff_admin accede al registro de llamadas
- **THEN** ve una tabla con columnas: Customer, Phone, Status, Duration, Date
- **THEN** solo ve llamadas de su compania

#### Scenario: Vista admin/root

- **WHEN** un usuario admin o root accede al registro de llamadas
- **THEN** ve la misma tabla con una columna adicional: Company
- **THEN** ve un Combobox para filtrar por compania
- **THEN** por defecto ve todas las llamadas de todas las companias

### Requirement: Detalle de llamada en Sheet

El sistema DEBE mostrar todos los datos de una llamada en un Sheet (shadcn) al hacer click en una fila.

#### Scenario: Abrir detalle de llamada

- **WHEN** el usuario hace click en una fila de la tabla
- **THEN** se abre un Sheet con todos los datos de la llamada (datos del cliente + metadata)

### Requirement: Audio de llamada como link externo

El sistema DEBE mostrar el audio como un link que abre en nueva tab.

#### Scenario: Audio disponible (menos de 30 dias)

- **WHEN** la llamada tiene `audio_url` y han pasado menos de 30 dias desde la llamada
- **THEN** se muestra el link al audio funcional

#### Scenario: Audio expirado (mas de 30 dias)

- **WHEN** han pasado 30 dias o mas desde la llamada
- **THEN** se muestra un Badge (shadcn) indicando que el audio ha expirado
- **THEN** el link se desactiva o se oculta

### Requirement: Mensaje informativo de expiracion de audio

El sistema DEBE mostrar un mensaje informativo en la lista de llamadas indicando que los audios expiran despues de 30 dias.

#### Scenario: Mensaje visible en la lista

- **WHEN** el usuario ve la tabla de llamadas
- **THEN** se muestra un mensaje informativo (banner o texto) indicando que las grabaciones de audio expiran despues de 30 dias

### Requirement: Registros parciales visibles

El sistema DEBE mostrar registros parciales (cuando solo llego uno de los dos webhooks).

#### Scenario: Solo webhook 1 recibido

- **WHEN** solo se recibio el webhook 1 para una llamada
- **THEN** se muestran los datos del cliente disponibles y los campos de metadata aparecen vacios o con indicador de pendiente

#### Scenario: Solo webhook 2 recibido

- **WHEN** solo se recibio el webhook 2 para una llamada
- **THEN** se muestran la metadata disponible y los campos del cliente aparecen vacios o con indicador de pendiente
