// worker/alerts.ts — Alertas en tiempo real vía Telegram (opt-in, fuera del hot-path, SIN deps).
// Se activan con TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID en .env.worker. Si faltan, todo es no-op.
// Las funciones son "fire-and-forget" (no bloquean el worker) y throttlean por tipo para no spamear.
// Lee el env de forma PEREZOSA → robusto ante el orden de carga de dotenv (config.ts).

function creds(): { token: string; chat: string } {
  return { token: process.env.TELEGRAM_BOT_TOKEN || '', chat: process.env.TELEGRAM_CHAT_ID || '' };
}

/** ¿Hay credenciales de Telegram configuradas? (las alertas son opt-in). */
export function alertsEnabled(): boolean {
  const { token, chat } = creds();
  return Boolean(token && chat);
}

/** Pura y testeable: ¿pasó suficiente tiempo desde el último envío de este tipo? */
export function throttleOk(lastTs: number, now: number, ms: number): boolean {
  return ms <= 0 || now - lastTs >= ms;
}

const lastByType: Record<string, number> = {};
function gate(type: string, ms: number): boolean {
  if (!alertsEnabled()) return false;
  const now = Date.now();
  if (!throttleOk(lastByType[type] ?? 0, now, ms)) return false;
  lastByType[type] = now;
  return true;
}

async function send(text: string): Promise<void> {
  const { token, chat } = creds();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) console.error('[telegram]', res.status, (await res.text().catch(() => '')).slice(0, 120));
  } catch (e) {
    console.error('[telegram]', (e as Error).message);
  }
}

export function alertTrade(a: {
  strategy: string;
  route: string;
  pair: string;
  base: number;
  netPnlUsd: number;
  cumPnlUsd: number;
  partial: boolean;
}): void {
  if (!gate('trade', 30_000)) return; // máx ~1 alerta de trade cada 30s (anti-spam en DEMO)
  const sign = a.netPnlUsd >= 0 ? '🟢' : '🔴';
  void send(
    `${sign} Trade ${a.strategy} · ${a.route}\n` +
      `${a.pair} · ${a.base.toFixed(5)} BTC · neto $${a.netPnlUsd.toFixed(2)}${a.partial ? ' (parcial)' : ''}\n` +
      `P&L acumulado: $${a.cumPnlUsd.toFixed(2)}`,
  );
}

export function alertRiskOff(r: { sentiment: number; impact: string; summary: string }): void {
  if (!gate('risk_off', 60_000)) return;
  void send(`⚠️ Risk-OFF por noticias\nimpacto ${r.impact} · sentimiento ${r.sentiment.toFixed(2)}\n${r.summary}`);
}

export function alertLossHalt(losses: number, cooldownMs: number): void {
  if (!gate('loss_halt', 60_000)) return;
  void send(`🛑 Cooldown por pérdidas\n${losses} pérdidas seguidas → pausa ${Math.round(cooldownMs / 1000)}s`);
}

export function alertRebalance(t: { from: string; to: string; asset: string; amount: number; usd: number }): void {
  if (!gate('rebalance', 0)) return;
  const dec = t.asset === 'BTC' ? 6 : 2;
  void send(`🔄 Rebalanceo\n${t.amount.toFixed(dec)} ${t.asset} · ${t.from} → ${t.to} (~$${t.usd.toFixed(0)})`);
}

export function alertBoot(mode: string, venues: number): void {
  if (!gate('boot', 0)) return;
  void send(`🦅 Bitcoiner worker arriba\nmodo ${mode} · ${venues} venues`);
}
