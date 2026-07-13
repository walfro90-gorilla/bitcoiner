# 🧪 QA & Hard-Testing — Bitcoiner

> Cómo probamos Bitcoiner **de verdad**: no solo tests unitarios, sino el producto **corriendo en producción**, manejado por un navegador real, en **loop**, con verificación de datos en vivo contra la base. Esta es la disciplina de pruebas detrás de un finalista.

**Bitcoiner** es un bot de arbitraje de BTC en tiempo real (7 exchanges, detección event-driven <1 ms, simulación depth-aware con costos reales). La narrativa central es la **honestidad**: detecta *todas* las oportunidades y **descarta correctamente** las no rentables. Contexto completo: [`PITCH.md`](PITCH.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`DECISIONS.md`](DECISIONS.md).

Este documento cubre **cómo lo probamos**. Hay tres capas:

```
1. Suite determinista (núcleo)     → la matemática es correcta
2. Hard-testing del dashboard      → el producto funciona en vivo, en loop, en todos los tamaños
3. Verificación de datos en vivo   → lo que se ve = lo que hay en la base
```

---

## 1 · Suite determinista (el núcleo) — `npm test`

El motor de decisión (VWAP, fees, slippage, precisión, rebalanceo, FSM de órdenes, breakers) se prueba con el runner nativo de Node (`node --test` + `tsx`, sin frameworks):

- **87 tests unitarios**, 0 fallos.
- **Property-based** con `fast-check`: invariantes verificadas sobre miles de entradas generadas (neto ≤ bruto, precisión exacta en satoshis, rebalanceo válido).
- **Estrés determinista** (`npm run stress`): **~890 000 iteraciones, 0 violaciones** (FSM fault-storm de 50k órdenes adversariales, L2Book incremental de 200k ops, throughput a 7 venues).

Detalle: [`PRUEBAS.md`](PRUEBAS.md) · [`PRUEBAS-ESTRES.md`](PRUEBAS-ESTRES.md).

> Los tests prueban que la **matemática** es correcta. Pero un jurado no ejecuta `npm test` — abre el dashboard. Por eso probamos también el producto vivo.

---

## 2 · Hard-testing del dashboard en vivo (navegador real, en loop)

Manejamos **Chrome headless con Playwright** contra la **URL de producción real** (`bitcoiner-three.vercel.app`), no un mock ni localhost. Cada corrida atraviesa el muro (`?llave`), espera a que hidraten SWR + Realtime, cierra el tour, y observa lo que un jurado vería.

### 2.1 · Loop de consistencia (5×)
Cargar el dashboard 5 veces en contextos limpios, cada una verificando que **los ~14 paneles rendericen con datos** y **cero errores de consola/red**. Detecta fallos intermitentes que una sola carga oculta.

| Métrica | Resultado |
|---|---|
| Cargas consistentes | **5 / 5** (todos los paneles presentes cada vez) |
| Errores de consola / página | **0** en las 5 |
| Tiempo de carga | ~4.5 s promedio |
| Imágenes rotas | **0** |

### 2.2 · Write-flows en loop (la parametrización en vivo)
El diferenciador #1 es escribir configuración en vivo y que el worker la adopte sin reiniciar. Lo probamos **manejando la UI real** en loop:

- Aplicar perfiles **Conservador ↔ Agresivo** 4 veces seguidas desde el Centro de Configuración.
- **El "Historial de cambios" subió en vivo 12 → 13 → 14 → 15 → 16** (cada cambio queda auditado).
- Verificado en la base: el worker **adoptó** los valores (`min_net_bps → 2`, `max_btc_per_trade → 0.1` del perfil Agresivo).
- Toggle de trading ON → OFF → ON.
- **Cero errores** y **cero drift de P&L** (probamos solo flujos sin ejecución; el estado se restauró exacto al terminar).

Esto prueba la ruta completa **UI → base → worker → adopción**, con auditoría y reversibilidad.

### 2.3 · Multi-viewport (desktop + móvil real)
Bitcoiner es una **PWA mobile-first**, así que probamos a **390 px** (móvil) además de 1440 px:

| Check móvil (390px) | Resultado |
|---|---|
| Scroll horizontal (body) | **0** (nunca rompe) |
| Bottom-nav + safe-area | ✅ presente |
| Hero "7 exchanges" legible | ✅ |
| Centro de Configuración, charts, matriz | ✅ legibles |

