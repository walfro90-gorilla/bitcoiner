-- 0013_candles.sql — Velas OHLC 1m para el chart institucional (lightweight-charts).
-- El worker agrega el mid de binance:BTC/USDT en velas y upserta la vela en formación (1 fila/min).
-- IDEMPOTENTE + ADITIVA. Tabla chica (1440 filas/día); NO entra a Realtime (se lee por SWR).
create table if not exists candles (
  id         bigserial primary key,
  pair       text not null,
  t          timestamptz not null,        -- inicio del bucket (minuto)
  o          numeric(20,8) not null,
  h          numeric(20,8) not null,
  l          numeric(20,8) not null,
  c          numeric(20,8) not null,
  updated_at timestamptz not null default now(),
  unique (pair, t)
);
create index if not exists idx_candles_pair_t on candles(pair, t desc);

alter table candles enable row level security;
drop policy if exists "public read" on candles;
create policy "public read" on candles for select using (true);
