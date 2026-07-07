# 🎬 DEMO.md — Guion de demostración (institucional)

> Cómo mostrar Bitcoiner en vivo, incluyendo los **momentos de oro** (parametrización en vivo,
> fault-injection y rebalanceo automático). Antes: worker arriba (`ssh bitcoiner 'pm2 list'`),
> dashboard en modo **Real**, P&L reseteado si hace falta. Cada cambio del worker se ve en **~2.5 s**.

## Checklist (30 s)
- [ ] Worker online en la VM · feeds frescos · dashboard abierto (con `?llave=gorila` el muro queda solo para el público).
- [ ] Modo **Real**, P&L en **$0** — resetea si hace falta: página **/admin** o `curl -X POST <url>/api/admin/reset -H "x-admin-key: <ADMIN_KEY>"`. En **Real** el P&L queda plano (disciplina); así evitas el P&L negativo que muestra **DEMO** (que ejecuta todo a propósito).
- [ ] Usa el **índice de secciones** (barra pegajosa) para saltar a **Configuración** / **Inventario** al vuelo · copiloto listo.

## Guion (≈3 min)

**1 · Velocidad y mercado (Pilar 1 velocidad) — 25 s.**
Señala el **chart de velas** (lightweight-charts) + la **matriz de arbitraje** + el **LivePing** (latencia de detección en vivo, <1 ms). *"7 exchanges por WebSocket, detección event-driven sub-milisegundo."*

**2 · Precisión: el corazón (Pilar 2 precisión) — 30 s.**
"Oportunidades vistas" subiendo vs P&L en $0. *"Cero ejecuciones no es un bug, es la precisión: calculamos el neto real (VWAP + fees + slippage + withdrawal) y descartamos lo no rentable."* Abre **🧬 Reproducir ejemplo** → +$109.75 en el blotter.

**3 · Parametrización TOTAL en vivo (DIFERENCIADOR #1) — 45 s.**
Abre el **Centro de Configuración** (Sección 3). *"Todo es ajustable en vivo, sin reiniciar el worker."*
- Cambia el **fee de Kraken** o el **umbral de una estrategia** → muestra la pestaña **Historial** (audit log: campo · antes→después). *"Cada cambio queda registrado y es reversible."*
- Aplica un **perfil** (Conservador/Agresivo) → varias variables cambian de golpe.
- Apaga un **exchange** con el toggle → en ~2.5 s deja de aparecer en las oportunidades (`exchange_disabled`).

**4 · Robustez / fault-injection (Pilar 2 robustez) — 30 s. MOMENTO DE ORO.**
En el ConfigCenter → Circuit breakers → sube **"Movimiento adverso (fault → demo ABORT)"** a, p.ej., **80 bps**. *"Simulo que el mercado se mueve en contra a mitad de ejecución."* → en la tabla de oportunidades aparecen descartes **`spread_inverted`**: el bot **aborta antes de ejecutar a pérdida**. Regrésalo a 0.

**5 · Rebalanceo inteligente y automatizado (Pilar 3) — 30 s.**
Sección 5 (**Inventario & Rebalanceo**): muestra el inventario por venue vs el piso operativo y el **plan** (ruta más barata). Activa **AUTO** → cuando un venue está "starved", el worker ejecuta la **transferencia** (la ves pasar `en tránsito → completada`). *"Inteligente: elige la ruta más barata y solo mueve si vale la pena."*

**6 · Ejecución real-ready + IA — 20 s.**
*"La ejecución está tras una interfaz `ExchangeAdapter`: hoy simulada, mañana es enchufar el `LiveAdapter` de Binance testnet — mismo contrato. El salto a real es un adapter, no un rediseño."* Cierra con el **copiloto**: pregunta *"¿por qué no se ejecutan oportunidades?"*.

## Fault-injection — resumen de palancas (todas en el ConfigCenter, en vivo)
| Demo | Palanca | Efecto visible |
|---|---|---|
| ABORT por mercado adverso | `abort_extra_slippage_bps` ↑ | descartes `spread_inverted` |
| Exchange caído/excluido | toggle exchange OFF | `exchange_disabled` |
| Estrategia apagada | toggle estrategia OFF | esa estrategia deja de emitir |
| Rebalanceo automático | toggle **AUTO** ON | transferencia `in_transit→completed` |
| Slippage por impacto | `dynamic_slippage` ON | netos más conservadores en órdenes grandes |
| Más actividad | toggle **DEMO** | ejecuta cada divergencia (fills/parciales/P&L) |

## Plan de contingencia
- **Sin datos** → `ssh bitcoiner 'pm2 logs clawbot-worker --lines 50 --nostream'`; respaldo: screenshots/GIF.
- **El inyector no mueve el P&L** → reintenta (incrementa `inject_seq`).
- **Copiloto lento** (cuota LLM) → sáltalo; está fuera del hot-path.
- **Testnet live** → demostrar **grabado**, nunca en vivo (riesgo de API). Ver ADR-004.
