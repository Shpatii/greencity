/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: `npm run build` writes plain files to out/, no Next server in production.
  output: 'export',
};

export default nextConfig;
