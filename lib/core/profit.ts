// lib/core/profit.ts — EL CORAZÓN DEL BOT.
// Cálculo de rentabilidad NETA depth-aware (VWAP) con fees, withdrawal, slippage y cross-quote.
import type { FeeTable, FillLeg, OrderBook } from './types';
import { totalSize, walkVwap } from './orderbook';
import { takerFee, withdrawalBtc } from './fees';

export interface NetProfitInput {
  buyBook: OrderBook; // compramos contra sus ASKS
  sellBook: OrderBook; // vendemos contra sus BIDS
  fees: FeeTable;
  targetBase: number; // BTC deseado
  slippageBps?: number; // movimiento adverso modelado por latencia (default 2)
  fxBuyToSell?: number; // convierte quote del SELL -> quote del BUY (cross-quote; default 1)
  depegBps?: number; // costo de conversión de stablecoin USD<->USDT (default 0)
  depthCap?: number; // máximo de niveles a considerar (default: todos)
  includeWithdrawal?: boolean; // cobrar withdrawal del BTC comprado (default true)
  withdrawalAmortizeTrades?: number; // amortizar el withdrawal entre N trades (rebalanceo); default 1
}

export interface NetProfitResult {
  execBase: number; // volumen ejecutable (capeado por liquidez) -> base de las órdenes parciales
  buy: FillLeg;
  sell: FillLeg;
  grossUsd: number; // bruto en quote del comprador
  netUsd: number; // neto en quote del comprador
  grossSpreadBps: number;
  netSpreadBps: number;
  withdrawalQuote: number;
  profitable: boolean;
}

const SLIP_DEFAULT = 2;

/**
 * Calcula la utilidad neta de comprar `targetBase` BTC en buyBook y venderlo en sellBook.
 * `minNetBps` define el umbral de rentabilidad (circuit breaker MIN_NET_BPS).
 */
export function computeNetProfit(i: NetProfitInput, minNetBps = 0): NetProfitResult {
  const slip = (i.slippageBps ?? SLIP_DEFAULT) / 1e4;
  const fx = i.fxBuyToSell ?? 1;
  const depeg = (i.depegBps ?? 0) / 1e4;
  const cap = i.depthCap ?? Infinity;

  const buyAsks = cap === Infinity ? i.buyBook.asks : i.buyBook.asks.slice(0, cap);
  const sellBids = cap === Infinity ? i.sellBook.bids : i.sellBook.bids.slice(0, cap);

  // 1) Cap de liquidez en ambos lados -> de aquí salen las ÓRDENES PARCIALES.
  const liqBuy = totalSize(buyAsks);
  const liqSell = totalSize(sellBids);
  const execBase = Math.min(i.targetBase, liqBuy, liqSell);

  // 2) y 3) VWAP de compra (asks asc) y venta (bids desc).
  const buyW = walkVwap(buyAsks, execBase);
  const sellW = walkVwap(sellBids, execBase);

  // VWAPs crudos (sin slippage) -> spread BRUTO depth-aware (sin costos).
  const vwapBuyRaw = buyW.vwap;
  const vwapSellRaw = sellW.vwap;
  const quoteSpentRaw = vwapBuyRaw * execBase; // quote del comprador
  const grossUsd = vwapSellRaw * execBase * fx - quoteSpentRaw; // normalizado a quote del comprador (sin depeg)
  const grossSpreadBps = quoteSpentRaw > 0 ? (grossUsd / quoteSpentRaw) * 1e4 : 0;

  // Slippage adverso (compra sube, venta baja) -> precios efectivos del fill.
  const vwapBuy = vwapBuyRaw * (1 + slip);
  const vwapSell = vwapSellRaw * (1 - slip);
  const quoteSpent = vwapBuy * execBase; // en quote del comprador
  const quoteRecvRaw = vwapSell * execBase; // en quote del vendedor

  // Normalización cross-quote a la quote del comprador + costo de depeg (solo en el neto).
  const quoteRecvNorm = quoteRecvRaw * fx * (1 - depeg);

  // Fees taker de ambos lados + withdrawal del BTC (una vez por oportunidad).
  const buyFee = quoteSpent * takerFee(i.fees, i.buyBook.venue);
  const sellFeeRaw = quoteRecvRaw * takerFee(i.fees, i.sellBook.venue);
  const sellFee = sellFeeRaw * fx; // a quote del comprador
  const includeWd = i.includeWithdrawal ?? true;
  const amortize = Math.max(1, i.withdrawalAmortizeTrades ?? 1);
  const withdrawalQuote = includeWd ? (withdrawalBtc(i.fees, i.buyBook.venue) * vwapBuy) / amortize : 0;

  // Neto (después de slippage, fees, depeg y withdrawal).
  const netUsd = quoteRecvNorm - sellFee - quoteSpent - buyFee - withdrawalQuote;
  const netSpreadBps = quoteSpent > 0 ? (netUsd / quoteSpent) * 1e4 : 0;

  const buy: FillLeg = {
    venue: i.buyBook.venue,
    side: 'buy',
    vwap: vwapBuy,
    filledBase: buyW.filledBase,
    quoteValue: quoteSpent,
    feeQuote: buyFee,
    levelsConsumed: buyW.levelsConsumed,
    fullyFilled: buyW.fullyFilled,
  };
  const sell: FillLeg = {
    venue: i.sellBook.venue,
    side: 'sell',
    vwap: vwapSell,
    filledBase: sellW.filledBase,
    quoteValue: quoteRecvRaw,
    feeQuote: sellFeeRaw,
    levelsConsumed: sellW.levelsConsumed,
    fullyFilled: sellW.fullyFilled,
  };

  return {
    execBase,
    buy,
    sell,
    grossUsd,
    netUsd,
    grossSpreadBps,
    netSpreadBps,
    withdrawalQuote,
    profitable: execBase > 0 && netSpreadBps >= minNetBps,
  };
}
