'use client';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSpreadHistory } from '@/lib/hooks';
import { fmtTime } from '@/lib/format';
import { Card, SectionTitle } from './ui';

export function SpreadChart() {
  const raw = useSpreadHistory('binance BTC/USDT', 'kraken BTC/USD', 240);
  const data = raw.map((d) => ({ t: d.ts, z: Number(d.zscore ?? 0) }));
  const last = data.length ? data[data.length - 1].z : 0;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="El z-score mide qué tan lejos está la diferencia de precios de su promedio histórico. Más allá de ±2 suele revertir a la media: señal de entrada del arbitraje estadístico."
        right={<span className="text-xs text-muted">Binance USDT vs Kraken USD · z={last.toFixed(2)}</span>}
      >
        Arbitraje estadístico (z-score)
      </SectionTitle>
      <div className="h-56 p-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Acumulando historial de spread…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => fmtTime(String(v))}
                tick={{ fill: '#8b95a5', fontSize: 10 }}
                minTickGap={48}
                stroke="#1f2733"
              />
              <YAxis domain={[-4, 4]} tick={{ fill: '#8b95a5', fontSize: 10 }} width={30} stroke="#1f2733" />
              <ReferenceLine y={2} stroke="#ea3943" strokeDasharray="4 4" />
              <ReferenceLine y={-2} stroke="#16c784" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#3a4658" />
              <Tooltip
                contentStyle={{ background: '#0f131c', border: '1px solid #1f2733', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => fmtTime(String(l))}
                formatter={(v) => [Number(v).toFixed(2), 'z-score']}
              />
              <Line type="monotone" dataKey="z" stroke="#f7931a" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
