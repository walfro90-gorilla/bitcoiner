// lib/core/strategies/triangular.ts — Arbitraje triangular intra-exchange (sin withdrawal).
// Ciclo USDT -> BTC -> ETH -> USDT (y el inverso) en un mismo venue.
import type { FeeTable, OrderBook, Venue } from '../types';
import { bestAsk, bestBid } from '../orderbook';
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

/**
 * Evalúa ambos ciclos triangulares con los tres books del MISMO venue.
 * Usa top-of-book (best ask/bid). Devuelve solo ciclos con edge razonable.
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
  const askBtc = bestAsk(btcUsdt);
  const askEth = bestAsk(ethBtc);
  const bidEthU = bestBid(ethUsdt);
  if (askBtc && askEth && bidEthU) {
    const btc = (1 / askBtc) * (1 - f);
    const eth = (btc / askEth) * (1 - f);
    const end = eth * bidEthU * (1 - f);
    out.push(
      mk(
        venue,
        'USDT->BTC->ETH->USDT',
        [
          { pair: btcUsdt.pair, side: 'buy', price: askBtc },
          { pair: ethBtc.pair, side: 'buy', price: askEth },
          { pair: ethUsdt.pair, side: 'sell', price: bidEthU },
        ],
        notional,
        end,
        p.minNetBps,
      ),
    );
  }

  // Reverse: USDT -> ETH -> BTC -> USDT
  const askEthU = bestAsk(ethUsdt);
  const bidEthB = bestBid(ethBtc);
  const bidBtc = bestBid(btcUsdt);
  if (askEthU && bidEthB && bidBtc) {
    const eth = (1 / askEthU) * (1 - f);
    const btc = eth * bidEthB * (1 - f);
    const end = btc * bidBtc * (1 - f);
    out.push(
      mk(
        venue,
        'USDT->ETH->BTC->USDT',
        [
          { pair: ethUsdt.pair, side: 'buy', price: askEthU },
          { pair: ethBtc.pair, side: 'sell', price: bidEthB },
          { pair: btcUsdt.pair, side: 'sell', price: bidBtc },
        ],
        notional,
        end,
        p.minNetBps,
      ),
    );
  }

  // Descarta ruido extremo (datos cruzados/incompletos)
  return out.filter((o) => o.netSpreadBps > -50);
}
