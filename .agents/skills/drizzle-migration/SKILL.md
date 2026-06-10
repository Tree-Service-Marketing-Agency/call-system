---
name: drizzle-migration
description: Usar al cambiar un esquema gestionado con Drizzle ORM (tablas, columnas, índices, constraints, enums, relaciones) que deba llegar a una base de datos. Prepara y revisa migraciones de forma segura en cualquier proyecto Drizzle (cualquier dialecto, layout o package manager). El agente genera y deja la migración lista; APLICARLA es responsabilidad del usuario. NUNCA usa drizzle-kit push contra bases compartidas- desincroniza el tracking y puede destruir datos.
---

# Migraciones con Drizzle (flujo seguro)

Flujo correcto para cualquier proyecto que use Drizzle ORM, independiente del dialecto
(postgres, mysql, sqlite, turso…), del layout de carpetas y del package manager.

## Regla de propiedad (quién hace qué)

- **El agente PREPARA:** editar el esquema, correr `generate` (offline, no toca ninguna BD),
  revisar y ajustar el `.sql`, y **entregar los comandos listos**.
- **El usuario APLICA:** el agente **nunca** corre `migrate`, `push`, ni ningún comando que
  escriba en una base de datos. Deja la migración lista y entrega las instrucciones para que el
  usuario la aplique en cada ambiente.

## Contexto pre-computado

- Config de Drizzle: `!find . -maxdepth 4 -name 'drizzle.config.*' -not -path '*/node_modules/*' 2>/dev/null`
- Package manager (lockfile): `!ls bun.lockb pnpm-lock.yaml yarn.lock package-lock.json 2>/dev/null`

## Paso 0 — Descubrir el setup del proyecto (no asumir)

Antes de cualquier comando, lee la config real para que los comandos coincidan con el proyecto:

1. **`drizzle.config.{ts,js,json}`** → anota `schema` (ruta del/los archivo(s) de esquema), `out`
   (carpeta de migraciones), `dialect`, y `dbCredentials`/`migrations` (tabla y schema de tracking).
2. **Package manager y scripts.** Detecta el runner por el lockfile (`bun`/`pnpm`/`yarn`/`npm`) y
   busca scripts de migración en `package.json` (p.ej. `db:generate`, `db:migrate`). Si no existen,
   usa el binario directo: `bunx drizzle-kit …`, `pnpm dlx drizzle-kit …`, `npx drizzle-kit …`.
3. **Conexión y ambientes.** Identifica cómo se entrega la cadena de conexión (variable de entorno,
   archivo `.env`, secretos de CI) y qué ambientes existen (local, dev, staging, prod).

A lo largo de la skill, `<gen>` = comando de generate del proyecto, `<mig>` = comando de migrate.

## Reglas críticas (no negociables)

1. **Nunca `drizzle-kit push` contra una base compartida o de larga vida** (prod, staging, dev
   compartida). `push` difea y muta la BD directamente, sin pasar por archivos de migración →
   desincroniza el snapshot/journal de la realidad y puede borrar datos. `push` solo es aceptable
   en una BD local 100% desechable.
2. **Siempre: editar esquema → `generate` → revisar el SQL → entregar para `migrate`.** Nunca
   aplicar a mano ni saltarse el review.
3. **Nunca editar una migración ya aplicada** en ningún ambiente. El migrador valida por hash del
   archivo; editar un `.sql` aplicado rompe el tracking. Se corrige hacia adelante con una migración nueva.
4. **Nunca editar a mano los archivos de snapshot/journal** de la carpeta `meta/`.
5. **El usuario aplica al ambiente más bajo primero** (local/dev), verifica, y luego promueve hacia
   arriba (staging → prod). Nunca prod primero.

## Flujo paso a paso

### 1. Editar el esquema
Modifica el/los archivo(s) indicados en `schema` de la config.

### 2. Generar (offline — no toca ninguna BD)
```
<gen>      # p.ej. bun run db:generate  /  npx drizzle-kit generate
```
Crea `out/NNNN_*.sql` y actualiza `meta/`. **Corre `<gen>` una segunda vez:** debe reportar
**"No schema changes"** → confirma que el snapshot quedó en sync (futuros generate saldrán limpios).

### 3. Revisar el SQL generado (paso de seguridad)
Abre el `.sql` nuevo y marca operaciones peligrosas:
- `DROP TABLE` / `DROP COLUMN` → **pérdida de datos**; confirma intención.
- `ADD COLUMN … NOT NULL` **sin DEFAULT** en tabla poblada → `migrate` **fallará** (ver Casos especiales).
- Cambios de tipo que requieran cláusula `USING` / casteo.
- **Renombrados:** Drizzle puede interpretar un rename como `DROP + ADD` (pierde datos). En modo
  interactivo te pregunta — responde rename; en modo no-interactivo, edita el SQL a `RENAME`.

