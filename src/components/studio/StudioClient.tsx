'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COMPARE_COLORS = ['#22d3ee', '#f472b6', '#facc15'];

import { toCreateConfigScript } from '@/core/codegen';
import { PRESETS } from '@/core/presets';
import { decodeSpec, encodeSpec } from '@/core/share';
import type {
  CurvePointView,
  LaunchSpec,
  SimulationResult,
  SpecDerivedLike,
} from '@/core/types';

interface ComparisonRun {
  name: string;
  derived: SpecDerivedLike;
  runs: SimulationResult[];
}

interface SimulateResponse {
  derived: SpecDerivedLike;
  curve: CurvePointView[];
  runs: SimulationResult[];
  comparisons: ComparisonRun[];
  specName: string;
}

interface MonteCarloResponse {
  derived: SpecDerivedLike;
  result: {
    runs: number;
    graduated: number;
    graduationProbability: number;
    graduationTimeP50: number | null;
    fees: { p10: number; p50: number; p90: number };
    peakMarketCap: { p10: number; p50: number; p90: number };
    feeRate: { p10: number; p50: number; p90: number };
    histogram: Array<{ bucket: number; count: number }>;
    meanFills: number;
  };
}

type NumericField =
  | 'totalSupply'
  | 'initialMarketCap'
  | 'migrationMarketCap'
  | 'percentageSupplyOnMigration'
  | 'creatorTradingFeePercentage';

const CARD = 'rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur';
const LABEL = 'text-[11px] uppercase tracking-wider text-slate-500';
const INPUT =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-500';

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function compact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return value.toFixed(2);
}

