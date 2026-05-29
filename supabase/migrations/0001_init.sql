-- 0001_init.sql — Clawbot arbitrage schema (idempotent)
-- Aplicable vía Supabase MCP apply_migration o Management API query endpoint.

-- ─────────────────────────────── Tablas ───────────────────────────────
create table if not exists exchanges (
  id           smallserial primary key,
  venue        text unique not null,            -- 'binance' | 'okx' | 'kraken' | 'bitso'
  display_name text not null,
  enabled      boolean not null default true
);

create table if not exists fee_config (
  id             smallserial primary key,
  exchange_id    smallint not null references exchanges(id),
  taker_bps      numeric(10,3) not null,
  maker_bps      numeric(10,3) not null,
  withdrawal_btc numeric(20,8) not null default 0,
  updated_at     timestamptz not null default now(),
  unique (exchange_id)
);
create index if not exists idx_fee_config_exchange on fee_config(exchange_id);

create table if not exists wallets (
  id          bigserial primary key,
  exchange_id smallint not null references exchanges(id),
  asset       text not null,                    -- 'BTC' | 'USDT' | 'USD' | 'MXN'
  balance     numeric(28,8) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (exchange_id, asset)
);
create index if not exists idx_wallets_exchange on wallets(exchange_id);

create table if not exists opportunities (
  id               bigserial primary key,
  detected_at      timestamptz not null default now(),
  strategy         text not null,               -- spatial | cross_quote | triangular | statistical
  buy_exchange_id  smallint references exchanges(id),
  sell_exchange_id smallint references exchanges(id),
  pair             text not null,
  gross_spread_bps numeric(10,3) not null,
  net_spread_bps   numeric(10,3) not null,
  gross_usd        numeric(20,8) not null,
  net_usd          numeric(20,8) not null,
  max_exec_base    numeric(20,8) not null,
  profitable       boolean not null,
  executed         boolean not null default false,
  skip_reason      text,
  feed_lag_ms      integer,
  detection_latency_ms integer
);
create index if not exists idx_opp_detected on opportunities(detected_at desc);
create index if not exists idx_opp_strategy on opportunities(strategy, detected_at desc);
create index if not exists idx_opp_buy on opportunities(buy_exchange_id);
create index if not exists idx_opp_sell on opportunities(sell_exchange_id);

create table if not exists trades (
  id                 bigserial primary key,
  opportunity_id     bigint not null references opportunities(id),
  executed_at        timestamptz not null default now(),
  pair               text not null,
  base_volume        numeric(20,8) not null,
  vwap_buy           numeric(20,8) not null,
  vwap_sell          numeric(20,8) not null,
  buy_fee_usd        numeric(20,8) not null,
  sell_fee_usd       numeric(20,8) not null,
  withdrawal_fee_usd numeric(20,8) not null default 0,
  net_pnl_usd        numeric(20,8) not null,
  execution_time_ms  integer not null,
  partial            boolean not null default false,
  status             text not null default 'filled',   -- filled | partial | rejected
  legs               jsonb not null                     -- [FillLeg, FillLeg]
);
create index if not exists idx_trades_opp on trades(opportunity_id);
create index if not exists idx_trades_executed on trades(executed_at desc);

create table if not exists spread_history (
  id      bigserial primary key,
  ts      timestamptz not null default now(),
  pair_a  text not null,
  pair_b  text not null,
  mid_a   numeric(20,8) not null,
  mid_b   numeric(20,8) not null,
  spread  numeric(20,10) not null,              -- log-ratio ln(mid_a/mid_b)
  zscore  numeric(12,4),
  mean    numeric(20,10),
  stddev  numeric(20,10)
);
create index if not exists idx_spread_pair_ts on spread_history(pair_a, pair_b, ts desc);

create table if not exists book_snapshots (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  exchange_id smallint not null references exchanges(id),
  pair        text not null,
  bids        jsonb not null,                    -- [[price,size], ...] top N
  asks        jsonb not null,
  exchange_ts bigint
);
create index if not exists idx_booksnap_ex_pair_ts on book_snapshots(exchange_id, pair, ts desc);

create table if not exists bot_state (
  id                 boolean primary key default true check (id),  -- fila singleton
  trading_enabled    boolean not null default true,
  min_net_bps        numeric(10,3) not null default 5,
  max_position_usd   numeric(20,2) not null default 10000,
  cumulative_pnl_usd numeric(20,8) not null default 0,
  consecutive_losses integer not null default 0,
  updated_at         timestamptz not null default now()
);

-- ─────────────────────────────── RLS ───────────────────────────────
-- Dashboard = SELECT público (anon). Worker = service role (bypassa RLS).
alter table exchanges      enable row level security;
alter table fee_config     enable row level security;
alter table wallets        enable row level security;
alter table opportunities  enable row level security;
alter table trades         enable row level security;
alter table spread_history enable row level security;
alter table book_snapshots enable row level security;
alter table bot_state      enable row level security;

drop policy if exists "public read" on exchanges;      create policy "public read" on exchanges      for select using (true);
drop policy if exists "public read" on fee_config;     create policy "public read" on fee_config     for select using (true);
drop policy if exists "public read" on wallets;        create policy "public read" on wallets        for select using (true);
drop policy if exists "public read" on opportunities;  create policy "public read" on opportunities  for select using (true);
drop policy if exists "public read" on trades;         create policy "public read" on trades         for select using (true);
drop policy if exists "public read" on spread_history; create policy "public read" on spread_history for select using (true);
drop policy if exists "public read" on bot_state;      create policy "public read" on bot_state      for select using (true);
-- book_snapshots: sin política pública (volumen alto; solo worker/service role).

-- ─────────────────────────── Realtime (idempotente) ───────────────────────────
do $$ begin alter publication supabase_realtime add table opportunities; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table trades;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table wallets;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table bot_state;     exception when duplicate_object then null; end $$;
