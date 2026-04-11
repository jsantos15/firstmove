import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'FirstMove — Learn Chess Openings',
  description:
    'Master chess openings with guided practice. Learn the Italian, Sicilian, Ruy Lopez, and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-[#0f1117] text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
