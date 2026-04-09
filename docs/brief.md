# Brief — Call System

## Que es

Dashboard que centraliza las llamadas capturadas por agentes de voz (Retell AI) para empresas de tree service. Cada empresa cliente ve quien les llamo, que servicio pidio, y puede escuchar el audio de la llamada. La agencia de marketing administra todas las empresas desde el mismo dashboard.

## Problema que resuelve

Las empresas de tree service pierden clientes potenciales cuando no pueden contestar el telefono. El agente de voz actua como recepcionista virtual, captura los datos del lead, y el dashboard los centraliza para que el negocio de seguimiento sin perder ninguna oportunidad.

## Flujo en una linea

Cliente llama → Retell toma datos → n8n procesa y envia webhook con datos → llamada termina → n8n envia segundo webhook con audio y costo → dashboard guarda y muestra todo.

## Cliente

Externo — empresas de tree service que contratan servicios de marketing de la agencia.

## Estado

🟡 En desarrollo — PRD definido, scaffolding de Next.js 16 listo.

## Deadline

Por definir.
