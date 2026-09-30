import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev server is reached over 127.0.0.1 in some environments; without this
  // Next blocks its own dev/HMR resources and the client never hydrates.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
