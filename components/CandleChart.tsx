'use client';
// components/CandleChart.tsx — Chart de velas japonesas (lightweight-charts, motor de TradingView).
// Importa la librería dinámicamente dentro del effect → SSR-safe (no toca document en el servidor).
import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useCandles } from '@/lib/hooks';
import { Card, SectionTitle } from './ui';
import { LivePing } from './LivePing';

export function CandleChart() {
  const candles = useCandles('BTC/USDT', 240);
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Inicializa el chart una vez (cliente).
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    void (async () => {
      const el = elRef.current;
      if (!el) return;
      const { createChart, ColorType } = await import('lightweight-charts');
      if (disposed || !elRef.current) return;
      const chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8b94a7', fontSize: 11 },
        grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
        height: 300,
        width: el.clientWidth,
      });
      const series = chart.addCandlestickSeries({
        upColor: '#16c784',
        downColor: '#ea3943',
        borderVisible: false,
        wickUpColor: '#16c784',
        wickDownColor: '#ea3943',
      });
      chartRef.current = chart;
      seriesRef.current = series;
      ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
      ro.observe(el);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Actualiza los datos cuando cambian las velas.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !candles.length) return;
    s.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Velas OHLC de 1 minuto del precio medio BTC/USDT (Binance), construidas por el worker y renderizadas con lightweight-charts (motor de TradingView). El punto verde marca la latencia de detección en vivo."
        right={<LivePing />}
      >
        📈 BTC/USDT · velas 1m
      </SectionTitle>
      <div className="relative">
        <div ref={elRef} className="h-[300px] w-full" />
        {!candles.length ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            Acumulando velas… el worker genera una por minuto.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
