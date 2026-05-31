import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { BottomNav } from '@/components/BottomNav';
import { Tour } from '@/components/Tour';
import { ServiceWorker } from '@/components/ServiceWorker';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Clawbot — Arbitraje BTC en tiempo real',
  description: 'Bot de arbitraje de Bitcoin multi-exchange: detección, simulación y P&L en vivo.',
  applicationName: 'Clawbot',
  appleWebApp: { capable: true, title: 'Clawbot', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0b0e14',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // respeta safe-areas (notch) en móvil
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full pb-[68px] sm:pb-0">
        <NavBar />
        {children}
        <BottomNav />
        <Tour />
        <ServiceWorker />
      </body>
    </html>
  );
}
