# Migraciones — Bitcoiner

SQL versionado. **Regla:** nunca editar una migración aplicada; agregar una nueva numerada. Aplicar **en orden**.

## Aplicadas (0001–0011)
`0001_init` · `0002_seed` · `0003_demo_mode` · `0004_news` · `0005_reset_fn` · `0006_retention` · `0007_market_ticks` · `0008_market_ticks_depth` · `0009_retention_cron_log` · `0010_bitstamp_and_inject` · `0011_fix_reset_fn`

## Fase final institucional (0012–0016) — mapa reservado
> Resuelve la colisión donde varias líneas de trabajo reclamaban `0012`. Cada una es **idempotente y aditiva** (`add column if not exists`, defaults neutros) → cero regresión sobre el sistema desplegado. Aplicar en este orden:

| # | Archivo | Qué crea | Línea de trabajo |
|---|---|---|---|
| **0012** | `0012_runtime_config.sql` | `runtime_config` (singleton), `strategy_config` (5 filas), `config_profiles`, `config_audit`. Seed **idéntico a `worker/config.ts` CONFIG.\*** | A · Parametrización TOTAL |
| **0013** | `0013_candles.sql` | `candles` (OHLC) | B · Charts velas |
| **0014** | `0014_rebalance.sql` | `transfers` + cols `rebalance_*` en `runtime_config` (`rebalance_auto=false`) | C · Rebalanceo |
| **0015** | `0015_dynamic_slippage.sql` | col `dynamic_slippage` en `runtime_config` (Tarea 1) | D/E · Slippage dinámico |
| **0016** | `0016_abort.sql` | cols `abort_min_net_bps` / `abort_extra_slippage_bps` en `runtime_config` (ABORT por inversión de spread) | D/E · Robustez (Pilar 2) |
| **0017** | `0017_force_stale_venue.sql` | soporte para la demo de fault-injection (forzar feed stale) | G · Demo de robustez |

> Aplicadas vía MCP: 0012–0016. Pendientes: 0017.
> La arquitectura `ExchangeAdapter` + máquina de estados de orden vive en `worker/execution/` (código, sin migración). La persistencia del lifecycle (`orders`/`order_events`) es stretch.

**Realtime:** solo tablas chicas (`runtime_config`, `strategy_config`, `transfers`) entran a la publicación — NO `opportunities`/`order_events`/`candles` (restricción de egress free-tier).

**Aplicar/verificar** vía MCP `supabase-bitcoiner` (`apply_migration` / `list_migrations`) o el SQL Editor de Supabase.
