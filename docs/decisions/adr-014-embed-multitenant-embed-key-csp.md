# ADR-014: Embed multi-tenant — embed_key opaco + frame-ancestors por compañía

**Fecha:** 2026-06-23
**Estado:** Aceptado

## Contexto

La **Fase 2** del **Text agent** expone la burbuja de chat como un widget
embebible en el sitio de cada **Company**. Eso obliga a resolver tres cosas a la
vez: (1) cómo identifica el widget público a su compañía sin filtrar el
`company_id` interno; (2) cómo evitamos que un tercero embeba la burbuja de una
compañía en un dominio que no le corresponde (clickjacking / suplantación); y
(3) cómo limitamos abuso del endpoint de chat ahora que es anónimo. La
restricción dura es que el embed se sirve dentro de un `<iframe>` cross-origin:
no podemos usar `X-Frame-Options` (rompe el embed) y un CSP completo en
`/widget` rompería los scripts/estilos propios de la página.

## Decisión

- Cada **Text agent** lleva un `embed_key` **opaco y rotable** (32 hex, UUID sin
  guiones, `UNIQUE`) que es la única identidad que viaja en el `<script>` del
  cliente. El `company_id` nunca sale al navegador.
- Cada **Text agent** lleva `allowed_origins` (`jsonb`, array de orígenes
  http(s) normalizados). El **proxy** (Node runtime) computa dinámicamente la
  directiva `frame-ancestors` de `/widget?key=...` a partir de `allowed_origins`
  (`'self'` + los orígenes), **solo** esa directiva, **nunca** `X-Frame-Options`.
  Sin orígenes configurados, el widget solo carga en el propio dashboard
  (`'self'`).
- El flujo público de `/api/chat` revalida origen (defensa en profundidad; el
  gate real es `frame-ancestors`) y aplica **rate limiting por IP + embed_key**
  (Upstash sliding window, falla abierto si no está configurado).
- Rotar el `embed_key` es una **palanca solo para Agency users**: invalida todos
  los embeds existentes.

## Razón

- Un `embed_key` opaco desacopla la identidad pública de la PK interna: se puede
  **rotar** ante una fuga sin tocar `company_id` ni romper integraciones
  internas.
- `frame-ancestors` calculado **por compañía** y por request es el control de
  embedding correcto en navegadores modernos; vive en el proxy (Node) que ya
  corre antes del render y puede leer la base con un lookup indexado de una fila.
- `allowed_origins` por compañía evita una whitelist global por env que no
  escala a multi-tenant.
- Rate limit por `IP + embed_key` acota abuso sin penalizar a una compañía por
  el tráfico de otra; falla abierto para no tumbar tráfico legítimo ante
  problemas de infra.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Variable de entorno global `ALLOWED_ORIGINS` | No escala a multi-tenant: un solo set de orígenes para todas las compañías; cambiar el de una toca a todas y exige deploy. |
| Usar `company_id` como clave pública del widget | Filtra la PK interna al navegador, no es rotable ante fuga y acopla la superficie pública a la identidad interna. |
| `X-Frame-Options` para controlar el embedding | Es binario (`DENY`/`SAMEORIGIN`) y no admite lista de orígenes; además rompe el embed cross-origin legítimo. `frame-ancestors` lo supersede. |
| CSP completo en `/widget` | `default-src`/`script-src` romperían los scripts y estilos propios de la página del widget; solo necesitamos `frame-ancestors`. |

## Consecuencias

- El esquema de `text_agents` gana `embed_key` (opaco, rotable, `UNIQUE`) y
  `allowed_origins` (allowlist de embed/origen por compañía).
- El **proxy** deja de ser puramente edge-friendly: hace un lookup a la base por
  `embed_key` para `/widget`. Corre en Node runtime (default del proxy) y falla
  a `'self'` si el lookup falla — nunca tumba el proxy.
- `/api/chat` y `/widget` pasan a ser rutas **públicas** en el allowlist del
  proxy; la seguridad recae en `frame-ancestors` + chequeo de origen + rate
  limit, no en la sesión.
- Upstash Redis es **opcional**: sin credenciales el rate limiting se desactiva
  (falla abierto). Documentado en `.env.example`.
- Rotar la clave es destructivo para los embeds vivos: requiere reactualizar el
  snippet en el sitio de la compañía.
