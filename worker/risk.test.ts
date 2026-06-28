// worker/risk.test.ts — Tests de los circuit breakers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RiskManager, type BotRuntimeState } from './risk';
import { applyRuntime } from './runtimeConfig';

function rt(): BotRuntimeState {
  return {
    tradingEnabled: true,
    demoMode: false,
    minNetBps: 5,
    maxPositionUsd: 10_000,
    cumulativePnlUsd: 0,
    consecutiveLosses: 0,
    newsRiskOff: false,
    newsSentiment: 0,
    newsImpact: 'low',
  };
}

test('risk: kill switch bloquea la ejecución', () => {
  const s = rt();
  s.tradingEnabled = false;
  assert.equal(new RiskManager(s).blockReason(Date.now()), 'trading_disabled');
});

test('risk: rate limiter corta tras N trades por minuto', () => {
  applyRuntime({ maxTradesPerMin: 2 });
  try {
    const r = new RiskManager(rt());
    const now = Date.now();
    assert.equal(r.blockReason(now), null);
    r.recordTrade(now, 1);
    r.recordTrade(now, 1);
    assert.equal(r.blockReason(now), 'max_trades_per_min');
  } finally {
    applyRuntime({ maxTradesPerMin: 30 });
  }
});

test('risk: halt por pérdidas consecutivas + cooldown configurable', () => {
  applyRuntime({ consecutiveLossHalt: 2, lossCooldownMs: 5_000, maxTradesPerMin: 100 });
  try {
    const s = rt();
    const r = new RiskManager(s);
    const now = Date.now();
    r.recordTrade(now, -1);
    r.recordTrade(now, -1); // 2ª pérdida → halt
    assert.equal(r.blockReason(now + 1_000), 'cooldown_consecutive_losses', 'en cooldown');
    assert.equal(r.blockReason(now + 6_000), null, 'tras el cooldown vuelve a operar');
    assert.ok(Math.abs(s.cumulativePnlUsd - -2) < 1e-9, 'P&L acumulado actualizado');
  } finally {
    applyRuntime({ consecutiveLossHalt: 3, lossCooldownMs: 15_000, maxTradesPerMin: 30 });
  }
});

test('risk: una ganancia resetea el contador de pérdidas consecutivas', () => {
  const s = rt();
  const r = new RiskManager(s);
  const now = Date.now();
  r.recordTrade(now, -1);
  assert.equal(s.consecutiveLosses, 1);
  r.recordTrade(now, 5); // ganancia
  assert.equal(s.consecutiveLosses, 0, 'reset tras ganancia');
});
