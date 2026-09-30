/**
 * Launch analysis — the one place a launch spec turns into numbers.
 *
 * Both entry points call into here: the studio runs it in the browser (the
 * Meteora SDK works fine client-side, which keeps the whole app statically
 * hostable), and `POST /api/simulate` exposes the same thing over HTTP for
 * scripts and curl.
 */
import { deriveSpec, toConfigParams, toCurvePoints } from './build';
import { lintSpec, type LintResult } from './lint';
import {
  demandProfileFor,
  monteCarlo,
  type DemandModel,
  type MonteCarloResult,
} from './montecarlo';
import { scaledScenarios } from './scenarios';
import { simulate } from './simulate';
import type { CurvePointView, LaunchSpec, Scenario, SimulationResult, SpecDerivedLike } from './types';

export interface ComparisonRun {
  name: string;
  derived: SpecDerivedLike;
  runs: SimulationResult[];
}

export interface AnalysisResult {
  derived: SpecDerivedLike;
  curve: CurvePointView[];
  runs: SimulationResult[];
  comparisons: ComparisonRun[];
  lint: LintResult;
  specName: string;
}

export interface AnalysisOptions {
  scenarios?: Scenario[];
  compareSpecs?: Array<{ name: string; spec: LaunchSpec }>;
}

/**
 * Compile a spec, replay demand against it, lint it, and repeat for any designs
 * it is being compared against.
 */
export function analyze(spec: LaunchSpec, options: AnalysisOptions = {}): AnalysisResult {
  const config = toConfigParams(spec);
  const derived = deriveSpec(spec, config);
  const curve = toCurvePoints(config);

  // No explicit scenarios? Scale demand to this launch's own graduation target.
  const scenarios =
    options.scenarios && options.scenarios.length > 0
      ? options.scenarios
      : scaledScenarios(derived.migrationQuoteThreshold);

  const runs = scenarios.map((scenario) => simulate(spec, scenario));

  const comparisons = (options.compareSpecs ?? []).map((entry) => {
    const compareConfig = toConfigParams(entry.spec);
    return {
      name: entry.name,
      derived: deriveSpec(entry.spec, compareConfig),
      runs: scenarios.map((scenario) => simulate(entry.spec, scenario)),
    };
  });

  return { derived, curve, runs, comparisons, lint: lintSpec(spec), specName: spec.name };
}

export interface MonteCarloResponse {
  derived: SpecDerivedLike;
  result: MonteCarloResult;
}

/** Sample many demand paths for a spec and return the distribution. */
export function analyzeMonteCarlo(
  spec: LaunchSpec,
  options: { runs?: number; seed?: number; model?: Partial<DemandModel> } = {},
): MonteCarloResponse {
  const derived = deriveSpec(spec, toConfigParams(spec));
  return {
    derived,
    result: monteCarlo(spec, derived.migrationQuoteThreshold, {
      ...options,
      model: options.model ?? demandProfileFor(spec.quoteAsset, derived.migrationQuoteThreshold),
    }),
  };
}
