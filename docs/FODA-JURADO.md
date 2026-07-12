# FODA de Bitcoiner frente a los 5 criterios del jurado

Análisis honesto de dónde está el proyecto **hoy** (12-jul-2026, cierre de la final) medido contra los cinco criterios que el comité anunció para la fase final: (1) profundidad y parametrización, (2) robustez ante escenarios adversos, (3) gestión de wallets y rebalanceo, (4) calidad de interfaz y visualización, (5) documentación y claridad del código. Las fortalezas citan la evidencia ya verificada en [CRITERIOS-JURADO.md](CRITERIOS-JURADO.md) y [QA-HARDTEST.md](QA-HARDTEST.md); las debilidades y amenazas se declaran con la misma honestidad que el bot aplica a sus oportunidades: cada «no» con su porqué y su mitigación.

---

## 💪 Fortalezas

**Criterio 1 — Profundidad y parametrización**
- **96 variables** editables en vivo (24× las 4 palancas pedidas), validadas por whitelist tipado, adoptadas por el worker en Frankfurt en **≤2.5 s sin reiniciar**, con audit log append-only (antes→después) y perfiles de un clic ([evidencia §1](CRITERIOS-JURADO.md)).
- Granularidad real: overrides **por estrategia** (5×8 campos) y **por exchange** (7×4 knobs); el circuito UI→API→Postgres→worker se probó **en producción** con el audit subiendo 12→16 en vivo y cero drift ([QA §2.2](QA-HARDTEST.md)).

**Criterio 2 — Robustez ante escenarios adversos**
- FSM de órdenes de **7 estados / 11 transiciones** (transición ilegal = excepción), fills **parciales** por liquidez real (cap VWAP en `lib/core/profit.ts`), y re-chequeo **ABORT con libro fresco** antes de comprometer ([evidencia §2](CRITERIOS-JURADO.md)).
- **~890,000 iteraciones de estrés adversarial, 0 violaciones** (fault-storm de 50k órdenes, 200k cálculos de neto sin un solo NaN) + CRC32 con resync en los feeds + **10 razones distintas** de descarte persistidas ([PRUEBAS-ESTRES.md](PRUEBAS-ESTRES.md)).

**Criterio 3 — Gestión de wallets y rebalanceo**
- Motor de decisión **puro y sin I/O** (`lib/core/rebalance.ts`, 131 líneas) que responde *cuándo* (runway de N trades), *hacia dónde* (mayor déficit), *por qué ruta* (origen con más excedente, costo real) y *si vale la pena* (banda muerta + costo ≤5% del monto) — **9/9 tests** + 3,000 inventarios aleatorios sin violaciones ([evidencia §3](CRITERIOS-JURADO.md)).
- Modo **AUTO opt-in** con FSM `in_transit→completed`, 5 parámetros en vivo con audit, y **el mismo núcleo corriendo en el browser** para previsualizar el plan que el worker ejecutará.

**Criterio 4 — Calidad de interfaz y visualización**
- **32 componentes** con Supabase Realtime (10 tablas, 18 suscripciones), latencia pulsando en pantalla, y la narrativa de honestidad **graficada**: `RejectionAnalysis` muestra la razón exacta de cada descarte sobre las últimas 500 oportunidades ([evidencia §4](CRITERIOS-JURADO.md)).
- Calidad **probada contra producción**, no prometida: 5/5 cargas consistentes, **0 errores de consola**, 0 overflow a 390px, PWA instalable mobile-first ([QA-HARDTEST.md](QA-HARDTEST.md)).

**Criterio 5 — Documentación y claridad del código**
- **17 documentos (1,337 líneas)** con **9 ADRs** formales (Contexto·Decisión·Por qué·Trade-off) y **9 trade-offs admitidos por escrito** ([DECISIONS.md](DECISIONS.md), [TRADE-OFFS.md](TRADE-OFFS.md)); el README mapea cada criterio del reto a su línea de código.
- **82/82 tests** en 20 archivos (incl. property-based con fast-check), 19 migraciones SQL inmutables, núcleo compartido worker+web re-exportado desde un punto único, y un QA de tres capas documentado con números medidos hoy ([QA-HARDTEST.md](QA-HARDTEST.md)).

---

## 🚀 Oportunidades de mejora

Priorizadas por impacto ante el jurado; esfuerzo S/M/L.

