# 🎤 Guion de pitch — Clawbot (2 min) · Coding Challenge México

> **Antes de empezar (checklist 30 s):** worker online (`pm2 list`) · dashboard abierto en modo **Real** · P&L en **$0** (resetea en el panel admin si hace falta) · pestaña del copiloto lista · este doc a un lado.

---

## ⏱️ Guion cronometrado (2:00)

### 0:00–0:15 · Gancho (qué es)
> *"Clawbot es un bot de arbitraje de Bitcoin en tiempo real. El cerebro corre en un servidor en **Frankfurt** con conexiones **WebSocket** abiertas a **5 exchanges** —Binance, OKX, Kraken, Bitso y Bitstamp— y procesa cada cambio de precio en **menos de un milisegundo**. Este dashboard refleja todo en vivo, sin recargar."*

👉 *Señala:* el dashboard completo, la barra de "Estado del mercado" con los 5 exchanges actualizándose.

### 0:15–0:40 · Velocidad + el mercado (criterio #1)
> *"Arriba ven el mejor precio de compra y venta en cada exchange, y la **matriz de arbitraje**: en verde, dónde podría comprarse barato y venderse caro. Detectamos cada divergencia con **WebSockets, no polling**, en un loop **event-driven**. Aquí está la latencia real: **p50, p95, p99 — sub-milisegundo**. Es el mismo principio que el HFT."*

👉 *Señala:* la **Matriz de arbitraje** (celdas verdes) y el panel **⚡ Velocidad de detección** (p50/p95/p99).

### 0:40–1:05 · Precisión: el corazón del bot (criterio #2) — **el momento clave**
> *"Y aquí está lo más importante. Llevamos detectadas **decenas de miles** de oportunidades… y ejecutadas **cero**. Eso **no es un error, es la precisión**. Calculamos la ganancia **neta** caminando el order book —VWAP real, no top-of-book— restando **comisiones, retiro, slippage y depeg**. Entre exchanges líquidos, las comisiones (~20 bps) se comen el spread (<1 bp). Un bot promedio ejecutaría y **perdería dinero en cada operación**. El nuestro **espera con disciplina**."*

👉 *Señala:* "Oportunidades vistas" (número grande subiendo) vs P&L en **$0** · la tabla de Oportunidades con el motivo de descarte (`below_threshold`).

### 1:05–1:25 · "Pero cuando SÍ hay edge…" (demo del ejemplo del reto)
> *"¿Y cuándo sí hay ganancia? Reproduzcamos el ejemplo exacto del reto."*

👉 *Acción:* pulsa **🧬 Reproducir ejemplo** (header).

> *"Comprar en Kraken a 70,000, vender en Binance a 70,250 — el sistema lo pasa por el **pipeline real**: detección, simulación respetando liquidez, y P&L. **+109.75 dólares por Bitcoin**, neto. Ahí está en el blotter, y el P&L se movió."*

👉 *Señala:* el trade nuevo en "Operaciones ejecutadas" y el P&L que salta.

### 1:25–1:45 · Inteligencia + robustez (criterios #3 y #4)
> *"No es una sola estrategia: corremos **cinco en paralelo** —espacial, cross-quote, triangular, estadística, y arbitraje **regional en Bitso México**— y las **priorizamos por ganancia neta**. Con gestión de riesgo de verdad: **órdenes parciales** por liquidez, **circuit breakers**, y verificación de integridad de los libros con **checksum CRC32**. Hasta las **noticias**: una IA puntúa el sentimiento y activa **risk-off** automático."*

👉 *Señala:* panel de estrategias · 🇲🇽 Premio Bitso · panel de Noticias con el termómetro.

### 1:45–2:00 · Cierre + IA
> *"Y todo es transparente: este **copiloto** explica cualquier decisión con datos reales."*

👉 *Acción:* en el copiloto escribe *"¿por qué no se ejecutan oportunidades?"* → deja que responda.

