# Hard test — Parametrización TOTAL (backend A1+A2)

> Verificación dura del refactor que volvió la config "en vivo" (runtime_config / strategy_config / fee_config / exchanges leídos por el worker cada 2.5s sin reiniciar). Fecha: fase final 2026-07.

## Qué se probó (5 frentes + revisión adversarial)

| Frente | Método | Resultado |
|---|---|---|
| Lógica del holder | `worker/runtimeConfig.test.ts` (applyRuntime/applyStrategy/effectiveMinNet/effectiveTargetBase) | ✅ 5/5 |
| **Gating/umbral por estrategia** | `worker/engine.test.ts` — alimenta books a `engine.onBook`, captura oportunidades: detecta espacial, **OFF la silencia**, **override de umbral la marca no-rentable** | ✅ 3/3 (prueba el diferenciador) |
| Loaders ↔ esquema DB | MCP: columnas de `runtime_config` vs `loadRuntimeConfig` | ✅ exactas, sin typos |
| Configurabilidad en vivo (DB) | MCP round-trip en runtime/estrategia/exchange (cambiar → leer → revertir) | ✅ las 3 superficies + revert limpio |
| Worker real (smoke) | `npx tsx worker/index.ts` 32s contra DB real (anon) + feeds | ✅ boot, feeds, `evaluate()`, **la DB manda** sobre el env, 0 crashes |
| Worker DEMO (path ejecución) | smoke sin DB + DEMO | ✅ 6 EXEC, caps OK, 0 crashes |
| Revisión adversarial | workflow 3 dimensiones (regresión / correctitud / datos-DB) | ✅ GO, sin bloqueantes por defecto |

**Cero regresión por defecto:** el seed de `0012` es idéntico a `CONFIG.*` y se verificó campo por campo; los smoke tests confirmaron comportamiento igual.

## Hallazgos de la revisión y su resolución

| # | Hallazgo | Sev. | Resolución |
|---|---|---|---|
| 1 | `regional` arrancaría en taker si hubiera DB **y** `REGIONAL_MAKER_MODE=true` en el env (el seed de `strategy_config.maker=false` pisa el default derivado de CONFIG). | medio (condicional) | **Verificado en la VM: no hay vars MAKER → ambos `false`.** No es regresión activa. Diseño documentado: con DB, `strategy_config` es la fuente de verdad del modo maker (los env solo siembran el default sin-DB). |
| 2 | `notional_usd` (triangular) y umbrales z-score (`stat_entry/exit/stop`) se cargaban a los holders pero **nunca se cableaban** al motor → editarlos no tenía efecto. | **alto** | **Cableados** en `engine.ts`: `detectTriangular` recibe `notionalUsd`; `evalStatistical` construye `StatThresholds` por estrategia (override DB o defaults) y los pasa a `statSample`. |
| 3 | `target_base` por estrategia solo funcionaba a la baja (el executor re-recortaba con el `max_btc_per_trade` global). | medio | `simulate()` recibe `maxBtcPerTrade` efectivo por estrategia (`effectiveTargetBase(opp.strategy)`) en vez del global. |
| 4 | `RUNTIME.makerMode`/`regionalMakerMode` campos muertos; `news_poll_ms` no era "en vivo" (el poller usaba `CONFIG` fijado en boot). | bajo | Quitados los campos muertos de `RuntimeConfig`. El poller de noticias pasó a `setTimeout` recursivo que lee `RUNTIME.newsPollMs` cada ciclo → **intervalo configurable en vivo**. |
| 5 | Poll de 2.5s sin guard de reentrancia (riesgo de solape si la red a Supabase se pone lenta). | bajo | Guard `polling` (flag + `try/finally`) en el `setInterval`. |
| 6 | `opportunities` sigue en la publicación `supabase_realtime` (desde `0001`) pese a la nota de egress. | nit | Fuera del scope de 0012 (el ahorro de egress se gestionó en el panel). Seguimiento. |

## Cómo reproducir
```bash
npm test            # 27/27 (incluye holder + integración del engine)
npm run check:worker
# Smoke (opcional, lee la DB de prod con anon, no escribe):
DEMO_MODE=true timeout -s INT 20 npx tsx worker/index.ts   # ver [EXEC] sin crashes
```
