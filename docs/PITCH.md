# 🎤 Guion de pitch — Bitcoiner · Coding Challenge México (finalista 17/250)

> **Antes de empezar (checklist T-15 min):** worker **online y caliente** en la VM (`pm2 list` → `clawbot-worker` online; feeds frescos ~5-10 min) · Supabase sirviendo (data-plane sin 402) · dashboard abierto con `?llave=gorila` en modo **Real** · P&L en **$0** (resetea en `/admin` SOLO con el worker vivo) · pestaña del copiloto lista · este doc a un lado.

> 💡 **La app se explica sola:** Bitcoiner es una **PWA instalable** (celular/PC) con **tour guiado** (botón 🎯) que recorre todo en 1 min — clave si el jurado la abre por su cuenta. Cada control del **Centro de Configuración** queda **auditado y es reversible**, así que explorar no rompe nada. Si te quedas sin tiempo: *"toquen 🎯 Tour y la app se explica sola."*

---

## ⏱️ Guion cronometrado (~2:30)

### 0:00–0:15 · Gancho (qué es)
> *"Bitcoiner es un bot de arbitraje de Bitcoin en tiempo real, **grado institucional**. El cerebro corre en un servidor en **Frankfurt** con WebSockets abiertos a **7 exchanges** —Binance, OKX, Kraken, Bitso, Bitstamp, Coinbase y Bybit— y procesa cada cambio de precio en **menos de un milisegundo**. Todo este dashboard es en vivo, sin recargar."*

👉 *Señala:* el dashboard completo y la barra de "Estado del mercado" con los exchanges actualizándose.

### 0:15–0:35 · Velocidad + el mercado (criterio: velocidad)
> *"Arriba, el mejor precio de compra y venta en cada exchange, y la **matriz de arbitraje**: en verde, dónde se podría comprar barato y vender caro. Detectamos cada divergencia con **WebSockets, no polling**, en un loop **event-driven**. Aquí la latencia real medida: **p50, p95, p99 — sub-milisegundo**. El mismo principio que el HFT."*

👉 *Señala:* la **Matriz de arbitraje** (celdas verdes) y el panel **⚡ Velocidad de detección** (p50/p95/p99).

### 0:35–1:00 · Precisión: el corazón del bot (criterio: precisión) — **el momento clave**
> *"Y aquí lo más importante. Llevamos detectadas **decenas de miles** de oportunidades… y ejecutadas **cero**. Eso **no es un error, es la precisión**. Calculamos la ganancia **neta** caminando el order book —VWAP real, no top-of-book— restando **comisiones, retiro, slippage y depeg**. Entre exchanges líquidos, las comisiones (~20 bps) se comen el spread (<1 bp). Un bot promedio ejecutaría y **perdería en cada operación**. El nuestro **espera con disciplina**."*

👉 *Señala:* "Oportunidades vistas" (número grande subiendo) vs P&L en **$0** · el panel **Análisis de descartes** con el motivo (`below_threshold`) y las "casi rentables".

### 1:00–1:15 · "Pero cuando SÍ hay edge…" (ejemplo exacto del reto)
> *"¿Y cuándo sí hay ganancia? Reproduzcamos el ejemplo exacto del reto."*

👉 *Acción:* pulsa **🧬 Reproducir ejemplo** (header) y **espera a que el botón confirme `✓ +$109.75 ejecutado`** (el worker lo procesa en ~2.5 s — narra el paso, no te quedes callado).

> *"Comprar en Kraken a 70,000, vender en Binance a 70,250 — pasa por el **pipeline real**: detección, simulación respetando la liquidez, y P&L. **+109.75 dólares por Bitcoin**, neto. Ahí está en el blotter, y el P&L se movió."*

👉 *Señala:* el trade nuevo en "Operaciones ejecutadas" y el P&L que salta.

