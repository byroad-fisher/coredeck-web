import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', weight: ['500', '600'], subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'coreDECK Web',
  description: 'Condition-first medical revision generated from MedVenture.',
  manifest: './manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#071c2a', width: 'device-width', initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
