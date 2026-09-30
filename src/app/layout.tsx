import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CurveCraft — design, simulate and ship token launches on Meteora DBC',
  description:
    'Compile a token launch into a real Meteora Dynamic Bonding Curve config, replay realistic demand against it with the official swap math, and export a runnable launch script.',
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
