# Decisiones Tecnicas — Call System

## Indice

| # | Titulo | Estado | Fecha |
|---|---|---|---|
| [001](./adr-001-void-status-for-non-billable-calls.md) | Marcar llamadas no cobrables como nuevo status `void` en `billing_ledger` | Aceptado | 2026-05-04 |
| [002](./adr-002-url-state-for-list-filters.md) | Estado de filtros en URL para listas del dashboard | Aceptado | 2026-05-04 |
| [003](./adr-003-retell-cost-column-and-visibility.md) | Columna `retell_cost` (numeric USD) y visibilidad solo agencia | Aceptado | 2026-05-09 |
| [004](./adr-004-n8n-as-call-ended-ingestion-source.md) | n8n como fuente de ingesta para `call_ended` | Aceptado (parcialmente supersedido por 006) | 2026-05-09 |
| [005](./adr-005-threshold-in-calls.md) | Billing threshold como conteo de llamadas | Aceptado | 2026-05-14 |
| [006](./adr-006-single-webhook-call-ended.md) | Consolidación en un solo webhook `call_ended`; eliminación de "Partial" | Aceptado | 2026-05-18 |

---

## Plantilla ADR

Copia esto en un archivo nuevo: `adr-NNN-nombre-en-kebab-case.md`

```markdown
# ADR-NNN: [Titulo descriptivo de la decision]

**Fecha:** YYYY-MM-DD
**Estado:** Propuesto | Aceptado | Supersedido por ADR-NNN

## Contexto
[El problema o necesidad que genero esta decision.
Que restricciones existian. Que pasaba si no se decidia.]

## Decision
[La decision tomada, en una oracion directa.]

## Razon
[Por que esta opcion sobre las demas. Se especifico —
no "es mejor", sino por que es mejor para este caso concreto.]

## Alternativas descartadas

| Alternativa | Por que se descarto |
|---|---|
| [Opcion] | [Razon concreta] |

## Consecuencias
[Que implica esta decision a futuro — ventajas, limitaciones,
riesgos y deuda tecnica si aplica.]
```
