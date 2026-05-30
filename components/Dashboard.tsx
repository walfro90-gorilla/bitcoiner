'use client';
import { useBotState, useCounts, useOpportunities } from '@/lib/hooks';
import { fmtUsd, n } from '@/lib/format';
import { Stat } from './ui';
import { Controls } from './Controls';
import { PnlChart } from './PnlChart';
import { SpreadChart } from './SpreadChart';
import { PremiumPanel } from './PremiumPanel';
import { OpportunitiesTable } from './OpportunitiesTable';
import { TradesTable } from './TradesTable';
import { WalletsPanel } from './WalletsPanel';
import { NewsPanel } from './NewsPanel';
import { Copilot } from './Copilot';
import { MarketView } from './MarketView';
import { LatencyPanel } from './LatencyPanel';
import { BestOpportunity } from './BestOpportunity';
import { StrategyBreakdown } from './StrategyBreakdown';
import { DepthLadder } from './DepthLadder';
import { ExampleAnatomy } from './ExampleAnatomy';

export function Dashboard() {
  const { botState } = useBotState();
  const counts = useCounts();
  const { opportunities } = useOpportunities(60);

  const pnl = n(botState?.cumulative_pnl_usd);
  const avgLat = opportunities.length
    ? Math.round(opportunities.reduce((s, o) => s + n(o.detection_latency_ms), 0) / opportunities.length)
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🦅</div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Clawbot <span className="text-accent">·</span> Arbitraje BTC
            </h1>
            <p className="text-xs text-muted">Detección multi-exchange en tiempo real · simulación · P&amp;L</p>
          </div>
        </div>
        <Controls />
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="P&L acumulado" value={fmtUsd(pnl)} tone={pnl >= 0 ? 'up' : 'down'} sub="neto simulado" />
        <Stat label="Operaciones" value={counts.trades} sub={`${counts.executed} oportunidades ejecutadas`} />
        <Stat label="Oportunidades vistas" value={counts.opportunities} sub="ejecutadas o no" />
        <Stat label="Latencia detección" value={avgLat > 0 ? `${avgLat} ms` : '<1 ms'} tone="accent" sub="procesamiento por evento" />
      </div>

      <div className="mt-3">
        <MarketView />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DepthLadder />
        <ExampleAnatomy />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LatencyPanel />
        <BestOpportunity />
      </div>

      <div className="mt-3">
        <PremiumPanel />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PnlChart />
        <SpreadChart />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpportunitiesTable />
        <TradesTable />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StrategyBreakdown />
        <WalletsPanel />
      </div>

      <div className="mt-3">
        <NewsPanel />
      </div>

      <footer className="mt-8 text-center text-xs text-muted">
        Clawbot — Coding Challenge México · datos de mercado en vivo (Binance · OKX · Kraken · Bitso)
      </footer>

      <Copilot />
    </div>
  );
}
