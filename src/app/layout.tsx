import type { Metadata } from 'next';
import './globals.css';

const DESCRIPTION =
  'Compile a token launch into a real Meteora Dynamic Bonding Curve config, replay realistic demand against it with the official swap math, and export a runnable launch script.';

export const metadata: Metadata = {
  title: 'CurveCraft — design, simulate and ship token launches on Meteora DBC',
  description: DESCRIPTION,
  openGraph: {
    title: 'CurveCraft — design, simulate and ship token launches on Meteora DBC',
    description: DESCRIPTION,
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'CurveCraft Studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CurveCraft — design, simulate and ship token launches on Meteora DBC',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
