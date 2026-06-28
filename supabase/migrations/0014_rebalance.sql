-- 0014_rebalance.sql — Rebalanceo inteligente automatizado entre exchanges (Pilar 3).
-- Tabla de transferencias simuladas (FSM in_transit -> completed) + config en runtime_config.
-- IDEMPOTENTE + ADITIVA. rebalance_auto OFF por defecto → cero cambio en el comportamiento desplegado.

create table if not exists transfers (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  from_exchange_id smallint references exchanges(id),
  to_exchange_id   smallint references exchanges(id),
  asset            text not null,                 -- 'BTC' | 'USDT'
  amount           numeric(28,8) not null,
  amount_usd       numeric(20,2) not null,
  cost_usd         numeric(20,8) not null default 0,
  status           text not null,                 -- in_transit | completed | cancelled
  reason           text,                          -- btc_starved | quote_starved
  eta_ms           integer not null default 0,
  auto             boolean not null default true,
  completed_at     timestamptz
);
create index if not exists idx_transfers_created on transfers(created_at desc);
create index if not exists idx_transfers_status on transfers(status);

alter table transfers enable row level security;
drop policy if exists "public read" on transfers;
create policy "public read" on transfers for select using (true);
do $$ begin alter publication supabase_realtime add table transfers; exception when duplicate_object then null; end $$;

-- Config del rebalanceo en runtime_config (leído en vivo por el worker).
alter table runtime_config add column if not exists rebalance_auto              boolean       not null default false;
alter table runtime_config add column if not exists rebalance_min_operating_usd numeric(20,2) not null default 20000;
alter table runtime_config add column if not exists rebalance_runway_trades     integer       not null default 3;
alter table runtime_config add column if not exists rebalance_min_transfer_usd  numeric(20,2) not null default 500;
alter table runtime_config add column if not exists rebalance_max_transfer_usd  numeric(20,2) not null default 50000;