| Oportunidad | Criterio(s) | Impacto jurado | Esfuerzo | Nota |
|---|---|---|---|---|
| **Replay determinista** desde `book_snapshots` («rewind the market») | 2, 4 | **Alto** | M | Wow visual: reproducir un momento del mercado y ver al bot decidir de nuevo. Demuestra robustez de forma tangible. |
| **Copiloto con tool-use de escritura** («sube el umbral a 10 bps» en lenguaje natural) | 1, 4 | **Alto** | M | Con guardas (whitelist + confirmación + audit). Convierte las 96 variables en conversación; hoy el copiloto es solo lectura. |
| **Ejecución real en mainnet** con capital acotado | 2 | **Alto** | L | El salto natural: el `LiveAdapter` ya opera contra Binance testnet; falta capital, claves mainnet y hardening operativo. |
| **Rebalanceo AUTO on por default + más rutas** | 3 | Medio | S | Hoy AUTO es opt-in (deploy cero-riesgo consciente). Encenderlo por default y añadir rutas multi-hop luce el motor. |
| **Ops: `pm2 startup` + reactivar CI + monitoring del worker** | 2, 5 | Medio | S | Resucitar tras reboot de la VM, gate automático de regresión, alerta si el worker cae. Barato y quita el mayor riesgo operativo. |
| **Lucir `maker_mode` en vivo** | 1 | Medio | S | El modelo maker (fee menor, riesgo de no-fill) ya existe pero está OFF por default; una demo lado a lado taker vs maker enseña profundidad. |
| **Pulido UI post-jurado** (empty-state móvil de TradesTable fuera de la tabla, focus-rings a11y en NavBar/BottomNav, ocultar columnas Mid/Spread en móvil) | 4 | Bajo | S | Detalles cosméticos detectados en el QA multi-lente; ninguno rompe nada hoy. |
| **Motor decimal completo** (reemplazar float64+fixed-point en el borde) | 5 | Bajo | L | Diferido conscientemente por ADR-003 ([DECISIONS.md](DECISIONS.md)); solo si un juez lo exige — el estrés de 200k cálculos no encontró un solo error de redondeo relevante. |

---

## ⚠️ Debilidades

Declaradas con la misma honestidad que pedimos al bot. Cada una con su mitigación o la razón de la decisión.

**Criterios 2 y 3 — La ejecución es SIMULADA.**
La debilidad más importante y la más consciente: Bitcoiner no opera capital real. *Mitigación / decisión:* la arquitectura es **real-ready** por diseño — el patrón `ExchangeAdapter` (ADR en [DECISIONS.md](DECISIONS.md)) permite `EXECUTION_MODE=live` contra **Binance testnet** hoy mismo, opt-in; la simulación es depth-aware (VWAP sobre libros reales, fills parciales, filtros de precisión tick/step/minNotional), no un random. Operar mainnet en un challenge sin capital asignado habría sido imprudencia, no mérito.

**Criterio 2 — Worker en UNA sola VM (SPOF) y on-demand.**
El worker vive en una única VM de UpCloud y se mantiene apagado por default para ahorrar. Si la VM cae durante una demo, el dashboard se queda sin datos frescos. *Mitigación:* recipe de warm-up antes de cualquier ventana de revisión + `pm2 save`; la redundancia real está en el backlog (ver Oportunidades). Es una decisión de costo consciente para un proyecto de concurso, no una omisión.

**Criterio 2/5 — CI auto-run apagado.**
El pipeline existe pero el auto-run está bloqueado por un lock de billing → no hay gate automático de regresión en cada push. *Mitigación:* disciplina manual documentada — cada cambio pasó `npm test` (82/82) + `next build` + re-QA visual antes de desplegar ([QA §4](QA-HARDTEST.md)). Reactivarlo es S y está priorizado.

**Criterio 3 — El reset de P&L requiere reiniciar el worker.**
Gotcha real encontrado en hard-testing: el worker mantiene el P&L en RAM y reescribe el valor viejo tras un reset. *Mitigación:* recipe operativo verificado `pm2 stop → reset → pm2 start` (P&L $0 durable), documentado en [QA-HARDTEST.md](QA-HARDTEST.md) §4. Fix de raíz (invalidación por señal) pendiente.

