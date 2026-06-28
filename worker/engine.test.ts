// worker/engine.test.ts — Integración del motor + parametrización por estrategia.
// Prueba que el gating on/off y el umbral POR ESTRATEGIA realmente afectan la detección
// (el diferenciador #1 del reto), sin DB ni feeds: se alimentan books a engine.onBook y se
// capturan las oportunidades emitidas tras el queueMicrotask de evaluate().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from './engine';
import { applyStrategy } from './runtimeConfig';
import { book, flatFees } from '../lib/core/__fixtures__/books';
import type { DetectedOpportunity } from './core';

const fees = flatFees(10, 10, 0); // 10 bps en todos los venues

// Spread tipo "ejemplo del reto": comprar Kraken 70000, vender Binance 70250 (ambos USDT, mismo par).
function feedSpatial(e: Engine): void {
  e.onBook(book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]));
  e.onBook(book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]));
}

async function detect(setup: (e: Engine) => void, minNetBps = 5): Promise<DetectedOpportunity[]> {
  const opps: DetectedOpportunity[] = [];
  const e = new Engine((o) => opps.push(o));
  e.setFees(fees);
  e.setMinNetBps(minNetBps);
  setup(e);
  await new Promise((r) => setTimeout(r, 10)); // deja correr el evaluate() agendado por queueMicrotask
  return opps;
}

test('engine: detecta oportunidad espacial rentable (camino feliz)', async () => {
  const opps = await detect(feedSpatial);
  const spatial = opps.filter((o) => o.strategy === 'spatial');
  assert.ok(spatial.length >= 1, 'debe emitir al menos una oportunidad espacial');
  assert.ok(spatial.some((o) => o.profitable), 'al menos una debe ser rentable (spread 250 >> fees)');
});

test('engine: deshabilitar una estrategia la quita de la detección (gate on/off)', async () => {
  applyStrategy('spatial', { enabled: false });
  try {
    const opps = await detect(feedSpatial);
    assert.equal(opps.filter((o) => o.strategy === 'spatial').length, 0, 'spatial OFF no debe emitir');
  } finally {
    applyStrategy('spatial', { enabled: true }); // restaurar
  }
});

test('engine: el umbral POR ESTRATEGIA marca como no-rentable sobre el global', async () => {
  applyStrategy('spatial', { minNetBpsOverride: 1000 }); // 1000 bps = imposible para este spread
  try {
    const opps = await detect(feedSpatial, 5); // umbral global 5, override por estrategia 1000
    const spatial = opps.filter((o) => o.strategy === 'spatial');
    assert.ok(spatial.length >= 1, 'sigue detectando la divergencia (se registra)');
    assert.ok(spatial.every((o) => !o.profitable), 'con override 1000 bps ninguna es rentable');
  } finally {
    applyStrategy('spatial', { minNetBpsOverride: null }); // restaurar
  }
});
