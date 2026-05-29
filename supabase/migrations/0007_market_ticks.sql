-- 0007_market_ticks.sql — Estado de mercado en vivo (BBO por venue+pair).
-- Tabla ACOTADA: 1 fila por (exchange_id, pair), el worker hace UPSERT ~cada 1.5s.
-- No crece con el tiempo => no necesita retención. El dashboard la lee por polling.

create table if not exists market_ticks (
  exchange_id smallint    not null references exchanges(id),
  pair        text        not null,
  base        text        not null,
  quote       text        not null,
  bid         numeric(20,8) not null,
  ask         numeric(20,8) not null,
  bid_size    numeric(28,8) not null default 0,
  ask_size    numeric(28,8) not null default 0,
  mid         numeric(20,8) not null,
  spread_bps  numeric(12,4) not null default 0,
  exchange_ts bigint,
  ts          timestamptz not null default now(),
  primary key (exchange_id, pair)
);

-- RLS: lectura pública (dashboard, anon); escritura solo service role (worker).
alter table market_ticks enable row level security;
drop policy if exists "public read" on market_ticks;
create policy "public read" on market_ticks for select using (true);
