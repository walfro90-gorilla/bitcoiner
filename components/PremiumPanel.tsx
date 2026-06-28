'use client';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSpreadHistory } from '@/lib/hooks';
import { fmtTime } from '@/lib/format';
import { Card, SectionTitle } from './ui';

export function PremiumPanel() {
  const raw = useSpreadHistory('Bitso BTC/MXN (USD)', 'Global BTC/USDT', 240);
  const data = raw.map((d) => ({ t: d.ts, prem: Number(d.spread) })); // spread = premio en bps
  const last = data.length ? data[data.length - 1].prem : 0;
  const premium = last >= 0; // >0 = Bitso más caro (premio); <0 = más barato (descuento)
  const color = premium ? '#16c784' : '#ea3943';

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Diferencia entre el precio de BTC en Bitso (México) y el precio global. 'Premio' = más caro en México; 'descuento' = más barato. Es el arbitraje regional que persigue el bot."
        right={
          <span className={`text-sm font-semibold ${premium ? 'text-up' : 'text-down'}`}>
            {(last / 100).toFixed(2)}% {premium ? '(premio)' : '(descuento)'}
          </span>
        }
      >
        🇲🇽 Premio Bitso MX — BTC en Bitso vs precio global
      </SectionTitle>
      <div className="h-(--chart-h) p-3">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            Esperando datos del premio… (requiere el worker con el feed BTC/MXN desplegado)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="prem" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(v) => `${(Number(v) / 100).toFixed(1)}%`}
                tick={{ fill: '#8b95a5', fontSize: 10 }}
                width={44}
                stroke="#1f2733"
              />
              <ReferenceLine y={0} stroke="#3a4658" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: '#0f131c', border: '1px solid #1f2733', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => fmtTime(String(l))}
                formatter={(v) => [`${(Number(v) / 100).toFixed(3)}% (${Number(v).toFixed(1)} bps)`, 'Premio']}
              />
              <Area type="monotone" dataKey="prem" stroke={color} fill="url(#prem)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
