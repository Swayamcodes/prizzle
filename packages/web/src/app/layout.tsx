import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const googleSansFlex = localFont({
  src: './fonts/GoogleSansFlexText[wght].ttf',
  variable: '--font-google-sans-flex',
  weight: '100 900',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

const instrumentSerif = localFont({
  src: './fonts/InstrumentSerif-Regular.ttf',
  variable: '--font-instrument-serif',
  weight: '400',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

export const metadata: Metadata = {
  title: 'Prizzle — Schema Converter',
  description: 'Convert Prisma and Drizzle schemas bidirectionally.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className={`${googleSansFlex.variable} ${instrumentSerif.variable}`}>{children}</body>
    </html>
  );
}
