'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/admin', label: 'Admin' },
  { href: '/escuela', label: 'Escuelita' },
];

export function NavBar() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-card2/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="text-xl">🦅</span> Clawbot
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-foreground/5 hover:text-foreground',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
