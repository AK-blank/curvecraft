import type { Metadata } from 'next';

import StudioClient from '@/components/studio/StudioClient';

export const metadata: Metadata = {
  title: 'CurveCraft Studio — design a Meteora DBC launch',
  description:
    'Design, simulate and ship token launches on Meteora’s Dynamic Bonding Curve. Fee schedules, graduation targets, curve shapes and sniper resistance, before you deploy.',
};

/**
 * The studio is a client component on purpose: the Meteora SDK runs in the
 * browser, so a launch report needs no server and the whole app can be hosted as
 * static files. Shared designs arrive as `?s=<base64 spec>` and are picked up on
 * mount (see `StudioClient`).
 */
export default function StudioPage() {
  return <StudioClient />;
}