### 1:15–1:45 · Parametrización TOTAL en vivo (**el diferenciador #1 del comité**)
> *"El comité nos dijo que la **profundidad de parametrización** era el factor decisivo. Aquí está: el **Centro de Configuración** ajusta **~30 variables en vivo** —fees por exchange, tamaños, slippage, breakers, y cada estrategia y cada exchange encendido o apagado—. Cambio algo aquí… y el worker lo **adopta en ~2.5 segundos, sin reiniciar**. Y todo queda en un **registro de auditoría** reversible."*

👉 *Acción:* en el **Centro de Configuración** apaga un exchange o sube el umbral → muestra que en ~2.5 s deja de aparecer en las oportunidades. Opcional **fault-injection**: sube `abort_extra_slippage_bps` y aparecen descartes `spread_inverted` (el bot **aborta** si el spread se invierte durante la latencia).

### 1:45–2:15 · Inteligencia + robustez (criterios: estrategia + robustez)
> *"No es una estrategia: corremos **cinco en paralelo** —espacial, cross-quote, triangular, estadística y arbitraje **regional en Bitso México**— priorizadas por **ganancia neta**. Con riesgo de verdad: **órdenes parciales** por liquidez, **circuit breakers**, **wallet guard**, integridad de libros con **checksum CRC32**, y **rebalanceo inteligente** del inventario entre venues. La ejecución es **'real-ready'**: un `SimulatedAdapter` por defecto y un `LiveAdapter` a testnet — el salto a real es enchufar el adapter. Hasta las **noticias**: una IA puntúa el sentimiento y activa **risk-off** automático."*

👉 *Señala:* panel de estrategias · 🇲🇽 Premio Bitso · Inventario/rebalanceo · panel de Noticias.

### 2:15–2:30 · Cierre + IA
> *"Y todo es transparente: este **copiloto** consulta la base en vivo —con herramientas de solo lectura— y explica cualquier decisión con datos reales."*

👉 *Acción:* en el copiloto escribe *"¿por qué no se ejecutan oportunidades?"* → deja que responda.

> *"Velocidad, precisión, parametrización total y robustez — desplegado y corriendo 24/7. **Bitcoiner no busca operar mucho; busca operar bien.**"*

---

## 🎁 Bloques extra (si hay tiempo o el jurado pregunta "qué más")

Piezas analíticas que demuestran profundidad — todas sobre **datos reales** y **fuera del hot-path** (no arriesgan la latencia):

### A · Maker vs Taker — el trade-off en vivo
👉 *Señala:* la tarjeta **"⚖️ Maker vs Taker"**; mueve el slider de fee.
> *"Modelamos las dos formas de ejecutar: taker cruza el spread con fill garantizado; maker pone órdenes límite — mejor precio y menor fee, pero con riesgo de no-fill. Mismo motor, recalculado en vivo: en el ejemplo del reto, taker da +$109.75 y maker hasta **+$199.88 por BTC**. Trade-off consciente: default el seguro. Y se puede **encender maker en vivo** desde el Centro de Configuración."*

### B · Backtest histórico del premio Bitso
👉 *Señala:* la tarjeta **"⏮️ Backtest"**; mueve el slider de costo.
> *"Esto NO es proyección inventada: reproducimos las **muestras reales** del premio Bitso que ya capturamos (el panel muestra el conteo exacto). Simula el P&L de operar el premio, y el slider de costo marca el **punto de equilibrio** donde deja de ser rentable — la misma disciplina, en datos históricos."*

### C · Régimen del premio con cadena de Markov
👉 *Señala:* la tarjeta **"🔮 Régimen del premio"** (heatmap 4×4).
> *"Modelamos el premio como una **cadena de Markov** sobre las muestras reales capturadas (el conteo va en el panel): estima la probabilidad de pasar de un régimen a otro —descuento, neutral, premio—. No predice el precio: anticipa el **régimen**, para saber cuándo pre-posicionar una orden maker. Arbitraje estadístico de verdad."*

