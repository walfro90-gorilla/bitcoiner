-- 0008_market_ticks_depth.sql — Profundidad (top niveles) para el order-book ladder del dashboard.
-- Se guardan los top ~8 niveles por lado en market_ticks (sigue siendo 1 fila por venue+pair, acotada).
alter table market_ticks add column if not exists bids jsonb not null default '[]'::jsonb;
alter table market_ticks add column if not exists asks jsonb not null default '[]'::jsonb;
