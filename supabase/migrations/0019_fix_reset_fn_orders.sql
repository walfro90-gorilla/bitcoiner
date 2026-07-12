-- 0019_fix_reset_fn_orders.sql
-- Fix: reset_simulation() fallaba con "cannot truncate a table referenced in a foreign key constraint".
-- Causa: orders.trade_id -> trades(id) y order_events.order_id -> orders(id) (migración 0017, posterior a la 0011)
-- no estaban en la lista de truncate, así que truncar `trades` violaba la FK de `orders`.
-- Fix: incluir orders, order_events y transfers (todo estado de simulación) + CASCADE como red de seguridad
-- para que una futura tabla con FK a estas no vuelva a romper el reset.
create or replace function reset_simulation() returns void language plpgsql security definer as $$
begin
  truncate trades, opportunities, book_snapshots, spread_history, news_signals, orders, order_events, transfers
    restart identity cascade;
  update wallets set balance = (case asset when 'BTC' then 1 when 'MXN' then 2000000 else 100000 end), updated_at = now()
    where true;
  update bot_state set cumulative_pnl_usd = 0, consecutive_losses = 0,
    news_sentiment = null, news_impact = null, news_summary = null, updated_at = now()
  where id = true;
end;
$$;

revoke all on function reset_simulation() from public, anon, authenticated;
grant execute on function reset_simulation() to service_role;
