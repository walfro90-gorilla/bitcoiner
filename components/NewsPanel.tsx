'use client';
import { useBotState, useNews } from '@/lib/hooks';
import { fmtTime, n } from '@/lib/format';
import { Badge, Card, SectionTitle, type Tone } from './ui';

export function NewsPanel() {
  const news = useNews(12);
  const { botState } = useBotState();
  const s = n(botState?.news_sentiment);
  const impact = botState?.news_impact ?? '—';
  const sentTone: Tone = s > 0.15 ? 'up' : s < -0.15 ? 'down' : 'muted';
  const impactTone: Tone = impact === 'high' ? 'down' : impact === 'medium' ? 'accent' : 'muted';

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Noticias de última hora puntuadas por IA (sentimiento e impacto). Las muy negativas activan 'risk-off' y el bot pausa las ejecuciones por precaución."
        right={
          <div className="flex gap-1.5">
            <Badge tone={sentTone}>ánimo {s.toFixed(2)}</Badge>
            <Badge tone={impactTone}>impacto {impact}</Badge>
          </div>
        }
      >
        Noticias &amp; sentimiento
      </SectionTitle>
      {botState?.news_summary ? (
        <div className="border-b border-border px-4 py-2 text-xs text-foreground/80">{botState.news_summary}</div>
      ) : null}
      <div className="max-h-[260px] divide-y divide-border overflow-auto">
        {news.map((x) => (
          <a
            key={x.id}
            href={x.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="block px-4 py-2 hover:bg-foreground/[0.03]"
          >
            <div className="line-clamp-2 text-xs text-foreground/90">{x.headline}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {x.source ?? 'news'} · {fmtTime(x.ts)}
            </div>
          </a>
        ))}
        {news.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">
            Sin noticias aún (el worker las consulta cada pocos minutos).
          </div>
        )}
      </div>
    </Card>
  );
}
