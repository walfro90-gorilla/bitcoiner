'use client';
// BottomNav — navegación inferior estilo app, SOLO en móvil (sm:hidden).
// Incluye un botón "Tour" que dispara el recorrido guiado vía evento global.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Inicio', icon: '📊' },
  { href: '/escuela', label: 'Aprende', icon: '🎓' },
  { href: '/admin', label: 'Admin', icon: '⚙️' },
];

export function BottomNav() {
  const path = usePathname();
  const startTour = () => window.dispatchEvent(new CustomEvent('clawbot:tour'));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card2/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-accent' : 'text-muted',
              )}
            >
              <span className="text-lg leading-none">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
        <button
          onClick={startTour}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted transition-colors active:text-accent"
        >
          <span className="text-lg leading-none">🎯</span>
          Tour
        </button>
      </div>
    </nav>
  );
}
