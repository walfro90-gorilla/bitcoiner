# 🏗️ ARCHITECTURE.md — Bitcoiner

> Mapa técnico para entender el sistema en 5 minutos. Complementa el decision-log ([`DECISIONS.md`](DECISIONS.md)).

## Visión general (3 capas, hot-path aislado del web)

```
   UpCloud VM · Frankfurt (EU)              Supabase (Postgres + Realtime)        Vercel
 ┌──────────────────────────────┐       ┌───────────────────────────────┐   ┌──────────────────┐
 │ WORKER (Node 24 + tsx)        │ write │ exchanges · fee_config         │   │ Next.js 16 (web) │
 │  feeds WS → order books (RAM) │──────▶│ runtime_config · strategy_cfg  │◀──│ read-only        │
 │  engine (event-driven)        │service│ wallets · opportunities·trades │   │ anon + RLS       │
 │  risk · executor · rebalancer │ role  │ spread_history · market_ticks  │   │ Realtime + SWR   │
 │  execution/ (Adapter+FSM)     │       │ candles · transfers · bot_state│   │ ConfigCenter     │
 │  news (LLM, fuera hot-path)   │       │ news_signals · config_audit    │   │ copiloto /api    │
 └──────────────────────────────┘       └───────────────────────────────┘   └──────────────────┘
        ▲ WS a 5 exchanges                         ▲   Realtime (push)  │
        Binance·OKX·Kraken·Bitso·Bitstamp          └────────────────────┘
```

- **Núcleo compartido** (`lib/core`, TS puro): tipos, VWAP/order book, fees, **profit** (`computeNetProfit`), 5 estrategias, **rebalance**, **precision**, **candles**, markov. Lo usan worker **y** web (p.ej. el InventoryPanel calcula el plan con el mismo motor que ejecuta el worker).

## Hot-path de detección (event-driven, <1 ms)
1. Cada mensaje WS → `feed` normaliza el libro → `engine.onBook(book)`.
2. El engine **coalescea** por `queueMicrotask` y re-evalúa **solo** los pares/bases afectados.
3. Corre las 5 estrategias (gateadas por `strategy_config`), recolecta candidatas y las emite **priorizadas por `net_usd`**.
4. `handleOpp`: gate de exchange → DEMO/umbral → news risk-off → circuit breakers → **ABORT por inversión de spread** → `simulate()` → persistencia.

Estrés medido: **~96k evaluaciones/s** in-process (ver [`PRUEBAS-ESTRES.md`](PRUEBAS-ESTRES.md) §5).

## Parametrización en vivo (ADR-002)
`UI (ConfigCenter)` → `POST /api/config` (valida + audit log) → escribe Postgres → el worker la lee en el **poll de 2.5 s** (`loadRuntimeConfig`/`loadStrategyConfig`/`loadFees`/`loadExchangeEnabled`) y la vuelca a los holders `RUNTIME`/`STRATEGIES` → el hot-path la usa en el siguiente tick. **Sin reiniciar.**

## Capa de ejecución “real-ready” (ADR-004)
```
ExchangeAdapter (interfaz)
 ├─ SimulatedAdapter  → fills contra el libro en RAM + conformOrder (precision)   [default]
 └─ LiveAdapter       → Binance Spot Testnet (REST HMAC)                          [opt-in]
OrderLifecycle (FSM): NEW → SENT → PARTIALLY_FILLED → FILLED / REJECTED / CANCELED / EXPIRED
```
Mismo contrato para sim y live → el salto a real es cambiar de adapter. Self-test al boot (ledger desechable).

## Rebalanceo inteligente (ADR-006)
`Rebalancer` (timer ~5 s, fuera del hot-path): `buildInventory` → `detectImbalances` (starvation/runway) → `planRebalance` (ruta más barata, `worthwhile`) → transferencia simulada con FSM `in_transit→completed` (mueve el `Ledger`, cobra withdrawal).

## Resiliencia
Reconexión con backoff exponencial (250 ms→8 s + jitter), watchdog de staleness (5 s), **CRC32 + resync** en OKX/Kraken (ADR-008), wallet guard (sin saldos negativos), circuit breakers (rate-limit, halt por pérdidas, kill switch, news risk-off), ABORT por inversión de spread.

## Mapa de archivos (dónde vive qué)
| Tema | Archivos |
|---|---|
| Motor neto | `lib/core/profit.ts` · `orderbook.ts` · `fees.ts` |
| Estrategias | `lib/core/strategies/*` |
| Precisión / rebalanceo / velas | `lib/core/precision.ts` · `rebalance.ts` · `candles.ts` |
| Detección | `worker/engine.ts` |
| Riesgo / ejecución | `worker/risk.ts` · `worker/executor.ts` |
| Ejecución real-ready | `worker/execution/{order,adapter,simulatedAdapter,liveAdapter}.ts` |
| Rebalanceo (worker) | `worker/rebalancer.ts` |
| Config en vivo | `worker/runtimeConfig.ts` · `worker/supabase.ts` · `app/api/config/route.ts` |
| Feeds | `worker/feeds/*` (`base.ts` común + `crc32.ts`) |
| Dashboard | `components/*` (`config/ConfigCenter`, `CandleChart`, `InventoryPanel`, …) |
| Esquema | `supabase/migrations/0001…0016` (ver `migrations/README.md`) |
