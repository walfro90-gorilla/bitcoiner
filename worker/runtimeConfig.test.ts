// worker/runtimeConfig.test.ts — Tests del holder de config en caliente (parametrización total).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME,
  STRATEGIES,
  applyRuntime,
  applyStrategy,
  effectiveMinNet,
  effectiveTargetBase,
} from './runtimeConfig';

test('defaults: RUNTIME y STRATEGIES inician con los valores de CONFIG.* (cero regresión)', () => {
  // Sin .env.worker, CONFIG usa sus defaults; el holder los espeja.
  assert.equal(RUNTIME.slippageBps, 2);
  assert.equal(RUNTIME.depegBps, 8);
  assert.equal(RUNTIME.maxBtcPerTrade, 0.05);
  assert.equal(RUNTIME.maxTradesPerMin, 30);
  assert.equal(RUNTIME.consecutiveLossHalt, 3);
  assert.equal(RUNTIME.lossCooldownMs, 15000);
  assert.equal(RUNTIME.staleMs, 5000);
  for (const s of ['spatial', 'cross_quote', 'triangular', 'statistical', 'regional'] as const) {
    assert.equal(STRATEGIES[s].enabled, true, `${s} debe iniciar habilitada`);
    assert.equal(STRATEGIES[s].maker, false, `${s} maker default false`);
    assert.equal(STRATEGIES[s].minNetBpsOverride, null);
    assert.equal(STRATEGIES[s].targetBase, null);
  }
});

test('applyRuntime: sobreescribe solo claves presentes; ignora null/undefined; permite 0', () => {
  applyRuntime({ slippageBps: 9, maxBtcPerTrade: 0.2 });
  assert.equal(RUNTIME.slippageBps, 9);
  assert.equal(RUNTIME.maxBtcPerTrade, 0.2);

  // null/undefined no deben pisar el valor actual.
  applyRuntime({ slippageBps: undefined as unknown as number });
  assert.equal(RUNTIME.slippageBps, 9, 'undefined no cambia');
  applyRuntime({ depegBps: null as unknown as number });
  assert.equal(RUNTIME.depegBps, 8, 'null no cambia');

  // 0 es un valor válido (no se filtra como falsy). El caso `false` se cubre en applyStrategy (enabled/maker).
  applyRuntime({ fxMaxAgeMs: 0 });
  assert.equal(RUNTIME.fxMaxAgeMs, 0);

  // restaurar defaults para no contaminar otros tests del proceso.
  applyRuntime({ slippageBps: 2, maxBtcPerTrade: 0.05 });
});

test('applyStrategy: hace merge del patch preservando el resto', () => {
  applyStrategy('spatial', { enabled: false, minNetBpsOverride: 12 });
  assert.equal(STRATEGIES.spatial.enabled, false);
  assert.equal(STRATEGIES.spatial.minNetBpsOverride, 12);
  assert.equal(STRATEGIES.spatial.maker, false, 'el resto se preserva');

  applyStrategy('spatial', { maker: true });
  assert.equal(STRATEGIES.spatial.maker, true);
  assert.equal(STRATEGIES.spatial.minNetBpsOverride, 12, 'override previo intacto');

  // restaurar
  applyStrategy('spatial', { enabled: true, minNetBpsOverride: null, maker: false });
});

test('effectiveMinNet: usa el override por estrategia, o el global si es null', () => {
  applyStrategy('cross_quote', { minNetBpsOverride: null });
  assert.equal(effectiveMinNet('cross_quote', 5), 5, 'null => global');
  applyStrategy('cross_quote', { minNetBpsOverride: 20 });
  assert.equal(effectiveMinNet('cross_quote', 5), 20, 'override gana');
  applyStrategy('cross_quote', { minNetBpsOverride: null }); // restaurar
});

test('effectiveTargetBase: usa el override por estrategia, o RUNTIME.maxBtcPerTrade si es null', () => {
  applyRuntime({ maxBtcPerTrade: 0.05 });
  applyStrategy('regional', { targetBase: null });
  assert.equal(effectiveTargetBase('regional'), 0.05, 'null => global');
  applyStrategy('regional', { targetBase: 0.3 });
  assert.equal(effectiveTargetBase('regional'), 0.3, 'override gana');
  applyStrategy('regional', { targetBase: null }); // restaurar
});