> *"Velocidad, precisión y robustez — desplegado y corriendo 24/7. **Clawbot no busca operar mucho; busca operar bien.**"*

---

## 🎯 Frases-ancla (memoriza estas 3)
1. *"Cero ejecuciones no es un bug, es la precisión."*
2. *"Un bot promedio detecta; uno bueno sabe cuándo NO operar."*
3. *"Clawbot no busca operar mucho; busca operar bien."*

---

## 🛡️ Preparación de Q&A (lo que puede preguntar el jurado)

**— ¿Por qué no ejecuta en Real? ¿Funciona?**
> Sí. Detecta decenas de miles de divergencias; las descarta porque ninguna es rentable tras costos. Lo demuestro: *(activa DEMO 20 s)* — bajo el umbral, ejecuta y se ven fills, parciales y P&L. *(vuelve a Real)*. Es una decisión de diseño: precisión sobre volumen.

**— ¿Latencia real o inventada?**
> Medida: persistimos `detection_latency_ms` y `feed_lag_ms` por evento. El panel muestra p50/p95/p99 en vivo. Event-driven con coalescing por microtask: re-evaluamos solo los pares afectados.

**— ¿Cómo manejan order books / desincronización?**
> OKX y Kraken son **incrementales** (deltas, no snapshots). Verificamos cada tick con **CRC32**; ante mismatch, resync automático. Lo validamos contra el wire real (OKX 5/5 match, incluido int32 negativo).

**— ¿Slippage y liquidez?**
> VWAP caminando el libro (no top-of-book). Si la liquidez no cubre el tamaño → **orden parcial**. Slippage adverso modela el movimiento durante la latencia. Wallet guard: nunca saldos negativos.

**— ¿Arbitraje triangular / estadístico?**
> Triangular intra-exchange (USDT→BTC→ETH→USDT) sin withdrawal; estadística por z-score con bandas ±2σ. Ambos en el dashboard.

**— ¿Por qué Bitso / México?**
> Es el edge **genuinamente rentable**: el mercado MX suele tener premio/descuento regional. Modelamos su costo real (fee MXN + spread FX). Es nuestro diferenciador.

**— ¿Arquitectura / por qué no todo en serverless?**
> Serverless no mantiene WebSockets persistentes → forzaría polling lento. Worker Node 24/7 en EU (evita geo-bloqueo de Binance/OKX) con libros en RAM. Web read-only en Vercel. Hot-path nunca toca el web.

**— ¿Y si quisieran operar de verdad?**
> El motor de decisión ya está; faltaría la capa de ejecución con API keys y manejo de errores de órdenes reales. La simulación ya respeta liquidez y balances, así que el salto es acotado.

---

## 🚨 Plan de contingencia (si algo falla en vivo)
- **No llegan datos al dashboard** → revisa `pm2 list` en la VM; el worker resucita solo tras reboot. Respaldo: screenshots/gif del dashboard funcionando.
- **El inyector no mueve el P&L** → verifica que estás en una pestaña con el worker vivo; reintenta el botón (incrementa `inject_seq`).
- **El copiloto tarda/falla** (cuota LLM) → sáltalo; está fuera del hot-path, no afecta al bot. Explica que es IA opcional.
- **0 trades y quieres mostrar mecánica** → toggle **DEMO** 20 s (se llena todo) → vuelve a **Real** y **resetea** antes de cerrar.

---

## 📦 Datos duros para soltar si hace falta
- **5 exchanges** · **5 estrategias** · WebSockets event-driven · **<1 ms** detección
- Motor neto depth-aware (VWAP + fees + withdrawal + slippage + depeg)
- Circuit breakers + parciales + wallet guard + **CRC32**
- Stress test: ~2.3 ms avg bajo carga, ~131 MB RSS, 0 crashes (ver `docs/PRUEBAS-ESTRES.md`)
- Desplegado: **UpCloud Frankfurt** (worker 24/7) + **Vercel** (web) + **Supabase** (datos/realtime)
- Tests: `npm test` (motor neto +$109.75 + CRC32)
