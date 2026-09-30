import type { Metadata } from 'next';

import StudioClient from '@/components/studio/StudioClient';
import { decodeSpec } from '@/core/share';

export const metadata: Metadata = {
  title: 'CurveCraft Studio — design a Meteora DBC launch',
  description:
    'Design, simulate and ship token launches on Meteora’s Dynamic Bonding Curve. Fee schedules, graduation targets and sniper resistance, before you deploy.',
};

/**
 * The studio reads its starting design from `?s=<base64 spec>`, which is what
 * makes every launch shareable as a plain URL. Parsing it on the server keeps
 * the client component free of "read the URL after mount" effects.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const params = await searchParams;
  const shared = params.s ? decodeSpec(params.s) : null;

  return <StudioClient initialSpec={shared ?? undefined} sharedFromUrl={Boolean(shared)} />;
}
