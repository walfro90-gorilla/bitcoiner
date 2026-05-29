# 🧪 Pruebas de estrés — Clawbot

Fecha: 2026-05-29 · Entorno: worker local (Node 20 + tsx) contra Supabase de producción · feeds en vivo (Binance, OKX, Kraken, Bitso).

Se evaluaron 4 dimensiones. **Veredicto: el sistema es robusto** — latencia sub-3 ms bajo carga, memoria ~130 MB, circuit breakers que cortan ~90% del trading cuando deben, órdenes parciales correctas, DB acotada y 0 crashes.

---

## 1) Carga / throughput
**Cómo:** worker en DEMO agresivo (`MAX_TRADES_PER_MIN=600`, sin halt) durante 30 s; medición de latencia, throughput, memoria y tamaño de DB.

| Métrica | Resultado |
|---|---|
| Latencia de detección | **avg 2.31 ms** · máx 50 ms |
| Throughput | 286 oportunidades + 88 trades en 30 s, sin degradación |
| Órdenes parciales | ✅ disparadas bajo carga (`0.00722` y `0.04278 BTC`) |
| Memoria (RSS) | **~131–136 MB** bajo carga (10 feeds) · ~30 MB idle |
| Crashes | **0** |

**Conclusión:** la detección event-driven + escrituras batched sostienen cientos de eventos por minuto con latencia sub-3 ms.

## 2) Resiliencia de feeds
**Cómo:** observación durante ~85 s de estrés + reinicios de proceso; inspección de las salvaguardas.

- Reconexión con **backoff exponencial** (250 ms → 8 s + jitter), **watchdog de staleness** (`STALE_MS=5s` excluye un feed muerto de la evaluación) y **heartbeat/ping** por venue.
- **5 reinicios limpios** del worker durante las pruebas: cada uno reconectó los **10 feeds** y **resumió el P&L desde la DB** (resiliencia de proceso demostrada).
- **0 crashes** en estrés continuo.

> Para verificar la reconexión por caída de red: desconecta el Wi-Fi ~10 s con el worker corriendo → `reconnecting in …ms` → `connected`.

## 3) Circuit breakers
**Cómo:** worker con `CONSECUTIVE_LOSS_HALT=2` y `MAX_TRADES_PER_MIN=5` durante 24 s; medición de `skip_reason` en la DB.

| Breaker | Evidencia |
|---|---|
| Halt por pérdidas consecutivas | `cooldown_consecutive_losses`: **41 bloqueos** |
| Rate limiter (trades/min) | `max_trades_per_min`: **37 bloqueos** |
| No rentables (correcto) | `below_threshold`: 97 |
| **Efecto neto** | ejecuciones cortadas **88 → 8** (~90 % frenado) |
| Kill switch global | verificado en vivo (0 → 18 trades al togglear DEMO) |
| Wallet guard | parciales + nunca saldos negativos |

**Conclusión:** todos los cortacircuitos disparan correctamente bajo presión.

## 4) Capacidad de DB bajo carga
**Cómo:** medición del tamaño de tablas/DB durante la carga + retención.

| Métrica | Resultado |
|---|---|
| Tamaño total DB | **12 MB** bajo carga |
| Tabla `opportunities` | **296 kB** |
| Retención | `pg_cron` cada 10 min (opps>3 h, snapshots>1 h, spread>12 h) |
| Snapshots | OFF por defecto (opt-in) |
| Proyección acotada | **~55–100 MB** máximo, sin importar la carga |

**Conclusión:** la DB se mantiene acotada de forma automática; no se desborda el free tier (500 MB).

---

## Cómo reproducir
```bash
# Carga / throughput
$env:MAX_TRADES_PER_MIN='600'; $env:CONSECUTIVE_LOSS_HALT='99999'; npm run worker
# Circuit breakers
$env:MAX_TRADES_PER_MIN='5';   $env:CONSECUTIVE_LOSS_HALT='2';     npm run worker
# Métricas: consultar Supabase (count/latencia por ventana, pg_total_relation_size)
# Resiliencia: desconectar la red ~10s y observar la reconexión en los logs
```
