'use client';
// Tour — recorrido guiado autónomo que explica el dashboard (basado en el pitch), con paso para
// instalar la PWA. Sin dependencias externas. Auto-inicia la 1ª visita; relanzable con el botón 🎯.
import { useCallback, useEffect, useRef, useState } from 'react';

type Step = {
  selector?: string; // elemento a resaltar; si falta → tarjeta centrada
  title: string;
  body: string;
  emoji?: string;
};

const STEPS: Step[] = [
  {
    emoji: '🦅',
    title: 'Bienvenido a Bitcoiner',
    body: 'Un bot que busca arbitraje de Bitcoin: comprar barato en un exchange y vender caro en otro, en tiempo real. Te muestro en 1 minuto cómo leer esta pantalla. Puedes salir cuando quieras.',
  },
  {
    selector: '#tour-resumen',
    emoji: '🟢',
    title: '¿Cómo va el bot ahora?',
    body: 'Aquí, en lenguaje simple: si está activo, en qué modo (Real o DEMO) y qué ha hecho. Es tu “estado de un vistazo”.',
  },
  {
    selector: '#tour-kpis',
    emoji: '📊',
    title: 'Los 4 números clave',
    body: 'Ganancia acumulada (P&L), operaciones hechas, oportunidades detectadas y la velocidad de detección (menos de 1 ms — nivel profesional).',
  },
  {
    selector: '#tour-mercado',
    emoji: '🏦',
    title: 'El mercado en vivo',
    body: 'Los precios de 7 exchanges a la vez, y una matriz que pinta en verde dónde habría diferencia de precio aprovechable. Todo se actualiza solo.',
  },
  {
    selector: '#tour-ejecucion',
    emoji: '🎯',
    title: 'Precisión, no cantidad',
    body: 'El bot detecta miles de diferencias pero ejecuta MUY pocas. Si ves P&L en $0, no es un error: descarta lo que no es rentable tras comisiones. Esa disciplina es lo valioso.',
  },
  {
    selector: '[data-tour="inject"]',
    emoji: '🧬',
    title: 'Cuando SÍ hay ganancia',
    body: 'Este botón reproduce el ejemplo del reto ($70,000 → $70,250) por el pipeline real y muestra +$109.75 por Bitcoin. Pruébalo después del tour.',
  },
  {
    selector: '#tour-analisis',
    emoji: '🔬',
    title: 'Análisis avanzado',
    body: 'Comparador maker/taker, un backtest histórico real y un modelo de régimen con cadenas de Markov. Es la “inteligencia” del sistema, sobre datos reales.',
  },
  {
    selector: '[data-tour="copilot"]',
    emoji: '💬',
    title: 'Pregúntale a la IA',
    body: 'Este copiloto responde con datos reales: “¿por qué no se ejecutan operaciones?”, “¿cómo va el P&L?”. Ideal si algo no te queda claro.',
  },
  {
    emoji: '📲',
    title: 'Instala Bitcoiner como app',
    body: 'Puedes instalarlo en tu celular o PC como una app normal — abre en pantalla completa, con su ícono.',
  },
  {
    emoji: '✅',
    title: 'Listo',
    body: 'Eso es todo. Recuerda: Bitcoiner no busca operar mucho, busca operar bien. Vuelve a ver el tour cuando quieras con el botón 🎯.',
  },
];

const SEEN_KEY = 'clawbot-tour-v1';
const PAD = 8;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function Tour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const deferredRef = useRef<BIPEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installMsg, setInstallMsg] = useState('');

  const step = STEPS[idx];
  const isInstallStep = idx === STEPS.length - 2;

  // Capturar el prompt de instalación PWA (Chrome/Edge/Android).
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BIPEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  // Recalcula la posición del elemento resaltado.
  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // recalcular tras el scroll
    setTimeout(() => {
      const e2 = document.querySelector(step.selector!);
      if (e2) setRect(e2.getBoundingClientRect());
    }, 380);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    const onMove = () => {
      if (step?.selector) {
        const el = document.querySelector(step.selector);
        if (el) setRect(el.getBoundingClientRect());
      }
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [active, idx, measure, step]);

  const start = useCallback(() => {
    setIdx(0);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-inicio en la 1ª visita al dashboard + escucha el botón 🎯.
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener('clawbot:tour', onStart);
    let seen = '1';
    try {
      seen = localStorage.getItem(SEEN_KEY) ?? '';
    } catch {
      seen = '1';
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!seen && location.pathname === '/') t = setTimeout(start, 1200);
    return () => {
      window.removeEventListener('clawbot:tour', onStart);
      if (t) clearTimeout(t);
    };
  }, [start]);

  // Bloquear scroll del body mientras el tour está activo no es necesario (seguimos el target).
  const next = () => (idx < STEPS.length - 1 ? setIdx((i) => i + 1) : finish());
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  async function doInstall() {
    const d = deferredRef.current;
    if (d) {
      await d.prompt();
      const choice = await d.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferredRef.current = null;
      setCanInstall(false);
      setInstallMsg(choice.outcome === 'accepted' ? '✅ ¡Instalada! Búscala en tu pantalla de inicio.' : 'Puedes instalarla luego desde el menú del navegador.');
    } else {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      setInstallMsg(
        isIOS
          ? 'En iPhone/iPad: toca el botón Compartir ⬆️ y elige “Añadir a inicio”.'
          : 'En el menú del navegador (⋮) elige “Instalar app” o “Añadir a pantalla de inicio”.',
      );
    }
  }

  if (!active) return null;

  // Posición de la tarjeta: debajo del target si hay espacio; si no, arriba; si no hay target, centrada.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let cardStyle: React.CSSProperties = {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%,-50%)',
  };
  if (rect) {
    const below = rect.bottom + 12;
    const placeBelow = below + 220 < vh;
    cardStyle = placeBelow
      ? { left: '50%', top: below, transform: 'translateX(-50%)' }
      : { left: '50%', top: Math.max(12, rect.top - 12), transform: 'translate(-50%,-100%)' };
  }

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      {/* Spotlight: capa oscura con “agujero” sobre el target (o capa plana si no hay target) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(2,4,8,0.78)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(2,4,8,0.82)]" />
      )}

      {/* Tarjeta del paso */}
      <div
        className="absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-accent/30 bg-card p-4 shadow-(--shadow-modal) shadow-accent/10"
        style={cardStyle}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">
            Paso {idx + 1} de {STEPS.length}
          </span>
          <button onClick={finish} className="text-muted hover:text-foreground" aria-label="Cerrar tour">
            ✕
          </button>
        </div>

        <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
          {step.emoji && <span>{step.emoji}</span>} {step.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{step.body}</p>

        {isInstallStep && (
          <div className="mt-3">
            <button
              onClick={doInstall}
              className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              {canInstall ? '📲 Instalar app' : 'Cómo instalar'}
            </button>
            {installMsg && <p className="mt-2 text-xs leading-relaxed text-accent">{installMsg}</p>}
          </div>
        )}

        {/* Progreso + navegación */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-heavy ${i === idx ? 'w-4 bg-accent' : 'w-1.5 bg-foreground/20'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={prev} className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-foreground/5">
                Atrás
              </button>
            )}
            <button
              onClick={next}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-black transition-transform hover:scale-105"
            >
              {idx === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
