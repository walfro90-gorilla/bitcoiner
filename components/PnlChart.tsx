'use client';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePnlSeries } from '@/lib/hooks';
import { fmtTime, fmtUsd } from '@/lib/format';
import { Card, SectionTitle } from './ui';

export function PnlChart() {
  const data = usePnlSeries(600);
  const last = data.length ? data[data.length - 1].cum : 0;
  const up = last >= 0;
  const color = up ? '#16c784' : '#ea3943';

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        right={<span className={`text-sm font-semibold ${up ? 'text-up' : 'text-down'}`}>{fmtUsd(last)}</span>}
      >
        P&amp;L acumulado
      </SectionTitle>
      <div className="h-64 p-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Sin operaciones todavía…</div>
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
