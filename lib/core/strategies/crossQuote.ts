// lib/core/strategies/crossQuote.ts — Arbitraje cross-quote USD <-> USDT.
import type { OrderBook, Quote } from '../types';
import { bestAsk, bestBid } from '../orderbook';
import { computeNetProfit } from '../profit';
import type { BaseParams, DetectedOpportunity } from './common';

export interface CrossQuoteParams extends BaseParams {
  depegBps: number; // costo de conversión de stablecoin (modelado)
  usdtPerUsd?: number; // referencia FX USD->USDT (default 1)
}

/** Convierte 1 unidad de `from` a unidades de `to`. null si no soportado. */
function fxConvert(from: Quote, to: Quote, usdtPerUsd: number): number | null {
  if (from === to) return 1;
  if (from === 'USD' && to === 'USDT') return usdtPerUsd;
  if (from === 'USDT' && to === 'USD') return 1 / usdtPerUsd;
  return null; // MXN u otros: fuera de alcance aquí
}

/**
 * Compara books de BTC en quotes DISTINTAS (USDT vs USD), normalizando con fx + depeg.
 * `books` debe ser del mismo BASE (BTC) en quotes mixtas.
 */
export function detectCrossQuote(books: OrderBook[], p: CrossQuoteParams): DetectedOpportunity[] {
  const out: DetectedOpportunity[] = [];
  const usdtPerUsd = p.usdtPerUsd ?? 1;
  for (let a = 0; a < books.length; a++) {
    for (let b = 0; b < books.length; b++) {
      if (a === b) continue;
      const buy = books[a];
      const sell = books[b];
      if (buy.quote === sell.quote) continue; // cross-quote = quotes distintas
      const fx = fxConvert(sell.quote, buy.quote, usdtPerUsd); // sell-quote -> buy-quote
      if (fx == null) continue;
      const ask = bestAsk(buy);
      const bid = bestBid(sell);
      if (ask == null || bid == null) continue;
      if (bid * fx <= ask) continue; // sin divergencia bruta tras convertir
      const r = computeNetProfit(
        {
          buyBook: buy,
          sellBook: sell,
          fees: p.fees,
          targetBase: p.targetBase,
          slippageBps: p.slippageBps,
          depthCap: p.depthCap,
          fxBuyToSell: fx,
          depegBps: p.depegBps,
          withdrawalAmortizeTrades: p.withdrawalAmortizeTrades,
          maker: p.maker,
        },
        p.minNetBps,
      );
      if (r.execBase <= 0) continue;
      out.push({
        strategy: 'cross_quote',
        buyVenue: buy.venue,
        sellVenue: sell.venue,
        buyQuote: buy.quote,
        sellQuote: sell.quote,
        pair: `${buy.pair} -> ${sell.pair}`,
        grossSpreadBps: r.grossSpreadBps,
        netSpreadBps: r.netSpreadBps,
        grossUsd: r.grossUsd,
        netUsd: r.netUsd,
        maxExecBase: r.execBase,
        profitable: r.profitable,
        exec: r,
      });
    }
  }
  return out;
}
