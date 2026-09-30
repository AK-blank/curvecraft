import { NextResponse } from 'next/server';

import { deriveSpec, toConfigParams } from '@/core/build';
import { monteCarlo, type DemandModel } from '@/core/montecarlo';
import type { LaunchSpec } from '@/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MonteCarloBody {
  spec: LaunchSpec;
  runs?: number;
  seed?: number;
  model?: Partial<DemandModel>;
}

/**
 * Samples many demand paths for a launch spec and returns the distribution of
 * outcomes (graduation probability, fee and market-cap percentiles).
 */
export async function POST(request: Request) {
  let body: MonteCarloBody;
  try {
    body = (await request.json()) as MonteCarloBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { spec } = body;
  if (!spec) {
    return NextResponse.json({ error: 'Missing `spec`' }, { status: 400 });
  }

  try {
    const config = toConfigParams(spec);
    const derived = deriveSpec(spec, config);
    const result = monteCarlo(spec, derived.migrationQuoteThreshold, {
      runs: body.runs,
      seed: body.seed,
      model: body.model,
    });
    return NextResponse.json({ derived, result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Monte-Carlo run failed' },
      { status: 500 },
    );
  }
}
