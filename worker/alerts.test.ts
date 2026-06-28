// worker/alerts.test.ts — Tests de las alertas Telegram (sin red: opt-in apagado en test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttleOk, alertsEnabled, alertTrade, alertRebalance } from './alerts';

test('throttleOk respeta la ventana anti-spam', () => {
  assert.equal(throttleOk(0, 1000, 0), true); // ms<=0 → siempre pasa
  assert.equal(throttleOk(1000, 1500, 1000), false); // 500ms < 1000ms
  assert.equal(throttleOk(1000, 2000, 1000), true); // 1000ms >= 1000ms
  assert.equal(throttleOk(1000, 2001, 1000), true);
});

test('sin credenciales: alertas deshabilitadas y todas las funciones son no-op (no lanzan, no hacen red)', () => {
  // En el entorno de test no hay TELEGRAM_BOT_TOKEN/CHAT_ID.
  assert.equal(alertsEnabled(), false);
  assert.doesNotThrow(() =>
    alertTrade({ strategy: 'spatial', route: 'kraken→binance', pair: 'BTC/USDT', base: 0.01, netPnlUsd: 1.2, cumPnlUsd: 10, partial: false }),
  );
  assert.doesNotThrow(() => alertRebalance({ from: 'binance', to: 'okx', asset: 'BTC', amount: 0.1, usd: 6000 }));
});
