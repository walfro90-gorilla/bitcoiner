# ⚖️ Trade-offs de diseño — Bitcoiner

> Un **trade-off** es una decisión donde mejorar una dimensión empeora otra: no se pueden maximizar las dos a la vez. Un buen sistema no "elimina" los trade-offs — los hace **explícitos** y elige el balance de forma consciente y configurable. Este documento lista los trade-offs de Bitcoiner, las opciones de cada uno, y por qué elegimos lo que elegimos.

---

## 1. Maker vs Taker (ejecución)

**El dilema:** ¿cómo entras a cada pata del arbitraje?

| | **Taker** (default) | **Maker** (`MAKER_MODE=true`) |
|---|---|---|
| Cómo entra | Cruza el spread: compra al *ask*, vende al *bid* | Orden límite pasiva: compra al *bid*, vende al *ask* |
| Precio | Peor (pagas el spread) | **Mejor** (capturas el spread) |
| Fee | Taker (mayor) | **Maker** (menor o igual) |
| Ejecución | ✅ **Fill garantizado** | ⚠️ **Riesgo de no-fill** (la orden puede no llenarse si el mercado se mueve) |

**Números reales** (ejemplo del reto: comprar Kraken, vender Binance):
- **Taker:** +$109.75 / BTC
- **Maker, mismo fee:** +$129.75 / BTC → **+$20 solo por mejor precio** (entras $10 mejor en cada lado)
- **Maker, con fee maker menor:** +$199.88 / BTC → **+$90** (precio + ahorro de comisión)

**Qué elegimos:** **Taker por default** (fills garantizados = P&L honesto), maker **opt-in**. Razón: el upside del maker es real y es como operan los profesionales (proveen liquidez en ambos extremos), pero **inflar el P&L asumiendo que toda orden pasiva se llena sería deshonesto**. Lo modelamos conservador y lo dejamos como palanca. → `lib/core/profit.ts` (opción `maker`), verificado en `profit.test.ts`.

---

## 2. Velocidad vs Precisión (detección)

**El dilema:** ¿ejecutas apenas ves un spread, o recalculas todos los costos primero?

- **Velocidad pura:** ejecutar al ver `ask < bid` → más trades, pero muchos serían **negativos en neto**.
- **Precisión:** caminar el order book (VWAP) y restar fees + withdrawal + slippage + depeg **antes** de decidir.

**Qué elegimos:** **precisión, sin sacrificar velocidad medible.** El cálculo neto corre en **<1 ms** (event-driven, en RAM), así que no hay que elegir de verdad — pero la *decisión* siempre es sobre el **neto**, nunca el bruto. Resultado: el bot detecta decenas de miles de oportunidades y ejecuta solo las rentables. → criterio #2 del reto.

---

## 3. Real vs DEMO (modo de ejecución)

**El dilema:** ¿muestras disciplina o muestras actividad?

- **Real:** solo ejecuta con neto ≥ umbral. En mercados eficientes → **P&L ≈ $0** (correcto, pero parece "quieto").
- **DEMO:** ejecuta cada divergencia bruta → llena tablas y P&L, pero acumula pérdidas (es a propósito, para enseñar la mecánica).

**Qué elegimos:** **Real por default**; DEMO como interruptor para demostrar fills/parciales en vivo. El toggle está en el dashboard y el worker lo adopta en ~2.5 s. → la narrativa: *"cero ejecuciones no es un bug, es la precisión"*.

---

## 4. Snapshot vs Incremental (feeds WebSocket)

**El dilema:** ¿recibes el libro completo cada vez, o solo los cambios?

- **Snapshot:** simple, imposible de desincronizar, pero **más ancho de banda** y menos profundidad (p.ej. OKX `books5` = top-5).
- **Incremental:** solo deltas → **eficiente y profundo** (400 niveles), pero puede **desincronizarse** si pierdes un mensaje.

**Qué elegimos:** **incremental + checksum CRC32** en OKX y Kraken. El checksum detecta cualquier desync y dispara un resync automático. Es lo que hacen los sistemas reales; lo validamos contra el wire en vivo. Binance/Bitso/Bitstamp siguen en snapshot (su API así lo entrega). → `worker/feeds/crc32.ts`.

---

## 5. Latencia vs Robustez (ejecución)

**El dilema:** cada verificación de seguridad añade microsegundos.

- **Menos chequeos:** más rápido, pero arriesgas ejecutar con datos viejos o saldo insuficiente.
- **Más chequeos:** re-evaluar liquidez/balances y modelar slippage antes del fill = más seguro.

**Qué elegimos:** **robustez con costo de latencia mínimo.** Slippage adverso + recap contra liquidez/balances antes de confirmar, wallet guard (nunca saldos negativos), y exclusión de feeds *stale*. El costo es sub-milisegundo, así que la robustez sale casi gratis.

---

## 6. Tamaño de orden vs Slippage (sizing)

**El dilema:** órdenes grandes ganan más… hasta que mueven el precio en tu contra.

- **Grande:** más ganancia nominal, pero **caminas más niveles del libro** → peor VWAP (slippage).
- **Pequeña:** menos slippage, pero menos ganancia absoluta.

**Qué elegimos:** cap por `MAX_BTC_PER_TRADE` + **VWAP real depth-aware** (no top-of-book), con **órdenes parciales** cuando la liquidez no cubre el tamaño. El motor ya "ve" cuánto cuesta cada nivel extra.

---

## 7. Umbral `min_net_bps` (apetito de riesgo)

**El dilema:** ¿cuán selectivo es el bot?

- **Umbral alto:** pocas operaciones, casi todas seguras.
- **Umbral bajo:** más operaciones, más expuesto a costos mal estimados.

**Qué elegimos:** **configurable en vivo** desde el dashboard (default 5 bps). Es la palanca directa del operador para mover el balance riesgo/volumen sin reiniciar nada.

---

## 8. Cobertura de datos vs Costo de DB

**El dilema:** guardar todo da análisis rico pero llena la base.

- **Guardar todo** (incl. snapshots de libro): backtest perfecto, pero ~700 MB/día.
- **Retención agresiva:** DB chica, pero pierdes historial fino.

**Qué elegimos:** retención automática con `pg_cron` (opps 3 h, spread 12 h, snapshots off por default) → la DB se mantiene en **~6% del free tier** sin intervención. Snapshots son opt-in para cuando se quiera backtest.

---

## 9. Más venues vs Recursos

**El dilema:** cada exchange extra = más oportunidades pero más RAM, conexiones y riesgo de rate-limit.

**Qué elegimos:** **5 venues** (Binance, OKX, Kraken, Bitso, Bitstamp) — el punto dulce para una VM de 2 GB, con reconexión por backoff para no provocar bans. Añadir un 6º es trivial si el hardware lo permite.

---

## Resumen para el jurado

> Bitcoiner no esconde sus trade-offs: cada uno tiene una **palanca** (`MAKER_MODE`, `min_net_bps`, `DEMO_MODE`, `MAX_BTC_PER_TRADE`, retención) y un **default conservador**. La filosofía: *empezar por lo honesto y seguro, y dejar el upside como una decisión explícita del operador*.
