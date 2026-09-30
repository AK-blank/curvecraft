import type { NextConfig } from 'next';

/**
 * Two build modes:
 *
 * - default (`next dev` / `next build`): full Next app with the HTTP API routes.
 * - `STATIC_EXPORT=1`: a static bundle for GitHub Pages. The studio computes
 *   everything in the browser, so nothing is lost except `POST /api/simulate`,
 *   which `scripts/build-static.mjs` moves aside for the duration of the build.
 */
const staticExport = process.env.STATIC_EXPORT === '1';
const basePath = process.env.BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // The dev server is reached over 127.0.0.1 in some environments; without this
  // Next blocks its own dev/HMR resources and the client never hydrates.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  turbopack: {
    root: __dirname,
  },
  ...(staticExport
    ? {
        output: 'export' as const,
        basePath,
        assetPrefix: basePath || undefined,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