### D · Órdenes reales en testnet (opt-in)
👉 *Señala:* el panel **"Órdenes en vivo"** (timeline de la FSM).
> *"La capa de ejecución existe: con `EXECUTION_MODE=live` mandamos una orden **límite no-marketable** al testnet de Binance y la cancelamos — se ve el ciclo real `new → open → canceled` sin arriesgar capital."*

---

## 🎯 Frases-ancla (memoriza estas 3)
1. *"Cero ejecuciones no es un bug, es la precisión."*
2. *"Cambio una variable y el bot la adopta en 2.5 segundos, sin reiniciar."*
3. *"Bitcoiner no busca operar mucho; busca operar bien."*

---

## 🛡️ Preparación de Q&A (lo que puede preguntar el jurado)

**— ¿Por qué no ejecuta en Real? ¿Funciona?**
> Sí. Detecta decenas de miles de divergencias; las descarta porque ninguna es rentable tras costos. Lo demuestro: *(activa DEMO 20 s)* — bajo el umbral, ejecuta y se ven fills, parciales y P&L. *(vuelve a Real)*. Es diseño: precisión sobre volumen.

**— ¿Qué tan configurable es? (el factor #1 del comité)**
> ~30 variables en vivo desde el Centro de Configuración: fees por exchange, tamaños, slippage/depeg/FX, circuit breakers, y **por estrategia** (on/off, umbral, maker, tamaño) y **por exchange** (on/off). El worker las relee en su poll de ~2.5 s **sin reiniciar**. Cada cambio queda en un **audit log** con perfiles y es reversible.

**— ¿Latencia real o inventada?**
> Medida: persistimos `detection_latency_ms` y `feed_lag_ms` por evento. El panel muestra p50/p95/p99 en vivo. Event-driven con coalescing por microtask: re-evaluamos solo los pares afectados.

**— ¿Cómo manejan order books / desincronización?**
> OKX y Kraken son **incrementales** (deltas). Verificamos cada tick con **CRC32**; ante mismatch, resync automático. Coinbase/Bybit vía un libro L2 incremental (snapshot/delta). Validado contra el wire real.

**— ¿Slippage y liquidez? ¿Y la precisión numérica?**
> VWAP caminando el libro (no top-of-book). Si la liquidez no cubre el tamaño → **orden parcial**. Slippage adverso modela el movimiento durante la latencia. En el **borde de ejecución** usamos aritmética exacta en enteros (**satoshis**, `conformOrder` a tick/step/minNotional); float64 solo en la detección (error ~1e-11 USD, 7 órdenes por debajo de 1 satoshi). Wallet guard: nunca saldos negativos.

**— ¿Arbitraje triangular / estadístico?**
> Triangular intra-exchange (USDT→BTC→ETH→USDT) sin withdrawal, **depth-aware** (VWAP por pata: en libros delgados el edge baja, honesto); estadística por z-score con bandas ±2σ. Ambos en el dashboard.

**— ¿Por qué Bitso / México?**
> Es el edge **genuinamente rentable**: el mercado MX suele tener premio/descuento regional. Modelamos su costo real (fee MXN + spread FX). Es nuestro diferenciador de estrategia.

**— ¿Arquitectura / por qué no todo en serverless?**
> Serverless no mantiene WebSockets persistentes → forzaría polling lento. Worker Node 24/7 en EU (evita geo-bloqueo de Binance/OKX) con libros en RAM. Web read-only en Vercel. El **hot-path nunca toca el web server**. 9 ADRs documentados en `docs/DECISIONS.md`.

**— ¿Y si quisieran operar de verdad?**
> Ya está la arquitectura: interfaz `ExchangeAdapter` con `SimulatedAdapter` (default) y `LiveAdapter` (testnet Binance, HMAC REST, opt-in). La simulación ya respeta liquidez y balances, así que el salto es **enchufar el adapter**, no reescribir.

**— ¿Maker o taker?**
> Modelamos ambos (mismo motor). Taker = fill garantizado, default. Maker = mejor precio + fee menor (+$199.88 vs +$109.75 en el ejemplo) con riesgo de no-fill. Trade-off explícito con palanca (`MAKER_MODE`), encendible en vivo. Elegimos el seguro por honestidad.

**— ¿No es Markov demasiado simple para predecir precios?**
> Sí para precio — por eso NO lo usamos para eso. Modelamos **régimen** (descuento/neutral/premio), donde un Markov de 1er orden es estándar y defendible, estimado sobre las muestras reales capturadas. La decisión del trade sigue siendo el cálculo neto determinista; Markov solo anticipa cuándo pre-posicionar maker.

**— ¿El backtest es real o inventado?**
> Real: reproduce `spread_history`, el premio Bitso que el worker ya capturó. No simulamos precios — usamos los registrados. El slider de costo muestra el punto de equilibrio.

**— ¿Cómo sé que no está roto?**
> `npm test` → **82/82** (motor neto +$109.75, CRC32, Markov, precisión, rebalanceo, executor, risk). Además **property-based** con fast-check y un harness de estrés (~890k iteraciones, 0 violaciones: FSM fault storm + L2Book + 7 venues). `npm run build` y `check:worker` verdes.

---

## 🚨 Plan de contingencia (si algo falla en vivo)
- **No llegan datos al dashboard** → (1) ¿worker vivo? `pm2 list`/`pm2 logs` en la VM. (2) ¿Supabase con **402 exceed_egress_quota**? entonces el data-plane está restringido — hay que quitar el spend cap / subir plan (no lo arregla prender la VM). Respaldo: screenshots/GIF del dashboard funcionando.
- **El inyector no muestra `✓ +$109.75 ejecutado`** (queda en "⏳ Esperando al worker…") → el worker no procesó el `inject_seq`: revisa que esté vivo y con Supabase sirviendo. El +$109.75 **estático** siempre está en la tarjeta "Anatomía de una oportunidad" (render client-side, no depende del worker).
- **El copiloto tarda/falla** (cuota LLM) → sáltalo; está fuera del hot-path. Es IA opcional.
- **0 trades y quieres mostrar mecánica** → toggle **DEMO** 20 s (se llena todo) → vuelve a **Real** y **resetea** (con worker vivo) antes de cerrar.
- **El jurado ve "En construcción"** → comparte SIEMPRE la URL con `?llave=gorila`, o pon `MAINTENANCE=off` en Vercel durante la ventana.

---

## 📦 Datos duros para soltar si hace falta
- **7 exchanges** · **5 estrategias** de ejecución + **modelo de régimen Markov** · WebSockets event-driven · **<1 ms** detección
- **Parametrización TOTAL en vivo**: ~30 vars, por estrategia y por exchange, **adopción ~2.5 s sin reiniciar**, con audit log + perfiles
- Motor neto depth-aware (VWAP + fees + withdrawal + slippage + depeg) · **maker/taker** modelados
- Precisión **fixed-point** en el borde (satoshis, `conformOrder`) · **ABORT** por inversión de spread
- **Rebalanceo inteligente** del inventario · **ejecución real-ready** (`SimulatedAdapter`/`LiveAdapter` testnet)
- Circuit breakers + parciales + wallet guard + **CRC32** (OKX/Kraken/Coinbase/Bybit incrementales)
- **Copiloto IA con tool-use** (herramientas de solo lectura sobre la DB en vivo) · alertas **Telegram** opt-in
- Capa analítica web-only sobre datos reales: **comparador maker/taker**, **backtest** del premio, **Markov** de régimen
- Robustez: `npm test` → **82/82** + **property-based** (fast-check) + estrés **~890k iteraciones, 0 violaciones** (ver `docs/PRUEBAS-ESTRES.md`)
- Desplegado: **UpCloud Frankfurt** (worker 24/7) + **Vercel** (web) + **Supabase** (datos/realtime)
- Trade-offs y decisiones documentados: `docs/TRADE-OFFS.md` · `docs/DECISIONS.md` (9 ADRs)
- **PWA instalable** (mobile-first, se ve bien en PC) + **tour guiado autoexplicativo** (🎯)
