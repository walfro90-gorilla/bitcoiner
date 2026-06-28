# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> Next.js 16.2.6: el middleware es **`proxy.ts` / `export function proxy()`** (NO `middleware.ts`). Lee los docs empacados en `node_modules/next/dist/docs/` antes de tocar APIs de Next.

## Qué es esto

**Bitcoiner** — bot de arbitraje de BTC en tiempo real para el **Coding Challenge México** (finalista 17/250). Detecta divergencias de precio entre Binance, OKX, Kraken, Bitso y Bitstamp, calcula rentabilidad **neta** (fees + withdrawal + slippage + depeg), **simula** la ejecución respetando la liquidez del order book, y modula el riesgo con noticias + IA. La narrativa central es de **honestidad**: registra *todas* las oportunidades y **descarta correctamente** las no rentables (entre venues líquidos los fees taker superan el spread). El idioma del proyecto (commits, docs, UI, comentarios) es **español**.

## Comandos

```bash
npm run dev            # dashboard Next.js → http://localhost:3000
npm run build          # build de producción (Vercel)
npm run lint           # eslint
npm test               # tests del núcleo (node --test + tsx): profit, crc32, markov
npm run check:worker   # typecheck del worker (tsconfig.worker.json)
npm run worker         # corre el worker en local (raro; normalmente vive en la VM)
npm run worker:watch   # worker con hot-reload
```

Un solo test: `node --import tsx --test lib/core/profit.test.ts`

Local necesita `.env.local` (web) y `.env.worker` (worker); ver `.env.example` y `docs/SETUP-LOCAL.md`. Los `.env*` NO están en git.

## Arquitectura (3 piezas — el hot-path nunca toca el servidor web)

```
UpCloud VM (Frankfurt)          Supabase (Postgres + Realtime)        Vercel
  worker/  (Node + tsx)   write   exchanges·fees·wallets·             app/ + components/
  WS → order books en RAM ──────► opportunities·trades·       ◄────── Next.js read-only
  engine event-driven     service spread_history·bot_state            (anon + RLS)
  executor (VWAP) + news   role   ·news_signals·book_snapshots         Realtime + SWR
```

- **`/lib/core`** — núcleo TS puro compartido por worker **y** web. `index.ts` re-exporta todo. El corazón es **`profit.ts`** (`computeNetProfit`: cap de liquidez → VWAP caminando ambos libros → bruto → neto tras costos). Las 5 estrategias viven en `strategies/` (spatial, crossQuote, triangular, statistical, regional/Bitso) + `markov.ts` (régimen del premio Bitso). **Toda la matemática nueva va aquí** para que worker y dashboard usen el mismo motor.
- **`/worker`** — `index.ts` orquesta: carga config de Supabase → feeds WS (`feeds/`, uno por venue, `base.ts` común) → `engine.ts` (loop event-driven, coalesce + re-evalúa solo lo afectado, emite oportunidades **priorizadas por `net_usd`**) → `risk.ts` (circuit breakers) → `executor.ts` (fills VWAP, parciales) → `writer.ts` (persiste a Supabase). `state.ts` = order books + ledger de wallets en RAM. `news.ts` = poller LLM fuera del hot-path. Vive en **EU** porque Binance/OKX bloquean IPs de EE.UU.
- **`/app` + `/components`** — dashboard. `Dashboard.tsx` compone los paneles; datos vía Supabase Realtime (`lib/realtime.ts`) + SWR. `app/api/chat/route.ts` = copiloto IA; `app/api/controls/route.ts` escribe a `bot_state` (kill switch, DEMO/Real, `min net bps`) que el worker obedece en ~2.5 s sin reiniciar. `app/api/admin/reset` = reset de la simulación.

### Estado compartido vía `bot_state`
El dashboard no habla con el worker directamente: escribe en la fila `bot_state` de Supabase y el worker la lee en cada ciclo. Así funcionan los controles en vivo (trading on/off, DEMO/Real, umbral) y los flags de noticias (risk-off).

### Migraciones
SQL versionado en `supabase/migrations/` (`0001_init` … `0011`). Cambios de esquema = nueva migración numerada, no editar las viejas.

## Detalles que muerden

- **Muro "En construcción"** (`proxy.ts`): el sitio está **amurallado a `/maintenance` por defecto**. Abrir con `MAINTENANCE=off`; espiar sin apagarlo con `?llave=<MAINTENANCE_KEY>` (default `gorila`, deja cookie 7 días).
- **Proveedor LLM** (`lib/llm.ts`): `LLM_PROVIDER=openai|gemini|anthropic`. En producción el **copiloto web usa Groq** (branch OpenAI-compatible, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`) y el **worker/noticias usa Gemini**. El README puede estar desactualizado respecto al provider; confía en `.env.example` / `lib/llm.ts`.
- **DEMO vs Real**: en **Real** solo ejecuta con neto ≥ umbral (descarta casi todo, por diseño). En **DEMO** ejecuta cada divergencia real aunque el neto sea chico, para mostrar la mecánica.
- **`MAKER_MODE`** (default off): modela fills maker (límite pasivo, fee menor, riesgo de no-fill) además del taker.
- **Restricción Supabase free-tier**: límite de egress; las `opportunities` salieron de Realtime para no saturarlo (ciclo de facturación ~día 29).

## Deploy
- **Web:** Vercel (import del repo; `worker/` ignorado vía `.vercelignore`).
- **Worker:** VM UpCloud Frankfurt `root@94.237.99.158`, repo en `~/clawbot`, pm2 `clawbot-worker`. Redeploy: `cd ~/clawbot && git pull && pm2 restart all`.
