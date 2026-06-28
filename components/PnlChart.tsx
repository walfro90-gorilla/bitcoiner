'use client';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBotState, usePnlSeries } from '@/lib/hooks';
import { fmtTime, fmtUsd } from '@/lib/format';
import { Card, SectionTitle } from './ui';

export function PnlChart() {
  const data = usePnlSeries(600);
  const { botState } = useBotState();
  const demo = botState?.demo_mode ?? false;
  const last = data.length ? data[data.length - 1].cum : 0;
  const up = last >= 0;
  const color = up ? '#16c784' : '#ea3943';

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Ganancia o pérdida acumulada (neta, ya con comisiones) de todas las operaciones simuladas, a lo largo del tiempo."
        right={<span className={`text-sm font-semibold ${up ? 'text-up' : 'text-down'}`}>{fmtUsd(last)}</span>}
      >
        P&amp;L acumulado
      </SectionTitle>
      <div className="h-(--chart-h) p-3">
        {data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="text-sm font-medium text-foreground/80">Sin operaciones todavía</div>
            {demo ? (
              <p className="max-w-md text-xs leading-relaxed text-muted">
                En modo <strong className="text-accent">DEMO</strong> el bot ejecuta cada divergencia real para mostrar
                la mecánica. Esperando la primera… (verifica que el worker esté corriendo).
              </p>
            ) : (
              <p className="max-w-md text-xs leading-relaxed text-muted">
                En modo <strong className="text-foreground/90">Real</strong>, el bot solo ejecuta cuando el arbitraje es
                rentable <em>tras todos los costos</em> (fees + slippage + withdrawal). Como los mercados están
                eficientes ahora, <strong className="text-foreground/90">espera disciplinadamente</strong> en lugar de
                perder dinero — esa es la precisión. Activa <strong className="text-accent">DEMO</strong> para ver la
                mecánica en vivo.
              </p>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="pnl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => fmtTime(String(v))}
                tick={{ fill: '#8b95a5', fontSize: 10 }}
                minTickGap={48}
                stroke="#1f2733"
              />
              <YAxis
                tickFormatter={(v) => fmtUsd(v, 0)}
                tick={{ fill: '#8b95a5', fontSize: 10 }}
                width={64}
                stroke="#1f2733"
              />
              <ReferenceLine y={0} stroke="#3a4658" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: '#0f131c', border: '1px solid #1f2733', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => fmtTime(String(l))}
                formatter={(v) => [fmtUsd(v as number), 'P&L acum']}
              />
              <Area type="monotone" dataKey="cum" stroke={color} fill="url(#pnl)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
