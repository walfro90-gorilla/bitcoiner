# 🦅 Bitcoiner — Bot de Arbitraje de Bitcoin en tiempo real

> Sistema que **detecta oportunidades de arbitraje de BTC en tiempo real** entre Binance, OKX, Kraken, Bitso y Bitstamp, calcula su **rentabilidad neta** (fees + withdrawal + slippage), **simula la ejecución** respetando la liquidez del order book, e incorpora **noticias de última hora + IA** en la gestión de riesgo. Construido para el **Coding Challenge México**.

## 🔗 Enlaces

| | |
|---|---|
| 🌐 **Dashboard en vivo** | **https://bitcoiner-three.vercel.app** |
| 💻 **Repositorio** | https://github.com/walfro90-gorilla/bitcoiner |
| ⚙️ **Worker** | UpCloud · Frankfurt (EU) · 24/7 con pm2 |

---

## 🎬 Qué estás viendo (en 30 segundos)

Un **worker** corriendo en un servidor de **Frankfurt** mantiene conexiones **WebSocket** abiertas a 7 exchanges y procesa cada cambio de precio en **<1 ms**. Cuando detecta que el precio de compra (ask) en un exchange es menor al de venta (bid) en otro, calcula si es rentable **después de todos los costos** y, si lo es, **simula la operación**. Todo se guarda en Supabase y este dashboard lo refleja **en vivo** (sin recargar). El **copiloto IA** explica lo que pasa y las **noticias** ajustan el riesgo.

> 💡 **Toggle DEMO/Real (arriba a la derecha):** en **Real**, el bot solo ejecuta operaciones con ganancia neta ≥ umbral — y como los mercados son eficientes, *correctamente* descarta casi todas (esa es la precisión). En **DEMO** ejecuta cada divergencia real aunque el neto sea chico, para mostrar la mecánica (fills, parciales, P&L) en vivo.

---

## 🖥️ Guía del dashboard — qué hace cada sección

1. **Header / Controles** — `Trading ON/OFF` (kill switch global), `DEMO/Real` (modo de ejecución) y `min net bps` (umbral de rentabilidad). Cualquier cambio aquí lo obedece el worker remoto en **~2.5 s** (vía la tabla `bot_state`), sin reiniciar nada.
2. **Tarjetas (KPIs):**
   - **P&L acumulado** — ganancia/pérdida neta simulada de todas las operaciones.
   - **Operaciones** — # de trades ejecutados (y oportunidades que se ejecutaron).
   - **Oportunidades vistas** — # de divergencias detectadas, *se ejecuten o no* (prueba que el bot "ve" el mercado).
   - **Latencia detección** — tiempo de procesamiento por evento (típico **<1 ms**).
3. **P&L acumulado (gráfica)** — evolución temporal del P&L neto (recharts).
4. **Arbitraje estadístico (z-score)** — el *spread* (log-ratio) entre Binance USDT y Kraken USD normalizado a desviaciones estándar; bandas **±2σ** marcan zonas de entrada (mean-reversion).
5. **Oportunidades detectadas (tabla en vivo)** — cada fila es una divergencia. Columnas: hora · **estrategia** (spatial/cross-quote/triangular/statistical) · **ruta** (compra→venta) · **Gross** (spread bruto) · **Net** (neto tras costos) · **Net $** · **Vol** (BTC ejecutable) · **estado** (`ejecutada` / `vista` / motivo de descarte como `below_threshold`, `news_risk_off`, `insufficient_balance`).
6. **Operaciones ejecutadas (blotter)** — trades simulados: volumen, **VWAP** de compra/venta, fees, **P&L neto**, `ms` de ejecución y bandera **parcial** (cuando la liquidez no cubrió el tamaño completo).
7. **Noticias & sentimiento** — titulares recientes + **termómetro** (sentimiento −1..1 e impacto) generado por la **IA**. Noticias de alto impacto negativo activan **risk-off** (el bot pausa ejecuciones).
8. **Wallets simuladas** — saldos por exchange y activo; se actualizan tras cada operación (y el *wallet guard* impide que se vuelvan negativos).
9. **Copiloto 🦅 (abajo a la derecha)** — chat con IA (Gemini) que responde sobre P&L, por qué se ejecutó/descartó una operación, estado del mercado y noticias, **con datos reales** de la base de datos.

