// worker/executor.ts — Ejecución simulada: fills VWAP, órdenes parciales, update de wallets.
import { RUNTIME } from './runtimeConfig';
import { Ledger } from './state';
import type { DetectedOpportunity, FillLeg } from './core';

export interface SimResult {
  finalBase: number;
  partial: boolean;
  vwapBuy: number;
  vwapSell: number;
  buyFeeUsd: number;
  sellFeeUsd: number;
  withdrawalFeeUsd: number;
  netPnlUsd: number;
  legs: FillLeg[];
  status: 'filled' | 'partial' | 'rejected';
  rejectReason?: string;
}

function zeroResult(reason: string): SimResult {
  return {
    finalBase: 0,
    partial: false,
    vwapBuy: 0,
    vwapSell: 0,
    buyFeeUsd: 0,
    sellFeeUsd: 0,
    withdrawalFeeUsd: 0,
    netPnlUsd: 0,
    legs: [],
    status: 'rejected',
    rejectReason: reason,
  };
}

/** Simula la ejecución de una oportunidad y aplica los cambios al ledger en RAM.
 *  `ignoreCaps` (solo para el inyector del ejemplo del reto): ejecuta el execBase completo
 *  sin los topes de tamaño (maxBtcPerTrade/maxPositionUsd), manteniendo el wallet guard. */
export function simulate(
  opp: DetectedOpportunity,
  ledger: Ledger,
  maxPositionUsd: number,
  ignoreCaps = false,
): SimResult {
  if (opp.triangular) return simulateTriangular(opp, ledger, maxPositionUsd);
  if (opp.exec) return simulateTwoLeg(opp, ledger, maxPositionUsd, ignoreCaps);
  return zeroResult('no_exec_detail');
}

function simulateTwoLeg(
  opp: DetectedOpportunity,
  ledger: Ledger,
  maxPositionUsd: number,
  ignoreCaps = false,
): SimResult {
  const ex = opp.exec!;
  const { buyVenue, sellVenue, buyQuote, sellQuote } = opp;
  const vwapBuy = ex.buy.vwap;
  const vwapSell = ex.sell.vwap;
  if (!(vwapBuy > 0) || !(ex.execBase > 0)) return zeroResult('invalid_quote');

  // Caps: posición máxima (USD), BTC por trade y wallet guard (balances disponibles).
  // El inyector del ejemplo del reto pasa ignoreCaps=true para mostrar el +$109.75 a 1 BTC completo;
  // el wallet guard (saldos disponibles) se respeta siempre.
  const availQuote = ledger.get(buyVenue, buyQuote);
  const availBtc = ledger.get(sellVenue, 'BTC');
  const finalBase = Math.min(
    ex.execBase,
    ignoreCaps ? Infinity : RUNTIME.maxBtcPerTrade,
    ignoreCaps ? Infinity : maxPositionUsd / vwapBuy,
    availQuote / vwapBuy,
    availBtc,
  );
  if (!(finalBase > 1e-8)) return zeroResult('insufficient_balance');

  const scale = finalBase / ex.execBase;
  const takerBuy = ex.buy.quoteValue > 0 ? ex.buy.feeQuote / ex.buy.quoteValue : 0;
  const takerSell = ex.sell.quoteValue > 0 ? ex.sell.feeQuote / ex.sell.quoteValue : 0;

  const buySpend = vwapBuy * finalBase;
  const buyFee = buySpend * takerBuy;
  const sellRecv = vwapSell * finalBase;
  const sellFee = sellRecv * takerSell;
  const withdrawalFee = ex.withdrawalQuote * scale;
  const netPnl = ex.netUsd * scale;

  // Wallet swaps (en RAM): compra BTC pagando quote; vende BTC recibiendo quote.
  ledger.add(buyVenue, buyQuote, -(buySpend + buyFee));
  ledger.add(buyVenue, 'BTC', finalBase);
  ledger.add(sellVenue, 'BTC', -finalBase);
  ledger.add(sellVenue, sellQuote, sellRecv - sellFee);

  const targetCap = Math.min(ex.execBase, RUNTIME.maxBtcPerTrade);
  const partial = finalBase < targetCap - 1e-9;
  const legs: FillLeg[] = [
    { ...ex.buy, vwap: vwapBuy, filledBase: finalBase, quoteValue: buySpend, feeQuote: buyFee },
    { ...ex.sell, vwap: vwapSell, filledBase: finalBase, quoteValue: sellRecv, feeQuote: sellFee },
  ];

  return {
    finalBase,
    partial,
    vwapBuy,
    vwapSell,
    buyFeeUsd: buyFee,
    sellFeeUsd: sellFee,
    withdrawalFeeUsd: withdrawalFee,
    netPnlUsd: netPnl,
    legs,
    status: partial ? 'partial' : 'filled',
  };
}

function simulateTriangular(opp: DetectedOpportunity, ledger: Ledger, maxPositionUsd: number): SimResult {
  const tri = opp.triangular!;
  const venue = tri.venue;
  const availUsdt = ledger.get(venue, 'USDT');
  const notional = Math.min(tri.execNotionalUsd, maxPositionUsd, availUsdt);
  if (!(notional > 1)) return zeroResult('insufficient_balance');

  const scale = notional / tri.execNotionalUsd;
  const netPnl = (tri.endQuote - tri.startQuote) * scale;
  ledger.add(venue, 'USDT', netPnl); // ciclo redondo: efecto neto en USDT

  const legs: FillLeg[] = tri.legs.map((l) => ({
    venue,
    side: l.side,
    vwap: l.price,
    filledBase: 0,
    quoteValue: notional,
    feeQuote: 0,
    levelsConsumed: 1,
    fullyFilled: true,
  }));

  return {
    finalBase: 0,
    partial: false,
    vwapBuy: 0,
    vwapSell: 0,
    buyFeeUsd: 0,
    sellFeeUsd: 0,
    withdrawalFeeUsd: 0,
    netPnlUsd: netPnl,
    legs,
    status: 'filled',
  };
}
