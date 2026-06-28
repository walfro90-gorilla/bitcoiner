# 🧭 DECISIONS.md — Decision log (ADRs) de Bitcoiner

> Registro de decisiones de arquitectura, en formato ADR ligero (Contexto · Decisión · Por qué · Trade-off).
> Es el documento de referencia para la **videollamada técnica** del comité: cada decisión es defendible.

---

## ADR-001 · Arquitectura de 3 capas; el hot-path nunca toca el servidor web
**Contexto.** Detección de arbitraje en tiempo real con WebSockets persistentes + ejecución simulada + dashboard.
**Decisión.** **Worker** Node 24/7 (UpCloud Frankfurt, order books en RAM) → **Supabase** (Postgres + Realtime) → **Next.js/Vercel** read-only. El núcleo matemático es TS puro en `lib/core`, compartido por worker y web.
**Por qué.** Serverless/Edge no mantiene WebSockets persistentes → forzaría polling lento. Un proceso dedicado con libros en RAM da latencia mínima. Región EU evita el geo-bloqueo de Binance/OKX a IPs de EE.UU.
**Trade-off.** Una VM que mantener (punto único) → mitigado con pm2 startup+save y reconexión con backoff.

## ADR-002 · Parametrización TOTAL en vivo (no reiniciar para reconfigurar)
**Contexto.** El comité dijo que **la profundidad de parametrización es el factor #1**.
**Decisión.** Toda la config (fees por exchange, tamaños, slippage/depeg/FX, circuit breakers, on/off + umbral + maker + tamaño **por estrategia**, on/off de exchanges, rebalanceo) vive en Postgres (`runtime_config` / `strategy_config` / `fee_config` / `exchanges`). El worker la lee en un **poll de 2.5 s** y la aplica sin reiniciar. Cambios con **audit log** (`config_audit`) y **perfiles** guardables.
**Por qué.** De ~4 a ~30+ variables ajustables desde la UI en vivo. El audit log hace cada cambio reversible y defendible.
**Trade-off.** ~3 SELECTs extra cada 2.5 s sobre tablas diminutas (egress despreciable). Guard de reentrancia en el poll.
**Código.** `worker/runtimeConfig.ts`, `app/api/config/route.ts`, `components/config/ConfigCenter.tsx`.

## ADR-003 · Precisión: float64 en la detección, fixed-point en el borde — NO decimal.js, NO C
**Contexto.** Pregunta natural: ¿no deberíamos usar decimales/“C” para “más precisión y velocidad”?
**Decisión.** **float64 en el hot-path** (detección/P&L) + **aritmética exacta en enteros (satoshis) en el BORDE de ejecución** (`lib/core/precision.ts`: `conformOrder` a tickSize/stepSize/minNotional). **No** decimal.js en todo. **No** reescribir en C.
**Por qué.** Medido: el error de float64 en el P&L es ~**1e-11 USD**, ~7 órdenes de magnitud **por debajo de 1 satoshi** (~$0.0006). Donde la exactitud SÍ es contractual es al conformar órdenes a los filtros del exchange (si rediondeas mal, el exchange RECHAZA) → ahí usamos enteros. Así la **simulación coincide con lo que un exchange real llenaría (sim == live)**. La latencia ya es <1 ms y está dominada por la **red** (exchange→Frankfurt), no por el CPU: C ahorraría microsegundos invisibles en un sistema simulado y arriesgaría un sistema desplegado.
**Trade-off.** El motor decimal “en todo” queda como roadmap; ganamos crédito de ingeniería sin riesgo. Verificado: el ejemplo del reto sigue dando **+$109.75** exacto.

## ADR-004 · Ejecución “real-ready”: patrón ExchangeAdapter + máquina de estados de orden
**Contexto.** El comité premia la ambición; ¿operar de verdad?
**Decisión.** La ejecución vive tras una interfaz **`ExchangeAdapter`** (`worker/execution/`): `SimulatedAdapter` (default, fills contra el libro en RAM) y `LiveAdapter` (**Binance Spot Testnet**, REST firmado HMAC). Máquina de estados de orden `NEW→SENT→PARTIALLY_FILLED→FILLED/REJECTED/CANCELED/EXPIRED`. `crossVenueTransfer: false` documenta que **no** ejecutamos arbitraje cross-venue real.
**Por qué.** El salto a ejecución real es **enchufar el LiveAdapter, no rediseñar**. El testnet prueba el lifecycle real sin fondos ni la imposibilidad del cross-venue (los testnets tienen precios aislados, no hay divergencia real que arbitrar). El núcleo sigue simulado y honesto.
**Trade-off.** El live se demuestra **grabado/controlado**, nunca dependiendo de un API call en vivo frente al jurado.

