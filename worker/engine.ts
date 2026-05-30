// worker/engine.ts — Loop de evaluación event-driven. Coalesce updates y re-evalúa solo lo afectado.
// Estrategias: espacial · cross-quote · triangular · estadística (z-score).
import { CONFIG } from './config';
import { MarketState } from './state';
import {
  computeNetProfit,
  DEFAULT_FEES,
  RollingZScore,
  detectCrossQuote,
  detectRegional,
  detectSpatial,
  detectTriangular,
  midPrice,
  statSample,
  type DetectedOpportunity,
  type FeeTable,
  type OrderBook,
  type Quote,
  type Venue,
} from './core';
import { getUsdtMxn } from './fx';

export interface OppTiming {
  exchangeTs: number;
  recvTs: number;
  detectedTs: number;
}
export type OpportunityHandler = (opp: DetectedOpportunity, timing: OppTiming) => void;

export interface SpreadSample {
  pair_a: string;
  pair_b: string;
  mid_a: number;
  mid_b: number;
  spread: number;
  zscore: number;
  mean: number;
  stddev: number;
}
export type SpreadHandler = (s: SpreadSample) => void;

const TRI_VENUES: Venue[] = ['binance', 'okx'];
const STAT_PAIRS = [
  { a: 'binance:BTC/USDT', b: 'kraken:BTC/USD', labelA: 'binance BTC/USDT', labelB: 'kraken BTC/USD' },
  { a: 'binance:BTC/USDT', b: 'okx:BTC/USDT', labelA: 'binance BTC/USDT', labelB: 'okx BTC/USDT' },
];
const STAT_WINDOW = 300;

function fxFor(from: Quote, to: Quote): number {
  if (from === to) return 1;
  // USD ~ USDT (referencia 1:1; el costo de depeg se modela aparte)
  if ((from === 'USD' && to === 'USDT') || (from === 'USDT' && to === 'USD')) return 1;
  return 1;
}

export class Engine {
  readonly state = new MarketState();
  private fees: FeeTable = DEFAULT_FEES;
  private minNet = CONFIG.minNetBps;
  private scheduled = false;
  private dirtyPairs = new Set<string>();
  private dirtyBases = new Set<string>();
  private lastBook?: OrderBook;
  private statState = new Map<string, RollingZScore>();
  private lastSpreadWrite = new Map<string, number>();

  constructor(
    private readonly onOpp: OpportunityHandler,
    private readonly onSpread: SpreadHandler = () => {},
  ) {
    for (const sp of STAT_PAIRS) this.statState.set(`${sp.a}|${sp.b}`, new RollingZScore(STAT_WINDOW));
  }

  setFees(f: FeeTable): void {
    this.fees = f;
  }
  setMinNetBps(bps: number): void {
    this.minNet = bps;
  }

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
  private isFresh(b: OrderBook | undefined, now: number): b is OrderBook {
    return !!b && now - b.recvTs <= CONFIG.staleMs;
  }

  private evaluate(): void {
    const now = Date.now();
    const trig = this.lastBook;
    const baseParams = {
      fees: this.fees,
      targetBase: CONFIG.maxBtcPerTrade,
      minNetBps: this.minNet,
      slippageBps: CONFIG.slippageBps,
      withdrawalAmortizeTrades: CONFIG.withdrawalAmortizeTrades,
      maker: CONFIG.makerMode,
    };

    // Buffer del tick: recolectamos TODAS las oportunidades y al final las emitimos
    // PRIORIZADAS (rentables primero, luego mayor net_usd) -> el bot ejecuta la MEJOR
    // del tick primero, no "la primera que aparece" (criterio #4 del reto).
    const candidates: DetectedOpportunity[] = [];

    // 1) Espacial: misma quote, distinto venue.
    for (const pair of this.dirtyPairs) {
      const byQuote = new Map<string, OrderBook[]>();
      for (const bk of this.fresh(this.state.byPair(pair), now)) {
        const arr = byQuote.get(bk.quote) ?? [];
        arr.push(bk);
        byQuote.set(bk.quote, arr);
      }
      for (const books of byQuote.values()) {
        if (books.length < 2) continue;
        for (const o of detectSpatial(books, baseParams)) candidates.push(o);
      }
    }

    // 2) Cross-quote: BTC en quotes distintas (USDT vs USD).
    if (this.dirtyBases.has('BTC')) {
      const btc = this.fresh(this.state.byBase('BTC'), now);
      if (new Set(btc.map((b) => b.quote)).size >= 2) {
        for (const o of detectCrossQuote(btc, { ...baseParams, depegBps: CONFIG.depegBps })) candidates.push(o);
      }
    }

    // 2b) Regional: premio Bitso MX (BTC/MXN vs BTC/USDT global).
    if (this.dirtyPairs.has('BTC/MXN') || this.dirtyPairs.has('BTC/USDT')) {
      const usdtMxn = getUsdtMxn();
      const bitsoMxn = this.state.get('bitso:BTC/MXN');
      if (usdtMxn > 0 && this.isFresh(bitsoMxn, now)) {
        const globals = this.fresh(this.state.byBase('BTC'), now).filter(
          (b) => b.pair === 'BTC/USDT' && b.venue !== 'bitso',
        );
        if (globals.length) {
          for (const o of detectRegional(bitsoMxn, globals, {
            ...baseParams,
            usdtMxn,
            bitsoMxnFeeBps: CONFIG.bitsoMxnFeeBps,
            fxSpreadBps: CONFIG.fxSpreadBps,
          }))
            candidates.push(o);

          // Registrar el premio firmado (Bitso vs global) para la gráfica del dashboard.
          const bitsoUsd = (midPrice(bitsoMxn) ?? 0) / usdtMxn;
          const globalUsd = midPrice(globals[0]) ?? 0;
          if (bitsoUsd > 0 && globalUsd > 0 && now - (this.lastSpreadWrite.get('premium') ?? 0) >= 1000) {
            this.lastSpreadWrite.set('premium', now);
            this.onSpread({
              pair_a: 'Bitso BTC/MXN (USD)',
              pair_b: 'Global BTC/USDT',
              mid_a: bitsoUsd,
              mid_b: globalUsd,
              spread: (bitsoUsd / globalUsd - 1) * 1e4, // premio en bps
              zscore: 0,
              mean: 0,
              stddev: 0,
            });
          }
        }
      }
    }

    // 3) Triangular intra-exchange (USDT->BTC->ETH->USDT).
    if (this.dirtyPairs.has('BTC/USDT') || this.dirtyPairs.has('ETH/BTC') || this.dirtyPairs.has('ETH/USDT')) {
      for (const v of TRI_VENUES) {
        const btcUsdt = this.state.get(`${v}:BTC/USDT`);
        const ethBtc = this.state.get(`${v}:ETH/BTC`);
        const ethUsdt = this.state.get(`${v}:ETH/USDT`);
        if (this.isFresh(btcUsdt, now) && this.isFresh(ethBtc, now) && this.isFresh(ethUsdt, now)) {
          for (const o of detectTriangular(v, btcUsdt, ethBtc, ethUsdt, { fees: this.fees, minNetBps: this.minNet }))
            candidates.push(o);
        }
      }
    }

    // 4) Estadística: z-score del spread (registra spread_history + emite señales).
    if (this.dirtyBases.has('BTC')) this.evalStatistical(now, candidates);

    this.dirtyPairs.clear();
    this.dirtyBases.clear();

    if (candidates.length === 0) return;
    // Priorización por valor esperado: rentables primero, luego mayor net_usd.
    candidates.sort((a, b) => (b.profitable ? 1 : 0) - (a.profitable ? 1 : 0) || b.netUsd - a.netUsd);
    const timing: OppTiming = {
      exchangeTs: trig?.exchangeTs ?? 0,
      recvTs: trig?.recvTs ?? now,
      detectedTs: Date.now(),
    };
    for (const o of candidates) this.onOpp(o, timing);
  }

