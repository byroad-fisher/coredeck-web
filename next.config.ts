import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  assetPrefix: process.env.GITHUB_PAGES === 'true' ? '/coredeck-web' : '',
};

export default nextConfig;
