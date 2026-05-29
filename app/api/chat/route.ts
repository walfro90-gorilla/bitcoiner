// app/api/chat/route.ts — Copiloto IA (Claude). Ensambla contexto en vivo desde Supabase y responde en streaming.
// Fuera del hot-path: solo lee la DB. Requiere ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SYSTEM = `Eres el copiloto de "Clawbot", un bot de arbitraje de Bitcoin multi-exchange (Binance, OKX, Kraken, Bitso).
Respondes en español, claro y conciso, como un analista cuantitativo.
Usa EXCLUSIVAMENTE los datos del SNAPSHOT en vivo para responder; si algo no está en los datos, dilo.
Sabes explicar: el P&L acumulado, por qué una oportunidad se ejecutó o se descartó (campo skip_reason), las estrategias (spatial, cross_quote, triangular, statistical), por qué el arbitraje entre exchanges líquidos rara vez es rentable (los fees taker ~20bps superan el spread), y dónde sí aparece edge (Bitso regional, cross-quote USD/USDT).
Da números concretos (bps, USD) cuando los tengas. Sé breve salvo que pidan detalle.`;

async function buildSnapshot(): Promise<string> {
  const sb = createAdminClient();
  const [opps, trades, wallets, bot, exchanges] = await Promise.all([
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
  ]);
  return JSON.stringify({
    bot_state: bot.data,
    exchanges: exchanges.data,
    wallets: wallets.data,
    recent_trades: trades.data,
    recent_opportunities: opps.data,
  });
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY no está configurada en el entorno.', { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatMessage[] };
  const messages = (body.messages ?? []).filter((m) => m.role && m.content).slice(-12);
  if (messages.length === 0) return new Response('Sin mensajes.', { status: 400 });

  const snapshot = await buildSnapshot();
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM },
      { type: 'text', text: `SNAPSHOT (datos en vivo):\n${snapshot}`, cache_control: { type: 'ephemeral' } },
    ],
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n[error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