> **Paneles de mercado (parte superior):** **Estado del mercado** (mejor bid/ask por exchange) + **Matriz de arbitraje** N×N que resalta dónde `ask(compra) < bid(venta)` · **Profundidad del libro** (ladder de niveles por venue) · **Anatomía del ejemplo del reto** ($70,000→$70,250 = +$109.75/BTC) · **Velocidad de detección** (avg/p50/p95/p99) · **Mejor oportunidad reciente** (priorización por neto) · **Desempeño por estrategia** (trades, win-rate y P&L de las 5).
>
> **Capa analítica (datos reales, fuera del hot-path):** **⚖️ Maker vs Taker** (comparador en vivo del trade-off, mismo motor) · **⏮️ Backtest** del premio Bitso sobre `spread_history` con punto de equilibrio · **🔮 Régimen del premio** (cadena de Markov: matriz de transición + probabilidad del próximo régimen) · **🔍 Análisis de descartes** (por qué el bot NO ejecuta).

---

## 🏗️ Arquitectura

Tres piezas; **el hot-path (detección) nunca toca el servidor web**:

```
  UpCloud VM (Frankfurt, EU)             Supabase (Postgres + Realtime)        Vercel
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

- **Worker** (`/worker`): WebSockets persistentes + order books **en RAM**, matemática por evento, ejecución simulada, poller de noticias; escribe a Supabase (service role). En **EU** porque Binance/OKX bloquean IPs de EE.UU.
- **Supabase**: estado + historial + **Realtime** (empuja cambios al dashboard).
- **Next.js / Vercel**: dashboard read-only (anon + RLS) + copiloto `/api/chat`.
- **Núcleo compartido** (`/lib/core`): TS puro (tipos, VWAP, fees, profit, estrategias) usado por worker **y** web.

## 🧮 La matemática: rentabilidad NETA depth-aware

Corazón: [`lib/core/profit.ts`](lib/core/profit.ts). Para comprar `V` BTC barato y venderlo caro:

1. **Cap de liquidez:** `execBase = min(targetBase, Σ asks_compra, Σ bids_venta)` → de aquí salen las **órdenes parciales**.
2. **VWAP** caminando ambos libros (no solo el top-of-book).
3. **Bruto:** `(vwapSell·fx − vwapBuy)·execBase`.
4. **Neto** = bruto − fees taker (ambos lados) − withdrawal (amortizado) − slippage − depeg (cross-quote).
5. Ejecuta solo si `netSpreadBps ≥ MIN_NET_BPS`.

> **Insight clave:** entre exchanges líquidos los fees taker (~20 bps round-trip) **superan** el spread (<1 bp) → el arbitraje espacial puro casi nunca es rentable. El edge real aparece en **Bitso** (premium regional) y **cross-quote USD↔USDT**. Por eso el bot registra *todas* las oportunidades y **descarta correctamente** las no rentables.

> **Modo maker (`MAKER_MODE`, opcional):** además del modelo *taker* (cruza el spread, fill garantizado), el motor puede modelar fills **maker** — órdenes límite pasivas que entran al **mejor precio del lado propio** (compra al bid, vende al ask) y pagan **fee maker** (menor). Es como capturan el arbitraje los profesionales: proveen liquidez en ambos extremos. A cambio asumen **riesgo de no-fill** (modelado conservadoramente). En el ejemplo del reto, maker rinde **+$199.88/BTC** vs **+$109.75** taker. Default *off* (taker, fills garantizados).

## 🧠 Estrategias (5 en paralelo)

| Estrategia | Descripción |
|---|---|
| **Espacial** | Mismo par/quote entre dos venues (comprar barato, vender caro). |
| **Cross-quote** | BTC/USD (Kraken) vs BTC/USDT, modelando costo de stablecoin (depeg). |
| **Triangular** | Ciclo intra-exchange USDT→BTC→ETH→USDT (sin withdrawal). |
| **Estadística** | z-score / mean-reversion del spread (log-ratio) entre venues. |
| **Regional (Bitso MX)** | Premio/descuento de BTC en el mercado mexicano (BTC/MXN) vs. el global (BTC/USDT), con FX USDT/MXN y costos locales. |
| **Régimen (Markov)** | Cadena de Markov de 1er orden sobre el historial del premio Bitso: modela las transiciones entre regímenes (descuento/neutral/premio) para **anticipar** cuándo conviene pre-posicionar órdenes maker. Modela el régimen, no el precio. |

> Cada tick recolecta TODAS las oportunidades y las emite **priorizadas por `net_usd`** (rentables primero) → el bot ejecuta la **mejor del tick primero**, no "la primera que aparece".

## 🛡️ Gestión de riesgo (circuit breakers)

`MIN_NET_BPS` · tamaño máx. por trade (BTC y USD) · rate limit (trades/min) · **halt por N pérdidas consecutivas** + cooldown · exclusión de feeds *stale*/desconectados · **wallet guard** (sin balances negativos → fuerza parciales) · **kill switch** + umbral en vivo desde el dashboard · **régimen risk-off por noticias** de alto impacto · **slippage adverso** que descuenta el movimiento del libro durante la latencia detect→fill · **recapeo contra liquidez y balances actuales** antes de confirmar el fill (parciales).

## 📰 Noticias & sentimiento (IA)

Poller **fuera del hot-path** (~3 min): **CryptoPanic** (o **Google News RSS** sin key) → un **LLM (Gemini)** sintetiza `{sentimiento −1..1, impacto, resumen}` → `news_signals` + `bot_state`. Alto impacto negativo ⇒ **risk-off**. El arbitraje es instantáneo, así que la noticia **modula el riesgo/volatilidad**, no el cálculo del spread.

## ⚡ Latencia

Detección **event-driven** (no polling): cada mensaje WS re-evalúa solo los pares afectados (coalescing por microtask). Se persiste `detection_latency_ms` (típico **<1 ms**) y `feed_lag_ms` (latencia de red exchange→worker). El dashboard muestra **avg / p50 / p95 / p99** en vivo y la latencia por oportunidad.

## 🔒 Integridad de los order books (incremental + checksum CRC32)

Los feeds de **OKX** (canal `books`, 400 niveles) y **Kraken** (`book` v2) son **incrementales**: tras un snapshot inicial se aplican solo los *deltas* (un nivel con tamaño 0 se borra). Mantener el libro en RAM aplicando deltas es lo que usan los sistemas reales — mucho más eficiente que recibir el libro completo cada vez.

El riesgo de un libro incremental es el **desincronización** (perder un mensaje → libro corrupto → señales falsas). Por eso ambos exchanges publican un **checksum CRC32** y Bitcoiner lo **recalcula y verifica en cada tick**:
- **OKX:** CRC32 (int32 con signo) de los primeros 25 niveles alternando bid/ask con los strings crudos del wire.
- **Kraken:** CRC32 de asks(10) + bids(10) con precio/cantidad formateados; la **precisión se auto-detecta** del primer snapshot.
- Ante un **mismatch** → *resync* automático (re-suscribe y pide snapshot nuevo); nunca se emite un libro corrupto. El de OKX es **best-effort**: si tras 3 fallos no cuadra, degrada a incremental sin checksum en vez de caerse.

Verificado **en vivo** contra el wire real (`worker/feeds/crc32.test.ts` cubre el algoritmo con el vector estándar `123456789 → 0xCBF43926`).

## 🧪 Pruebas de estrés

Probado bajo carga agresiva contra Supabase de producción (metodología + cómo reproducir en [`docs/PRUEBAS-ESTRES.md`](docs/PRUEBAS-ESTRES.md)):

| Dimensión | Resultado |
|---|---|
| **Carga / throughput** | latencia **avg 2.31 ms** (máx 50) · 286 opps + 88 trades / 30 s · RSS ~131 MB · **0 crashes** |
| **Resiliencia de feeds** | reconexión con backoff + watchdog de staleness (5 s) · 5 reinicios limpios resumiendo P&L desde la DB |
| **Circuit breakers** | halt por pérdidas (**41 bloqueos**) + rate-limit (**37**) → ejecuciones **88 → 8** (~90 % frenado) |
| **Capacidad de DB** | **12 MB** bajo carga · acotada a ~55–100 MB por `pg_cron` + snapshots off |

---

## 🎯 Cómo cumplimos los criterios de evaluación

| Criterio del reto | Cómo lo resolvemos |
|---|---|
| **1. Velocidad / eficiencia de detección** | **WebSockets** (no polling) + order books en RAM **incrementales** (deltas, no snapshots completos) → **<1 ms** por evento, medido y mostrado. Worker en EU para baja latencia y sin geo-bloqueo. |
| **2. Precisión del cálculo neto** | `computeNetProfit` depth-aware: VWAP sobre el libro + **fees por exchange** + **withdrawal** (amortizado) + **slippage** + **depeg** cross-quote. Descarta lo que es rentable en bruto pero negativo en neto. |
| **3. Solidez / robustez** | Órdenes **parciales** por liquidez, **wallet guard**, suite de **circuit breakers**, halt por pérdidas, manejo de feeds stale + reconexión con backoff, **slippage adverso** (modela el movimiento del libro durante la latencia), **recapeo contra balances/liquidez** antes del fill, y **verificación de integridad CRC32** de los libros incrementales (resync ante desync). |
| **4. Estrategia e inteligencia** | **5 estrategias** (espacial, cross-quote, triangular, estadística, **regional Bitso MX**) + **régimen de riesgo por noticias con IA**. No toma "la primera": evalúa todos los pares y **prioriza por `net_usd`** (ejecuta la mejor del tick primero); el dashboard muestra el **desglose de P&L por estrategia**. |
| **5. Arquitectura y código** | Separación worker/web, **núcleo TS puro reutilizado**, tipos compartidos, RLS estricta, capa LLM **pluggable**, migraciones versionadas. |
| **6. Experiencia web** | Dashboard **en tiempo real** (Supabase Realtime + SWR) con P&L, oportunidades, trades, z-score, noticias, wallets, controles en vivo y **copiloto IA**. |

---

## 🧰 Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Recharts · SWR · `ws` · `@supabase/ssr` + Realtime · **LLM pluggable** `@google/genai` (Gemini) / `@anthropic-ai/sdk` · Node 20+ · `tsx` · pm2.

## 🚀 Correr en local

```bash
npm install
# 1) Variables: copia .env.example -> .env.local (web) y .env.worker (worker)
# 2) DB: aplica supabase/migrations/*.sql (MCP de Supabase o SQL Editor)
# 3) Arranca:
npm run worker     # el "cerebro": feeds + detección + ejecución + noticias
npm run dev        # dashboard en http://localhost:3000
```

## ☁️ Despliegue

- **Worker** → **UpCloud VM región EU** (guía paso a paso: [`deploy/UPCLOUD.md`](deploy/UPCLOUD.md)); alternativas: Railway EU (`railway.json`) o Docker (`Dockerfile`). IP **no-US** para Binance/OKX.
- **Web** → **Vercel** (import del repo). Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, y el LLM del copiloto — por defecto **Groq** (`LLM_PROVIDER=openai`, `OPENAI_API_KEY=gsk_…`, `OPENAI_MODEL=llama-3.3-70b-versatile`); alternativa: `GEMINI_API_KEY` + `LLM_PROVIDER=gemini`. `worker/` se ignora con `.vercelignore`.
- **Supabase** → un proyecto compartido por worker y web.

## 🗄️ Esquema (Supabase / Postgres)

`exchanges`, `fee_config`, `wallets`, `opportunities`, `trades`, `spread_history`, `book_snapshots`, `bot_state`, `news_signals`. **RLS:** lectura pública (anon) para el dashboard; escritura solo vía service role (worker). **Realtime** en `opportunities`, `trades`, `wallets`, `bot_state`, `news_signals`. SQL en [`supabase/migrations/`](supabase/migrations).

## 📐 Decisiones técnicas

- **Worker separado del web**: Edge/Serverless no mantienen conexiones persistentes → forzarían polling lento. Un proceso Node 24/7 con libros en RAM da latencia mínima.
- **Región EU**: evita el geo-bloqueo de Binance/OKX desde IPs de EE.UU.
- **Modelo de inventario**: saldos en cada venue; el `withdrawal` se **amortiza** entre los trades que un rebalanceo soporta, no completo por trade.
- **Cross-quote ≠ arbitraje puro**: USDT ≠ USD → costo de depeg configurable.
- **IA fuera del hot-path**: copiloto + scoring de noticias (Gemini, pluggable) leen la DB y modulan riesgo; **nunca** deciden el trade en sí (eso es de microsegundos).

### ⚖️ Trade-offs explícitos

Un buen sistema no esconde sus compensaciones: las hace explícitas y deja una **palanca** para cada una. Detalle completo en [`docs/TRADE-OFFS.md`](docs/TRADE-OFFS.md).

| Trade-off | Opciones | Elección (palanca) |
|---|---|---|
| **Maker vs Taker** | Taker = fill garantizado · Maker = mejor precio + fee menor, con riesgo de no-fill | Taker default; maker opt-in (`MAKER_MODE`). En el ejemplo del reto: taker +$109.75 vs maker **+$199.88**/BTC |
| **Velocidad vs Precisión** | Ejecutar al ver bruto · recalcular neto antes | Precisión (neto en <1 ms) |
| **Real vs DEMO** | Disciplina (P&L ~$0) · actividad (llena tablas) | Real default; DEMO (`DEMO_MODE`) para demo en vivo |
| **Snapshot vs Incremental** | Simple · eficiente pero con desync | Incremental + checksum CRC32 (OKX/Kraken) |
| **Tamaño vs Slippage** | Orden grande gana más · mueve el precio | VWAP depth-aware + parciales (`MAX_BTC_PER_TRADE`) |
| **Selectividad** | Umbral alto = seguro · bajo = más trades | `min_net_bps` configurable en vivo (default 5) |
| **Datos vs Costo DB** | Guardar todo · retención agresiva | `pg_cron` → ~6% del free tier |
- **5º exchange (Bitstamp)** + **inyector del ejemplo del reto**: el botón "🧬 Reproducir ejemplo" del dashboard empuja el escenario $70,000→$70,250 por el pipeline real (detección → simulación → P&L), para que el jurado vea el caso del brief ejecutarse en vivo.
- **Tests**: `npm test` corre **82 unit tests** + un harness de estrés determinista (`npm run stress`). Cubren motor neto (incl. **+$109.75/BTC** y maker/taker), Markov, CRC32, **precisión fixed-point**, **rebalanceo**, **velas OHLC**, **parametrización en vivo**, **FSM de orden + SimulatedAdapter**, **executor + circuit breakers**, **integración del motor** (gating por estrategia) e **invariantes bajo carga** (~890k iteraciones, 0 violaciones). Docs: **[`CRITERIOS-JURADO.md`](docs/CRITERIOS-JURADO.md)** (evidencia punto por punto de los 5 criterios del jurado) · [`PRUEBAS.md`](docs/PRUEBAS.md) · [`PRUEBAS-ESTRES.md`](docs/PRUEBAS-ESTRES.md) · [`QA-HARDTEST.md`](docs/QA-HARDTEST.md) · [`DECISIONS.md`](docs/DECISIONS.md) · [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`DEMO.md`](docs/DEMO.md) · [`VIDEOCALL.md`](docs/VIDEOCALL.md).
- **Capa analítica (web-only, datos reales)**: comparador **maker/taker**, **backtest** histórico del premio Bitso y **cadena de Markov** de régimen — todo en el navegador sobre datos ya capturados, sin tocar el worker ni el hot-path. Trade-offs en [`docs/TRADE-OFFS.md`](docs/TRADE-OFFS.md).

---

## 🎤 Guion de pitch (2 minutos)

1. **(15s)** "Bitcoiner detecta arbitraje de Bitcoin en tiempo real entre 7 exchanges. El cerebro corre en Frankfurt con WebSockets; este dashboard refleja todo en vivo."
2. **(30s)** Señala las **Oportunidades** llegando y la **latencia <1 ms**. "Detectamos cada divergencia en sub-milisegundo."
3. **(30s)** Abre una operación en el **blotter**: "Calculamos el neto real — fees, withdrawal, slippage — y caminamos el order book (VWAP), con **órdenes parciales** si falta liquidez."
4. **(20s)** Toggle **DEMO → Real**: "En real el bot **descarta** lo que no es rentable tras costos. Esa precisión es la diferencia entre un bot promedio y uno bueno." (Cambio se aplica al worker remoto en 2.5 s.)
5. **(15s)** **Noticias + termómetro**: "La IA puntúa noticias de última hora; las de alto impacto activan risk-off automático."
6. **(10s)** Abre el **copiloto 🦅**: pregunta *"¿por qué se descartó la última oportunidad?"* → responde con datos reales.

> **Cierre:** *"Velocidad, precisión y robustez — y todo desplegado y en vivo."*
