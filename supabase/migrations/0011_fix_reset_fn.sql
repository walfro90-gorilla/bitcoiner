-- 0011_fix_reset_fn.sql — Arregla reset_simulation(): el UPDATE de wallets no tenía WHERE
-- y la extensión `safeupdate` de Supabase lo rechazaba con "UPDATE requires a WHERE clause".
-- `where true` actualiza todas las filas (es el escape oficial de safeupdate).
create or replace function reset_simulation() returns void language plpgsql security definer as $$
begin
  truncate trades, opportunities, book_snapshots, spread_history, news_signals restart identity;
  update wallets set balance = (case asset when 'BTC' then 1 when 'MXN' then 2000000 else 100000 end), updated_at = now()
    where true;
  update bot_state set cumulative_pnl_usd = 0, consecutive_losses = 0,
    news_sentiment = null, news_impact = null, news_summary = null, updated_at = now()
  where id = true;
end;
$$;

revoke all on function reset_simulation() from public, anon, authenticated;
grant execute on function reset_simulation() to service_role;
