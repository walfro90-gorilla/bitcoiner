import type { MetadataRoute } from 'next';

// Next sirve esto en /manifest.webmanifest y lo enlaza automáticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Clawbot — Arbitraje BTC',
    short_name: 'Clawbot',
    description: 'Bot de arbitraje de Bitcoin multi-exchange: detección, simulación y P&L en vivo.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b0e14',
    theme_color: '#0b0e14',
    categories: ['finance', 'productivity'],
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
