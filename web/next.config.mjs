import { existsSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: `npm run build` writes plain files to out/, no Next server in production.
  output: 'export',
  // /map/index.html instead of map.html, so /map works on any static server, not only on Vercel.
  trailingSlash: true,
  // No image optimisation server in a static export.
  images: { unoptimized: true },
  // The counter layer is optional; only request the file when the pipeline published it.
  env: {
    NEXT_PUBLIC_HAS_COUNTERS: existsSync(new URL('./public/data/counters.geojson', import.meta.url)) ? '1' : '',
  },
};

export default nextConfig;
