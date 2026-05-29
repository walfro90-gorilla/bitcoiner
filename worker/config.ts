// worker/config.ts — Carga de configuración desde .env.worker (o env de Railway).
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: process.env.WORKER_ENV_FILE ?? '.env.worker' });

function num(name: string, def: number): number {
  const v = process.env[name];
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}
function str(name: string, def = ''): string {
  return process.env[name] ?? def;
}
function list(name: string, def: string): string[] {
  return str(name, def)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CONFIG = {
  supabaseUrl: str('SUPABASE_URL'),
  supabaseServiceKey: str('SUPABASE_SERVICE_ROLE_KEY'),

  venues: list('WORKER_VENUES', 'binance,okx,kraken,bitso'),
  pairs: list('WORKER_PAIRS', 'BTC/USDT,BTC/USD'),

  // Riesgo / circuit breakers
  minNetBps: num('MIN_NET_BPS', 5),
  maxPositionUsd: num('MAX_POSITION_USD', 10000),
  maxBtcPerTrade: num('MAX_BTC_PER_TRADE', 0.05),
  maxTradesPerMin: num('MAX_TRADES_PER_MIN', 30),
  consecutiveLossHalt: num('CONSECUTIVE_LOSS_HALT', 3),
  staleMs: num('STALE_MS', 5000),

  // Modelado de costos
  depegBps: num('DEPEG_BPS', 8),
  slippageBps: num('SLIPPAGE_BPS', 2),
  withdrawalAmortizeTrades: num('WITHDRAWAL_AMORTIZE_TRADES', 50),
  bitsoMxnFeeBps: num('BITSO_MXN_FEE_BPS', 65), // fee taker de Bitso en pares MXN
  fxSpreadBps: num('FX_SPREAD_BPS', 30), // costo de conversión MXN<->USD

  // Replay / demo
  snapshotSampleMs: num('SNAPSHOT_SAMPLE_MS', 0), // 0 = desactivado (replay opt-in); evita ~700MB/día
  newsPollMs: num('NEWS_POLL_MS', 180000),
  demoMode: str('DEMO_MODE', 'false').toLowerCase() === 'true',
};

export const HAS_SUPABASE = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseServiceKey);

/** Umbral efectivo: en DEMO se relaja para que se disparen operaciones en escenario. */
export function effectiveMinNetBps(): number {
  return CONFIG.demoMode ? -25 : CONFIG.minNetBps;
}
