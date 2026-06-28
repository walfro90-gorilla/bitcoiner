// lib/core/profit.test.ts — Tests del motor de rentabilidad neta.
// Reproduce el EJEMPLO EXACTO del reto y verifica la precisión del cálculo neto.
// Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNetProfit } from './profit';
import { book, fees10, feesMaker } from './__fixtures__/books';

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

// ── Maker fills: mejor precio (entra al bid/ask) + fee maker menor ──
test('slippage dinámico: a mayor fracción del libro consumida, más slippage (menor neto)', () => {
  // Libro delgado (size 1 por lado) → execBase 1 consume el 100% → frac=1 → slip = base×2.
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 1 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 1 }], [{ price: 70260, size: 5 }]);
  const fijo = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1, slippageBps: 5 }, 0);
  const din = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase: 1, slippageBps: 5, dynamicSlippage: true }, 0);
  assert.ok(din.netUsd < fijo.netUsd, 'el impacto dinámico reduce más el neto en libros delgados');
});

test('maker captura mejor neto que taker (mejor precio + fee menor)', () => {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]);

  const taker = computeNetProfit({ buyBook, sellBook, fees: feesMaker, targetBase: 1, slippageBps: 0 }, 0);
  const maker = computeNetProfit({ buyBook, sellBook, fees: feesMaker, targetBase: 1, slippageBps: 0, maker: true }, 0);

  // Taker: compra al ask 70000, vende al bid 70250 -> bruto 250/BTC.
  assert.ok(Math.abs(taker.grossUsd - 250) < 1e-9, `taker bruto ${taker.grossUsd} debe ser 250`);
  // Maker: compra al bid 69990, vende al ask 70260 -> bruto 270/BTC (mejor precio en ambos lados).
  assert.ok(Math.abs(maker.grossUsd - 270) < 1e-9, `maker bruto ${maker.grossUsd} debe ser 270`);
  // Maker neto = 70260 - 35.13 - 69990 - 34.995 = 199.875
  assert.ok(Math.abs(maker.netUsd - 199.875) < 1e-6, `maker neto ${maker.netUsd} debe ser 199.875`);
  assert.ok(maker.netUsd > taker.netUsd, 'maker debe superar a taker (precio + fee)');
  assert.equal(maker.maker, true);
  assert.equal(taker.maker, false);
});

test('maker usa la tarifa maker (no la taker)', () => {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]);
  const maker = computeNetProfit({ buyBook, sellBook, fees: feesMaker, targetBase: 1, slippageBps: 0, maker: true }, 0);
  // fee compra maker = 69990 * 0.0005 = 34.995 (no 69990*0.001=69.99)
  assert.ok(Math.abs(maker.buy.feeQuote - 34.995) < 1e-6, `fee maker compra ${maker.buy.feeQuote} debe ser 34.995`);
});
