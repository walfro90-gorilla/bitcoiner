-- 0016_abort.sql — ABORT por inversión de spread (Pilar 2: robustez ante mercado que se mueve).
-- Antes de ejecutar, el worker re-evalúa el libro FRESCO con un movimiento adverso modelado; si el
-- neto cae por debajo de abort_min_net_bps, ABORTA (no ejecuta a pérdida). abort_extra_slippage_bps
-- modela/inyecta ese movimiento (0 = sin movimiento → comportamiento actual; subirlo demuestra aborts).
alter table runtime_config add column if not exists abort_min_net_bps        numeric(10,3) not null default 0;
alter table runtime_config add column if not exists abort_extra_slippage_bps numeric(10,3) not null default 0;
