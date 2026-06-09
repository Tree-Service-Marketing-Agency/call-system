# Runbook — Migración `retell_numbers` (PRD #41, fase 1)

Aplica la migración `drizzle/0010_unique_black_tarantula.sql` (crea la tabla
`retell_numbers`) y corre el backfill desde `company_agents`. **Lo ejecuta el
usuario (root), no el agente.** Esta fase NO toca APIs ni UI; `company_agents`
y `companies.retell_phone_number` siguen existiendo y se eliminan en una fase
posterior.

> ⚠️ **Nunca uses `drizzle-kit push`.** Muta la BD sin pasar por archivos de
> migración y desincroniza el tracking (`drizzle.__drizzle_migrations`).

## 0. Pre-requisitos

- Estar en la rama con la migración (`feat/retell-numbers-schema`) con
  `drizzle/0010_unique_black_tarantula.sql` presente.
- `DATABASE_URL` en `.env` apuntando al ambiente correcto. **Verifica el
  destino antes de cada paso** — es fácil pegarle a prod por accidente.

## 1. Snapshot / branch de la base (rollback instantáneo)

Antes de cualquier escritura, crea un punto de restauración:

**Opción A — Neon branch (recomendado, instantáneo):**

```bash
neonctl branches create --name backup-pre-retell-numbers
```

(o desde la consola de Neon: Branches → New branch desde el branch actual)

**Opción B — pg_dump:**

```bash
pg_dump "$DATABASE_URL" -Fc -f backup-pre-retell-numbers.dump
```

Rollback = restaurar el branch/dump. No continúes sin esto.

## 2. Aplicar la migración

```bash
npm run db:migrate
```

- Solo corre migraciones **pendientes** → seguro de re-ejecutar (no-op si ya
  aplicó).
- Debe reportar `migrations applied ✔`.

## 3. Correr el backfill

```bash
npx tsx scripts/backfill-retell-numbers.ts
```

Idempotente (`ON CONFLICT (agent_id) DO NOTHING`) — seguro de re-ejecutar.
Inserta 1 fila por cada fila de `company_agents` con `enabled = true`.
`phone_number` solo se asigna cuando la compañía tiene exactamente 1 agente y
`retell_phone_number` no es null.

## 4. Verificar conteos (datos reales esperados)

El script imprime los conteos al final. Con los datos validados en el PRD
(9 compañías, 11 agentes) se espera:

| Métrica | Esperado |
| --- | --- |
| total rows | **11** (== filas previas en `company_agents`) |
| rows with phone | **7** (pares 1 agente + 1 número inequívocos) |
| rows without phone | **4** |

Las 4 filas sin phone vienen de **2 compañías**:

- 1 compañía con **1 agente y sin número** (`retell_phone_number` null) → 1 fila.
- 1 compañía con **3 agentes y 1 número** (ambiguo, no se puede emparejar) → 3 filas.

El script lista esas compañías (nombre + agent_ids). Si los conteos no
cuadran, detente y revisa antes de seguir (rollback disponible del paso 1).

Verificación manual opcional:

```sql
SELECT COUNT(*) FROM retell_numbers;                          -- 11
SELECT COUNT(*) FROM retell_numbers WHERE phone_number IS NOT NULL; -- 7
SELECT COUNT(*) FROM company_agents;                          -- 11 (intacto)
```

## 5. Arreglo manual (2 compañías)

1. **Compañía con 1 agente sin número:** conseguir el número Retell que le
   corresponde y escribirlo:

   ```sql
   UPDATE retell_numbers SET phone_number = '+1XXXXXXXXXX', updated_at = now()
   WHERE agent_id = '<agent_id>';
   ```

2. **Compañía con 3 agentes + 1 número:** decidir (en el dashboard de Retell)
   a cuál de los 3 agentes pertenece `companies.retell_phone_number` y
   asignárselo a esa fila con el mismo `UPDATE`. Los otros 2 agentes quedan
   con `phone_number` null hasta tener sus números.

Formato siempre E.164 US (ej. `+17163210677`).

## Fases posteriores (fuera de este runbook)

- Smoke tests de UI y del toggle live contra Retell, repointing de ingestion
  (`call-ended`) y `by-agent` a `retell_numbers`, y el drop de
  `company_agents` + `companies.retell_phone_number` van en fases
  posteriores del PRD #41 con sus propios runbooks.
