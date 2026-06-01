// lib/llm.ts — Capa LLM pluggable (SOLO server-side).
// Providers: 'openai' (compatible: Groq/OpenRouter/DeepSeek/Together/etc.), 'gemini', 'anthropic'.
// Provider por env LLM_PROVIDER; si no, auto-detecta por la key disponible (prioriza OpenAI-compatible).
export type LlmProvider = 'openai' | 'gemini' | 'anthropic';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
// Modelo por defecto del branch OpenAI-compatible (Groq Llama 3.3 70B). Override con OPENAI_MODEL.
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');

export function activeProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  if (p === 'openai' || p === 'groq' || p === 'openrouter' || p === 'deepseek') return 'openai';
  if (p === 'anthropic') return 'anthropic';
  if (p === 'gemini') return 'gemini';
  // Auto-detección: prioriza OpenAI-compatible (Groq y cía) por ser gratis/rápido.
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'gemini';
}

export function hasLlmKey(): boolean {
  const p = activeProvider();
  if (p === 'openai') return !!process.env.OPENAI_API_KEY;
  if (p === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return !!process.env.GEMINI_API_KEY;
}

function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
}

/** Respuesta de chat en streaming (async generator de chunks de texto). */
export async function* streamChat(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): AsyncGenerator<string> {
  const maxTokens = opts.maxTokens ?? 1024;

  // Branch OpenAI-compatible (Groq / OpenRouter / DeepSeek / Together…): SSE estándar de /chat/completions.
  if (activeProvider() === 'openai') {
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`LLM ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // la última línea puede estar incompleta
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        } catch {
          /* línea de keep-alive o parcial: ignorar */
        }
      }
    }
    return;
  }

  if (activeProvider() === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const stream = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: opts.system,
      messages: opts.messages,
      stream: true,
    });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
    }
    return;
  }
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: toGeminiContents(opts.messages),
    config: { systemInstruction: opts.system, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  });
  for await (const chunk of stream) {
    const t = chunk.text;
    if (t) yield t;
  }
}

/** Generación de una sola respuesta (para scoring de noticias). `json: true` fuerza salida JSON. */
export async function generateText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const maxTokens = opts.maxTokens ?? 800;

  // Branch OpenAI-compatible (no streaming) — para scoring de noticias.
  if (activeProvider() === 'openai') {
    const messages = [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: opts.prompt },
    ];
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  if (activeProvider() === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  }
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  return res.text ?? '';
}
