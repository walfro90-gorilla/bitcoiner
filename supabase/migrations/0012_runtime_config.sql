-- 0012_runtime_config.sql — Parametrización TOTAL en vivo (diferenciador #1).
-- Convierte CONFIG.* (worker/config.ts) y los umbrales por estrategia en parámetros
-- editables desde la UI sin reiniciar el worker, con perfiles y audit log.
-- IDEMPOTENTE + ADITIVA. El SEED usa valores IDÉNTICOS a worker/config.ts → cero regresión.

-- ── runtime_config: singleton (1 fila) con todas las variables globales ──
create table if not exists runtime_config (
  id                          boolean primary key default true check (id),  -- fila singleton
  slippage_bps                numeric(10,3) not null default 2,
  depeg_bps                   numeric(10,3) not null default 8,
  withdrawal_amortize_trades  integer       not null default 50,
  fx_spread_bps               numeric(10,3) not null default 30,
  fx_amortize_trades          integer       not null default 1,
  fx_max_age_ms               integer       not null default 0,
  bitso_mxn_fee_bps           numeric(10,3) not null default 65,
  bitso_mxn_maker_fee_bps     numeric(10,3) not null default 40,
  max_btc_per_trade           numeric(20,8) not null default 0.05,
  max_trades_per_min          integer       not null default 30,
  consecutive_loss_halt       integer       not null default 3,
  loss_cooldown_ms            integer       not null default 15000,
  stale_ms                    integer       not null default 5000,
  maker_mode                  boolean       not null default false,
  regional_maker_mode         boolean       not null default false,
  news_poll_ms                integer       not null default 180000,
  updated_at                  timestamptz   not null default now()
);
insert into runtime_config (id) values (true) on conflict (id) do nothing;

-- ── strategy_config: 1 fila por estrategia (on/off + umbral + maker + tamaño por estrategia) ──
create table if not exists strategy_config (
  strategy            text primary key,            -- spatial | cross_quote | triangular | statistical | regional
  enabled             boolean not null default true,
  min_net_bps_override numeric(10,3),              -- NULL = usa el umbral global (bot_state.min_net_bps)
  maker               boolean not null default false,
  target_base         numeric(20,8),               -- NULL = usa runtime_config.max_btc_per_trade
  notional_usd        numeric(20,2),               -- triangular: NULL = usa bot_state.max_position_usd
  stat_entry          numeric(10,4),               -- z-score (NULL = default del código)
  stat_exit           numeric(10,4),
  stat_stop           numeric(10,4),
  updated_at          timestamptz not null default now()
);
insert into strategy_config (strategy) values
  ('spatial'), ('cross_quote'), ('triangular'), ('statistical'), ('regional')
on conflict (strategy) do nothing;

-- ── config_profiles: presets guardables (conservador/agresivo/demo) ──
create table if not exists config_profiles (
  id          serial primary key,
  name        text unique not null,
  description text,
  snapshot    jsonb not null,            -- { bot_state, runtime_config, strategy_config }
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now()
);
insert into config_profiles (name, description, snapshot, is_builtin) values
  ('Conservador', 'Umbral alto, maker, tamaño chico, breakers estrictos',
   '{"bot_state":{"min_net_bps":15,"demo_mode":false},"runtime_config":{"max_btc_per_trade":0.02,"maker_mode":true,"max_trades_per_min":20,"consecutive_loss_halt":2,"slippage_bps":3},"strategy_config":{}}'::jsonb, true),
  ('Agresivo', 'Umbral bajo, tamaño grande, más trades/min',
   '{"bot_state":{"min_net_bps":2,"demo_mode":false},"runtime_config":{"max_btc_per_trade":0.1,"maker_mode":false,"max_trades_per_min":60,"consecutive_loss_halt":5,"slippage_bps":2},"strategy_config":{}}'::jsonb, true),
  ('Demo', 'DEMO mode: ejecuta cada divergencia para mostrar mecánica',
   '{"bot_state":{"min_net_bps":5,"demo_mode":true},"runtime_config":{"max_btc_per_trade":0.05,"maker_mode":false,"max_trades_per_min":30,"consecutive_loss_halt":3,"slippage_bps":2},"strategy_config":{}}'::jsonb, true)
on conflict (name) do nothing;

-- ── config_audit: append-only (quién/qué/cuándo/antes→después) ──
create table if not exists config_audit (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  actor      text not null default 'dashboard',
  scope      text not null,             -- runtime | strategy | exchange | fee | profile
  field      text not null,
  old_value  jsonb,
  new_value  jsonb
);
create index if not exists idx_config_audit_ts on config_audit(ts desc);

-- ── RLS: lectura pública (dashboard); escritura solo service-role/admin ──
alter table runtime_config  enable row level security;
alter table strategy_config enable row level security;
alter table config_profiles enable row level security;
alter table config_audit    enable row level security;
drop policy if exists "public read" on runtime_config;  create policy "public read" on runtime_config  for select using (true);
drop policy if exists "public read" on strategy_config; create policy "public read" on strategy_config for select using (true);
drop policy if exists "public read" on config_profiles; create policy "public read" on config_profiles for select using (true);
drop policy if exists "public read" on config_audit;    create policy "public read" on config_audit    for select using (true);

-- ── Realtime: solo tablas chicas (refresco instantáneo del Centro de Config). NO opportunities. ──
do $$ begin alter publication supabase_realtime add table runtime_config;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table strategy_config; exception when duplicate_object then null; end $$;
