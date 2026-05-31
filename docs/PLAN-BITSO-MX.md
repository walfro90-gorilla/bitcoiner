# Plan: Arbitraje de Premio Regional Bitso (MX)

## Contexto / por qué
Bitcoin en México suele cotizar con un **premio de ~1–3%** (a veces descuento) sobre el precio
global, por fricción de capital MXN↔USD, demanda local (remesas) y costos de rampas fiat. Ese premio
vive en el libro **BTC/MXN** de Bitso (el más líquido), **no** en BTC/USDT. A diferencia del arbitraje
entre exchanges líquidos (donde fees > spread), aquí el **premio bruto (100–300 bps) suele superar los
costos** → es donde *sí* hay ganancia real. Bitcoiner ya tiene a Bitso integrado; esto lo lleva al nicho.

## Matemática
```
bitsoBtcUsd  = bitsoBtcMxn / usdtMxn          (precio de Bitso convertido a USD)
globalBtcUsd = mid(Binance/OKX BTC/USDT)
premioBps    = (bitsoBtcUsd / globalBtcUsd − 1) × 10,000
```
- Premio > 0 (Bitso caro): comprar BTC global, vender en Bitso (MXN), convertir MXN→USD.
- Premio < 0 (Bitso barato): comprar en Bitso, vender global.
- Neto = premio − fee Bitso (MXN) − fee global − spread FX (USD/MXN) − transfer (amortizado).
  Solo se marca rentable si el neto > umbral.

## Fases
1. **Datos** — feed `BTC/MXN` de Bitso + `worker/fx.ts` (tasa USDT/MXN desde el book `usdt_mxn` de
   Bitso, con fallback a una API FX gratis sin key).
2. **Estrategia `regional`** — `lib/core/strategies/regional.ts`: premio neto con modelo de costo MX
   (`BITSO_MXN_FEE_BPS`, `FX_SPREAD_BPS`, transfer amortizado). Nuevo `StrategyType: 'regional'`.
3. **Dashboard** — panel "Premio Bitso MX": premio % en vivo (bruto + neto), gráfica histórica.
4. **Persistencia** — wallet MXN sembrada en Bitso; premio guardado en `spread_history`.
5. **(stretch)** — sim de la pata MXN→USD (off-ramp realista).

## Archivos
- Nuevos: `worker/fx.ts`, `lib/core/strategies/regional.ts`, `components/PremiumPanel.tsx`.
- Modificados: `worker/feeds/bitso.ts`, `worker/engine.ts`, `worker/index.ts`, `worker/config.ts`,
  `lib/core/types.ts`, `components/Dashboard.tsx`, seed/reset (wallet MXN).

## El punto honesto
El premio MX es real pero no gratis: Bitso ~0.65% taker en spot MXN, spread del off-ramp USD/MXN, y
riesgo de tiempo. El bot resta todo → muestra el premio **neto**. Cuando el bruto (1–3%) supera esos
costos, es ganancia genuina — y eso pasa seguido en MX.

## Verificación
1. Confirmar `btc_mxn` + `usdt_mxn` en Bitso; ver el feed MXN conectar.
2. El premio % del dashboard debe coincidir con agregadores (CoinGecko MX).
3. Replay de un premio histórico → el neto se calcula bien.
