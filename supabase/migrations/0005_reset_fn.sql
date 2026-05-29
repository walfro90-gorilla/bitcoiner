-- 0005_reset_fn.sql — Función para reiniciar la simulación (truncate instantáneo). SOLO service_role.
create or replace function reset_simulation() returns void language plpgsql security definer as $$
begin
  truncate trades, opportunities, book_snapshots, spread_history, news_signals restart identity;
  update wallets set balance = (case asset when 'BTC' then 1 else 100000 end), updated_at = now();
  update bot_state set cumulative_pnl_usd = 0, consecutive_losses = 0,
    news_sentiment = null, news_impact = null, news_summary = null, updated_at = now()
  where id = true;
end;
$$;

revoke all on function reset_simulation() from public, anon, authenticated;
grant execute on function reset_simulation() to service_role;
