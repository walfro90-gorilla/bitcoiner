// lib/core/fees.ts — Config de fees por exchange. El worker la sobreescribe con fee_config de la DB.
import type { FeeTable, Venue } from './types';

/** Defaults (bps + withdrawal BTC). Fuente: tabla verificada en el plan. */
export const DEFAULT_FEES: FeeTable = {
  binance: { takerBps: 10, makerBps: 10, withdrawalBtc: 0.0002 },
  okx: { takerBps: 10, makerBps: 8, withdrawalBtc: 0.0004 },
  kraken: { takerBps: 40, makerBps: 25, withdrawalBtc: 0.00005 },
  bitso: { takerBps: 9.8, makerBps: 7.5, withdrawalBtc: 0.0003 },
};

/** Fee taker como fracción (0.001 = 0.10%). */
export function takerFee(fees: FeeTable, venue: Venue): number {
  return (fees[venue] ?? DEFAULT_FEES[venue]).takerBps / 1e4;
}

export function withdrawalBtc(fees: FeeTable, venue: Venue): number {
  return (fees[venue] ?? DEFAULT_FEES[venue]).withdrawalBtc;
}
