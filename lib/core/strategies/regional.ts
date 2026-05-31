// lib/core/strategies/regional.ts — Premio regional Bitso: BTC/MXN vs BTC/USDT global.
// Compara el precio de Bitso (en MXN, convertido a USD con la tasa USDT/MXN) contra el global,
// en ambas direcciones, con modelo de costo MX (fee Bitso MXN + spread FX + withdrawal).
import type { FeeTable, OrderBook, Quote, Venue } from '../types';
import { totalSize, walkVwap } from '../orderbook';
import { makerFee, takerFee, withdrawalBtc } from '../fees';
import type { NetProfitResult } from '../profit';
import type { DetectedOpportunity } from './common';

export interface RegionalParams {
  fees: FeeTable;
  targetBase: number;
  minNetBps: number;
  slippageBps?: number;
  usdtMxn: number; // precio de 1 USDT en MXN (tasa de conversión)
  bitsoMxnFeeBps: number; // fee taker de Bitso en pares MXN (~65 bps base)
  fxSpreadBps: number; // costo de conversión MXN<->USD
  withdrawalAmortizeTrades?: number;
  depthCap?: number;
  // --- Optimización (opt-in; si no se pasan, el cálculo es idéntico al taker original) ---
  maker?: boolean; // fills MAKER en ambas patas (órdenes límite pasivas): mejor precio + fee maker, con riesgo de no-fill
  bitsoMxnMakerFeeBps?: number; // fee maker de Bitso MXN (solo si maker); fallback a bitsoMxnFeeBps
  fxAmortizeTrades?: number; // amortiza el costo FX entre N trades (default 1 = sin amortizar)
}

function label(venue: Venue, quote: Quote): string {
  const v = venue === 'bitso' ? 'Bitso' : venue.charAt(0).toUpperCase() + venue.slice(1);
  return `${v} ${quote}`;
}

function evalDirection(
  buyBook: OrderBook,
  sellBook: OrderBook,
  buyQuote: Quote,
  sellQuote: Quote,
  p: RegionalParams,
): DetectedOpportunity | null {
  const cap = p.depthCap;
  const maker = p.maker ?? false;
  // Taker: cruza el spread (compra al ask, vende al bid).
  // Maker: orden límite pasiva que se une al lado propio (compra al bid, vende al ask) -> mejor precio.
  const buyLevels = maker ? buyBook.bids : buyBook.asks;
  const sellLevels = maker ? sellBook.asks : sellBook.bids;
  const buySide = cap ? buyLevels.slice(0, cap) : buyLevels;
  const sellSide = cap ? sellLevels.slice(0, cap) : sellLevels;
  const execBase = Math.min(p.targetBase, totalSize(buySide), totalSize(sellSide));
  if (!(execBase > 1e-8)) return null;

  const slip = (p.slippageBps ?? 2) / 1e4;
  const fxSpread = p.fxSpreadBps / 1e4;
  const toUsd = (q: Quote, amt: number) => (q === 'MXN' ? amt / p.usdtMxn : amt);
  const feeRate = (venue: Venue, q: Quote) =>
    q === 'MXN' && venue === 'bitso'
      ? (maker ? (p.bitsoMxnMakerFeeBps ?? p.bitsoMxnFeeBps) : p.bitsoMxnFeeBps) / 1e4
      : (maker ? makerFee : takerFee)(p.fees, venue);

  const vwapBuy = walkVwap(buySide, execBase).vwap; // en buyQuote
  const vwapSell = walkVwap(sellSide, execBase).vwap; // en sellQuote

  // Bruto en USD (sin slippage ni fees).
  const spentUsdRaw = toUsd(buyQuote, vwapBuy * execBase);
  const recvUsdRaw = toUsd(sellQuote, vwapSell * execBase);
  const grossUsd = recvUsdRaw - spentUsdRaw;

  // Neto (slippage + fees + spread FX + withdrawal amortizado).
  const vwapBuyAdj = vwapBuy * (1 + slip);
  const vwapSellAdj = vwapSell * (1 - slip);
  const spentQuote = vwapBuyAdj * execBase;
  const recvQuote = vwapSellAdj * execBase;
  const spentUsd = toUsd(buyQuote, spentQuote);
  const recvUsd = toUsd(sellQuote, recvQuote);
  const buyFeeQuote = spentQuote * feeRate(buyBook.venue, buyQuote);
  const sellFeeQuote = recvQuote * feeRate(sellBook.venue, sellQuote);
  const fxAmortize = Math.max(1, p.fxAmortizeTrades ?? 1);
  const fxCost = ((buyQuote === 'MXN' ? spentUsd : recvUsd) * fxSpread) / fxAmortize;
  const amortize = Math.max(1, p.withdrawalAmortizeTrades ?? 1);
  const withdrawalUsd = (withdrawalBtc(p.fees, buyBook.venue) * toUsd(buyQuote, vwapBuy)) / amortize;
  const netUsd =
    recvUsd - toUsd(sellQuote, sellFeeQuote) - spentUsd - toUsd(buyQuote, buyFeeQuote) - fxCost - withdrawalUsd;

  const grossSpreadBps = spentUsdRaw > 0 ? (grossUsd / spentUsdRaw) * 1e4 : 0;
  const netSpreadBps = spentUsdRaw > 0 ? (netUsd / spentUsdRaw) * 1e4 : 0;

  const exec: NetProfitResult = {
    execBase,
    buy: {
      venue: buyBook.venue,
      side: 'buy',
      vwap: vwapBuyAdj,
      filledBase: execBase,
      quoteValue: spentQuote,
      feeQuote: buyFeeQuote,
      levelsConsumed: 0,
      fullyFilled: true,
    },
    sell: {
      venue: sellBook.venue,
      side: 'sell',
      vwap: vwapSellAdj,
      filledBase: execBase,
      quoteValue: recvQuote,
      feeQuote: sellFeeQuote,
      levelsConsumed: 0,
      fullyFilled: true,
    },
    grossUsd,
    netUsd,
    grossSpreadBps,
    netSpreadBps,
    withdrawalQuote: withdrawalUsd,
    profitable: netSpreadBps >= p.minNetBps,
    maker,
  };

  return {
    strategy: 'regional',
    buyVenue: buyBook.venue,
    sellVenue: sellBook.venue,
    buyQuote,
    sellQuote,
    pair: `${label(buyBook.venue, buyQuote)} → ${label(sellBook.venue, sellQuote)}`,
    grossSpreadBps,
    netSpreadBps,
    grossUsd,
    netUsd,
    maxExecBase: execBase,
    profitable: exec.profitable,
    exec,
  };
}

/** Compara Bitso BTC/MXN vs cada BTC/USDT global, en ambas direcciones (premio y descuento). */
export function detectRegional(
  bitsoMxn: OrderBook,
  globals: OrderBook[],
  p: RegionalParams,
): DetectedOpportunity[] {
  if (!(p.usdtMxn > 0)) return [];
  const out: DetectedOpportunity[] = [];
  for (const g of globals) {
    const a = evalDirection(g, bitsoMxn, 'USDT', 'MXN', p); // Bitso caro: comprar global, vender Bitso
    if (a) out.push(a);
    const b = evalDirection(bitsoMxn, g, 'MXN', 'USDT', p); // Bitso barato: comprar Bitso, vender global
    if (b) out.push(b);
  }
  return out;
}
