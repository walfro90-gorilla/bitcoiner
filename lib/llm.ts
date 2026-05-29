// lib/llm.ts — Capa LLM pluggable (SOLO server-side). Gemini por defecto, Anthropic opcional.
// Provider por env LLM_PROVIDER='gemini'|'anthropic'; si no, auto-detecta por la key disponible.
export type LlmProvider = 'gemini' | 'anthropic';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function activeProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  if (p === 'anthropic') return 'anthropic';
  if (p === 'gemini') return 'gemini';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'gemini';
}

export function hasLlmKey(): boolean {
  return activeProvider() === 'gemini' ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
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
    config: { systemInstruction: opts.system, maxOutputTokens: maxTokens },
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
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  return res.text ?? '';
}
