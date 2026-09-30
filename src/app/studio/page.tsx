import type { Metadata } from 'next';

import StudioClient from '@/components/studio/StudioClient';

export const metadata: Metadata = {
  title: 'CurveCraft Studio — design a Meteora DBC launch',
  description:
    'Design, simulate and ship token launches on Meteora’s Dynamic Bonding Curve. Fee schedules, graduation targets and sniper resistance, before you deploy.',
};

export default function StudioPage() {
  return <StudioClient />;
}
