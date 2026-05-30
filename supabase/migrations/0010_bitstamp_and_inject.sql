-- 0010_bitstamp_and_inject.sql — 5º exchange (Bitstamp) + soporte de inyección de escenario (demo).
-- Idempotente.

-- 1) Bitstamp como venue + sus fees + wallets simuladas (para que pueda ejecutar y mostrar nombre en la UI).
insert into exchanges (venue, display_name, enabled)
values ('bitstamp', 'Bitstamp', true)
on conflict (venue) do nothing;

insert into fee_config (exchange_id, taker_bps, maker_bps, withdrawal_btc)
select id, 40, 30, 0.0001 from exchanges where venue = 'bitstamp'
on conflict (exchange_id) do nothing;

insert into wallets (exchange_id, asset, balance)
select id, 'USDT', 100000 from exchanges where venue = 'bitstamp'
on conflict (exchange_id, asset) do nothing;
insert into wallets (exchange_id, asset, balance)
select id, 'BTC', 1 from exchanges where venue = 'bitstamp'
on conflict (exchange_id, asset) do nothing;

-- 2) Limpieza: fila basura de wallets (asset corrupto de una corrida previa).
delete from wallets where asset !~ '^[A-Z]{2,5}$';

-- 3) Inyección de escenario: el dashboard incrementa inject_seq; el worker lo detecta y reproduce el ejemplo del reto.
alter table bot_state add column if not exists inject_seq bigint not null default 0;
