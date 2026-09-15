import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prizzle — Schema Converter',
  description: 'Convert Prisma and Drizzle schemas bidirectionally.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
