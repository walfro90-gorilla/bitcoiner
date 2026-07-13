# 📹 VIDEOCALL.md — Preparación de la videollamada técnica

> El comité puede agendar una llamada para "profundizar en decisiones técnicas y arquitectura".
> Aquí: respuestas defendibles + **qué archivo abrir** si preguntan por X. Base: [`DECISIONS.md`](DECISIONS.md).

## Frases ancla
1. *"Empezamos por lo honesto y seguro; el upside es una palanca explícita y configurable."*
2. *"El salto a ejecución real es enchufar el `LiveAdapter`, no rediseñar."*
3. *"Float64 en la detección (error ≪ 1 satoshi), exactitud entera en el borde de ejecución."*

## Q&A probable

**— ¿Por qué no lo reescribieron en C para ir más rápido?**
La latencia ya es <1 ms y está dominada por la **red** (exchange→Frankfurt), no por el CPU. Es un sistema **simulado**: C ahorraría microsegundos invisibles y arriesgaría un sistema desplegado finalista. Lo medimos y lo documentamos (ADR-003). Donde la precisión sí importa —conformar órdenes a los filtros del exchange— usamos **enteros (satoshis)**.

**— ¿No deberían usar decimales (decimal.js) para el dinero?**
El error de float64 en el P&L es ~1e-11 USD, ~7 órdenes por debajo de un satoshi. Lo institucional no es "decimal en todo", es **exactitud donde es contractual**: `lib/core/precision.ts` conforma a `tickSize`/`stepSize`/`minNotional` con aritmética entera → la simulación coincide con lo que el exchange real llenaría. *(Abrir `lib/core/precision.ts` + `precision.test.ts`.)*

**— ¿Qué tan parametrizable es? (el factor #1)**
~30+ variables en vivo desde la UI sin reiniciar: fees por exchange, tamaños, slippage/depeg/FX, breakers, on/off + umbral + maker + tamaño **por estrategia**, on/off de exchanges, rebalanceo. Con perfiles + **audit log**. *(Abrir `components/config/ConfigCenter.tsx` + `app/api/config/route.ts` + la pestaña Historial en vivo.)*

**— ¿Cómo manejan que el mercado se mueva durante la ejecución?**
ABORT por inversión de spread: re-chequeo síncrono del libro fresco con movimiento adverso modelado; si el edge se invirtió, no ejecuta (`spread_inverted`). Demostrable subiendo `abort_extra_slippage_bps`. *(Abrir `worker/index.ts` → `recheckAbort`.)*

**— ¿El rebalanceo es de verdad "inteligente"?**
No es un cron: detecta starvation (runway), elige el **origen más barato**, dimensiona al piso y solo mueve si el costo ≤ 5% del valor (`worthwhile`), evitando ping-pong. *(Abrir `lib/core/rebalance.ts` + `rebalance.test.ts`.)*

**— ¿Órdenes parciales / liquidez?**
VWAP caminando el libro (no top-of-book); si la liquidez no cubre el tamaño → parcial. Slippage dinámico opcional por impacto de mercado. *(Abrir `lib/core/profit.ts` + `orderbook.ts`.)*

**— ¿Integridad de los order books?**
OKX/Kraken incrementales con **CRC32** verificado cada tick; ante mismatch, resync. Validado contra el wire. *(Abrir `worker/feeds/crc32.ts` + `crc32.test.ts`.)*

**— ¿Y si quisieran operar de verdad?**
La interfaz `ExchangeAdapter` ya existe con dos implementaciones (`SimulatedAdapter` default, `LiveAdapter` Binance Spot Testnet con REST firmado HMAC) y máquina de estados de orden. Falta capital/KYC y manejo de errores de órdenes reales; el diseño ya está. *(Abrir `worker/execution/`.)*

**— ¿Cómo sé que es robusto / no inventan los números?**
87 tests unitarios + un harness de estrés determinista: ~96k evaluaciones/s y **0 violaciones de invariantes en ~890k iteraciones** (neto≤bruto, precisión exacta, rebalanceo válido, OHLC coherente). *(Abrir `docs/PRUEBAS-ESTRES.md` §5 + `npm run stress`.)*

**— ¿Por qué Bitso / México?**
Es el edge **genuinamente rentable**: premio/descuento regional MXN. Modelamos su costo real (fee MXN + spread FX). Diferenciador.

## "Abrir si preguntan por X"
| Tema | Archivo |
|---|---|
| Cálculo neto / +$109.75 | `lib/core/profit.ts` · `profit.test.ts` |
| Precisión / fixed-point | `lib/core/precision.ts` |
| Parametrización | `components/config/ConfigCenter.tsx` · `app/api/config/route.ts` |
| ABORT (Pilar 2) | `worker/index.ts` (`recheckAbort`) |
| Rebalanceo (Pilar 3) | `lib/core/rebalance.ts` · `worker/rebalancer.ts` |
| Ejecución real-ready | `worker/execution/*` |
| CRC32 | `worker/feeds/crc32.ts` |
| Estrés | `scripts/stress.ts` · `docs/PRUEBAS-ESTRES.md` |
| Decisiones | `docs/DECISIONS.md` |

## Antes de la llamada
- Tener el **audit log poblado** con cambios reales (mueve algunas variables el día previo).
- Ensayar el code-walkthrough de `profit.ts` y `precision.ts`.
- Worker arriba + datos frescos (encender la VM, verificar liveness).
