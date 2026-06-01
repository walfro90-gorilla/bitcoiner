// app/api/chat/route.ts — Copiloto IA. Ensambla contexto en vivo desde Supabase y responde en streaming.
// LLM pluggable (Gemini por defecto, Anthropic opcional). Fuera del hot-path: solo lee la DB.
import { createAdminClient } from '@/lib/supabase/admin';
import { hasLlmKey, streamChat, type ChatMessage } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SYSTEM = `Eres el copiloto de "Bitcoiner", un bot de arbitraje de Bitcoin multi-exchange (Binance, OKX, Kraken, Bitso).
Respondes en español, claro y conciso, como un analista cuantitativo.
Usa EXCLUSIVAMENTE los datos del SNAPSHOT en vivo para responder; si algo no está en los datos, dilo.
Sabes explicar: el P&L acumulado, por qué una oportunidad se ejecutó o se descartó (campo skip_reason), las estrategias (spatial, cross_quote, triangular, statistical), por qué el arbitraje entre exchanges líquidos rara vez es rentable (los fees taker ~20bps superan el spread), dónde sí aparece edge (Bitso regional, cross-quote USD/USDT), y cómo las noticias de alto impacto activan el régimen de riesgo.
Da números concretos (bps, USD) cuando los tengas. Sé breve salvo que pidan detalle.`;

async function buildSnapshot(): Promise<string> {
  const sb = createAdminClient();
  const [opps, trades, wallets, bot, exchanges, news] = await Promise.all([
    sb
      .from('opportunities')
      .select('detected_at,strategy,pair,gross_spread_bps,net_spread_bps,net_usd,profitable,executed,skip_reason')
      .order('detected_at', { ascending: false })
      .limit(40),
    sb
      .from('trades')
      .select('executed_at,pair,base_volume,vwap_buy,vwap_sell,net_pnl_usd,partial,status')
      .order('executed_at', { ascending: false })
      .limit(25),
    sb.from('wallets').select('exchange_id,asset,balance'),
    sb.from('bot_state').select('*').eq('id', true).single(),
    sb.from('exchanges').select('id,venue,display_name'),
    sb
      .from('news_signals')
      .select('ts,source,headline,sentiment,impact')
      .order('ts', { ascending: false })
      .limit(15),
  ]);
  return JSON.stringify({
    bot_state: bot.data,
    exchanges: exchanges.data,
    wallets: wallets.data,
    recent_trades: trades.data,
    recent_opportunities: opps.data,
    recent_news: news.data,
  });
}

export async function POST(req: Request) {
  if (!hasLlmKey()) {
    return new Response('No hay API key de LLM configurada (define OPENAI_API_KEY, GEMINI_API_KEY o ANTHROPIC_API_KEY).', {
      status: 500,
    });
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatMessage[] };
  const messages = (body.messages ?? []).filter((m) => m.role && m.content).slice(-12);
  if (messages.length === 0) return new Response('Sin mensajes.', { status: 400 });

  const snapshot = await buildSnapshot();
  const gen = streamChat({
    system: `${SYSTEM}\n\nSNAPSHOT (datos en vivo):\n${snapshot}`,
    messages,
    maxTokens: 1024,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        for await (const text of gen) {
          emitted = true;
          controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        // No volcar el JSON crudo del proveedor: mensaje amigable + log para depurar en server.
        console.error('[chat] LLM error:', (err as Error).message);
        if (!emitted) {
          controller.enqueue(
            encoder.encode(
              '⚠️ El copiloto no está disponible en este momento (el proveedor de IA rechazó la solicitud). ' +
                'El resto del dashboard funciona con normalidad — los datos en vivo no dependen de la IA.',
            ),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