### 2.4 · Revisión UI/UX multi-lente
Seis lentes en paralelo (primera impresión del jurado, móvil, legibilidad de paneles, el diferenciador #1, accesibilidad, escuela/admin) revisaron los screenshots **contra el código**, produciendo un plan priorizado por riesgo. Resultado: 6 mejoras seguras aplicadas (ver §4), veredicto **listo para el jurado**.

---

## 3 · Verificación de datos en vivo (MCP Supabase)

Cerramos el loop consultando la **base directamente** (MCP `execute_sql`) para confirmar que lo que muestra el dashboard = lo que realmente hay:

- **Liveness:** los **7 venues** (Binance, OKX, Kraken, Bitso, Bitstamp, Coinbase, Bybit) escribiendo `market_ticks` **frescos al segundo**.
- **Frescura:** `market_ticks` a ~1 s de `now()` con el worker sano.
- **Integridad del estado:** P&L, modo (Real), umbral y wallets consistentes con la UI.
- **Datos honestos:** miles de oportunidades detectadas, **descartadas** por no rentables (`skip_reason`), 0 ejecuciones en Real — la narrativa central, medida en la base.

---

## 4 · Hallazgos y correcciones (lo que encontramos y arreglamos)

El hard-testing encontró cosas reales que los tests unitarios no ven. Todo corregido y desplegado:

| Hallazgo | Causa raíz | Fix |
|---|---|---|
| `reset_simulation()` fallaba con FK | La función (migración 0011) no incluía `orders`/`order_events` (añadidas en 0017) en el `truncate` | **Migración `0019`**: incluye las tablas + `CASCADE` |
| El P&L no se limpiaba con el worker vivo | El worker mantiene el P&L en RAM y reescribe el valor viejo; el guard de adopción no lo detecta en estado estable | **Recipe operativo:** `pm2 stop` → reset → `pm2 start` (el worker arranca leyendo P&L=0 de la base). Verificado: $0 durable |
| Traza de la FSM al revés (`FILLED→SENT→NEW`) | Sort estable por `ts` sin desempate; los eventos self-test comparten el mismo ms | Desempate por `id`: **`NEW→SENT→FILLED`** |
| Footer decía "5 exchanges" | Quedó del conteo viejo 5→7 | 7 venues |
| Escuela decía "4 estrategias" | Faltaba la estrategia Regional/Bitso | "5 estrategias" + Regional |
| Badge de orden se cortaba en móvil | Fila sin `flex-wrap` a 390px | `flex-wrap` |
| Remate de honestidad poco visible | El punchline vivía en gris chico junto a los KPIs grandes | Resaltado (`<strong>`) |
| Labels en inglés en UI en español | `sent`, `gross/net` | `ánimo`, `bruto/neto` |

Cada cambio se verificó con `npm test` (87/87) + `next build` + re-QA visual en el navegador antes de desplegar.

---

## 5 · Cómo reproducir

```bash
# 1. Núcleo determinista
npm test                 # 87/87
npm run stress           # ~890k iteraciones, 0 violaciones

# 2. Hard-test del dashboard (Chrome headless + Playwright contra producción)
#    Maneja bitcoiner-three.vercel.app/?llave=gorila: carga en loop, móvil,
#    write-flows de config, y captura screenshots + errores de consola.
#    (Harness en scratchpad; el patrón: playwright-core + /usr/bin/google-chrome)

# 3. Verificación de datos en vivo (requiere acceso a la base)
#    SELECT sobre market_ticks / opportunities / trades / bot_state
#    para confirmar frescura por venue, P&L y descartes.
```

---

## Resultado

- **87/87** tests · **~890k** iteraciones de estrés sin violaciones.
- Dashboard: **5/5** cargas consistentes, **0** errores de consola, **0** imágenes rotas, **0** overflow en móvil.
- Write-flows en vivo: auditados, adoptados por el worker, **cero drift**.
- Datos en vivo: **7/7** venues frescos al segundo, P&L honesto en $0.
- Todos los hallazgos del hard-testing: **corregidos y desplegados**.

> **Detectar es fácil; probar que sabes cuándo NO operar — y que el producto lo demuestra en vivo, en cualquier pantalla, sin romperse — es la diferencia.**
