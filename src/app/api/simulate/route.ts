import { NextResponse } from 'next/server';

import { toConfigParams, toCurvePoints, deriveSpec } from '@/core/build';
import { scaledScenarios } from '@/core/scenarios';
import { lintSpec } from '@/core/lint';
import { simulate } from '@/core/simulate';
import type { LaunchSpec, Scenario } from '@/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SimulateBody {
  spec: LaunchSpec;
  scenarios?: Scenario[];
  compareSpecs?: Array<{ name: string; spec: LaunchSpec }>;
}

/**
 * Runs the DBC launch simulator server-side (the Meteora SDK is heavy and
 * Node-only) and returns everything the studio needs to render a launch report.
 */
export async function POST(request: Request) {
  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
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
    const curve = toCurvePoints(config);

    // No explicit scenarios? Scale demand to this launch's graduation target.
    const scenarios =
      body.scenarios && body.scenarios.length > 0
        ? body.scenarios
        : scaledScenarios(derived.migrationQuoteThreshold);

    const runs = scenarios.map((scenario) => simulate(spec, scenario));

    const comparisons = (body.compareSpecs ?? []).map((entry) => {
      const compareConfig = toConfigParams(entry.spec);
      return {
        name: entry.name,
        derived: deriveSpec(entry.spec, compareConfig),
        runs: scenarios.map((scenario) => simulate(entry.spec, scenario)),
      };
    });

    return NextResponse.json({
      derived,
      curve,
      runs,
      comparisons,
      lint: lintSpec(spec),
      specName: spec.name,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Simulation failed' },
      { status: 500 },
    );
  }
}
