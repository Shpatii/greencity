import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Safelane HN – Cycling Safety Priority Map',
  description: 'Cycling safety priority map for Heilbronn',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-gray-100">{children}</body>
    </html>
  );
}
