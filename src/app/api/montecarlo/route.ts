import { NextResponse } from 'next/server';

import { analyzeMonteCarlo } from '@/core/analysis';
import type { DemandModel } from '@/core/montecarlo';
import type { LaunchSpec } from '@/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MonteCarloBody {
  spec: LaunchSpec;
  runs?: number;
  seed?: number;
  model?: Partial<DemandModel>;
}

/** HTTP entry point for the Monte-Carlo sampler; the studio calls the same code in-page. */
export async function POST(request: Request) {
  let body: MonteCarloBody;
  try {
    body = (await request.json()) as MonteCarloBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.spec) {
    return NextResponse.json({ error: 'Missing `spec`' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      analyzeMonteCarlo(body.spec, { runs: body.runs, seed: body.seed, model: body.model }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Monte-Carlo run failed' },
      { status: 500 },
    );
  }
}
