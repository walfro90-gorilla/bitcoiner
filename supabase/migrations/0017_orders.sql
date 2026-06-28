-- 0017_orders.sql — Persistencia del ciclo de vida de órdenes (audit de la FSM real-ready).
-- Alimenta el panel "Órdenes en vivo". Aditiva, idempotente. RLS read-only público + Realtime.
-- Fuentes: 'sim' (derivada de un trade simulado), 'selftest' (self-test del adapter), 'testnet' (orden real en Binance testnet).

create table if not exists orders (
  id            bigserial primary key,
  trade_id      bigint references trades(id) on delete set null,
  venue         text not null,
  symbol        text not null,
  side          text not null,          -- buy | sell
  type          text not null,          -- market | limit
  qty           numeric(20,8) not null,
  limit_price   numeric(20,8),
  order_id      text,                   -- id del exchange (testnet) si aplica
  state         text not null,          -- NEW|SENT|PARTIALLY_FILLED|FILLED|REJECTED|CANCELED|EXPIRED
  filled_qty    numeric(20,8) not null default 0,
  avg_price     numeric(20,8) not null default 0,
  fee_quote     numeric(20,8) not null default 0,
  source        text not null default 'sim',
  reject_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_orders_created on orders(created_at desc);

create table if not exists order_events (
  id          bigserial primary key,
  order_id    bigint not null references orders(id) on delete cascade,
  ts          bigint not null,          -- epoch ms (Date.now() de la transición)
  from_state  text,
  to_state    text not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_order_events_order on order_events(order_id);

alter table orders enable row level security;
alter table order_events enable row level security;

do $$ begin
  create policy "public read orders" on orders for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read order_events" on order_events for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin alter publication supabase_realtime add table orders; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table order_events; exception when duplicate_object then null; end $$;