### 4. Casos especiales (editar el `.sql` ANTES de aplicar; nunca después)
- **Columna NOT NULL en tabla con datos** → 3 pasos en la misma migración:
  ```sql
  ALTER TABLE "t" ADD COLUMN "col" <tipo>;             -- 1) nullable
  UPDATE "t" SET "col" = <valor_backfill> WHERE …;     -- 2) backfill
  ALTER TABLE "t" ALTER COLUMN "col" SET NOT NULL;     -- 3) recién entonces NOT NULL
  ```
- **Migración de datos** (mover/transformar): agrega los `UPDATE`/`INSERT` al `.sql`.
- **Cambios grandes/zero-downtime:** usa expand→migrate→contract en migraciones separadas.
- Borrar datos solo es opción si son **desechables**, y siempre **con confirmación** explícita del usuario.

### 5. Sugerencia: commitear esquema + migración juntos
Sugiere al usuario commitear el cambio de `schema` **y** los archivos de `out/`/`meta/` en el mismo
commit, para que nunca se separen, siguiendo el flujo de ramas/PR del proyecto. *(Es solo una
recomendación; el agente no ejecuta git.)*

### 6. Entregar para que el usuario aplique (el agente NO corre migrate)
La migración ya está lista (esquema editado + `.sql` revisado). Entrega al usuario los comandos
exactos para aplicar, **en orden del ambiente más bajo al más alto**, indicando cómo apuntar la
conexión a cada ambiente según el setup del Paso 0. Por ejemplo:

```
# El USUARIO ejecuta, fijando la conexión del ambiente destino:
<mig>      # p.ej. DATABASE_URL="<conexión-dev>" bun run db:migrate
```

Notas a comunicar al usuario:
- `migrate` solo corre lo **pendiente** → es seguro re-ejecutarlo (no-op si ya aplicó).
- **Verificar el ambiente destino antes de aplicar** (es fácil pegarle a prod por accidente; pasar la
  conexión explícita en el comando es más seguro que depender de cuál ambiente esté "activo").
- Si el **CI** corre `migrate` automáticamente en algún ambiente, avisarlo para no duplicar.

## Anti-patrones (NO hacer)
- ❌ `push` / `reset` / drop-and-recreate contra bases compartidas.
- ❌ Que el agente corra `migrate`/`push` o cualquier comando que escriba en una BD.
- ❌ Editar migraciones o snapshots ya aplicados.
- ❌ Aplicar a prod antes que a dev.

## Troubleshooting
- **`migrate` falla con `relation/table already exists`** → la BD ya tiene el esquema pero la tabla
  de tracking está vacía/atrasada (típico tras un `push` previo, o al adoptar una BD existente). **No
  borrar nada.** Adoptar/stampear (ver Recuperación). Comparar la tabla de tracking entre ambientes
  para ubicar la divergencia.
- **`generate` repite el mismo churn** (dropear/recrear FKs, `SET DEFAULT` una y otra vez) → snapshot
  desincronizado por un `push` previo, o identificadores que exceden el límite de longitud del motor
  (p.ej. Postgres trunca a 63 chars). Con migraciones puras no debería repetirse.

## Recuperación: adoptar una BD existente en migraciones (baseline/stamp)
Cuando una BD se construyó con `push` (o es previa a las migraciones) y se quiere que `migrate`
funcione. **El agente prepara el script; lo ejecuta el usuario** (escribe en la BD).
1. Asegurar que los archivos de migración representan el esquema completo actual (regenerar un
   baseline limpio si hace falta; un 2º `generate` debe decir "No schema changes").
2. En cada ambiente existente, **marcar la migración como aplicada sin ejecutar el DDL**, insertando
   su `hash` + `folderMillis` en la tabla de tracking. Usar `readMigrationFiles` de
   `drizzle-orm/migrator` para obtener los valores exactos que el migrador espera:
   ```ts
   import { readMigrationFiles } from "drizzle-orm/migrator";
   const migs = readMigrationFiles({ migrationsFolder: "<out>" });
   // por cada mig: insertar (hash, created_at = folderMillis) en la tabla de tracking.
   // OJO: la ubicación de la tabla depende del dialecto y de `migrations` en la config
   //   - postgres: schema "drizzle", tabla "__drizzle_migrations" (id, hash, created_at)
   //   - mysql/sqlite: tabla "__drizzle_migrations" (created_at bigint)
   // El migrador aplica una mig si  max(created_at en BD) < folderMillis.
   ```
3. Verificar (lo corre el usuario) que `migrate` sea **no-op** en las BD existentes y que cree el
   esquema completo en una BD nueva.

## Referencias
- `drizzle.config.*` del proyecto, scripts `db:*` en `package.json`.
- Docs: drizzle-kit `generate` / `migrate` / `push`, y `drizzle-orm/migrator`.
