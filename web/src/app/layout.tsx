import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

// Absolute base for the Open Graph image URL: NEXT_PUBLIC_SITE_URL (e.g. https://safelane.example.org),
// else the production domain Vercel sets at build time.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

const DESCRIPTION =
  'Cycling-safety priority map for Heilbronn: bike sensor rides show which streets to fix first.';

export const metadata: Metadata = {
  ...(SITE_URL && { metadataBase: new URL(SITE_URL) }),
  title: 'SafeLane HN',
  description: DESCRIPTION,
  openGraph: { title: 'SafeLane HN', description: DESCRIPTION, type: 'website', locale: 'en_GB' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
