# 🧪 Pruebas — Bitcoiner

> **Filosofía:** los tests son **documentación ejecutable**. Son deterministas (sin red, sin reloj real donde importa), corren en **&lt;1 s**, y **fijan el ejemplo exacto del reto** (+$109.75/BTC) para que nunca pueda romperse en silencio. La matemática de dinero y la lógica de detección/riesgo se prueban en el **núcleo TS puro** compartido por worker y web.

## Cómo correr

```bash
npm test            # toda la suite (auto-discovery: lib/**/*.test.ts + worker/**/*.test.ts)
npm run test:core   # solo el núcleo crítico (profit + crc32 + markov)
npm run check:worker # typecheck estricto del worker (tsconfig.worker.json)
npm run lint        # eslint
node --import tsx --test lib/core/profit.test.ts   # un solo archivo
```

**Estado:** **82/82 verde** · `check:worker` RC=0 · `npm run stress` → 0 violaciones. Node 24 (runner nativo `node --test` + `tsx`, sin frameworks externos).

> **Cobertura fase final** (además de profit/markov/crc32): `precision.test.ts` (fixed-point), `rebalance.test.ts` (núcleo) + `worker/rebalancer.test.ts` (FSM), `candles.test.ts`, `runtimeConfig.test.ts`, `worker/engine.test.ts` (gating por estrategia), `worker/execution/{order,simulatedAdapter}.test.ts` (FSM + adapter), `worker/executor.test.ts` + `worker/risk.test.ts` (fills/parciales/wallet-guard/breakers) y `lib/core/stress.test.ts` (invariantes). El estrés determinista vive en `scripts/stress.ts` (`npm run stress`) — ver [`PRUEBAS-ESTRES.md`](PRUEBAS-ESTRES.md) §5.

## Suite por área

### 🧮 Núcleo — rentabilidad neta · [lib/core/profit.test.ts](../lib/core/profit.test.ts) (6)
El corazón del bot: `computeNetProfit` (VWAP depth-aware + fees + slippage + withdrawal + depeg + maker/taker).
| Test | Qué garantiza (criterio del reto) |
|---|---|
| reproduce el ejemplo del reto: **+$109.75/BTC** neto | Precisión del cálculo neto (criterio #2), fijado exacto |
| rechaza una oportunidad rentable en bruto pero **negativa en neto** | La "honestidad": descarta lo no rentable tras costos |
| **órdenes parciales**: capa el volumen a la liquidez | Robustez ante liquidez insuficiente (criterio #3) |
| el **slippage** estimado reduce el neto | Modelado de costos de ejecución |
| **maker** captura mejor neto que taker | Trade-off maker/taker modelado |
| maker usa la **tarifa maker** (no la taker) | Fees correctos por modo |

### 🔢 Núcleo — régimen Markov del premio Bitso · [lib/core/markov.test.ts](../lib/core/markov.test.ts) (7)
Cadena de Markov de 1er orden sobre el historial del premio MX.
`classifyRegime` (bps→estado) · matriz de transición (filas suman 1) · transiciones deterministas exactas · conteo de transiciones/muestras · `probEntersPremium` (suma columnas de premio) · estado nunca visto → distribución vacía sin crash · **suavizado de Laplace** (evita ceros duros).

### 🔒 Integridad de order books — CRC32 · [worker/feeds/crc32.test.ts](../worker/feeds/crc32.test.ts) (6)
Verificación de libros incrementales (OKX/Kraken) contra desincronización.
Vector estándar `"123456789" → 0xCBF43926` · cadena vacía = 0 · `toInt32` unsigned→signed (como OKX) · `okxChecksumString` (alterna bid/ask con strings crudos del wire) · `krakenFmt` (formato de precisión) · `krakenChecksumString` (asks asc + bids desc).

### ⚙️ Parametrización en vivo — holder · [worker/runtimeConfig.test.ts](../worker/runtimeConfig.test.ts) (5)
El holder en caliente `RUNTIME`/`STRATEGIES` que el worker actualiza sin reiniciar.
Defaults = `CONFIG.*` (cero regresión) · `applyRuntime` (solo claves presentes; ignora null/undefined; permite 0) · `applyStrategy` (merge preservando el resto) · `effectiveMinNet` (override por estrategia o global) · `effectiveTargetBase` (override o global).

### 🧠 Integración del motor — gating por estrategia · [worker/engine.test.ts](../worker/engine.test.ts) (3)
Prueba el **diferenciador #1** (parametrización con efecto real): alimenta books a `engine.onBook` y captura las oportunidades emitidas.
| Test | Qué prueba |
|---|---|
| detecta oportunidad espacial rentable | Camino feliz de la detección |
| **deshabilitar una estrategia la quita** de la detección | El toggle on/off por estrategia tiene efecto real |
| el **umbral por estrategia** marca como no-rentable sobre el global | El override de umbral por estrategia funciona |

## Más allá de los unit tests

- **Hard test de la parametrización** — metodología + hallazgos + resoluciones de la revisión adversarial: [docs/HARDTEST-PARAM.md](HARDTEST-PARAM.md). Incluye round-trip de config en vivo contra la DB y smoke tests del worker real (boot, feeds, ejecución, 0 crashes).
- **Pruebas de estrés** — carga, resiliencia de feeds, circuit breakers y capacidad de DB: [docs/PRUEBAS-ESTRES.md](PRUEBAS-ESTRES.md).
- **Typecheck estricto** — `npm run check:worker` (worker) + `next build` (web) en cada commit.

## Cobertura — honestidad de ingeniería

**Cubierto:** núcleo neto (incl. ejemplo del reto), Markov, CRC32, holder de config, gating del motor, y el path de ejecución vía smoke (DEMO → 6 fills, caps OK, 0 crashes).

**Pendiente (roadmap, criterio #5):** unit tests dedicados de `executor`/`risk`/parsers de feeds, *property-based testing* de invariantes (net ≤ gross, parciales ≤ liquidez, sin saldos negativos), y CI en GitHub Actions (lint + typecheck + test + build en cada push).
