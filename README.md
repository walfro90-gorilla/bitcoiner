# 🦅 Clawbot — Bot de Arbitraje de Bitcoin en tiempo real

Sistema de **detección y simulación de arbitraje de BTC** multi-exchange, en tiempo real, con dashboard web en vivo, un copiloto de IA y un módulo de **noticias/sentimiento**. Construido para el **Coding Challenge México**.

Monitorea order books de Bitcoin en **Binance, OKX, Kraken y Bitso** vía WebSockets, detecta divergencias, calcula la rentabilidad **neta** (fees + withdrawal + slippage + latencia), **simula la ejecución** respetando la liquidez del libro (órdenes parciales + balances de wallet), incorpora **noticias de última hora** como régimen de riesgo, y visualiza oportunidades, operaciones y P&L acumulado.

---

## 🏗️ Arquitectura

Tres piezas; **el hot-path (detección) nunca toca el servidor web**:

```
  UpCloud VM (EU) / Railway              Supabase (Postgres + Realtime)        Vercel
 ┌───────────────────────┐          ┌──────────────────────────────┐   ┌────────────────────┐
 │  WORKER (Node + tsx)   │  service │ exchanges · fee_config        │   │ Next.js dashboard  │
 │  WebSockets ─► RAM     │  role    │ wallets · opportunities       │◄──┤ (anon, RLS)        │
 │  order books          │ ───────► │ trades · spread_history       │   │ Realtime + SWR     │
 │  engine event-driven  │  (write) │ book_snapshots · bot_state    │   │ recharts · P&L     │
 │  estrategias + riesgo │          │ news_signals                  │   │ /api/chat copiloto │
 │  executor (VWAP)      │          └──────────────────────────────┘   └────────────────────┘
 │  news poller (LLM)    │                    ▲  realtime  │
 └───────────────────────┘                    └────────────┘
```

- **Worker** (`/worker`): conexiones WebSocket persistentes + order books **en RAM**, matemática de rentabilidad por evento, ejecución simulada, poller de noticias, y escritura a Supabase (service role). Va en **UpCloud VM región EU** (o Railway EU) — Binance/OKX bloquean IPs de EE.UU.
- **Supabase**: estado + historial + **Realtime** para el dashboard.
- **Next.js / Vercel** (`/app`, `/components`): dashboard read-only en vivo (anon + RLS) + copiloto `/api/chat`.
- **Núcleo compartido** (`/lib/core`): TS puro (tipos, VWAP, fees, profit, estrategias) importado por worker **y** web.

## 🧮 La matemática: rentabilidad NETA depth-aware

Corazón: [`lib/core/profit.ts`](lib/core/profit.ts). Para comprar `V` BTC barato y venderlo caro:

1. **Cap de liquidez:** `execBase = min(targetBase, Σ asks_compra, Σ bids_venta)` → **órdenes parciales**.
2. **VWAP** caminando ambos libros (no solo el top).
3. **Bruto:** `(vwapSell·fx − vwapBuy)·execBase`.
4. **Neto** = bruto − fees taker (ambos lados) − withdrawal (amortizado) − slippage − depeg (cross-quote).
5. Ejecuta solo si `netSpreadBps ≥ MIN_NET_BPS`.

> **Insight clave:** entre exchanges líquidos los fees taker (~20 bps round-trip) **superan** el spread (<1 bp) → el arbitraje espacial puro casi nunca es rentable. El edge real aparece en **Bitso** (premium regional) y **cross-quote USD↔USDT**. El bot registra *todas* las oportunidades (rentables o no) para demostrar que "ve" el mercado.

## 🧠 Estrategias

| Estrategia | Descripción |
|---|---|
| **Espacial** | Mismo par/quote entre dos venues. |
| **Cross-quote** | BTC/USD (Kraken) vs BTC/USDT, modelando costo de stablecoin (depeg). |
| **Triangular** | Ciclo intra-exchange USDT→BTC→ETH→USDT. |
| **Estadística** | z-score / mean-reversion del spread (log-ratio) entre venues. |

