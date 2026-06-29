// lib/core/strategies/triangular.test.ts — Arbitraje triangular DEPTH-AWARE (VWAP por pata).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTriangular } from './triangular';
import { flatFees } from '../__fixtures__/books';
import type { OrderBook, Venue } from '../types';

function ob(pair: string, asks: [number, number][], bids: [number, number][]): OrderBook {
  return {
    venue: 'binance' as Venue,
    base: 'BTC',
    quote: 'USDT',
    pair,
    asks: asks.map(([price, size]) => ({ price, size })),
    bids: bids.map(([price, size]) => ({ price, size })),
    exchangeTs: 0,
    recvTs: 0,
  };
}

const FEES0 = flatFees(0, 0, 0);
const PARAMS = { fees: FEES0, minNetBps: 5, notionalUsd: 1000 };
const fwd = (res: ReturnType<typeof detectTriangular>) => res.find((o) => o.pair === 'USDT->BTC->ETH->USDT');

test('triangular: libro profundo → edge = matemática top-of-book (+50 bps), rentable', () => {
  // 1000 USDT → 0.02 BTC → 0.5 ETH → 1005 USDT = +0.5% = +50 bps (fee 0).
  const res = detectTriangular(
    'binance',
    ob('BTC/USDT', [[50000, 100]], [[49990, 100]]),
    ob('ETH/BTC', [[0.04, 1000]], [[0.0399, 1000]]),
    ob('ETH/USDT', [[2011, 1000]], [[2010, 1000]]),
    PARAMS,
  );
  const f = fwd(res);
  assert.ok(f, 'debe detectar el ciclo forward');
  assert.ok(Math.abs(f.netSpreadBps - 50) < 0.5, `edge ~50 bps, got ${f.netSpreadBps}`);
  assert.equal(f.grossSpreadBps, f.netSpreadBps, 'triangular: bruto == neto (fees baked-in)');
  assert.equal(f.profitable, true);
  assert.equal(f.maxExecBase, 0, 'ejecución triangular intra-venue sin cambios');
});

test('triangular: libro DELGADO en la 1ª pata → el VWAP baja el edge (depth-aware)', () => {
  const deep = fwd(
    detectTriangular(
      'binance',
      ob('BTC/USDT', [[50000, 100]], [[49990, 100]]),
      ob('ETH/BTC', [[0.04, 1000]], [[0.0399, 1000]]),
      ob('ETH/USDT', [[2011, 1000]], [[2010, 1000]]),
      PARAMS,
    ),
  );
  // Mismo cruce, pero la mejor capa de BTC solo cubre ~10 USDT; el resto, peor precio.
  const thin = fwd(
    detectTriangular(
      'binance',
      ob('BTC/USDT', [[50000, 0.0002], [50500, 100]], [[49990, 100]]),
      ob('ETH/BTC', [[0.04, 1000]], [[0.0399, 1000]]),
      ob('ETH/USDT', [[2011, 1000]], [[2010, 1000]]),
      PARAMS,
    ),
  );
  assert.ok(deep && thin, 'ambos ciclos detectados');
  assert.ok(thin.netSpreadBps < deep.netSpreadBps - 5, `delgado (${thin.netSpreadBps}) debe ser claramente < profundo (${deep.netSpreadBps})`);
});

test('triangular: ciclo absurdamente negativo se descarta (filtro de ruido)', () => {
  const res = detectTriangular(
    'binance',
    ob('BTC/USDT', [[50000, 100]], [[40000, 100]]), // vender BTC a 40k = pérdida enorme
    ob('ETH/BTC', [[0.05, 1000]], [[0.03, 1000]]),
    ob('ETH/USDT', [[2011, 1000]], [[1500, 1000]]),
    PARAMS,
  );
  assert.equal(fwd(res), undefined, 'el ciclo forward sin edge se filtra (netSpreadBps <= -50)');
});