## ADR-005 · ABORT por inversión de spread (robustez ante mercado en movimiento)
**Contexto.** Pilar #2: “¿qué pasa si el mercado se mueve a mitad de la ejecución?”
**Decisión.** Guard **síncrono** en `handleOpp` (`recheckAbort`): antes de comprometer, re-evalúa el libro **fresco** con un movimiento adverso modelado (`abort_extra_slippage_bps`) y **aborta** (`skip_reason: spread_inverted`) si el neto cae por debajo de `abort_min_net_bps`.
**Por qué.** Responde literal el Pilar #2 sin la complejidad (ni el riesgo de desincronización async) de una capa FSM persistida completa. Subir `abort_extra_slippage_bps` **demuestra aborts en vivo** (fault injection).
**Trade-off.** Defaults neutros (0/0) = cero regresión; aplica a spatial/cross_quote/statistical.

## ADR-006 · Rebalanceo inteligente y automatizado (no un cron tonto)
**Contexto.** Pilar #3: “¿mantiene el balance entre exchanges de forma inteligente y automatizada?”
**Decisión.** Núcleo puro (`lib/core/rebalance.ts`): detecta **starvation** (un venue sin BTC para vender o sin quote para comprar bajo el piso operativo = runway × tamaño de trade), elige el **origen más barato**, dimensiona **hacia el piso** y solo mueve si es **`worthwhile`** (costo ≤ 5% del valor movido + banda muerta). El worker ejecuta la transferencia simulada con FSM `in_transit→completed` fuera del hot-path.
**Por qué.** “Inteligente” = elige ruta, dimensiona y evita ping-pong/migajas; no mueve por mover.
**Trade-off.** `rebalance_auto` OFF por defecto (cero regresión); el operador lo activa.

## ADR-007 · Slippage dinámico por liquidez (Tarea 1)
**Contexto.** Tarea 1 pedía slippage “dinámico basado en el order book”.
**Decisión.** Opt-in: el slippage adverso escala con la **fracción del libro consumida** (impacto de mercado), además del VWAP depth-aware. Configurable en vivo (`dynamic_slippage`).
**Por qué.** Modela el impacto real de una orden grande relativa a la liquidez. Default off → el ejemplo del reto (+$109.75) intacto.

## ADR-008 · Order books incrementales + checksum CRC32
**Contexto.** OKX/Kraken entregan deltas (eficiente y profundo) pero pueden desincronizarse.
**Decisión.** Mantener el libro en RAM aplicando deltas + **verificar CRC32 en cada tick**; ante mismatch, **resync** automático. OKX es best-effort (degrada a incremental tras 3 fallos). Binance/Bitso/Bitstamp van por snapshot.
**Por qué.** Es lo que hacen los sistemas reales; nunca se emite un libro corrupto. Verificado contra el wire (`worker/feeds/crc32.test.ts`).

## ADR-009 · Restricción free-tier de Supabase
**Contexto.** El límite que muerde es **egress/Realtime**, no el tamaño de DB.
**Decisión.** `opportunities` **fuera** de Realtime (era ~99% del tráfico); el dashboard la refresca por polling. Solo tablas chicas (trades, wallets, bot_state, runtime/strategy_config, transfers) en Realtime. Retención con `pg_cron`.
**Por qué.** Mantiene el proyecto en el free tier sin sacrificar la experiencia en vivo de P&L/ejecuciones.

---

### Resumen de filosofía
> Empezar por lo **honesto y seguro** (simulación, taker, defaults conservadores), dejar el **upside como palanca explícita** (maker, dynamic slippage, rebalance auto, testnet), y hacer **cada decisión defendible** con datos. Ver también [`docs/TRADE-OFFS.md`](TRADE-OFFS.md) y [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
