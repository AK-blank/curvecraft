import { NextResponse } from 'next/server';

import { analyze } from '@/core/analysis';
import type { LaunchSpec, Scenario } from '@/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SimulateBody {
  spec: LaunchSpec;
  scenarios?: Scenario[];
  compareSpecs?: Array<{ name: string; spec: LaunchSpec }>;
}

/**
 * HTTP entry point for the launch simulator. The studio itself runs the same
 * code in the browser (see `@/core/analysis`), so this route exists for scripts,
 * CI and anyone who would rather curl than click.
 */
export async function POST(request: Request) {
  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.spec) {
    return NextResponse.json({ error: 'Missing `spec`' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      analyze(body.spec, { scenarios: body.scenarios, compareSpecs: body.compareSpecs }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Simulation failed' },
      { status: 500 },
    );
  }
}
