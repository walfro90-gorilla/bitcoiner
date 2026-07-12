// worker/news.ts — Poller de noticias (CryptoPanic, fallback Google News RSS) -> scoring con Gemini
// -> news_signals + régimen de riesgo en bot_state. Fuera del hot-path (poll cada NEWS_POLL_MS).
import { RUNTIME } from './runtimeConfig';
import { supabase } from './supabase';
import { generateText, hasLlmKey } from '../lib/llm';

export interface NewsRegime {
  sentiment: number; // -1..1
  impact: 'low' | 'medium' | 'high';
  summary: string;
  riskOff: boolean;
}

interface RawNews {
  headline: string;
  url: string;
  source: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchNews(): Promise<RawNews[]> {
  const key = process.env.CRYPTOPANIC_API_KEY;
  try {
    if (key) {
      const r = await fetch(
        `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${key}&currencies=BTC,ETH&public=true`,
      );
      const j = (await r.json()) as { results?: Array<{ title: string; url: string; source?: { title?: string } }> };
      return (j.results ?? []).slice(0, 20).map((p) => ({
        headline: p.title,
        url: p.url,
        source: p.source?.title ?? 'CryptoPanic',
      }));
    }
    // Fallback sin key: Google News RSS.
    const r = await fetch(
      'https://news.google.com/rss/search?q=bitcoin%20OR%20crypto%20when:1d&hl=en-US&gl=US&ceid=US:en',
    );
    const xml = await r.text();
    const items: RawNews[] = [];
    const re =
      /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<source[^>]*>(.*?)<\/source>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && items.length < 20) {
      items.push({ headline: decodeEntities(m[1]), url: m[2], source: decodeEntities(m[3]) });
    }
    return items;
  } catch (e) {
    console.error('[news] fetch:', (e as Error).message);
    return [];
  }
}

async function score(items: RawNews[]): Promise<NewsRegime | null> {
  if (!items.length || !hasLlmKey()) return null;
  const titles = items.map((i, idx) => `${idx + 1}. ${i.headline}`).join('\n');
  const prompt = `Eres analista de riesgo de un bot de trading de BTC. Evalúa el impacto GLOBAL de estos titulares recientes.
Devuelve SOLO JSON válido: {"sentiment": number entre -1 (muy bajista) y 1 (muy alcista), "impact": "low"|"medium"|"high", "summary": "una frase en español"}.
Titulares:
${titles}`;
  try {
    const raw = await generateText({ prompt, json: true, maxTokens: 500 });
    // Extrae el primer objeto JSON plano (robusto ante texto/objetos extra del modelo).
    const cleaned = (raw.match(/\{[^{}]*\}/)?.[0] ?? raw).trim();
    const j = JSON.parse(cleaned) as { sentiment?: number; impact?: string; summary?: string };
    const sentiment = Math.max(-1, Math.min(1, Number(j.sentiment) || 0));
    const impact = (['low', 'medium', 'high'].includes(j.impact ?? '') ? j.impact : 'low') as NewsRegime['impact'];
    const summary = String(j.summary ?? '').slice(0, 300);
    return { sentiment, impact, summary, riskOff: impact === 'high' && sentiment <= -0.4 };
  } catch (e) {
    console.error('[news] score:', (e as Error).message);
    return null;
  }
}

/** Arranca el poller; llama onRegime con el régimen actual tras cada ciclo.
 *  Usa setTimeout recursivo que lee RUNTIME.newsPollMs en cada ciclo → el intervalo es
 *  configurable EN VIVO desde la UI sin reiniciar. Devuelve un handle con stop(). */
export function startNewsPoller(
  onRegime: (r: NewsRegime) => void,
  isLeader: () => boolean = () => true, // gate anti-SPOF: solo el líder persiste noticias
): { stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const run = async () => {
    const items = await fetchNews();
    if (!items.length) return;
    const regime = await score(items);

    if (supabase && isLeader()) {
      const rows = items.slice(0, 12).map((i) => ({
        source: i.source,
        headline: i.headline,
        url: i.url,
        currencies: 'BTC',
        sentiment: regime?.sentiment ?? null,
        impact: regime?.impact ?? null,
      }));
      const { error } = await supabase.from('news_signals').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
      if (error) console.error('[news] insert:', error.message);
      if (regime) {
        await supabase
          .from('bot_state')
          .update({
            news_sentiment: regime.sentiment,
            news_impact: regime.impact,
            news_summary: regime.summary,
            news_updated_at: new Date().toISOString(),
          })
          .eq('id', true);
      }
    }
    if (regime) onRegime(regime);
    console.log(
      `[news] ${items.length} titulares | sentiment=${regime?.sentiment ?? 'n/a'} impact=${regime?.impact ?? 'n/a'} riskOff=${regime?.riskOff ?? false}`,
    );
  };
  const loop = async () => {
    await run();
    if (!stopped) timer = setTimeout(() => void loop(), RUNTIME.newsPollMs);
  };
  void loop();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