  private evalStatistical(now: number, candidates: DetectedOpportunity[]): void {
    for (const sp of STAT_PAIRS) {
      const a = this.state.get(sp.a);
      const b = this.state.get(sp.b);
      if (!this.isFresh(a, now) || !this.isFresh(b, now)) continue;
      const midA = midPrice(a);
      const midB = midPrice(b);
      if (midA == null || midB == null) continue;

      const key = `${sp.a}|${sp.b}`;
      const stats = this.statState.get(key)!;
      const sig = statSample(stats, sp.labelA, sp.labelB, midA, midB);

      // Persistir spread_history como mucho 1/seg por par (para la gráfica).
      if (now - (this.lastSpreadWrite.get(key) ?? 0) >= 1000) {
        this.lastSpreadWrite.set(key, now);
        this.onSpread({
          pair_a: sp.labelA,
          pair_b: sp.labelB,
          mid_a: midA,
          mid_b: midB,
          spread: sig.spread,
          zscore: sig.z,
          mean: sig.mean,
          stddev: sig.std,
        });
      }

      // Señal de entrada: comprar el barato, vender el caro.
      if (sig.action === 'enter_short_a' || sig.action === 'enter_long_a') {
        const buyBook = sig.action === 'enter_short_a' ? b : a;
        const sellBook = sig.action === 'enter_short_a' ? a : b;
        const fx = fxFor(sellBook.quote, buyBook.quote);
        const r =
          // reutiliza el motor neto; depeg solo si cruzan quotes
          detectStatExec(buyBook, sellBook, this.fees, this.minNet, fx, buyBook.quote !== sellBook.quote ? CONFIG.depegBps : 0);
        if (r && r.maxExecBase > 0)
          candidates.push({ ...r, pair: `${sp.labelA} ↔ ${sp.labelB} (z=${sig.z.toFixed(2)})` });
      }
    }
  }
}

// Construye una oportunidad 'statistical' reutilizando el cálculo neto de spatial/cross-quote.
function detectStatExec(
  buyBook: OrderBook,
  sellBook: OrderBook,
  fees: FeeTable,
  minNetBps: number,
  fx: number,
  depegBps: number,
): DetectedOpportunity | null {
  const r = computeNetProfit(
    {
      buyBook,
      sellBook,
      fees,
      targetBase: CONFIG.maxBtcPerTrade,
      slippageBps: CONFIG.slippageBps,
      withdrawalAmortizeTrades: CONFIG.withdrawalAmortizeTrades,
      fxBuyToSell: fx,
      depegBps,
    },
    minNetBps,
  );
  if (r.execBase <= 0) return null;
  return {
    strategy: 'statistical',
    buyVenue: buyBook.venue,
    sellVenue: sellBook.venue,
    buyQuote: buyBook.quote,
    sellQuote: sellBook.quote,
    pair: '',
    grossSpreadBps: r.grossSpreadBps,
    netSpreadBps: r.netSpreadBps,
    grossUsd: r.grossUsd,
    netUsd: r.netUsd,
    maxExecBase: r.execBase,
    profitable: r.profitable,
    exec: r,
  };
}
