// worker/runtimeConfig.ts — Fuente de verdad EN CALIENTE de la configuración.
// El hot-path (engine/executor/risk/fx) lee SIEMPRE de aquí (no captura CONFIG.* al arranque).
// El poll de bot_state/runtime_config/strategy_config (worker/index.ts) actualiza estos holders en vivo.
// Inicializado desde CONFIG.* → si no hay DB, el comportamiento es idéntico al de siempre.
import { CONFIG } from './config';
import type { StrategyType } from './core';

export interface RuntimeConfig {
  slippageBps: number;
  depegBps: number;
  withdrawalAmortizeTrades: number;
  fxSpreadBps: number;
  fxAmortizeTrades: number;
  fxMaxAgeMs: number;
  bitsoMxnFeeBps: number;
  bitsoMxnMakerFeeBps: number;
  maxBtcPerTrade: number;
  maxTradesPerMin: number;
  consecutiveLossHalt: number;
  lossCooldownMs: number;
  staleMs: number;
  newsPollMs: number;
}

export interface StrategyConfig {
  enabled: boolean;
  minNetBpsOverride: number | null; // null = usa el umbral global
  maker: boolean;
  targetBase: number | null; // null = usa RUNTIME.maxBtcPerTrade
  notionalUsd: number | null; // triangular: null = usa maxPositionUsd
  statEntry: number | null;
  statExit: number | null;
  statStop: number | null;
}

export type StrategyConfigMap = Record<StrategyType, StrategyConfig>;

const LOSS_COOLDOWN_MS_DEFAULT = 15_000; // antes hardcodeado en risk.ts

/** Config global en caliente — init desde CONFIG.* (cero regresión sin DB). */
export const RUNTIME: RuntimeConfig = {
  slippageBps: CONFIG.slippageBps,
  depegBps: CONFIG.depegBps,
  withdrawalAmortizeTrades: CONFIG.withdrawalAmortizeTrades,
  fxSpreadBps: CONFIG.fxSpreadBps,
  fxAmortizeTrades: CONFIG.fxAmortizeTrades,
  fxMaxAgeMs: CONFIG.fxMaxAgeMs,
  bitsoMxnFeeBps: CONFIG.bitsoMxnFeeBps,
  bitsoMxnMakerFeeBps: CONFIG.bitsoMxnMakerFeeBps,
  maxBtcPerTrade: CONFIG.maxBtcPerTrade,
  maxTradesPerMin: CONFIG.maxTradesPerMin,
  consecutiveLossHalt: CONFIG.consecutiveLossHalt,
  lossCooldownMs: LOSS_COOLDOWN_MS_DEFAULT,
  staleMs: CONFIG.staleMs,
  newsPollMs: CONFIG.newsPollMs,
};
// Nota: el modo maker es POR ESTRATEGIA (STRATEGIES[s].maker). maker_mode/regional_maker_mode
// del runtime_config solo siembran el default por-estrategia (abajo) cuando no hay override en DB.

function defaultStrategy(maker: boolean): StrategyConfig {
  return {
    enabled: true,
    minNetBpsOverride: null,
    maker,
    targetBase: null,
    notionalUsd: null,
    statEntry: null,
    statExit: null,
    statStop: null,
  };
}

/** Config por estrategia en caliente. Regional arranca con SU flag de maker (regionalMakerMode). */
export const STRATEGIES: StrategyConfigMap = {
  spatial: defaultStrategy(CONFIG.makerMode),
  cross_quote: defaultStrategy(CONFIG.makerMode),
  triangular: defaultStrategy(CONFIG.makerMode),
  statistical: defaultStrategy(CONFIG.makerMode),
  regional: defaultStrategy(CONFIG.regionalMakerMode),
};

/** Aplica un parche a la config global (desde el poll). Solo sobreescribe claves presentes. */
export function applyRuntime(patch: Partial<RuntimeConfig>): void {
  for (const k of Object.keys(patch) as (keyof RuntimeConfig)[]) {
    const v = patch[k];
    if (v != null) (RUNTIME[k] as number | boolean) = v;
  }
}

/** Aplica config por estrategia (desde el poll). */
export function applyStrategy(strategy: StrategyType, patch: Partial<StrategyConfig>): void {
  const cur = STRATEGIES[strategy];
  if (!cur) return;
  STRATEGIES[strategy] = { ...cur, ...patch };
}

/** Umbral efectivo de una estrategia: override por estrategia o el global. */
export function effectiveMinNet(strategy: StrategyType, globalMinNet: number): number {
  return STRATEGIES[strategy].minNetBpsOverride ?? globalMinNet;
}

/** Tamaño objetivo de una estrategia: override por estrategia o el global. */
export function effectiveTargetBase(strategy: StrategyType): number {
  return STRATEGIES[strategy].targetBase ?? RUNTIME.maxBtcPerTrade;
}
