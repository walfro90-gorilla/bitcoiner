'use client';
import { useBotState, useCounts, useOpportunities } from '@/lib/hooks';
import { fmtUsd, n } from '@/lib/format';
import { Section, Stat } from './ui';
import { StatusHero } from './StatusHero';
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
import { RejectionAnalysis } from './RejectionAnalysis';
import { MakerTakerCompare } from './MakerTakerCompare';
import { BacktestPanel } from './BacktestPanel';
import { MarkovPanel } from './MarkovPanel';

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

      {/* Resumen: lo primero que ve cualquiera — estado en lenguaje humano + KPIs grandes */}
      <StatusHero />

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="P&L acumulado"
          value={fmtUsd(pnl)}
          tone={pnl >= 0 ? 'up' : 'down'}
          sub="neto simulado"
          info="Ganancia o pérdida neta total (ya con comisiones) de todas las operaciones simuladas hasta ahora."
        />
        <Stat
          label="Operaciones"
          value={counts.trades}
          sub={`${counts.executed} oportunidades ejecutadas`}
          info="Número de operaciones que el bot ejecutó: oportunidades rentables que sí aprovechó."
        />
        <Stat
          label="Oportunidades vistas"
          value={counts.opportunities}
          sub="ejecutadas o no"
          info="Cuántas diferencias de precio detectó el bot, se ejecutaran o no. Demuestra que vigila el mercado constantemente."
        />
        <Stat
          label="Latencia detección"
          value={avgLat > 0 ? `${avgLat} ms` : '<1 ms'}
          tone="accent"
          sub="procesamiento por evento"
          info="Tiempo promedio para procesar cada cambio de precio. Más bajo = más rápido (típico menos de 1 ms)."
        />
      </div>

      {/* 1 · Mercado en vivo */}
      <Section n={1} title="Mercado en vivo" desc="Precios de los 5 exchanges y dónde podría haber arbitraje">
        <MarketView />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DepthLadder />
          <ExampleAnatomy />
        </div>
      </Section>

      {/* 2 · Ejecución y P&L (lo más importante para el jurado, arriba) */}
      <Section n={2} title="Ejecución y P&amp;L" desc="Qué ejecutó el bot, cuánto ganó y por qué descartó el resto">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PnlChart />
          <BestOpportunity />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <OpportunitiesTable />
          <TradesTable />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RejectionAnalysis />
          <StrategyBreakdown />
        </div>
      </Section>

      {/* 3 · Análisis (capa analítica sobre datos reales) */}
      <Section n={3} title="Análisis" desc="Modelos y comparativas: maker/taker, backtest, régimen y velocidad">
        <MakerTakerCompare />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PremiumPanel />
          <BacktestPanel />
        </div>
        <div className="mt-3">
          <MarkovPanel />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <LatencyPanel />
          <SpreadChart />
        </div>
      </Section>

      {/* 4 · Inteligencia y saldos */}
      <Section n={4} title="Inteligencia y saldos" desc="Noticias con IA que ajustan el riesgo, y las wallets simuladas">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NewsPanel />
          <WalletsPanel />
        </div>
      </Section>

      <footer className="mt-8 pb-4 text-center text-xs text-muted">
        Clawbot — Coding Challenge México · datos de mercado en vivo (Binance · OKX · Kraken · Bitso · Bitstamp)
      </footer>

      <Copilot />
    </div>
  );
}
