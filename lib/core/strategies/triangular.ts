// lib/core/strategies/triangular.ts — Arbitraje triangular intra-exchange (sin withdrawal).
// Ciclo USDT -> BTC -> ETH -> USDT (y el inverso) en un mismo venue.
import type { FeeTable, Level, OrderBook, Venue } from '../types';
import { takerFee } from '../fees';
import type { DetectedOpportunity, TriangularDetail, TriangularLeg } from './common';

export interface TriangularParams {
  fees: FeeTable;
  minNetBps: number;
  notionalUsd?: number; // tamaño nominal del ciclo en USDT (default 1000)
}

function mk(
  venue: Venue,
  cycle: string,
  legs: TriangularLeg[],
  notional: number,
  endPerUnit: number,
  minNetBps: number,
): DetectedOpportunity {
  const edgeBps = (endPerUnit - 1) * 1e4; // fees ya incluidos en endPerUnit
  const netUsd = notional * (endPerUnit - 1);
  const tri: TriangularDetail = {
    venue,
    cycle,
    legs,
    startQuote: notional,
    endQuote: notional * endPerUnit,
    execNotionalUsd: notional,
  };
  return {
    strategy: 'triangular',
    buyVenue: venue,
    sellVenue: venue,
    buyQuote: 'USDT',
    sellQuote: 'USDT',
    pair: cycle,
    grossSpreadBps: edgeBps,
    netSpreadBps: edgeBps,
    grossUsd: netUsd,
    netUsd,
    maxExecBase: 0,
    profitable: edgeBps >= minNetBps,
    triangular: tri,
  };
}

// Camina los ASKS gastando `quoteIn` de quote → base recibida (fee sobre lo recibido). VWAP depth-aware.
function buyWalk(asks: Level[], quoteIn: number, fee: number): { out: number; spent: number; vwap: number } {
  let remaining = quoteIn;
  let base = 0;
  let spent = 0;
  for (const lvl of asks) {
    if (remaining <= 1e-9) break;
    const levelQuote = lvl.price * lvl.size;
    const use = Math.min(remaining, levelQuote);
    base += use / lvl.price;
    spent += use;
    remaining -= use;
  }
  return { out: base * (1 - fee), spent, vwap: base > 0 ? spent / base : 0 };
}

// Camina los BIDS vendiendo `baseIn` de base → quote recibido (fee sobre lo recibido). VWAP depth-aware.
function sellWalk(bids: Level[], baseIn: number, fee: number): { out: number; vwap: number } {
  let remaining = baseIn;
  let quote = 0;
  let sold = 0;
  for (const lvl of bids) {
    if (remaining <= 1e-12) break;
    const take = Math.min(remaining, lvl.size);
    quote += take * lvl.price;
    sold += take;
    remaining -= take;
  }
  return { out: quote * (1 - fee), vwap: sold > 0 ? quote / sold : 0 };
}

/**
 * Evalúa ambos ciclos triangulares con los tres books del MISMO venue.
 * DEPTH-AWARE: camina cada pata por VWAP para el notional (antes usaba top-of-book) → el edge ya
 * refleja el impacto de liquidez, igual que las otras estrategias. El denominador es lo realmente
 * gastado (`spent`), así que en libros delgados el edge baja en vez de inflarse. Mantiene
 * `maxExecBase = 0` (la ejecución triangular intra-venue no cambia). Solo ciclos con edge razonable.
 */
export function detectTriangular(
  venue: Venue,
  btcUsdt: OrderBook,
  ethBtc: OrderBook,
  ethUsdt: OrderBook,
  p: TriangularParams,
): DetectedOpportunity[] {
  const f = takerFee(p.fees, venue);
  const notional = p.notionalUsd ?? 1000;
  const out: DetectedOpportunity[] = [];

  // Forward: USDT -> BTC -> ETH -> USDT
  {
    const l1 = buyWalk(btcUsdt.asks, notional, f); // USDT -> BTC
    const l2 = buyWalk(ethBtc.asks, l1.out, f); // BTC -> ETH
    const l3 = sellWalk(ethUsdt.bids, l2.out, f); // ETH -> USDT
    if (l1.spent > 0 && l1.vwap > 0 && l2.vwap > 0 && l3.vwap > 0) {
      out.push(
        mk(
          venue,
          'USDT->BTC->ETH->USDT',
          [
            { pair: btcUsdt.pair, side: 'buy', price: l1.vwap },
            { pair: ethBtc.pair, side: 'buy', price: l2.vwap },
            { pair: ethUsdt.pair, side: 'sell', price: l3.vwap },
          ],
          l1.spent,
          l3.out / l1.spent,
          p.minNetBps,
        ),
      );
    }
  }

  // Reverse: USDT -> ETH -> BTC -> USDT
  {
    const l1 = buyWalk(ethUsdt.asks, notional, f); // USDT -> ETH
    const l2 = sellWalk(ethBtc.bids, l1.out, f); // ETH -> BTC
    const l3 = sellWalk(btcUsdt.bids, l2.out, f); // BTC -> USDT
    if (l1.spent > 0 && l1.vwap > 0 && l2.vwap > 0 && l3.vwap > 0) {
      out.push(
        mk(
          venue,
          'USDT->ETH->BTC->USDT',
          [
            { pair: ethUsdt.pair, side: 'buy', price: l1.vwap },
            { pair: ethBtc.pair, side: 'sell', price: l2.vwap },
            { pair: btcUsdt.pair, side: 'sell', price: l3.vwap },
          ],
          l1.spent,
          l3.out / l1.spent,
          p.minNetBps,
        ),
      );
    }
  }

  // Descarta ruido extremo (datos cruzados/incompletos)
  return out.filter((o) => o.netSpreadBps > -50);
}
