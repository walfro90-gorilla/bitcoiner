// lib/core/strategies/spatial.ts — Arbitraje espacial: mismo par/quote entre dos venues.
import type { OrderBook } from '../types';
import { bestAsk, bestBid } from '../orderbook';
import { computeNetProfit } from '../profit';
import type { BaseParams, DetectedOpportunity } from './common';

/**
 * Para cada par ordenado (A,B) con A!=B: si ask(A) < bid(B) hay divergencia bruta;
 * evalúa comprar en A y vender en B con cálculo neto depth-aware.
 * `books` debe contener solo books del MISMO par (misma quote).
 */
export function detectSpatial(books: OrderBook[], p: BaseParams): DetectedOpportunity[] {
  const out: DetectedOpportunity[] = [];
  for (let a = 0; a < books.length; a++) {
    for (let b = 0; b < books.length; b++) {
      if (a === b) continue;
      const buy = books[a];
      const sell = books[b];
      if (buy.venue === sell.venue) continue;
      const ask = bestAsk(buy);
      const bid = bestBid(sell);
      if (ask == null || bid == null || ask >= bid) continue; // sin divergencia bruta
      const r = computeNetProfit(
        {
          buyBook: buy,
          sellBook: sell,
          fees: p.fees,
          targetBase: p.targetBase,
          slippageBps: p.slippageBps,
          depthCap: p.depthCap,
          withdrawalAmortizeTrades: p.withdrawalAmortizeTrades,
        },
        p.minNetBps,
      );
      if (r.execBase <= 0) continue;
      out.push({
        strategy: 'spatial',
        buyVenue: buy.venue,
        sellVenue: sell.venue,
        buyQuote: buy.quote,
        sellQuote: sell.quote,
        pair: buy.pair,
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
