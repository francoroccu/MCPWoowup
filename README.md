# Métricas WoowUp · Patagonia Digital

Plataforma interna para ver, **mes a mes**, las métricas de CRM de todas las cuentas de WoowUp,
agrupadas por **cuenta madre** (ej. Comercial Depor) y sus **marcas** (cada cuenta WoowUp: Depor, Blockstore…).
Los datos se traen del **servidor MCP de WoowUp** y se guardan en Postgres (Neon), con un cron diario en Vercel.

## Qué incluye

| Pantalla | Qué muestra |
|---|---|
| **Portafolio** `/` | Árbol cuenta madre → marcas del mes elegido: envíos, campañas, entrega, CTR, CTOR, revenue, Δ vs mes anterior y vs mismo mes del año pasado, RPE |
| **Cuenta madre** `/grupos/[slug]` | KPIs del mes (vs mes anterior y año anterior), marcas del mes, campañas de todas las marcas (top/bottom 5 + tabla), últimos 12 meses y aporte por marca |
| **Marca** `/cuentas/[slug]` | KPIs del mes, campañas (top/bottom 5 + tabla), mix por canal, one-shot vs automatizaciones, últimos 12 meses |
| **Campaña** `/cuentas/[slug]/campanas/[id]` | Resultado del mes vs promedio de la cuenta (mismo canal y tipo), peso en envíos y revenue; en automatizaciones, historia mes a mes |
| **Administración** `/admin` | Crear cuentas madre, asignar marcas, renombrar/ocultar, sincronizar a demanda, historial de syncs |

Filtros en todas las vistas: **selector desplegable de mes** (con flechas ‹ ›; por defecto el último mes cerrado), canal
(email, SMS, WhatsApp, push) y tipo (one-shot `custom` / automatizaciones `triggered`). La tabla histórica de 12 meses queda
plegada al final de cada vista. La tabla de campañas permite buscar, ordenar por cualquier columna y filtrar por tipo y canal.

**Reglas de negocio aplicadas** (las mismas del proyecto de auditoría):
- `filter_by = "activity"` siempre (nunca `sent`, que subreporta automatizaciones).
- One-shot y automatizaciones se guardan por separado; además canal × tipo.
- Cuentas con rol `CONSULT` u `OPERATOR`: se marca **"Revenue no disponible por permisos"** y no se estima.
- El revenue de una cuenta madre solo se suma si todas sus marcas tienen la misma moneda.
- Las variaciones solo se muestran si el mes de comparación tiene datos de todas las marcas; en el mes en curso no se comparan volúmenes ni revenue (son parciales).
- Top/bottom 5 de campañas por revenue (por clics si no hay revenue), entre campañas con ≥ 1.000 envíos.
- Semáforos (puntos de color) solo con canal email y son **referencias orientativas de email retail**, no benchmarks de la cuenta.

Fórmulas: Entrega = (envíos − rebotes) / envíos · Open rate = aperturas / entregados · CTR = clics / entregados ·
CTOR = clics / aperturas · RPE = revenue / envíos · Ticket = revenue / conversiones · % autom. = revenue triggered / revenue total.

## Modo demo

Sin `DATABASE_URL` la app arranca con **datos ficticios** (banner naranja). Sirve para revisar el mockup en Vercel
antes de conectar nada. Sin `APP_PASSWORD` y sin base, queda abierta; con base real exige contraseña.

## Puesta en marcha

### 1. Local
```bash
npm install
cp .env.example .env.local   # completar variables
npm run dev                  # http://localhost:3000
```

### 2. Base de datos (Neon vía Vercel)
1. En Vercel → Storage → **Create Database → Neon (Postgres)** y conectarla al proyecto. Eso crea `DATABASE_URL`.
2. Crear las tablas: `npm run db:push` (con `DATABASE_URL` en `.env.local`).

### 3. Validar el MCP de WoowUp (paso clave)
```bash
npm run mcp:inspect              # lista herramientas y parámetros reales
npm run mcp:inspect -- depor     # prueba list_accounts, get_account y get_campaigns_stats en una cuenta
```
Revisar `mcp-inspect-output/` y, si los nombres de parámetros o claves de respuesta difieren, ajustar **solo**
`src/lib/woowup/mapping.ts` (`statsArgs`, `listCampaignsArgs`, `switchArgs`, listas `KEYS`, `parseCampaignList`). Todo lo demás depende de ese archivo.

### 4. Carga histórica
```bash
npm run backfill                       # enero 2025 → hoy (habilita comparaciones del año)
npm run sync -- --from 2026-09         # rango parcial
npm run sync -- --account depor        # una sola cuenta
```
Después, en `/admin`: crear "Comercial Depor" y asignarle Depor, Blockstore, etc.

### 5. GitHub + Vercel
```bash
git init && git add . && git commit -m "Plataforma de métricas WoowUp"
git remote add origin git@github.com:<org>/woowup-metrics.git && git push -u origin main
```
En Vercel: **Import Project** desde GitHub, cargar las variables de `.env.example` y desplegar.
El cron de `vercel.json` corre todos los días 09:00 UTC (06:00 ART) y re-sincroniza el mes en curso y el anterior
(la atribución de revenue sigue moviéndose después del envío). Requiere `CRON_SECRET`.
Con muchas cuentas conviene plan Pro (funciones de hasta 300 s); `SYNC_CONCURRENCY` controla cuántas sesiones MCP corren en paralelo.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres (Neon). Sin ella → modo demo |
| `APP_PASSWORD` | Contraseña compartida del equipo |
| `AUTH_SECRET` | Firma de la cookie de sesión |
| `WOOWUP_MCP_URL` | Endpoint MCP (Streamable HTTP) |
| `WOOWUP_MCP_TOKEN` | Token del MCP |
| `WOOWUP_MCP_AUTH_HEADER` / `_PREFIX` | Header de auth (default `Authorization: Bearer …`) |
| `SYNC_CONCURRENCY` | Sesiones MCP paralelas (default 3) |
| `CRON_SECRET` | Protege `/api/cron/sync` |

## Estructura

```
src/
  app/                 páginas (portafolio, grupos, cuentas, admin, login) y /api/cron/sync
  components/          KPIs, gráficos (Recharts), tablas, filtros
  db/schema.ts         account_groups · accounts · monthly_metrics · campaign_metrics · sync_runs
  lib/metrics.ts       fórmulas, semáforos y formato
  lib/views.ts         series mensuales, períodos de comparación
  lib/woowup/          cliente MCP, mapping (único punto a ajustar) y sync
scripts/               mcp-inspect y sync/backfill por CLI
```

## Próximos pasos sugeridos
- Login con Google restringido a `@patagoniadigital.tech` (Auth.js) en lugar de contraseña compartida.
- Comparación interanual (YoY) seleccionable además del período anterior.
- Detalle profundo por campaña on-demand (`get_campaign_report`: segmentos, lifecycle).
- Exportar a Excel / PDF por cuenta madre para enviar al cliente.
