// worker/engine.ts — Loop de evaluación event-driven. Coalesce updates y re-evalúa solo lo afectado.
import { CONFIG } from './config';
import { MarketState } from './state';
import {
  DEFAULT_FEES,
  detectCrossQuote,
  detectSpatial,
  type DetectedOpportunity,
  type FeeTable,
  type OrderBook,
} from './core';

export interface OppTiming {
  exchangeTs: number;
  recvTs: number;
  detectedTs: number;
}
export type OpportunityHandler = (opp: DetectedOpportunity, timing: OppTiming) => void;

export class Engine {
  readonly state = new MarketState();
  private fees: FeeTable = DEFAULT_FEES;
  private minNet = CONFIG.minNetBps;
  private scheduled = false;
  private dirtyPairs = new Set<string>();
  private dirtyBases = new Set<string>();
  private lastBook?: OrderBook;

  constructor(private readonly onOpp: OpportunityHandler) {}

  setFees(f: FeeTable): void {
    this.fees = f;
  }

  setMinNetBps(bps: number): void {
    this.minNet = bps;
  }

  /** Punto de entrada de cada update de feed. */
  onBook = (b: OrderBook): void => {
    this.state.setBook(b);
    this.lastBook = b;
    this.dirtyPairs.add(b.pair);
    this.dirtyBases.add(b.base);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.evaluate();
    });
  };

  private fresh(books: OrderBook[], now: number): OrderBook[] {
    return books.filter((b) => now - b.recvTs <= CONFIG.staleMs);
  }

  private evaluate(): void {
    const now = Date.now();
    const minNet = this.minNet;
    const targetBase = CONFIG.maxBtcPerTrade;
    const trig = this.lastBook;

    // Arbitraje espacial: misma quote, distinto venue.
    for (const pair of this.dirtyPairs) {
      const sameQuote = new Map<string, OrderBook[]>();
      for (const bk of this.fresh(this.state.byPair(pair), now)) {
        const arr = sameQuote.get(bk.quote) ?? [];
        arr.push(bk);
        sameQuote.set(bk.quote, arr);
      }
      for (const books of sameQuote.values()) {
        if (books.length < 2) continue;
        const opps = detectSpatial(books, {
          fees: this.fees,
          targetBase,
          minNetBps: minNet,
          slippageBps: CONFIG.slippageBps,
          withdrawalAmortizeTrades: CONFIG.withdrawalAmortizeTrades,
        });
        for (const o of opps) this.emit(o, now, trig);
      }
    }

    // Arbitraje cross-quote: BTC en quotes distintas (USDT vs USD).
    if (this.dirtyBases.has('BTC')) {
      const btc = this.fresh(this.state.byBase('BTC'), now);
      const quotes = new Set(btc.map((b) => b.quote));
      if (quotes.size >= 2) {
        const opps = detectCrossQuote(btc, {
          fees: this.fees,
          targetBase,
          minNetBps: minNet,
          slippageBps: CONFIG.slippageBps,
          depegBps: CONFIG.depegBps,
          withdrawalAmortizeTrades: CONFIG.withdrawalAmortizeTrades,
        });
        for (const o of opps) this.emit(o, now, trig);
      }
    }

    this.dirtyPairs.clear();
    this.dirtyBases.clear();
  }

  private emit(o: DetectedOpportunity, now: number, trig?: OrderBook): void {
    this.onOpp(o, {
      exchangeTs: trig?.exchangeTs ?? 0,
      recvTs: trig?.recvTs ?? now,
      detectedTs: Date.now(),
    });
  }
}
