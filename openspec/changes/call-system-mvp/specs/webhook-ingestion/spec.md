# Spec - `webhook-ingestion`

## ADDED Requirements

### Requirement: Recepcion de webhook 1 (datos del cliente)

El sistema DEBE exponer un endpoint POST que reciba los datos del cliente capturados durante la llamada. Los campos esperados son: `call_id`, `agent_id`, `date`, `name`, `phone`, `address`, `zipcode`, `city`, `service`, `summary`.

#### Scenario: Webhook 1 llega antes que webhook 2

- **WHEN** n8n envia el webhook 1 con datos del cliente
- **THEN** el sistema crea un registro de llamada con los datos del cliente y estado parcial (sin metadata de llamada)

#### Scenario: Webhook 1 llega despues que webhook 2

- **WHEN** n8n envia el webhook 1 y ya existe un registro con el mismo `call_id` + `agent_id`
- **THEN** el sistema actualiza el registro existente con los datos del cliente

### Requirement: Recepcion de webhook 2 (metadata de llamada)

El sistema DEBE exponer un endpoint POST que reciba la metadata de la llamada al terminar. Los campos esperados son: `call_id`, `agent_id`, `event`, `call_status`, `start_timestamp`, `end_timestamp`, `duration_ms`, `audio_url`, `call_cost`.

#### Scenario: Webhook 2 llega despues que webhook 1

- **WHEN** n8n envia el webhook 2 y ya existe un registro con el mismo `call_id` + `agent_id`
- **THEN** el sistema actualiza el registro existente con la metadata de la llamada

#### Scenario: Webhook 2 llega antes que webhook 1

- **WHEN** n8n envia el webhook 2 sin que exista registro previo
- **THEN** el sistema crea un registro parcial con la metadata de la llamada (sin datos del cliente)

### Requirement: Cruce de datos por call_id y agent_id

El sistema DEBE identificar los registros de llamada usando la combinacion unica de `call_id` + `agent_id`.

#### Scenario: Ambos webhooks recibidos

- **WHEN** ambos webhooks han sido procesados para el mismo `call_id` + `agent_id`
- **THEN** el registro contiene todos los campos combinados de ambos webhooks

### Requirement: Vinculacion de llamada a compania

El sistema DEBE vincular cada llamada a una compania a traves del `agent_id`. Cada compania tiene uno o mas `agent_id` asociados.

#### Scenario: Llamada con agent_id conocido

- **WHEN** llega un webhook con un `agent_id` asociado a una compania
- **THEN** la llamada se vincula automaticamente a esa compania

#### Scenario: Llamada con agent_id desconocido

- **WHEN** llega un webhook con un `agent_id` no asociado a ninguna compania
- **THEN** el sistema almacena el registro sin compania asociada

### Requirement: Almacenamiento del costo de Retell

El sistema DEBE guardar el `call_cost` del webhook 2 como referencia interna. Este valor NO se muestra a los usuarios del dashboard.

#### Scenario: Costo almacenado como referencia

- **WHEN** el webhook 2 incluye `call_cost`
- **THEN** el sistema guarda el valor en el registro de la llamada como campo interno

### Requirement: Registro del precio de billing al momento de la llamada

El sistema DEBE capturar el precio fijo por llamada vigente al momento de recibir el webhook y almacenarlo en el registro de la llamada.

#### Scenario: Precio vigente al momento del registro

- **WHEN** se crea o completa un registro de llamada
- **THEN** el sistema guarda el precio por llamada vigente en ese momento junto al registro
