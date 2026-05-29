// worker/index.ts — Boot + orquestación del worker (detección -> riesgo -> ejecución -> persistencia).
import { CONFIG, HAS_SUPABASE } from './config';
import { Engine, type OppTiming } from './engine';
import { Feed } from './feeds/base';
import { createBinanceFeed } from './feeds/binance';
import { createOkxFeed } from './feeds/okx';
import { createKrakenFeed } from './feeds/kraken';
import { createBitsoFeed } from './feeds/bitso';
import { simulate } from './executor';
import { startNewsPoller } from './news';
import { RiskManager, type BotRuntimeState } from './risk';
import { Writer } from './writer';
import { Ledger } from './state';
import { loadBotState, loadExchanges, loadFees, loadWallets } from './supabase';
import { bestAsk, bestBid, type DetectedOpportunity, type OrderBook, type Venue } from './core';

type FeedBuilder = (pair: string, onBook: (b: OrderBook) => void) => Feed | null;
const BUILDERS: Record<string, FeedBuilder> = {
  binance: createBinanceFeed,
  okx: createOkxFeed,
  kraken: createKrakenFeed,
  bitso: createBitsoFeed,
};

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function main(): Promise<void> {
  // 1) Cargar configuración desde la DB (o defaults si no hay Supabase).
  const exMap = await loadExchanges();
  const fees = await loadFees(exMap);
  const ledger = new Ledger();
  await loadWallets(exMap, ledger);
  if (ledger.snapshot().length === 0) {
    // Sin DB: sembrar balances para poder simular ejecuciones localmente.
    for (const v of CONFIG.venues as Venue[]) {
      ledger.set(v, 'USDT', 100000);
      ledger.set(v, 'USD', 100000);
      ledger.set(v, 'BTC', 1);
    }
  }
  const bs = await loadBotState();
  const runtime: BotRuntimeState = {
    tradingEnabled: bs?.trading_enabled ?? true,
    demoMode: bs?.demo_mode ?? CONFIG.demoMode,
    minNetBps: bs ? +bs.min_net_bps : CONFIG.minNetBps,
    maxPositionUsd: bs ? +bs.max_position_usd : CONFIG.maxPositionUsd,
    cumulativePnlUsd: bs ? +bs.cumulative_pnl_usd : 0,
    consecutiveLosses: bs?.consecutive_losses ?? 0,
    newsRiskOff: false,
    newsSentiment: 0,
    newsImpact: 'low',
  };

  const risk = new RiskManager(runtime);
  const writer = new Writer(exMap);
  writer.start();

  const seenThrottle = new Map<string, number>();
  const SEEN_MS = 5000; // registra como mucho 1 oportunidad "vista" por ruta cada 5s (evita saturar la DB)

  function buildOppRow(opp: DetectedOpportunity, t: OppTiming, executed: boolean, skip: string | null) {
    return {
      strategy: opp.strategy,
      buy_exchange_id: writer.exId(opp.buyVenue),
      sell_exchange_id: writer.exId(opp.sellVenue),
      pair: opp.pair,
      gross_spread_bps: round(opp.grossSpreadBps, 3),
      net_spread_bps: round(opp.netSpreadBps, 3),
      gross_usd: round(opp.grossUsd, 8),
      net_usd: round(opp.netUsd, 8),
      max_exec_base: round(opp.maxExecBase, 8),
      profitable: opp.profitable,
      executed,
      skip_reason: skip,
      feed_lag_ms: t.exchangeTs ? Math.max(0, t.recvTs - t.exchangeTs) : null,
      detection_latency_ms: Math.max(0, t.detectedTs - t.recvTs),
    };
  }

  function persistSeen(opp: DetectedOpportunity, t: OppTiming, reason: string, force: boolean): void {
    const key = `${opp.strategy}:${opp.buyVenue}:${opp.sellVenue}`;
    const now = Date.now();
    if (!force && now - (seenThrottle.get(key) ?? 0) < SEEN_MS) return;
    seenThrottle.set(key, now);
    writer.queueOpportunity(buildOppRow(opp, t, false, reason));
  }

  function handleOpp(opp: DetectedOpportunity, t: OppTiming): void {
    const now = Date.now();
    const wantExecute = runtime.demoMode ? opp.grossSpreadBps > 0 : opp.profitable;

    if (!wantExecute) {
      persistSeen(opp, t, 'below_threshold', false);
      return;
    }
    if (runtime.newsRiskOff) {
      persistSeen(opp, t, 'news_risk_off', opp.profitable);
      return;
    }
    const block = risk.blockReason(now);
    if (block) {
      persistSeen(opp, t, block, opp.profitable);
      return;
    }
    const sim = simulate(opp, ledger);
    if (sim.status === 'rejected') {
      persistSeen(opp, t, sim.rejectReason ?? 'rejected', opp.profitable);
      return;
    }
    risk.recordTrade(now, sim.netPnlUsd);
    const tradeRowBase = {
      executed_at: new Date().toISOString(),
      pair: opp.pair,
      base_volume: round(sim.finalBase, 8),
      vwap_buy: round(sim.vwapBuy, 8),
      vwap_sell: round(sim.vwapSell, 8),
      buy_fee_usd: round(sim.buyFeeUsd, 8),
      sell_fee_usd: round(sim.sellFeeUsd, 8),
      withdrawal_fee_usd: round(sim.withdrawalFeeUsd, 8),
      net_pnl_usd: round(sim.netPnlUsd, 8),
      execution_time_ms: Math.max(0, Date.now() - t.detectedTs),
      partial: sim.partial,
      status: sim.status,
      legs: sim.legs,
    };
    void writer.persistExecution({
      oppRow: buildOppRow(opp, t, true, null),
      tradeRowBase,
      walletSnapshot: ledger.snapshot(),
      botState: runtime,
    });
    console.log(
      `[EXEC ${opp.strategy}] ${opp.buyVenue}->${opp.sellVenue} ${opp.pair} ` +
        `base=${sim.finalBase.toFixed(5)} netPnl=$${sim.netPnlUsd.toFixed(2)} ` +
        `${sim.partial ? '(parcial)' : ''} pnlAcum=$${runtime.cumulativePnlUsd.toFixed(2)}`,
    );
  }

  const engine = new Engine(handleOpp, (s) =>
    writer.queueSpread({
      pair_a: s.pair_a,
      pair_b: s.pair_b,
      mid_a: s.mid_a,
      mid_b: s.mid_b,
      spread: s.spread,
      zscore: s.zscore,
      mean: s.mean,
      stddev: s.stddev,
    }),
  );
  engine.setFees(fees);
  engine.setMinNetBps(runtime.minNetBps);

  // 2) Feeds.
  const feeds: Feed[] = [];
  for (const pair of CONFIG.pairs)
    for (const venue of CONFIG.venues) {
      const build = BUILDERS[venue];
      const feed = build ? build(pair, engine.onBook) : null;
      if (feed) {
        feed.start();
        feeds.push(feed);
      }
    }

  // Feeds extra para arbitraje triangular (ETH) en venues que lo soportan.
  for (const pair of ['ETH/USDT', 'ETH/BTC'])
    for (const venue of ['binance', 'okx']) {
      const build = BUILDERS[venue];
      const feed = build ? build(pair, engine.onBook) : null;
      if (feed) {
        feed.start();
        feeds.push(feed);
      }
    }

  // 3) Muestreo de snapshots para replay/backtest.
  setInterval(() => {
    for (const b of engine.state.all())
      writer.queueSnapshot({
        exchange_id: writer.exId(b.venue),
        pair: b.pair,
        bids: b.bids.slice(0, 10),
        asks: b.asks.slice(0, 10),
        exchange_ts: b.exchangeTs || null,
      });
  }, CONFIG.snapshotSampleMs);

  // 4) Poll de bot_state (kill switch + umbral desde el dashboard).
  if (HAS_SUPABASE) {
    setInterval(async () => {
      const s = await loadBotState();
      if (!s) return;
      runtime.tradingEnabled = s.trading_enabled;
      runtime.demoMode = s.demo_mode;
      runtime.minNetBps = +s.min_net_bps;
      runtime.maxPositionUsd = +s.max_position_usd;
      engine.setMinNetBps(runtime.minNetBps);
      // Si el panel admin reinició el P&L (DB=0) pero el worker tiene un valor en memoria, adoptar el reset.
      if (+s.cumulative_pnl_usd === 0 && runtime.cumulativePnlUsd !== 0) {
        runtime.cumulativePnlUsd = 0;
        runtime.consecutiveLosses = 0;
        console.log('[reset] P&L reiniciado desde el panel admin');
      }
    }, 2500);
  }

  // 4b) Poller de noticias -> régimen de riesgo (fuera del hot-path).
  const newsTimer = startNewsPoller((r) => {
    runtime.newsRiskOff = r.riskOff;
    runtime.newsSentiment = r.sentiment;
    runtime.newsImpact = r.impact;
    if (r.riskOff) console.log('[risk] NEWS RISK-OFF activo: ejecuciones en pausa por noticias.');
  });

  // 5) Heartbeat de consola.
  setInterval(() => {
    const books = engine.state.all();
    if (!books.length) return console.log('--- esperando datos de mercado... ---');
    const lines = books.map(
      (b) => `  ${b.venue}:${b.pair}  bid=${bestBid(b)?.toFixed(2)}  ask=${bestAsk(b)?.toFixed(2)}`,
    );
    console.log(
      `--- @ ${new Date().toISOString()} | pnlAcum=$${runtime.cumulativePnlUsd.toFixed(2)} trading=${runtime.tradingEnabled} ---\n${lines.join('\n')}`,
    );
  }, 5000);

  process.on('SIGINT', () => {
    console.log('\nDeteniendo...');
    feeds.forEach((f) => f.stop());
    writer.stop();
    clearInterval(newsTimer);
    process.exit(0);
  });

  console.log(
    `Clawbot worker iniciado | db=${HAS_SUPABASE} venues=${CONFIG.venues.join(',')} ` +
      `pairs=${CONFIG.pairs.join(',')} minNetBps=${runtime.minNetBps} demo=${runtime.demoMode} ` +
      `pnlAcum=$${runtime.cumulativePnlUsd.toFixed(2)}`,
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
