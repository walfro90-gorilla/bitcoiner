import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Muro de "En construcción" de GorillaLabs.
// Activo por defecto. Para abrir el sitio real: env MAINTENANCE=off
// Para espiar el sitio detrás del muro: visita cualquier URL con ?llave=<MAINTENANCE_KEY>
const KEY = process.env.MAINTENANCE_KEY ?? 'gorila';

export function proxy(req: NextRequest) {
  if (process.env.MAINTENANCE === 'off') return NextResponse.next();

  const url = req.nextUrl;

  // Llave secreta -> deja una cookie y entra al sitio real (sin el query feo)
  if (url.searchParams.get('llave') === KEY) {
    const res = NextResponse.redirect(new URL(url.pathname, req.url));
    res.cookies.set('gl_pase', KEY, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  if (req.cookies.get('gl_pase')?.value === KEY) return NextResponse.next();

  return NextResponse.rewrite(new URL('/maintenance', req.url));
}

export const config = {
  // Todo pasa por el muro salvo estáticos, manifest, la propia página y los assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|maintenance).*)'],
};
