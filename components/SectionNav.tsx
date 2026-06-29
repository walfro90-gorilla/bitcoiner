'use client';
// SectionNav — índice de secciones pegajoso (no rompe nada: una sola página, solo navega).
// Salta a cada sección por ancla y resalta la activa con scroll-spy (IntersectionObserver).
// Pega justo debajo de la NavBar (que mide h-14 = 56px).
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'tour-mercado', label: 'Mercado', icon: '🏦' },
  { id: 'tour-ejecucion', label: 'Ejecución', icon: '🎯' },
  { id: 'tour-config', label: 'Configuración', icon: '⚙️' },
  { id: 'tour-analisis', label: 'Análisis', icon: '🔬' },
  { id: 'tour-inteligencia', label: 'Inteligencia', icon: '🧠' },
];

export function SectionNav() {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Margen superior: descuenta NavBar (56px) + este índice (~44px). Inferior: activa hasta scrollear lejos.
      { rootMargin: '-104px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <nav
      aria-label="Secciones del dashboard"
      className="sticky top-14 z-30 -mx-4 mb-4 border-b border-border bg-background/85 px-4 py-2 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="focus-ring shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-ui hover:border-accent/30 hover:text-foreground"
          aria-label="Ir al inicio"
        >
          ↑ Inicio
        </button>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => go(s.id)}
            className={cn(
              'focus-ring shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-ui',
              active === s.id
                ? 'border-accent/40 bg-accent/15 text-accent'
                : 'border-border text-muted hover:border-accent/30 hover:text-foreground',
            )}
          >
            <span className="mr-1">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
