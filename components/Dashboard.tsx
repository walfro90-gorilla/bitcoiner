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
import { MarketReplay } from './MarketReplay';
import { MarkovPanel } from './MarkovPanel';
import { ConfigCenter } from './config/ConfigCenter';
import { CandleChart } from './CandleChart';
import { InventoryPanel } from './InventoryPanel';
import { LiveOrdersPanel } from './LiveOrdersPanel';
import { SectionNav } from './SectionNav';

export function Dashboard() {
  const { botState } = useBotState();
  const counts = useCounts();
  const { opportunities } = useOpportunities(60);

  const pnl = n(botState?.cumulative_pnl_usd);
  const demo = botState?.demo_mode ?? false;
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
              Bitcoiner <span className="text-accent">·</span> Arbitraje BTC
            </h1>
            <p className="text-xs text-muted">Detección multi-exchange en tiempo real · simulación · P&amp;L</p>
          </div>
        </div>
        <Controls />
      </header>

      {/* Resumen: lo primero que ve cualquiera — estado en lenguaje humano + KPIs grandes */}
      <div id="tour-resumen">
        <StatusHero />
      </div>

      <div id="tour-kpis" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="P&L acumulado"
          value={fmtUsd(pnl)}
          tone={pnl >= 0 ? 'up' : 'down'}
          sub={demo ? 'DEMO: ejecuta todo (mecánica)' : 'neto simulado · solo rentables'}
          info={
            demo
              ? 'En DEMO el bot ejecuta CADA divergencia (aunque pierda contra fees) para mostrar la mecánica completa: por eso el P&L puede ser negativo. En modo Real solo ejecuta lo rentable tras costos — ahí la disciplina deja el P&L plano o positivo.'
              : 'Ganancia o pérdida neta total (ya con comisiones) de todas las operaciones simuladas hasta ahora.'
          }
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

      {/* Índice de secciones pegajoso — navega la página sin ocultar nada (ideal para el jurado) */}
      <SectionNav />

      {/* 1 · Mercado en vivo */}
      <Section id="tour-mercado" n={1} title="Mercado en vivo" desc="Precios de los 7 exchanges y dónde podría haber arbitraje">
        <div className="mb-3">
          <CandleChart />
        </div>
        <MarketView />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DepthLadder />
          <ExampleAnatomy />
        </div>
      </Section>

      {/* 2 · Ejecución y P&L (lo más importante para el jurado, arriba) */}
      <Section id="tour-ejecucion" n={2} title="Ejecución y P&amp;L" desc="Qué ejecutó el bot, cuánto ganó y por qué descartó el resto">
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
        <div className="mt-3">
          <LiveOrdersPanel />
        </div>
      </Section>

      {/* 3 · Configuración — parametrización TOTAL en vivo (diferenciador #1 del reto) */}
      <Section id="tour-config" n={3} title="Configuración" desc="Ajusta TODO en vivo: costos, tamaños, breakers, estrategias y exchanges — el worker lo adopta en ~2.5s">
        <ConfigCenter />
      </Section>

      {/* 4 · Análisis (capa analítica sobre datos reales) */}
      <Section id="tour-analisis" n={4} title="Análisis" desc="Modelos y comparativas: maker/taker, backtest, régimen y velocidad">
        <MakerTakerCompare />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PremiumPanel />
          <BacktestPanel />
        </div>
        <div className="mt-3">
          <MarketReplay />
        </div>
        <div className="mt-3">
          <MarkovPanel />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <LatencyPanel />
          <SpreadChart />
        </div>
      </Section>

      {/* 5 · Inteligencia y saldos */}
      <Section id="tour-inteligencia" n={5} title="Inteligencia y saldos" desc="Noticias con IA que ajustan el riesgo, rebalanceo de inventario y wallets">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NewsPanel />
          <InventoryPanel />
        </div>
        <div className="mt-3">
          <WalletsPanel />
        </div>
      </Section>

      <footer className="mt-8 pb-6 text-center">
        <p className="text-xs text-muted">
          Bitcoiner — Coding Challenge México · datos de mercado en vivo (Binance · OKX · Kraken · Bitso · Bitstamp · Coinbase · Bybit)
        </p>

        {/* Marca de la casa — GorillaLabs 🦍 */}
        <a
          href="https://www.gorillabs.dev/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Desarrollado por Laboratorios Gorila — visita gorillabs.dev"
          className="group mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card2/60 px-4 py-1.5 text-xs text-muted shadow-(--shadow-card) transition-ui hover:border-accent/50 hover:bg-accent/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="text-sm transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110">🦍</span>
          <span>
            Desarrollado por{' '}
            <span className="font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent">
              Laboratorios Gorila
            </span>
          </span>
          <span aria-hidden className="text-accent transition-transform duration-200 group-hover:translate-x-0.5">↗</span>
        </a>
      </footer>

      <Copilot />
    </div>
  );
}
