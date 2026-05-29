-- 0004_news.sql — Señales de noticias + régimen de riesgo en bot_state.
create table if not exists news_signals (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  source     text,
  headline   text not null,
  url        text unique,
  currencies text,
  sentiment  numeric(4,3), -- -1..1
  impact     text,         -- low | medium | high
  summary    text
);
create index if not exists idx_news_ts on news_signals(ts desc);

alter table news_signals enable row level security;
drop policy if exists "public read" on news_signals;
create policy "public read" on news_signals for select using (true);

alter table bot_state add column if not exists news_sentiment numeric(4,3);
alter table bot_state add column if not exists news_impact text;
alter table bot_state add column if not exists news_summary text;
alter table bot_state add column if not exists news_updated_at timestamptz;

do $$ begin alter publication supabase_realtime add table news_signals; exception when duplicate_object then null; end $$;
