// lib/core/strategies/common.ts — Tipos comunes que producen todas las estrategias.
import type { NetProfitResult } from '../profit';
import type { FeeTable, Quote, StrategyType, Venue } from '../types';

export interface TriangularLeg {
  pair: string;
  side: 'buy' | 'sell';
  price: number;
}

export interface TriangularDetail {
  venue: Venue;
  cycle: string; // "USDT->BTC->ETH->USDT"
  legs: TriangularLeg[];
  startQuote: number;
  endQuote: number;
  execNotionalUsd: number;
}

/** Resultado uniforme de detección que el engine convierte en fila `opportunities`. */
export interface DetectedOpportunity {
  strategy: StrategyType;
  buyVenue: Venue;
  sellVenue: Venue;
  buyQuote: Quote;
  sellQuote: Quote;
  pair: string;
  grossSpreadBps: number;
  netSpreadBps: number;
  grossUsd: number;
  netUsd: number;
  maxExecBase: number;
  profitable: boolean;
  exec?: NetProfitResult; // spatial / cross_quote -> detalle para simular el fill
  triangular?: TriangularDetail; // triangular
}

export interface BaseParams {
  fees: FeeTable;
  targetBase: number;
  minNetBps: number;
  slippageBps?: number;
  depthCap?: number;
  withdrawalAmortizeTrades?: number;
  maker?: boolean; // modela fills maker (órdenes límite pasivas: mejor precio + fee maker)
}
