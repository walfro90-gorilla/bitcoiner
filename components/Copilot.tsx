'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '¿Cómo va el P&L?',
  '¿Por qué se descartan oportunidades?',
  '¿Qué estrategia es más rentable?',
];

export function Copilot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy el copiloto de Bitcoiner 🦅. Pregúntame por el P&L, por qué se ejecutó o descartó una operación, o el estado del mercado.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'error');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: 'assistant', content: acc };
          return c;
        });
      }
    } catch (e) {
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: 'assistant', content: `⚠️ ${(e as Error).message}` };
        return c;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        data-tour="copilot"
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl shadow-lg shadow-accent/20 transition-transform hover:scale-105 sm:bottom-5 sm:right-5"
        aria-label="Copiloto IA"
      >
        {open ? '×' : '🦅'}
      </button>

      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[26rem] max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-card shadow-2xl sm:bottom-20 sm:right-5 sm:h-[28rem]">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Copiloto Bitcoiner <span className="text-xs font-normal text-muted">· Claude</span>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed',
                    m.role === 'user' ? 'bg-blue/20 text-foreground' : 'bg-card2 text-foreground/90',
                  )}
                >
                  {m.content || (busy && i === msgs.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:bg-foreground/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-border p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntale al bot…"
              className="flex-1 rounded-md bg-card2 px-3 py-2 text-xs outline-none placeholder:text-muted"
            />
            <button
              disabled={busy}
              className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              {busy ? '…' : '↑'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
