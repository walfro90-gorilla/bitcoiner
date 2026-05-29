-- 0002_seed.sql — seed idempotente (exchanges, fees reales, wallets simuladas, bot_state)

insert into exchanges (venue, display_name) values
  ('binance','Binance'),
  ('okx','OKX'),
  ('kraken','Kraken'),
  ('bitso','Bitso')
on conflict (venue) do nothing;

-- Fees públicos taker/maker (bps) + withdrawal BTC (aprox; ver tabla verificada en el plan)
insert into fee_config (exchange_id, taker_bps, maker_bps, withdrawal_btc)
select e.id, v.taker, v.maker, v.wd
from exchanges e
join (values
  ('binance', 10.0, 10.0, 0.00020),
  ('okx',     10.0,  8.0, 0.00040),
  ('kraken',  40.0, 25.0, 0.00005),
  ('bitso',    9.8,  7.5, 0.00030)
) as v(venue, taker, maker, wd) on v.venue = e.venue
on conflict (exchange_id) do update set
  taker_bps = excluded.taker_bps,
  maker_bps = excluded.maker_bps,
  withdrawal_btc = excluded.withdrawal_btc,
  updated_at = now();

-- Wallets simuladas: USDT + BTC para todos; USD para Kraken (cross-quote)
insert into wallets (exchange_id, asset, balance)
select e.id, w.asset, w.bal
from exchanges e
join (values
  ('binance','USDT',100000),('binance','BTC',1),
  ('okx','USDT',100000),    ('okx','BTC',1),
  ('kraken','USDT',100000), ('kraken','USD',100000), ('kraken','BTC',1),
  ('bitso','USDT',100000),  ('bitso','BTC',1), ('bitso','MXN',2000000)
) as w(venue, asset, bal) on w.venue = e.venue
on conflict (exchange_id, asset) do nothing;

-- Estado del bot (fila singleton)
insert into bot_state (id) values (true) on conflict (id) do nothing;
