# Flujos — Call System

## Flujo 1: Recepcion de llamada y almacenamiento

Cuando un cliente llama al numero del agente Retell, el agente captura sus datos. Al terminar la llamada, n8n procesa toda la informacion y envia **un solo webhook** (`call_ended`) al dashboard con todos los datos: cliente, metadatos (audio, duracion, costo, timestamps) y transcript. (Ver ADR-006 — el antiguo webhook `call_data` se deprecó.)

```mermaid
sequenceDiagram
    participant C as Cliente
    participant R as Retell Agent
    participant N as n8n
    participant API as Next.js API
    participant DB as PostgreSQL

    C->>R: Llama al numero del agente
    R->>C: Saluda, pregunta nombre y servicio
    C->>R: Da sus datos personales
    Note over R: La llamada termina
    R->>N: Envia la llamada completa
    N->>N: Desenvuelve array, renombra campos, "Not provided"→null
    N->>API: Webhook call_ended (cliente + audio + duracion + costo + transcript)
    API->>DB: Upsert call por (call_id, agent_id) con todos los datos
```

---

## Flujo 2: Autenticacion y acceso por rol

El admin de la agencia crea companias y usuarios. Cada usuario accede al dashboard y ve contenido filtrado segun su rol y compania.

```mermaid
flowchart TD
    A[Usuario ingresa email + password] --> B{Auth.js valida}
    B -->|Invalido| C[Error de login]
    B -->|Valido| D{Que rol tiene?}
    D -->|root| E[Ve todo + Business Model]
    D -->|admin| F[Ve todo menos Business Model]
    D -->|staff_admin| G[Ve su compania + gestion de usuarios]
    D -->|staff| H[Ve su compania solo lectura]
```

---

## Flujo 3: Creacion de compania y usuarios

El root o admin crea una compania asociada a uno o mas agent_id de Retell. Luego crea usuarios para esa compania.

```mermaid
sequenceDiagram
    participant A as Root/Admin
    participant APP as Dashboard
    participant DB as PostgreSQL

    A->>APP: Crea compania (nombre + agent_ids)
    APP->>DB: INSERT company + agents
    APP->>A: Redirige a detalle de compania
    A->>APP: Crea usuario (email + password generado)
    APP->>DB: INSERT user (rol: staff_admin o staff)
    APP->>A: Muestra usuario en tabla
```

---

## Flujo 4: Calculo de billing mensual

Cada llamada se registra con el precio fijo vigente al momento de entrar. El billing mensual se calcula sumando los costos de todas las llamadas del mes en curso.

```mermaid
flowchart TD
    A[Llega llamada nueva] --> B[Obtener precio fijo actual]
    B --> C[Guardar llamada con billed_amount = precio fijo]
    C --> D[Billing mes = SUM de billed_amount WHERE mes actual]
    D --> E{Quien consulta?}
    E -->|staff/staff_admin| F[Sidebar: total de su compania]
    E -->|root/admin| G[Tabla companias: billing por empresa]
```

---

## Maquinas de Estados

### Llamada (Call)

Desde ADR-006 una llamada se registra en una sola fase: el webhook `call_ended`
trae todos los datos al terminar la llamada. No existe un estado intermedio
"Parcial".

```mermaid
stateDiagram-v2
    [*] --> Completa: Webhook call_ended (cliente + audio + duracion + costo + transcript)
    Completa --> [*]
```

| Estado | Descripcion |
|---|---|
| Completa | Webhook `call_ended` recibido, registro completo |