function clock(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function StudioClient() {
  const [spec, setSpec] = useState<LaunchSpec>(() => structuredClone(PRESETS[0].spec));
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [data, setData] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState(0);
  const [showScript, setShowScript] = useState(false);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResponse | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcRuns, setMcRuns] = useState(200);
  const [shareLabel, setShareLabel] = useState('Copy share link');
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const run = useCallback(
    async (nextSpec: LaunchSpec, compareSpecs: Array<{ name: string; spec: LaunchSpec }>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: nextSpec, compareSpecs }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Simulation failed');
      setData(payload as SimulateResponse);
      setActiveRun(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
    },
    [],
  );

  const compareSpecs = useMemo(
    () =>
      compareIds
        .map((id) => PRESETS.find((preset) => preset.id === id))
        .filter((preset): preset is (typeof PRESETS)[number] => Boolean(preset))
        .map((preset) => ({ name: preset.name, spec: preset.spec })),
    [compareIds],
  );

  useEffect(() => {
    const timer = setTimeout(() => void run(spec, compareSpecs), 250);
    return () => clearTimeout(timer);
  }, [spec, run, compareSpecs]);

  // A spec can arrive in the URL, which is what makes designs shareable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('s');
    if (!encoded) return;
    const decoded = decodeSpec(encoded);
    if (decoded) {
      setSpec(decoded);
      setPresetId('shared');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMcLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/montecarlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec, runs: mcRuns }),
        });
        const payload = (await response.json()) as MonteCarloResponse;
        if (!cancelled && response.ok) setMonteCarlo(payload);
      } catch {
        /* keep the previous distribution on failure */
      } finally {
        if (!cancelled) setMcLoading(false);
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spec, mcRuns]);

  const share = async () => {
    const url = `${window.location.origin}/studio?s=${encodeSpec(spec)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel('Link copied');
    } catch {
      setShareLabel('Copy failed');
    }
    window.history.replaceState(null, '', `/studio?s=${encodeSpec(spec)}`);
    setTimeout(() => setShareLabel('Copy share link'), 2_000);
  };

  const update = <K extends keyof LaunchSpec>(key: K, value: LaunchSpec[K]) =>
    setSpec((current) => ({ ...current, [key]: value }));

  const updateNumber = (key: NumericField, value: number) =>
    setSpec((current) => ({ ...current, [key]: value }));

  const currentRun = data?.runs[activeRun];
  const script = useMemo(() => toCreateConfigScript(spec), [spec]);

  const chartData = useMemo(() => {
    if (!currentRun) return [];
    const base = currentRun.pricePath.map(([t, price]) => ({
      t,
      label: clock(t),
      marketCap: price * spec.totalSupply,
    }));
    const byTime = new Map(base.map((row) => [row.t, { ...row } as Record<string, number | string>]));
    (data?.comparisons ?? []).forEach((comparison, index) => {
      const supply =
        compareSpecs.find((entry) => entry.name === comparison.name)?.spec.totalSupply ??
        spec.totalSupply;
      const runPath = comparison.runs[activeRun]?.pricePath ?? [];
      runPath.forEach(([t, price]) => {
        const row = byTime.get(t) ?? { t, label: clock(t), marketCap: 0 };
        row[`compare${index}`] = price * supply;
        byTime.set(t, row);
      });
    });
    return [...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t));
  }, [currentRun, spec.totalSupply, data?.comparisons, activeRun, compareSpecs]);

  const headToHead = useMemo(() => {
    if (!data || (data.comparisons?.length ?? 0) === 0) return [];
    const feeOf = (runs: SimulationResult[] | undefined, index: number) => {
      const run = runs?.[index];
      if (!run || run.quoteVolume === 0) return null;
      return run.tradingFees / run.quoteVolume;
    };
    const rows = [
      {
        name: data.specName,
        derived: data.derived,
        runs: data.runs,
        color: '#a78bfa',
      },
      ...(data.comparisons ?? []).map((comparison, index) => ({
        name: comparison.name,
        derived: comparison.derived,
        runs: comparison.runs,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      })),
    ];

    return rows.map((row) => {
      const organic = feeOf(row.runs, 0);
      const sniper = feeOf(row.runs, 1);
      const active = row.runs?.[activeRun];
      return {
        ...row,
        organicFee: organic,
        sniperPremium: organic && sniper ? ((sniper - organic) / organic) * 100 : null,
        activeFee: feeOf(row.runs, activeRun),
        activeGrad: active?.graduatedAtSec ?? null,
        peak: active?.peakMarketCap ?? 0,
      };
    });
  }, [data, activeRun]);

  const feeEfficiency = useMemo(() => {
    if (!currentRun || currentRun.quoteVolume === 0) return 0;
    return (currentRun.tradingFees / currentRun.quoteVolume) * 100;
  }, [currentRun]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-lg font-semibold tracking-tight text-violet-400">
              curve<span className="text-slate-100">craft</span>
            </span>
            <span className="hidden text-xs text-slate-500 sm:block">
              design · simulate · ship token launches on Meteora DBC
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => void share()}
              className="rounded-full border border-violet-500/60 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/10"
            >
              {shareLabel}
            </button>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  setPresetId(preset.id);
                  setSpec(structuredClone(preset.spec));
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  presetId === preset.id
                    ? 'bg-violet-500 text-white'
                    : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 lg:grid-cols-[380px_1fr]">
        {/* ---------------- controls ---------------- */}
        <section className={`${CARD} h-fit p-5`}>
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Launch spec</h2>
          <p className="mb-5 text-xs text-slate-500">
            {PRESETS.find((p) => p.id === presetId)?.thesis}
          </p>

          <div className="space-y-4">
            <div>
              <label className={LABEL}>Quote asset</label>
              <div className="mt-1 flex gap-2">
                {(['SOL', 'USDC'] as const).map((asset) => (
                  <button
                    key={asset}
                    onClick={() => update('quoteAsset', asset)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                      spec.quoteAsset === asset
                        ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {asset}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Total supply</label>
                <input
                  className={`${INPUT} mt-1`}
                  type="number"
                  value={spec.totalSupply}
                  onChange={(e) => updateNumber('totalSupply', Number(e.target.value))}
                />
              </div>
              <div>
                <label className={LABEL}>Supply on migration %</label>
                <input
                  className={`${INPUT} mt-1`}
                  type="number"
                  value={spec.percentageSupplyOnMigration}
                  onChange={(e) =>
                    updateNumber('percentageSupplyOnMigration', Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Start MC ({spec.quoteAsset})</label>
                <input
                  className={`${INPUT} mt-1`}
                  type="number"
                  value={spec.initialMarketCap}
                  onChange={(e) => updateNumber('initialMarketCap', Number(e.target.value))}
                />
              </div>
              <div>
                <label className={LABEL}>Graduation MC ({spec.quoteAsset})</label>
                <input
                  className={`${INPUT} mt-1`}
                  type="number"
                  value={spec.migrationMarketCap}
                  onChange={(e) => updateNumber('migrationMarketCap', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Fee schedule</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {spec.feeSchedule.startingFeeBps / 100}% → {spec.feeSchedule.endingFeeBps / 100}%
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    ['linear', 'Linear'],
                    ['exponential', 'Exponential'],
                    ['rateLimiter', 'Rate limiter'],
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    onClick={() => update('feeMode', mode)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] transition ${
                      spec.feeMode === mode
                        ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {spec.feeMode !== 'rateLimiter' ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Start bps</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.feeSchedule.startingFeeBps}
                      onChange={(e) =>
                        update('feeSchedule', {
                          ...spec.feeSchedule,
                          startingFeeBps: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>End bps</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.feeSchedule.endingFeeBps}
                      onChange={(e) =>
                        update('feeSchedule', {
                          ...spec.feeSchedule,
                          endingFeeBps: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Periods</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.feeSchedule.numberOfPeriods}
                      onChange={(e) =>
                        update('feeSchedule', {
                          ...spec.feeSchedule,
                          numberOfPeriods: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Duration (s)</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.feeSchedule.totalDurationSec}
                      onChange={(e) =>
                        update('feeSchedule', {
                          ...spec.feeSchedule,
                          totalDurationSec: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Base bps</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.rateLimiter?.baseFeeBps ?? 100}
                      onChange={(e) =>
                        update('rateLimiter', {
                          baseFeeBps: Number(e.target.value),
                          feeIncrementBps: spec.rateLimiter?.feeIncrementBps ?? 100,
                          referenceAmount: spec.rateLimiter?.referenceAmount ?? 1,
                          maxLimiterDurationSec: spec.rateLimiter?.maxLimiterDurationSec ?? 3600,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Increment bps</label>
                    <input
                      className={`${INPUT} mt-1`}
                      type="number"
                      value={spec.rateLimiter?.feeIncrementBps ?? 100}
                      onChange={(e) =>
                        update('rateLimiter', {
                          baseFeeBps: spec.rateLimiter?.baseFeeBps ?? 100,
                          feeIncrementBps: Number(e.target.value),
                          referenceAmount: spec.rateLimiter?.referenceAmount ?? 1,
                          maxLimiterDurationSec: spec.rateLimiter?.maxLimiterDurationSec ?? 3600,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Creator fee %</label>
                <input
                  className={`${INPUT} mt-1`}
                  type="number"
                  value={spec.creatorTradingFeePercentage}
                  onChange={(e) =>
                    updateNumber('creatorTradingFeePercentage', Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label className={LABEL}>Migration fee</label>
                <select
                  className={`${INPUT} mt-1`}
                  value={spec.migrationFeePreset}
                  onChange={(e) =>
                    update('migrationFeePreset', Number(e.target.value) as LaunchSpec['migrationFeePreset'])
                  }
                >
                  {[25, 30, 100, 200, 400, 600].map((bps) => (
                    <option key={bps} value={bps}>
                      {bps / 100}%
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={spec.dynamicFee.enabled}
                onChange={(e) => update('dynamicFee', { enabled: e.target.checked })}
                className="size-4 accent-violet-500"
              />
              Dynamic fee (volatility scaled)
            </label>

            <button
              onClick={() => setShowScript((v) => !v)}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-violet-500 hover:text-violet-200"
            >
              {showScript ? 'Hide' : 'Show'} launch script
            </button>
          </div>
        </section>

        {/* ---------------- results ---------------- */}
        <section className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Raise to graduate"
              value={`${fmt(data?.derived.migrationQuoteThreshold ?? 0)} ${spec.quoteAsset}`}
              hint={`${fmt(spec.initialMarketCap)} → ${fmt(spec.migrationMarketCap)} ${spec.quoteAsset} MC`}
            />
            <Stat
              label="Start price"
              value={`${(data?.derived.startPrice ?? 0).toExponential(3)}`}
              hint={`${spec.quoteAsset} per token`}
            />
            <Stat
              label="Peak MC"
              value={`${compact(currentRun?.peakMarketCap ?? 0)}`}
              hint={currentRun ? `${currentRun.fills.length} fills` : '—'}
            />
            <Stat
              label="Fees generated"
              value={`${fmt(currentRun?.tradingFees ?? 0, 2)}`}
              hint={`${feeEfficiency.toFixed(2)}% of volume`}
            />
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Market cap path</h2>
                <p className="text-xs text-slate-500">
                  {currentRun
                    ? currentRun.graduatedAtSec === null
                      ? 'Curve did not complete inside the scenario window'
                      : `Graduated at ${clock(currentRun.graduatedAtSec)}`
                    : 'Running simulation…'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-600">compare</span>
                {PRESETS.map((preset) => {
                  const active = compareIds.includes(preset.id);
                  return (
                    <button
                      key={preset.id}
                      onClick={() =>
                        setCompareIds((current) =>
                          current.includes(preset.id)
                            ? current.filter((id) => id !== preset.id)
                            : [...current, preset.id].slice(-3),
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        active
                          ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-200'
                          : 'border-slate-700 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                {(data?.runs ?? []).map((sim, index) => (
                  <button
                    key={sim.scenarioName}
                    onClick={() => setActiveRun(index)}
                    className={`rounded-full px-3 py-1.5 text-xs transition ${
                      activeRun === index
                        ? 'bg-slate-100 text-slate-900'
                        : 'border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sim.scenarioName}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    stroke="#1e293b"
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    stroke="#1e293b"
                    tickFormatter={(v: number) => compact(v)}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#020617',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value) => [fmt(Number(value)), `MC (${spec.quoteAsset})`]}
                  />
                  <ReferenceLine
                    y={spec.migrationMarketCap}
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    label={{ value: 'graduation', fill: '#22d3ee', fontSize: 10, position: 'right' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="marketCap"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    fill="url(#mcFill)"
                  />
                  {COMPARE_COLORS.slice(0, (data?.comparisons ?? []).length).map((color, index) => (
                    <Line
                      key={color}
                      type="monotone"
                      dataKey={`compare${index}`}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                      name={data?.comparisons?.[index]?.name ?? `compare ${index + 1}`}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`${CARD} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-slate-200">Scenario scoreboard</h2>
              <div className="space-y-2">
                {(data?.runs ?? []).map((sim, index) => {
                  const organic = data?.runs[0];
                  const organicFee =
                    organic && organic.quoteVolume > 0
                      ? organic.tradingFees / organic.quoteVolume
                      : 0;
                  const fee =
                    sim.quoteVolume > 0 ? sim.tradingFees / sim.quoteVolume : 0;
                  const delta =
                    index > 0 && organicFee > 0 ? ((fee - organicFee) / organicFee) * 100 : null;
                  return (
                    <div
                      key={sim.scenarioName}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-300">{sim.scenarioName}</span>
                      <span className="flex items-center gap-4 font-mono text-slate-400">
                        <span>peak {compact(sim.peakMarketCap)}</span>
                        <span>
                          {(fee * 100).toFixed(2)}%
                          {delta !== null && Math.abs(delta) >= 0.05 ? (
                            <span className={delta > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {' '}
                              {delta > 0 ? '+' : ''}
                              {delta.toFixed(1)}%
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            sim.graduatedAtSec === null ? 'text-amber-400' : 'text-emerald-400'
                          }
                        >
                          {sim.graduatedAtSec === null ? 'no graduation' : clock(sim.graduatedAtSec)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Fees are shown as a share of quote volume. The delta compares each scenario against
                the organic grind — a positive number means that demand pattern pays the launch more
                per unit of volume.
              </p>
              {currentRun?.warnings?.length ? (
                <div className="mt-3 space-y-1">
                  {currentRun.warnings.slice(0, 3).map((warning) => (
                    <p key={warning} className="text-[11px] text-amber-400/80">
                      ! {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={`${CARD} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-slate-200">Compiled curve</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className={LABEL}>Segments</div>
                  <div className="mt-1 font-mono text-slate-300">
                    {data?.curve.length ?? 0} constant-product
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className={LABEL}>Start price</div>
                  <div className="mt-1 font-mono text-slate-300">
                    {(data?.derived.startPrice ?? 0).toExponential(3)} {spec.quoteAsset}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className={LABEL}>Migration price</div>
                  <div className="mt-1 font-mono text-slate-300">
                    {(data?.derived.migrationPrice ?? 0).toExponential(3)} {spec.quoteAsset}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className={LABEL}>Migrating supply</div>
                  <div className="mt-1 font-mono text-slate-300">
                    {compact(data?.derived.migrationSupply ?? 0)} tokens
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Price multiple from first fill to graduation:{' '}
                <span className="font-mono text-slate-400">
                  {data && data.derived.startPrice > 0
                    ? `${(data.derived.migrationPrice / data.derived.startPrice).toFixed(1)}×`
                    : '—'}
                </span>
                . The curve is compiled by{' '}
                <span className="font-mono text-slate-400">buildCurveWithMarketCap</span>, the same
                helper a launch script would call.
              </p>
            </div>
          </div>

          {headToHead.length > 1 && (
            <div className={`${CARD} p-5`}>
              <h2 className="mb-1 text-sm font-semibold text-slate-200">
                Head to head · {data?.runs[activeRun]?.scenarioName}
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                The same demand replayed against every design you selected. Fee rate is fees divided
                by quote volume; the sniper premium compares the sniper-wave scenario against organic
                demand for that design.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="pb-2 pr-4 font-normal">Design</th>
                      <th className="pb-2 pr-4 font-normal">Raise target</th>
                      <th className="pb-2 pr-4 font-normal">Fee rate</th>
                      <th className="pb-2 pr-4 font-normal">Sniper premium</th>
                      <th className="pb-2 pr-4 font-normal">Graduates at</th>
                      <th className="pb-2 font-normal">Peak MC</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-300">
                    {headToHead.map((row) => (
                      <tr key={row.name} className="border-t border-slate-800">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{ background: row.color }}
                            />
                            {row.name}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          {compact(row.derived.migrationQuoteThreshold)} {spec.quoteAsset}
                        </td>
                        <td className="py-2 pr-4">
                          {row.activeFee === null ? '—' : `${(row.activeFee * 100).toFixed(2)}%`}
                        </td>
                        <td className="py-2 pr-4">
                          {row.sniperPremium === null ? (
                            '—'
                          ) : (
                            <span
                              className={
                                row.sniperPremium > 5 ? 'text-emerald-300' : 'text-slate-400'
                              }
                            >
                              {row.sniperPremium > 0 ? '+' : ''}
                              {row.sniperPremium.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {row.activeGrad === null ? (
                            <span className="text-amber-400">no graduation</span>
                          ) : (
                            clock(row.activeGrad)
                          )}
                        </td>
                        <td className="py-2">{compact(row.peak)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`${CARD} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  Graduation odds · Monte-Carlo
                </h2>
                <p className="text-xs text-slate-500">
                  {monteCarlo
                    ? `${monteCarlo.result.runs} sampled demand paths · ${monteCarlo.result.meanFills.toFixed(0)} fills per path on average`
                    : 'sampling demand paths…'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {[100, 200, 500].map((runs) => (
                  <button
                    key={runs}
                    onClick={() => setMcRuns(runs)}
                    className={`rounded-full px-3 py-1.5 text-xs transition ${
                      mcRuns === runs
                        ? 'bg-slate-100 text-slate-900'
                        : 'border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {runs} runs
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
                <div className={LABEL}>Graduates</div>
                <div className="mt-1 font-mono text-4xl text-emerald-300">
                  {monteCarlo
                    ? `${(monteCarlo.result.graduationProbability * 100).toFixed(0)}%`
                    : '—'}
                </div>
                <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                  <div>
                    median time to graduate:{' '}
                    <span className="font-mono text-slate-400">
                      {monteCarlo?.result.graduationTimeP50
                        ? clock(monteCarlo.result.graduationTimeP50)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    graduated in{' '}
                    <span className="font-mono text-slate-400">
                      {monteCarlo ? monteCarlo.result.graduated : '—'}
                    </span>{' '}
                    of {monteCarlo?.result.runs ?? '—'} paths
                  </div>
                </div>
                {mcLoading && <div className="mt-3 text-[11px] text-slate-600">resampling…</div>}
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Fees earned', data: monteCarlo?.result.fees, unit: spec.quoteAsset },
                    {
                      label: 'Effective fee rate',
                      data: monteCarlo?.result.feeRate,
                      unit: '%',
                    },
                    {
                      label: 'Peak market cap',
                      data: monteCarlo?.result.peakMarketCap,
                      unit: spec.quoteAsset,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                    >
                      <div className={LABEL}>{row.label}</div>
                      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-400">
                        {(['p10', 'p50', 'p90'] as const).map((key) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-slate-600">{key}</span>
                            <span>
                              {row.data
                                ? `${compact(row.data[key])}${row.unit === '%' ? '%' : ''}`
                                : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <div className={LABEL}>Distribution of peak market cap</div>
                  <div className="mt-3 flex h-24 items-end gap-1">
                    {(monteCarlo?.result.histogram ?? []).map((bucket, index) => {
                      const max = Math.max(
                        1,
                        ...(monteCarlo?.result.histogram ?? []).map((b) => b.count),
                      );
                      const above = bucket.bucket >= spec.migrationMarketCap;
                      return (
                        <div
                          key={index}
                          title={`${compact(bucket.bucket)} ${spec.quoteAsset}: ${bucket.count} paths`}
                          className={`flex-1 rounded-t ${above ? 'bg-emerald-400/70' : 'bg-violet-500/60'}`}
                          style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                    <span>0</span>
                    <span>
                      graduation {compact(spec.migrationMarketCap)} {spec.quoteAsset}
                    </span>
                    <span>
                      {compact(
                        monteCarlo?.result.histogram.at(-1)?.bucket ?? spec.migrationMarketCap,
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Green bars cleared the graduation target. Demand is sampled lognormally (buyer
                    count and buy size), with a 70% chance of a sniper wave, a 35% chance of a whale
                    and a coin-flip on whether that whale dumps.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {showScript && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-200">Launch script</h2>
                <button
                  onClick={() => void navigator.clipboard.writeText(script)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-violet-500 hover:text-violet-200"
                >
                  Copy
                </button>
              </div>
              <pre className="max-h-[420px] overflow-auto bg-slate-950/80 p-5 text-[11px] leading-relaxed text-slate-400">
                <code>{script}</code>
              </pre>
            </div>
          )}

          {loading && <p className="text-center text-xs text-slate-600">simulating…</p>}
        </section>
      </main>

      <footer className="mx-auto max-w-[1400px] px-6 pb-10 pt-4 text-xs text-slate-600">
        Simulation runs the official Meteora DBC swap math
        (<span className="font-mono">@meteora-ag/dynamic-bonding-curve-sdk</span>) against a virtual
        pool, so the fees and prices match what the on-chain program would produce for the same trade
        sequence.
      </footer>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className={LABEL}>{label}</div>
      <div className="mt-1 font-mono text-xl text-slate-100">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}
