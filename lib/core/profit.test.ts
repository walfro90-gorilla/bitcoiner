// lib/core/profit.test.ts — Tests del motor de rentabilidad neta.
// Reproduce el EJEMPLO EXACTO del reto y verifica la precisión del cálculo neto.
// Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNetProfit } from './profit';
import type { FeeTable, Level, OrderBook, Quote, Venue } from './types';

// Fees a 0.1% en todos los venues, sin withdrawal — para igualar el supuesto del reto.
const fees10: FeeTable = {
  binance: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
  okx: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
  kraken: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
  bitso: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
  bitstamp: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
};

function book(venue: Venue, quote: Quote, bids: Level[], asks: Level[]): OrderBook {
  return { venue, base: 'BTC', quote, pair: `BTC/${quote}`, bids, asks, exchangeTs: 0, recvTs: Date.now() };
}

// ── El ejemplo del reto ──────────────────────────────────────────────
// Comprar 1 BTC en Kraken a $70,000 (Ask) + fee $70.00 = costo $70,070.00
// Vender 1 BTC en Binance a $70,250 (Bid) − fee $70.25 = ingreso $70,179.75
// Ganancia neta = $109.75 por BTC.
test('reproduce el ejemplo del reto: +$109.75/BTC neto', () => {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]);

  const r = computeNetProfit(
    { buyBook, sellBook, fees: fees10, targetBase: 1, slippageBps: 0, withdrawalAmortizeTrades: 1 },
    5,
  );

  assert.equal(Math.round(r.execBase), 1, 'debe ejecutar 1 BTC completo');
  assert.ok(Math.abs(r.buy.feeQuote - 70.0) < 1e-9, `fee compra ${r.buy.feeQuote} debe ser 70.00`);
  assert.ok(Math.abs(r.sell.feeQuote - 70.25) < 1e-9, `fee venta ${r.sell.feeQuote} debe ser 70.25`);
  assert.ok(Math.abs(r.grossUsd - 250) < 1e-9, `bruto ${r.grossUsd} debe ser 250`);
  assert.ok(Math.abs(r.netUsd - 109.75) < 1e-6, `NETO ${r.netUsd} debe ser exactamente 109.75`);
  assert.equal(r.profitable, true);
});

// ── Precisión: bruto positivo pero NETO negativo (mercado eficiente) ──
test('rechaza una oportunidad rentable en bruto pero negativa en neto', () => {
  // Spread de solo $10 (1.4 bps) entre venues líquidos: los fees (~20 bps) lo superan.
  const buyBook = book('binance', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('okx', 'USDT', [{ price: 70010, size: 5 }], [{ price: 70020, size: 5 }]);

  const r = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1 }, 5);

  assert.ok(r.grossUsd > 0, 'el bruto es positivo');
  assert.ok(r.netUsd < 0, `el neto ${r.netUsd} debe ser negativo tras fees`);
  assert.equal(r.profitable, false, 'NO debe ejecutarse (precisión)');
});

// ── Robustez: orden parcial cuando la liquidez no cubre el tamaño ──
test('órdenes parciales: capa el volumen a la liquidez disponible', () => {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 0.3 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 0.5 }], [{ price: 70260, size: 5 }]);

  const r = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1 }, 5);

  assert.ok(Math.abs(r.execBase - 0.3) < 1e-9, `execBase ${r.execBase} debe capar a 0.3 (lado más delgado)`);
  assert.ok(r.execBase < 1, 'es una ejecución parcial (< target)');
});

// ── Costos: el slippage reduce el neto ──
test('el slippage estimado reduce el neto', () => {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]);

  const sin = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1, slippageBps: 0 }, 5);
  const con = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1, slippageBps: 5 }, 5);

  assert.ok(con.netUsd < sin.netUsd, 'con slippage el neto debe ser menor');
});