**Criterio 3 — Rebalanceo AUTO está OFF por default.**
El motor completo existe y está testeado (9/9), pero se despliega opt-in. *Decisión consciente:* despliegue cero-riesgo — que un evaluador nunca vea fondos moviéndose sin haberlo pedido. Se enciende con un toggle en la UI y el plan es previsualizable antes.

**Criterio 1 — `maker_mode` existe pero no se luce.**
Modela fills maker (límite pasivo, fee menor, riesgo de no-fill) y está OFF por default; el jurado no lo verá salvo que se lo enseñemos. *Mitigación:* mencionarlo en la defensa y encenderlo en vivo si hay pregunta sobre fees.

**Criterios 1/4 — El copiloto tiene tools solo de LECTURA.**
Puede explicar el estado del bot pero no ejecutar acciones ni cambiar config. *Decisión consciente:* un LLM con permisos de escritura sobre un bot de trading exige guardas que no queríamos improvisar a días del cierre. Es la oportunidad #2 de la tabla.

**Transversal — Dependencia de Supabase.**
El free-tier ya nos restringió una vez por egress (data-plane caído durante la preparación). *Mitigación aplicada:* upgrade a **Pro (250 GB)** + las `opportunities` se sacaron de Realtime para reducir egress. El riesgo residual es bajo pero existe.

**Criterio 5 — 4 warnings de lint (react-hooks).**
Cosméticos, no rompen build ni runtime. Se declaran porque prometimos no esconder nada; arreglo trivial post-jurado.

---

## 🎯 Amenazas

| Amenaza | Criterio | Probabilidad | Mitigación |
|---|---|---|---|
| Worker apagado/caído durante la revisión → dashboard sin datos frescos | 2, 4 | **Media** | Warm-up 30 min antes de la ventana + `pm2 save`; checklist de liveness (7/7 venues frescos) antes del Meet. `pm2 startup` en backlog inmediato. |
| Supabase re-restringe por egress → data-plane caído | 2, 4 | Baja | Ya migrado a **Pro (250 GB)**; `opportunities` fuera de Realtime; ciclo de facturación vigilado. |
| Muro de mantenimiento activo → el jurado abre la URL pelada y ve el gorila | 4 | Media | `MAINTENANCE=off` durante toda la ventana de revisión (o compartir la URL con `?llave`). Item #1 del checklist pre-jurado. |
| Demo en modo DEMO driftea el P&L (ejecuta todo, neto chico) | 3, 4 | Media | Presentar en modo **Real** (P&L honesto en $0) + recipe verificado `stop → reset → start` si se quiere demostrar DEMO y limpiar después. |
| Caída de servicios externos (WS de exchanges, LLM, Vercel/Supabase/UpCloud) | 2 | Baja | Backoff exponencial + resync CRC32 en feeds; staleness guard excluye libros congelados; el LLM está fuera del hot-path (el bot decide sin él). Multi-proveedor LLM ya soportado (`LLM_PROVIDER`). |
| Finalistas competidores con ejecución real o más venues | 1, 2 | Media | No se mitiga con features de último minuto: se defiende con la narrativa — simulación **honesta y auditable** (890k iteraciones, cada descarte con razón) vale más que una ejecución real sin evidencia de robustez. 7 venues + arquitectura real-ready demostrable en testnet. |

---

## 🧭 Si tuviéramos 2 semanas más

1. **Replay determinista desde `book_snapshots`** — es el único movimiento que sube dos criterios a la vez (robustez + visualización) con un efecto demo inmediato: «así se veía el mercado a las 14:32:07, mira al bot decidir de nuevo». La infraestructura (snapshots persistidos) ya existe.
2. **Copiloto con escritura guardada** — cierra el círculo de la parametrización: 96 variables gobernadas por lenguaje natural, con el mismo whitelist, confirmación explícita y audit log que ya protegen el API. Diferenciador #1 potenciado por IA.
3. **Ops de producción real: pm2 startup + CI + monitoring + segunda instancia del worker** — lo menos vistoso y lo más importante: elimina el SPOF, que es hoy la amenaza más probable. Un bot de arbitraje que no sobrevive un reboot no está terminado, y lo sabemos.

La postura no cambia: **Bitcoiner prefiere un «no» documentado a un «sí» inflado.** Este FODA aplica al proyecto el mismo estándar que el bot aplica al mercado — cada fortaleza con su `archivo:línea`, cada debilidad con su mitigación o su ADR, y cero números redondeados hacia arriba.
