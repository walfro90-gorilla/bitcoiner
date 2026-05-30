-- 0009_retention_cron_log.sql — Extiende la retención para purgar también el log interno de pg_cron.
-- cron.job_run_details crece sin auto-limpieza (1 fila por corrida); aquí lo acotamos a 2 días.
-- Idempotente: solo reemplaza la función; el job '*/10' ya existe (0006).
-- IMPORTANTE: conserva 'executed = false' y 'security definer' de 0006:
--   - executed=false  -> NO borra oportunidades ejecutadas (tienen un trade con FK NOT NULL; borrarlas violaría la FK).
--   - security definer -> la función corre con permisos del owner (necesario para tocar cron.*).
create or replace function clawbot_retention() returns void language plpgsql security definer as $$
begin
  delete from opportunities  where executed = false and detected_at < now() - interval '3 hours';
  delete from book_snapshots where ts < now() - interval '1 hour';
  delete from spread_history  where ts < now() - interval '12 hours';
  -- Log interno de pg_cron (no es de la app, pero crece sin tope).
  begin
    delete from cron.job_run_details where end_time < now() - interval '2 days';
  exception when others then
    null; -- si no hay permisos sobre cron.*, ignorar sin romper la retención
  end;
end;
$$;
