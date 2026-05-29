-- 0006_retention.sql — Retención automática para acotar la DB (pg_cron).
-- Borra datos de alto volumen viejos cada 10 min. Conserva trades y oportunidades EJECUTADAS.
create extension if not exists pg_cron;

create or replace function clawbot_retention() returns void language plpgsql security definer as $$
begin
  delete from opportunities where executed = false and detected_at < now() - interval '3 hours';
  delete from book_snapshots where ts < now() - interval '1 hour';
  delete from spread_history where ts < now() - interval '12 hours';
end;
$$;

-- Programar cada 10 minutos (idempotente).
do $$ begin perform cron.unschedule('clawbot-retention'); exception when others then null; end $$;
select cron.schedule('clawbot-retention', '*/10 * * * *', 'select clawbot_retention()');
