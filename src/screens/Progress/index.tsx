import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import { db } from '@/services/db';
import { canonicalExerciseId } from '@/services/progressionEngine';
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

/** Sessions where this exercise has at least one completed set with weight & reps. */
function countSessionsWithLiftData(sessions: WorkoutSession[], exerciseId: string): number {
  const cid = canonicalExerciseId(exerciseId);
  let n = 0;
  for (const s of sessions) {
    const ex = s.exercises.find((e) => canonicalExerciseId(e.exerciseId) === cid);
    if (!ex) continue;
    const has = ex.sets.some((st) => st.completed && st.weight > 0 && st.reps > 0);
    if (has) n += 1;
  }
  return n;
}

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

const SATURATION_KEYS = ['chest', 'back', 'shoulders', 'legs'] as const;

export default function ProgressScreen() {
  const { t } = useTranslation();
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
      const liftSessionCount = countSessionsWithLiftData(sessions, exerciseId);
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
        liftSessionCount,
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
      <div className="flex flex-col gap-6 px-6 pb-32 pt-10">
        <header>
          <h1 className="text-4xl font-black tracking-tighter text-white">{t('progress')}</h1>
        </header>
        <p className="text-sm text-[#6B7280]">{t('loading')}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col gap-6 px-6 pb-32 pt-10">
        <header>
          <h1 className="text-4xl font-black tracking-tighter text-white">{t('progress')}</h1>
          <p className="mt-1 font-medium tracking-tight text-[#6B7280]">{t('yourProgressOverTime')}</p>
        </header>
        <Card className="border-[#2A2A2A] bg-[#1C1C1C] py-10 text-center">
          <p className="text-sm font-medium leading-relaxed text-[#6B7280]">
            {t('completeFirstWorkoutToSeeProgress')}
          </p>
        </Card>
      </div>
    );
  }

  const { thisOverall, overallPct, splits, benchmarks, volumeRows, maxVol } = metrics;
  const benchmarksWithData = benchmarks.filter((b) => b.displayKg > 0);

  const overallTrendUp = overallPct !== null && overallPct > 0;
  const overallTrendDown = overallPct !== null && overallPct < 0;
  const overallTrendFlat = overallPct !== null && overallPct === 0;

  const SPLIT_LABEL: Record<SplitKey, string> = {
    push: t('push').toUpperCase(),
    pull: t('pull').toUpperCase(),
    legs: t('legs').toUpperCase(),
  };

  const saturationRows = SATURATION_KEYS.map((k) => volumeRows.find((r) => r.key === k)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );

  return (
    <div className="animate-in fade-in space-y-12 px-6 pb-32 pt-10 duration-700">
      <header>
        <h1 className="text-4xl font-black tracking-tighter text-white">{t('progress')}</h1>
        <p className="mt-1 font-medium tracking-tight text-[#6B7280]">{t('yourProgressOverTime')}</p>
      </header>

      <section className="relative overflow-hidden rounded-[32px] border border-white/5 bg-[#141414]/80 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.98]">
        <div className="relative z-10">
          <div className="mb-2 text-center">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
              {t('currentStrengthIndex')}
            </h3>
          </div>

          <div className="text-center">
            <span className="text-7xl font-black tracking-tighter text-white">{thisOverall}</span>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3">
            {(['push', 'pull', 'legs'] as const).map((key) => {
              const thisAvg = splits[key].thisAvg;
              const noSplitData = thisAvg <= 0;
              const avg = noSplitData ? null : Math.round(thisAvg);
              const sp = pctChange(splits[key].thisAvg, splits[key].prevAvg);
              const showTrendRow = !noSplitData && sp !== null && sp !== 0;
              const up = showTrendRow && sp > 0;
              const down = showTrendRow && sp < 0;
              return (
                <div
                  key={key}
                  className="flex flex-col items-center rounded-2xl border border-white/5 bg-[#050505]/40 p-4 text-center backdrop-blur-md transition-all hover:bg-[#050505]/60"
                >
                  <span className="mb-2 block text-[9px] font-black tracking-[0.2em] text-[#6B7280]">
                    {SPLIT_LABEL[key]}
                  </span>
                  <span className="block text-lg font-black tracking-tighter text-white">
                    {noSplitData ? '—' : avg}
                  </span>
                  {showTrendRow ? (
                    <div
                      className={`mt-2 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-tight ${
                        up ? 'text-[#22C55E]' : down ? 'text-[#EF4444]' : 'text-[#6B7280]'
                      }`}
                    >
                      {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : null}
                      {down ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                      {formatPct(sp)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8B5CF6]/5 blur-[80px]"
          aria-hidden
        />
      </section>

      {benchmarksWithData.length > 0 ? (
        <section className="space-y-6">
          <div>
            <h3 className="text-left text-sm font-black uppercase tracking-widest text-[#6B7280]">
              {t('benchmarkLifts')}
            </h3>
          </div>
          <div className="flex flex-col gap-10">
            {benchmarksWithData.map((lift) => {
              const showDeltaBadge =
                lift.liftSessionCount >= 2 &&
                lift.changeTone === 'success' &&
                lift.changeText !== '+0kg';
              return (
                <div key={lift.exerciseId} className="group">
                  <span className="mb-2 block text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                    {lift.label}
                  </span>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-1">
                      <span className="text-4xl font-black tabular-nums tracking-tighter text-white">
                        {lift.displayKg}
                      </span>
                      <span className="text-sm text-[#6B7280]">{t('kgUnit')}</span>
                    </div>
                    {showDeltaBadge ? (
                      <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1">
                        <TrendingUp className="h-3 w-3 text-[#22C55E]" aria-hidden />
                        <span className="text-[10px] font-black text-[#22C55E]">{lift.changeText}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 h-[1.5px] w-full overflow-hidden rounded-full bg-[#111111]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${lift.barPct}%` }}
                      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                      className="h-[1.5px] rounded-full bg-gradient-to-r from-[#8B5CF6]/40 to-[#8B5CF6] shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-6 pt-4">
        <h3 className="px-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
          {t('weeklySaturation')}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {saturationRows.map((v) => {
            const fillPct = maxVol > 0 ? Math.min(100, Math.round((v.sets / maxVol) * 100)) : 0;
            return (
              <div
                key={v.key}
                className="relative overflow-hidden rounded-3xl border border-[#222222] bg-[#111111] p-5"
              >
                <div className="relative z-10 flex flex-col items-center">
                  <span className="mb-2 text-[9px] font-black tracking-widest text-[#6B7280]">{v.label}</span>
                  <span className="text-2xl font-black tracking-tight text-white">{fillPct}%</span>
                  <span className="mt-1 text-[9px] font-bold uppercase text-[#6B7280]">
                    {v.sets} / {maxVol} {t('setsUnit')}
                  </span>
                </div>
                <div className="absolute inset-0 z-0">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${fillPct}%` }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className={`absolute bottom-0 left-0 right-0 opacity-20 ${
                      v.sets >= maxVol && maxVol > 0 ? 'bg-[#8B5CF6]' : 'bg-[#6B7280]'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
