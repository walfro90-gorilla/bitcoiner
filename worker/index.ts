// worker/index.ts — Boot + orquestación del worker (detección -> riesgo -> ejecución -> persistencia).
import { CONFIG, HAS_SUPABASE } from './config';
import { Engine, type OppTiming } from './engine';
import { Feed } from './feeds/base';
import { createBinanceFeed } from './feeds/binance';
import { createOkxFeed } from './feeds/okx';
import { createKrakenFeed } from './feeds/kraken';
import { createBitsoFeed } from './feeds/bitso';
import { createBitstampFeed } from './feeds/bitstamp';
import { simulate } from './executor';
import { computeNetProfit } from './core';
import { startNewsPoller } from './news';
import { RiskManager, type BotRuntimeState } from './risk';
import { Writer } from './writer';
import { Ledger } from './state';
import {
  loadBotState,
  loadExchangeEnabled,
  loadExchanges,
  loadFees,
  loadRuntimeConfig,
  loadStrategyConfig,
  loadWallets,
} from './supabase';
import { applyRuntime, applyStrategy, effectiveTargetBase, RUNTIME } from './runtimeConfig';
import { Rebalancer } from './rebalancer';
import { bestAsk, bestBid, CandleAggregator, midPrice, type DetectedOpportunity, type FeeTable, type OrderBook, type Venue } from './core';
import { getUsdtMxn, startFx } from './fx';

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
  let currentFees = fees; // referencia mutable para el rebalancer (se recarga en el poll)
  // Parametrización TOTAL (0012): cargar config en caliente desde la DB sobre los defaults de CONFIG.*.
  const rcInit = await loadRuntimeConfig();
  if (rcInit) applyRuntime(rcInit);
  for (const sc of await loadStrategyConfig()) applyStrategy(sc.strategy, sc.patch);
  let exchangeEnabled = await loadExchangeEnabled();
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
  let lastInjectSeq = bs?.inject_seq ?? 0;
  let lastSeenPnl = bs ? +bs.cumulative_pnl_usd : 0; // último P&L que el worker escribió/leyó
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

  function handleOpp(opp: DetectedOpportunity, t: OppTiming, force = false): void {
    const now = Date.now();
    // Gate de exchange deshabilitado (parametrización total): si cualquiera de las dos patas
    // está en un exchange apagado desde la UI, se descarta (salvo el inyector del reto).
    if (!force && (exchangeEnabled.get(opp.buyVenue) === false || exchangeEnabled.get(opp.sellVenue) === false)) {
      persistSeen(opp, t, 'exchange_disabled', false);
      return;
    }
    const wantExecute = force || (runtime.demoMode ? opp.grossSpreadBps > 0 : opp.profitable);

    if (!wantExecute) {
      persistSeen(opp, t, 'below_threshold', false);
      return;
    }
    if (!force && runtime.newsRiskOff) {
      persistSeen(opp, t, 'news_risk_off', opp.profitable);
      return;
    }
    if (!force) {
      const block = risk.blockReason(now);
      if (block) {
        persistSeen(opp, t, block, opp.profitable);
        return;
      }
    }
    // El inyector del ejemplo del reto (force=true) ejecuta sin topes de tamaño, para mostrar
    // el +$109.75 a 1 BTC completo. Las operaciones normales conservan sus caps.
    const sim = simulate(opp, ledger, runtime.maxPositionUsd, effectiveTargetBase(opp.strategy), force);
    if (sim.status === 'rejected') {
      persistSeen(opp, t, sim.rejectReason ?? 'rejected', opp.profitable);
      return;
    }
    risk.recordTrade(now, sim.netPnlUsd);
    lastSeenPnl = runtime.cumulativePnlUsd; // marca el P&L que el worker va a persistir (evita auto-reset en el poll)
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

  // Inyección del escenario del reto (botón del dashboard): reproduce el ejemplo EXACTO del enunciado
  // (comprar Kraken $70,000, vender Binance $70,250, fees 0.1%, 1 BTC) por el MISMO pipeline real
  // (computeNetProfit → simulate → persist), dando +$109.75/BTC como dice el reto.
  //
  // Usa los SUPUESTOS DEL RETO, no los fees reales del trading en vivo: el reto asume 0.1% en ambos
  // lados, sin slippage ni withdrawal. Si usáramos los fees reales (Kraken 40 bps) el ejemplo daría
  // negativo y dejaría de "reproducir el ejemplo". Esto NO afecta la detección real (usa `fees`).
  const SCENARIO_FEES: FeeTable = {
    binance: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
    okx: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
    kraken: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
    bitso: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
    bitstamp: { takerBps: 10, makerBps: 10, withdrawalBtc: 0 },
  };
  function injectScenario(): void {
    const now = Date.now();
    // El ejemplo del reto es DIDÁCTICO: garantiza el inventario necesario para 1 BTC, sin depender
    // del balance real (que fluctúa por el drift del trading). Compra en Kraken (necesita USDT),
    // vende en Binance (necesita BTC). Sembramos lo justo si falta.
    if (ledger.get('kraken', 'USDT') < 71000) ledger.set('kraken', 'USDT', 100000);
    if (ledger.get('binance', 'BTC') < 1) ledger.set('binance', 'BTC', 2);
    // Libros con liquidez >= 1 BTC al precio exacto del reto (top-of-book = precio del enunciado).
    const buyBook: OrderBook = {
      venue: 'kraken', base: 'BTC', quote: 'USDT', pair: 'BTC/USDT',
      bids: [{ price: 69990, size: 10 }], asks: [{ price: 70000, size: 10 }], exchangeTs: 0, recvTs: now,
    };
    const sellBook: OrderBook = {
      venue: 'binance', base: 'BTC', quote: 'USDT', pair: 'BTC/USDT',
      bids: [{ price: 70250, size: 10 }], asks: [{ price: 70260, size: 10 }], exchangeTs: 0, recvTs: now,
    };
    const r = computeNetProfit(
      {
        buyBook, sellBook, fees: SCENARIO_FEES, targetBase: 1, // 1 BTC, como el ejemplo del reto
        slippageBps: 0, includeWithdrawal: false, // supuestos del enunciado (sin slippage ni retiro)
      },
      0, // umbral 0: el ejemplo del reto siempre se ejecuta para mostrar la mecánica
    );
    const opp: DetectedOpportunity = {
      strategy: 'spatial', buyVenue: 'kraken', sellVenue: 'binance', buyQuote: 'USDT', sellQuote: 'USDT',
      pair: 'BTC/USDT (ejemplo del reto)', grossSpreadBps: r.grossSpreadBps, netSpreadBps: r.netSpreadBps,
      grossUsd: r.grossUsd, netUsd: r.netUsd, maxExecBase: r.execBase, profitable: r.profitable, exec: r,
    };
    handleOpp(opp, { exchangeTs: 0, recvTs: now, detectedTs: now }, true);
    console.log(`[inject] escenario del reto reproducido (net=$${r.netUsd.toFixed(2)} por ${r.execBase} BTC)`);
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

  // Premio Bitso MX (Fase 1): feed BTC/MXN + tipo de cambio USDT/MXN.
  const bitsoMxn = createBitsoFeed('BTC/MXN', engine.onBook);
  if (bitsoMxn) {
    bitsoMxn.start();
    feeds.push(bitsoMxn);
  }
  startFx();

  // 5º exchange: Bitstamp BTC/USDT (snapshot-replace), entra directo a la matriz espacial.
  const bitstamp = createBitstampFeed('BTC/USDT', engine.onBook);
  if (bitstamp) {
    bitstamp.start();
    feeds.push(bitstamp);
  }

  // 3) Muestreo de snapshots para replay/backtest (opt-in: solo si SNAPSHOT_SAMPLE_MS > 0).
  if (CONFIG.snapshotSampleMs > 0) {
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
  }

  // 3b) Estado de mercado en vivo: upsert del mejor bid/ask por venue+pair (~cada 1.5s).
  //     Tabla acotada (1 fila por venue+pair) que alimenta la vista de mercado del dashboard.
  //     De paso agrega el mid de binance:BTC/USDT en velas OHLC 1m para el chart institucional.
  const candleAgg = new CandleAggregator(60_000);
  if (HAS_SUPABASE) {
    setInterval(() => {
      const t = Date.now();
      const rows: Record<string, unknown>[] = [];
      for (const b of engine.state.all()) {
        if (t - b.recvTs > CONFIG.staleMs) continue; // no publicar books stale
        const bid = bestBid(b);
        const ask = bestAsk(b);
        const exId = writer.exId(b.venue);
        if (bid == null || ask == null || exId == null) continue;
        const mid = (bid + ask) / 2;
        rows.push({
          exchange_id: exId,
          pair: b.pair,
          base: b.base,
          quote: b.quote,
          bid: round(bid, 8),
          ask: round(ask, 8),
          bid_size: round(b.bids[0]?.size ?? 0, 8),
          ask_size: round(b.asks[0]?.size ?? 0, 8),
          mid: round(mid, 8),
          spread_bps: mid > 0 ? round(((ask - bid) / mid) * 1e4, 4) : 0,
          bids: b.bids.slice(0, 8),
          asks: b.asks.slice(0, 8),
          exchange_ts: b.exchangeTs || null,
          ts: new Date(t).toISOString(),
        });
      }
      if (rows.length) void writer.upsertMarketTicks(rows);

      // Vela OHLC 1m del mid de binance:BTC/USDT (upsert de la vela en formación).
      const ref = engine.state.get('binance:BTC/USDT');
      const refMid = ref && t - ref.recvTs <= CONFIG.staleMs ? midPrice(ref) : null;
      if (refMid && refMid > 0) {
        candleAgg.add(refMid, t);
        const cur = candleAgg.current();
        if (cur)
          void writer.upsertCandle({
            pair: 'BTC/USDT',
            t: new Date(cur.t * 1000).toISOString(),
            o: cur.o,
            h: cur.h,
            l: cur.l,
            c: cur.c,
            updated_at: new Date(t).toISOString(),
          });
      }
    }, 1500);
  }

  // 4) Poll de bot_state (kill switch + umbral desde el dashboard).
  if (HAS_SUPABASE) {
    let polling = false;
    setInterval(async () => {
      if (polling) return; // guard de reentrancia: no solapar polls si la red a Supabase se pone lenta
      polling = true;
      try {
      const s = await loadBotState();
      if (!s) return;
      runtime.tradingEnabled = s.trading_enabled;
      runtime.demoMode = s.demo_mode;
      runtime.minNetBps = +s.min_net_bps;
      runtime.maxPositionUsd = +s.max_position_usd;
      engine.setMinNetBps(runtime.minNetBps);
      // Parametrización TOTAL: recargar config en caliente (runtime/estrategias/fees/exchanges) sin reiniciar.
      const rc = await loadRuntimeConfig();
      if (rc) applyRuntime(rc);
      for (const sc of await loadStrategyConfig()) applyStrategy(sc.strategy, sc.patch);
      exchangeEnabled = await loadExchangeEnabled();
      currentFees = await loadFees(exMap);
      engine.setFees(currentFees);
      // Inyección de escenario solicitada desde el dashboard.
      if (typeof s.inject_seq === 'number' && s.inject_seq > lastInjectSeq) {
        lastInjectSeq = s.inject_seq;
        injectScenario();
      }
      // Reset externo (panel admin): la DB cambió a 0 PERO no fue por el último escrito del worker.
      // Comparamos contra lastSeenPnl (lo último que el worker dejó en la DB) para no pisar un
      // P&L recién generado por un trade. Solo adoptamos el reset si el cambio vino de afuera.
      const dbPnl = +s.cumulative_pnl_usd;
      if (dbPnl === 0 && runtime.cumulativePnlUsd !== 0 && lastSeenPnl !== runtime.cumulativePnlUsd) {
        runtime.cumulativePnlUsd = 0;
        runtime.consecutiveLosses = 0;
        lastSeenPnl = 0;
        console.log('[reset] P&L reiniciado desde el panel admin');
      }
      } finally {
        polling = false;
      }
    }, 2500);
  }

  // 4b) Poller de noticias -> régimen de riesgo (fuera del hot-path).
  const news = startNewsPoller((r) => {
    runtime.newsRiskOff = r.riskOff;
    runtime.newsSentiment = r.sentiment;
    runtime.newsImpact = r.impact;
    if (r.riskOff) console.log('[risk] NEWS RISK-OFF activo: ejecuciones en pausa por noticias.');
  });

  // 4c) Rebalanceo inteligente automatizado (fuera del hot-path; solo actúa si rebalance_auto ON).
  const rebalancer = new Rebalancer(
    ledger,
    () => {
      const b = engine.state.get('binance:BTC/USDT');
      return b ? midPrice(b) ?? 0 : 0;
    },
    () => currentFees,
    () => ({
      auto: RUNTIME.rebalanceAuto,
      minOperatingUsd: RUNTIME.rebalanceMinOperatingUsd,
      runwayTrades: RUNTIME.rebalanceRunwayTrades,
      maxPositionUsd: runtime.maxPositionUsd,
      minTransferUsd: RUNTIME.rebalanceMinTransferUsd,
      maxTransferUsd: RUNTIME.rebalanceMaxTransferUsd,
    }),
    writer,
  );
  rebalancer.start();

  // 5) Heartbeat de consola.
  setInterval(() => {
    const books = engine.state.all();
    if (!books.length) return console.log('--- esperando datos de mercado... ---');
    const lines = books.map(
      (b) => `  ${b.venue}:${b.pair}  bid=${bestBid(b)?.toFixed(2)}  ask=${bestAsk(b)?.toFixed(2)}`,
    );
    const fx = getUsdtMxn();
    const bMxn = engine.state.get('bitso:BTC/MXN');
    const bUsdt = engine.state.get('binance:BTC/USDT');
    let premio = '';
    if (fx > 0 && bMxn && bUsdt) {
      const bitsoUsd = (midPrice(bMxn) ?? 0) / fx;
      const globalUsd = midPrice(bUsdt) ?? 0;
      const bps = globalUsd > 0 ? (bitsoUsd / globalUsd - 1) * 1e4 : 0;
      premio = `\n  [PREMIO BITSO] usdtMxn=${fx.toFixed(3)} bitsoUSD=${bitsoUsd.toFixed(0)} globalUSD=${globalUsd.toFixed(0)} premio=${bps.toFixed(1)}bps`;
    }
    console.log(
      `--- @ ${new Date().toISOString()} | pnlAcum=$${runtime.cumulativePnlUsd.toFixed(2)} trading=${runtime.tradingEnabled} rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB ---\n${lines.join('\n')}${premio}`,
    );
  }, 5000);

  process.on('SIGINT', () => {
    console.log('\nDeteniendo...');
    feeds.forEach((f) => f.stop());
    writer.stop();
    news.stop();
    rebalancer.stop();
    process.exit(0);
  });

  console.log(
    `Bitcoiner worker iniciado | db=${HAS_SUPABASE} venues=${CONFIG.venues.join(',')} ` +
      `pairs=${CONFIG.pairs.join(',')} minNetBps=${runtime.minNetBps} demo=${runtime.demoMode} ` +
      `pnlAcum=$${runtime.cumulativePnlUsd.toFixed(2)}`,
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