## 🛡️ Gestión de riesgo (circuit breakers)

`MIN_NET_BPS` · tamaño máximo por trade (BTC y USD) · rate limit (trades/min) · **halt por N pérdidas consecutivas** + cooldown · exclusión de feeds *stale*/desconectados · **wallet guard** (no permite balances negativos → fuerza órdenes parciales) · **kill switch global** + umbral editables desde el dashboard · **régimen risk-off por noticias** de alto impacto.

## 📰 Noticias & sentimiento (IA)

Poller **fuera del hot-path** (cada ~3 min) consulta **CryptoPanic** (o **Google News RSS** sin key como fallback); un **LLM (Gemini/Claude)** sintetiza los titulares en `{sentimiento -1..1, impacto, resumen}` → `news_signals` + `bot_state`. Noticias de **alto impacto negativo** activan **risk-off** (pausa de ejecuciones). El arbitraje es instantáneo, así que la noticia **modula el riesgo/volatilidad**, no el cálculo del spread. El dashboard muestra feed + termómetro; el copiloto lo cita.

## ⚡ Latencia

Detección **event-driven** (no polling): cada mensaje WS re-evalúa solo los pares afectados (coalescing por microtask). Se mide y persiste `detection_latency_ms` (típicamente **<1 ms**) y `feed_lag_ms`.

## 🧰 Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Recharts · SWR · `ws` · `@supabase/ssr` + Realtime · **LLM pluggable** `@google/genai` (Gemini) / `@anthropic-ai/sdk` · Node 20 + `tsx`.

## 🚀 Correr en local

```bash
npm install

# 1) Variables (ver .env.example): .env.local (web) y .env.worker (worker)
# 2) DB: aplicar supabase/migrations/*.sql (MCP de Supabase o SQL Editor)
# 3) Arrancar
npm run worker     # el "cerebro" (feeds + detección + ejecución + noticias)
npm run dev        # dashboard en http://localhost:3000
```

`DEMO_MODE=true` (o el toggle del dashboard) relaja el umbral para mostrar ejecuciones en vivo.

## ☁️ Despliegue

- **Worker** — **UpCloud VM región EU (recomendado)**, ver [`deploy/UPCLOUD.md`](deploy/UPCLOUD.md); o Railway EU (`railway.json`), o Docker (`Dockerfile`). IP **no-US** para Binance/OKX.
- **Web** — **Vercel**: import del repo, framework Next.js. Vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. `worker/` se ignora vía `.vercelignore`.
- **Supabase** — un proyecto compartido.

## 🗄️ Esquema

`exchanges`, `fee_config`, `wallets`, `opportunities`, `trades`, `spread_history`, `book_snapshots`, `bot_state`, `news_signals`. RLS: lectura pública (anon) para el dashboard; escritura solo vía service role (worker). Realtime en `opportunities`, `trades`, `wallets`, `bot_state`, `news_signals`. SQL en [`supabase/migrations/`](supabase/migrations).

## 📐 Decisiones técnicas

- **Worker separado del web**: Edge/Serverless no mantienen conexiones persistentes → forzarían polling (lento, rate-limited). Un proceso Node 24/7 con libros en RAM da latencia mínima.
- **Región EU del worker**: evita el geo-bloqueo de Binance/OKX desde IPs de US.
- **Modelo de inventario**: saldos en cada venue; el `withdrawal` se **amortiza** entre los trades que un rebalanceo soporta (`WITHDRAWAL_AMORTIZE_TRADES`), no completo por trade.
- **Cross-quote ≠ arbitraje puro**: USDT ≠ USD → costo de depeg configurable.
- **IA fuera del hot-path**: copiloto (Gemini por defecto, Anthropic opcional — `lib/llm.ts`) lee la DB y explica; nunca decide trades (microsegundos).
- **Noticias = régimen de riesgo, no señal de hot-path**: poller + scoring LLM modulan riesgo/volatilidad; no tocan el cálculo del spread.
