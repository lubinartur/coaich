import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { db } from '@/services/db';
import {
  allTimeBestEpley1RM,
  BENCHMARK_LIFT_DEFS,
  bestEpley1RMInWindow,
  hasAnyCompletedSet,
  overallStrengthScore,
  pctChange,
  rollingWeekWindows,
  splitAverage1RM,
  type SplitKey,
  volumeRowsForUi,
} from '@/services/progressMetrics';
import type { WorkoutSession } from '@/types';

function formatSignedKg(delta: number): string {
  if (delta === 0) return '+0';
  const rounded = Math.abs(delta) < 10 ? Math.round(delta * 10) / 10 : Math.round(delta);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${rounded}`.replace(/\.0$/, '');
}

function formatPct(p: number | null): string {
  if (p === null) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const all = await db.workoutSessions.toArray();
        if (!cancelled) setSessions(all);
      } catch (err) {
        console.error('[Progress] load sessions', err);
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    if (sessions.length === 0 || !hasAnyCompletedSet(sessions)) return null;
    const now = Date.now();
    const { thisStart, thisEnd, prevStart, prevEnd } = rollingWeekWindows(now);

    const thisOverall = overallStrengthScore(sessions, thisStart, thisEnd);
    const prevOverall = overallStrengthScore(sessions, prevStart, prevEnd);
    const overallPct = pctChange(thisOverall, prevOverall);

    const splits: Record<
      SplitKey,
      { thisAvg: number; prevAvg: number }
    > = {
      push: {
        thisAvg: splitAverage1RM(sessions, 'push', thisStart, thisEnd),
        prevAvg: splitAverage1RM(sessions, 'push', prevStart, prevEnd),
      },
      pull: {
        thisAvg: splitAverage1RM(sessions, 'pull', thisStart, thisEnd),
        prevAvg: splitAverage1RM(sessions, 'pull', prevStart, prevEnd),
      },
      legs: {
        thisAvg: splitAverage1RM(sessions, 'legs', thisStart, thisEnd),
        prevAvg: splitAverage1RM(sessions, 'legs', prevStart, prevEnd),
      },
    };

    const benchmarks = BENCHMARK_LIFT_DEFS.map(({ label, exerciseId }) => {
      const thisBest = bestEpley1RMInWindow(sessions, exerciseId, thisStart, thisEnd);
      const prevBest = bestEpley1RMInWindow(sessions, exerciseId, prevStart, prevEnd);
      const allBest = allTimeBestEpley1RM(sessions, exerciseId);
      const delta = thisBest - prevBest;
      let changeTone: 'success' | 'muted' | 'danger' = 'muted';
      if (delta > 0) changeTone = 'success';
      else if (delta < 0) changeTone = 'danger';
      const barPct = allBest > 0 ? Math.min(100, (thisBest / allBest) * 100) : 0;
      return {
        label,
        exerciseId,
        displayKg: Math.round(thisBest),
        changeText: `${formatSignedKg(delta)}kg`,
        changeTone,
        barPct,
      };
    });

    const volumeRows = volumeRowsForUi(sessions, thisStart, thisEnd);
    const maxVol = Math.max(1, ...volumeRows.map((r) => r.sets));

    return {
      thisOverall,
      prevOverall,
      overallPct,
      splits,
      benchmarks,
      volumeRows,
      maxVol,
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Progress</h1>
        </header>
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Progress</h1>
        </header>
        <Card className="border-border bg-card py-10 text-center">
          <p className="text-sm font-medium leading-relaxed text-text-secondary">
            Complete your first workout to see progress
          </p>
        </Card>
      </div>
    );
  }

  const { thisOverall, overallPct, splits, benchmarks, volumeRows, maxVol } = metrics;

  const overallTrendUp = overallPct !== null && overallPct > 0;
  const overallTrendDown = overallPct !== null && overallPct < 0;
  const overallTrendFlat = overallPct !== null && overallPct === 0;
  const overallTrendClass = overallTrendUp
    ? 'text-success'
    : overallTrendDown
      ? 'text-red-400'
      : 'text-text-secondary';

  const SPLIT_LABEL: Record<SplitKey, string> = {
    push: 'PUSH',
    pull: 'PULL',
    legs: 'LEGS',
  };

  function splitTrend(split: SplitKey) {
    const { thisAvg, prevAvg } = splits[split];
    const d = thisAvg - prevAvg;
    if (d > 0.5) return { Icon: ArrowUp, className: 'text-success' as const };
    if (d < -0.5) return { Icon: ArrowDown, className: 'text-red-400' as const };
    return { Icon: null as null, className: 'text-text-secondary' as const };
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Progress</h1>
      </header>

      {/* Overall strength */}
      <Card className="border-border bg-card">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          OVERALL STRENGTH SCORE
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-5xl font-bold tracking-tighter text-text-primary">{thisOverall}</span>
          <span className={`flex items-center gap-0.5 text-sm font-bold ${overallTrendClass}`}>
            {overallPct !== null && overallPct !== 0 ? (
              <>
                {overallTrendUp ? <ArrowUp className="h-4 w-4" aria-hidden /> : null}
                {overallTrendDown ? <ArrowDown className="h-4 w-4" aria-hidden /> : null}
                {formatPct(overallPct)}
              </>
            ) : overallTrendFlat ? (
              <span>{formatPct(0)}</span>
            ) : overallPct === null && thisOverall > 0 ? (
              <>
                <ArrowUp className="h-4 w-4" aria-hidden />
                New
              </>
            ) : (
              <span>vs last week</span>
            )}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['push', 'pull', 'legs'] as const).map((key) => {
            const avg = Math.round(splits[key].thisAvg);
            const { Icon, className } = splitTrend(key);
            return (
              <div key={key} className="rounded-lg border border-border bg-surface p-2 text-center">
                <p className="text-[8px] font-bold uppercase tracking-wide text-text-secondary">{SPLIT_LABEL[key]}</p>
                <p className={`mt-1 flex items-center justify-center gap-0.5 text-xs font-bold ${className}`}>
                  {avg}
                  {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Benchmark lifts */}
      <section>
        <h2 className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          BENCHMARK LIFTS (EST. 1RM)
        </h2>
        <div className="flex flex-col gap-3">
          {benchmarks.map((lift) => (
            <Card key={lift.exerciseId} className="relative overflow-hidden border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-text-primary">{lift.label}</p>
                  <p
                    className={`mt-1 text-[10px] font-bold uppercase tracking-tight ${
                      lift.changeTone === 'success'
                        ? 'text-success'
                        : lift.changeTone === 'danger'
                          ? 'text-red-400'
                          : 'text-text-secondary'
                    }`}
                  >
                    {lift.changeText}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-lg font-bold text-text-primary">{lift.displayKg}kg</span>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all"
                  style={{ width: `${lift.barPct}%` }}
                />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Weekly volume */}
      <section className="mb-4">
        <h2 className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          WEEKLY VOLUME
        </h2>
        <Card className="flex flex-col gap-4 border-border">
          {volumeRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold uppercase text-text-secondary">{row.label}</span>
                <span className="font-mono text-text-primary">{row.sets} SETS</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${(row.sets / maxVol) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
