'use client';
// StatusHero — Resumen en lenguaje humano: "qué estoy viendo y cómo va", para que CUALQUIERA lo entienda.
import { useBotState, useCounts } from '@/lib/hooks';
import { n } from '@/lib/format';
import { Card } from './ui';

export function StatusHero() {
  const { botState } = useBotState();
  const counts = useCounts();
  const trading = botState?.trading_enabled ?? true;
  const demo = botState?.demo_mode ?? false;
  const opps = counts.opportunities;
  const trades = counts.trades;

  // Frase de estado en lenguaje natural según el modo y la actividad.
  let estado: string;
  let tone: 'up' | 'accent' | 'muted';
  if (!trading) {
    estado = 'El bot está en pausa (trading apagado). Sigue observando el mercado pero no ejecuta.';
    tone = 'muted';
  } else if (demo) {
    estado = 'Modo DEMO: el bot ejecuta cada divergencia para mostrar la mecánica (fills, parciales, P&L).';
    tone = 'accent';
  } else {
    estado =
      'Modo Real: el bot vigila 5 exchanges y solo ejecuta si hay ganancia tras todos los costos. Si ves 0 operaciones, es disciplina — no un error.';
    tone = 'up';
  }

  const dot = tone === 'up' ? 'bg-up' : tone === 'accent' ? 'bg-accent' : 'bg-muted';

  return (
    <Card className="overflow-hidden p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`live-dot mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-base font-bold tracking-tight sm:text-lg">
              Bitcoiner está {trading ? 'activo' : 'en pausa'}
            </h1>
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                demo ? 'bg-accent/15 text-accent' : 'bg-up/15 text-up'
              }`}
            >
              {demo ? 'DEMO' : 'REAL'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">{estado}</p>
          <p className="mt-2 text-xs text-muted">
            Hasta ahora ha <strong className="text-foreground/90">detectado {opps.toLocaleString('es-MX')}</strong>{' '}
            oportunidades y <strong className="text-foreground/90">ejecutado {trades.toLocaleString('es-MX')}</strong>.
          </p>
        </div>
      </div>
    </Card>
  );
}
