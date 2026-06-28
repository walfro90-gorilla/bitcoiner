-- 0018_coinbase_bybit.sql — Alta de 2 venues: Coinbase y Bybit. Aditiva, idempotente.
-- Siembra exchanges + fee_config + wallets (simuladas) para que el worker persista sus datos.
-- (El worker mapea venue→exchange_id desde la tabla `exchanges`.)

insert into exchanges (venue, display_name, enabled)
values ('coinbase', 'Coinbase', true), ('bybit', 'Bybit', true)
on conflict (venue) do nothing;

-- Fees realistas: Coinbase retail es caro (refuerza la narrativa de honestidad); Bybit spot ~10 bps.
insert into fee_config (exchange_id, taker_bps, maker_bps, withdrawal_btc)
select id, 60, 40, 0.0001 from exchanges where venue = 'coinbase'
union all
select id, 10, 10, 0.0002 from exchanges where venue = 'bybit'
on conflict (exchange_id) do nothing;

-- Wallets simuladas iniciales (mismo patrón que los demás venues): USDT + BTC.
insert into wallets (exchange_id, asset, balance)
select id, 'USDT', 100000 from exchanges where venue in ('coinbase', 'bybit')
union all
select id, 'BTC', 1 from exchanges where venue in ('coinbase', 'bybit')
on conflict (exchange_id, asset) do nothing;
