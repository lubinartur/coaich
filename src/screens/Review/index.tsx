import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { db } from '@/services/db';
import { canonicalExerciseId } from '@/services/progressionEngine';
import type { AIReview, PrRecord, WorkoutSession } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';

export interface ReviewScreenProps {
  /** When set, stats and exercise log are loaded from Dexie for this session. */
  sessionId?: string;
  workoutName: string;
  workoutDate: string;
  onBack: () => void;
  onEditWorkout?: () => void;
  /** Bump after external edits so session is re-fetched from Dexie. */
  dataRefreshKey?: number;
}

function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min.toString().padStart(2, '0')}m`;
  return `${min}m`;
}

type StatTile = { label: string; value: string };

const STATS_PLACEHOLDER: StatTile[] = [
  { label: 'VOLUME', value: '420kg' },
  { label: 'SETS', value: '18' },
  { label: 'EXERCISES', value: '6' },
  { label: 'DURATION', value: '1h 05m' },
];

/** Stats grid only: always kg, comma thousands when ≥ 1000. */
function formatStatVolumeKg(volKg: number): string {
  const rounded = Math.round(volKg);
  const num = rounded >= 1000 ? rounded.toLocaleString('en-US') : String(rounded);
  return `${num}kg`;
}

const LOG_EXERCISES = [
  {
    name: 'Lat Pulldown',
    sets: [
      { n: 1, w: 65, r: 12 },
      { n: 2, w: 65, r: 12 },
      { n: 3, w: 70, r: 10 },
    ],
  },
  {
    name: 'Barbell Row',
    sets: [
      { n: 1, w: 70, r: 10 },
      { n: 2, w: 70, r: 10 },
      { n: 3, w: 70, r: 9 },
    ],
  },
  {
    name: 'Bicep Curl',
    sets: [
      { n: 1, w: 22, r: 10 },
      { n: 2, w: 22, r: 10 },
      { n: 3, w: 22, r: 10 },
    ],
  },
] as const;

function exerciseVolumeKg(sets: { w: number; r: number; completed: boolean }[]): number {
  return sets.filter((s) => s.completed).reduce((a, s) => a + s.w * s.r, 0);
}

function formatVolumeDisplay(volKg: number): { value: string; unit: string } {
  if (volKg < 1000) {
    return { value: String(Math.round(volKg)), unit: 'kg' };
  }
  return { value: (volKg / 1000).toFixed(1), unit: 't' };
}

/** PR row title — same display name rules as session rows. */
function prDisplayName(r: PrRecord): string {
  return toDisplayName((r.exerciseName ?? '').trim() || 'Exercise');
}

/** PR row subtitle: `77.5kg × 8` or `12 reps` (same rules as prDetection `formatPrLine`). */
function prWeightSubtitle(r: PrRecord): string {
  const w = r.weight;
  const reps = r.reps;
  if (w > 0) {
    const ws = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, '');
    return `${ws}kg × ${reps}`;
  }
  return `${reps} reps`;
}

export default function ReviewScreen({
  sessionId,
  workoutName,
  workoutDate,
  onBack,
  onEditWorkout,
  dataRefreshKey = 0,
}: ReviewScreenProps) {
  const [expandedLogKeys, setExpandedLogKeys] = useState<string[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [prRecords, setPrRecords] = useState<PrRecord[]>([]);
  const [coachReview, setCoachReview] = useState<AIReview | null>(null);
  const [coachLoading, setCoachLoading] = useState(() => Boolean(sessionId));

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    let cancelled = false;
    void db.workoutSessions.get(sessionId).then((s) => {
      if (!cancelled) setSession(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  useEffect(() => {
    if (!sessionId) {
      setPrRecords([]);
      return;
    }
    let cancelled = false;
    void db.prRecords
      .where('sessionId')
      .equals(sessionId)
      .toArray()
      .then((rows) => {
        if (!cancelled) setPrRecords(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  useEffect(() => {
    if (!sessionId) {
      setCoachReview(null);
      setCoachLoading(false);
      return;
    }
    let cancelled = false;
    setCoachLoading(true);
    void db.aiReviews
      .where('sessionId')
      .equals(sessionId)
      .first()
      .then((row) => {
        if (!cancelled) {
          setCoachReview(row ?? null);
          setCoachLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  const prRecordsForDisplay = useMemo(() => {
    const resolveName = (r: PrRecord): string => {
      const raw = r as PrRecord & { exercise_name?: string };
      let name = (r.exerciseName ?? raw.exercise_name ?? '').trim();
      if (!name && session) {
        const cid = r.exerciseId;
        const ex = session.exercises.find(
          (e) => e.exerciseId === cid || canonicalExerciseId(e.exerciseId) === cid,
        );
        name = (ex?.exerciseName ?? '').trim();
      }
      return name || 'Exercise';
    };
    return [...prRecords]
      .map((r) => ({ ...r, exerciseName: resolveName(r) }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
  }, [prRecords, session]);

  const displayStats = useMemo((): StatTile[] => {
    if (!session) {
      return STATS_PLACEHOLDER;
    }
    const setCount = session.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const volKg = session.totalVolume;
    const durMin = Math.max(0, Math.round(session.durationMinutes));
    return [
      { label: 'VOLUME', value: formatStatVolumeKg(volKg) },
      { label: 'SETS', value: String(setCount) },
      { label: 'EXERCISES', value: String(session.exercises.length) },
      { label: 'DURATION', value: formatDurationMinutes(durMin) },
    ];
  }, [session]);

  const logExercises = useMemo(() => {
    if (!session) {
      return LOG_EXERCISES.map((ex) => ({
        key: ex.name,
        name: ex.name,
        sets: ex.sets.map((st) => ({ n: st.n, w: st.w, r: st.r, completed: true })),
      }));
    }
    return session.exercises.map((ex) => ({
      key: ex.exerciseId,
      name: ex.exerciseName,
      sets: ex.sets.map((st) => ({
        n: st.setNumber,
        w: st.weight,
        r: st.reps,
        completed: st.completed,
      })),
    }));
  }, [session]);

  const toggleLogExpand = (key: string) => {
    setExpandedLogKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div className="min-h-screen w-full animate-in fade-in slide-in-from-bottom-8 bg-[#0A0A0A] pb-24 duration-700">
      <header className="sticky top-0 z-10 border-b border-[#2A2A2A] bg-[#0A0A0A]/80 px-6 pb-6 pt-6 backdrop-blur-xl">
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl bg-white/5 p-3 text-white transition-colors hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {sessionId && onEditWorkout ? (
            <button
              type="button"
              onClick={onEditWorkout}
              className="rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#8B5CF6] shadow-[0_0_20px_rgba(139,92,246,0.15)]"
            >
              Edit Session
            </button>
          ) : (
            <span className="w-10" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" aria-hidden />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
              {workoutDate}
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">{toDisplayName(workoutName)}</h1>
        </div>
      </header>

      <div className="space-y-12 px-6 py-10">
        <div className="grid grid-cols-2 gap-4">
          {displayStats.map((stat) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-[24px] border border-[#222222] bg-[#111111] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#333333]"
            >
              <span className="relative z-10 text-[9px] font-black tracking-[0.15em] text-[#6B7280]">
                {stat.label}
              </span>
              <div className="relative z-10 mt-2">
                <div className="text-3xl font-black tracking-tighter transition-colors group-hover:text-[#8B5CF6]">
                  {stat.value}
                </div>
              </div>
              <div
                className="absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-white/[0.02] transition-transform duration-700 group-hover:scale-150"
                aria-hidden
              />
            </div>
          ))}
        </div>

        {prRecordsForDisplay.length > 0 ? (
          <section className="relative overflow-hidden rounded-[32px] border border-[#F59E0B]/20 bg-gradient-to-br from-[#F59E0B]/10 to-transparent p-8 shadow-[0_0_40px_-12px_rgba(245,158,11,0.2)]">
            <div className="mb-5 flex items-center gap-2">
              <div className="rounded-lg bg-[#F59E0B] p-1.5 shadow-lg shadow-[#F59E0B]/20">
                <Trophy className="h-4 w-4 fill-black text-black" aria-hidden />
              </div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Personal Records</h3>
            </div>
            <div className="divide-y divide-[#F59E0B]/15">
              {prRecordsForDisplay.map((r) => (
                <div
                  key={r.id ?? `${r.exerciseId}-${r.achievedAt}`}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <p className="text-base font-bold text-white">{prDisplayName(r)}</p>
                  <p className="mt-1 text-sm text-[#F59E0B]">{prWeightSubtitle(r)}</p>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10" aria-hidden>
              <Sparkles className="h-20 w-20 text-[#F59E0B]" />
            </div>
          </section>
        ) : null}

        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-black text-black shadow-xl shadow-white/10">
              AI
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Coach Analysis</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#6B7280]">
                Post-Session Intelligence
              </p>
            </div>
          </div>

          {sessionId && coachLoading ? (
            <div className="space-y-4 px-2" aria-busy>
              <div className="h-2 w-full animate-pulse rounded-full bg-[#111111]" />
              <div className="h-2 w-[90%] animate-pulse rounded-full bg-[#111111]" />
              <div className="h-2 w-[80%] animate-pulse rounded-full bg-[#111111]" />
            </div>
          ) : sessionId && !coachReview ? (
            <p className="px-2 text-sm text-[#6B7280]">No AI review for this workout.</p>
          ) : coachReview ? (
            <div className="space-y-10 px-2">
              <p className="text-xl font-medium italic leading-tight tracking-tight text-white/90">
                {coachReview.intro}
              </p>

              <div className="grid grid-cols-1 gap-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#22C55E]">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={3} aria-hidden />
                    What went well
                  </div>
                  <div className="space-y-3">
                    {coachReview.wentWell.map((p, i) => (
                      <div key={`${p}-${i}`} className="group flex gap-4">
                        <span className="mt-1 font-mono font-black text-[#22C55E] opacity-40 transition-opacity group-hover:opacity-100">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="text-base leading-snug text-[#AAAAAA]">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                    <AlertCircle className="h-3 w-3" strokeWidth={3} aria-hidden />
                    To improve
                  </div>
                  <div className="space-y-3">
                    {coachReview.toImprove.map((p, i) => (
                      <div key={`${p}-${i}`} className="group flex gap-4">
                        <span className="mt-1 font-mono font-black text-[#F59E0B] opacity-40 transition-opacity group-hover:opacity-100">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="text-base leading-snug text-[#AAAAAA]">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {coachReview.exerciseNotes.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#8B5CF6]">
                    <MessageSquare className="h-3 w-3" strokeWidth={3} aria-hidden />
                    Exercise notes
                  </div>
                  <div className="space-y-3">
                    {coachReview.exerciseNotes.map((block, i) => (
                      <div key={`${block.exerciseId}-${block.exerciseName}-${i}`} className="group flex gap-4">
                        <span className="mt-1 font-mono font-black text-[#8B5CF6] opacity-40 transition-opacity group-hover:opacity-100">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white">{toDisplayName(block.exerciseName || 'Exercise')}</p>
                          <p className="mt-1 text-base leading-snug text-[#AAAAAA]">{block.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="px-2 text-sm text-[#6B7280]">No AI review for this workout.</p>
          )}
        </section>

        <section className="space-y-6">
          <h3 className="px-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
            Exercise log
          </h3>
          <div className="space-y-4">
            {logExercises.map((ex) => {
              const completed = ex.sets.filter((s) => s.completed);
              const volDisp = formatVolumeDisplay(exerciseVolumeKg(ex.sets));
              const open = expandedLogKeys.includes(ex.key);
              return (
                <div key={ex.key} className="overflow-hidden rounded-[32px] border border-[#222222] bg-[#111111]">
                  <button
                    type="button"
                    onClick={() => toggleLogExpand(ex.key)}
                    className="group flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-[#181818]"
                  >
                    <div>
                      <div className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-[#8B5CF6]">
                        {toDisplayName(ex.name)}
                      </div>
                      <div className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
                        {completed.length} sets • {volDisp.value}
                        {volDisp.unit ? ` ${volDisp.unit}` : ''}
                      </div>
                    </div>
                    <div className="rounded-full bg-[#222222] p-2 transition-all group-hover:bg-[#8B5CF6]/20 group-hover:text-[#8B5CF6]">
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {open ? (
                      <motion.div
                        key={ex.key}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 border-t border-white/5 px-6 pb-6 pt-4">
                          <div className="mb-2 grid grid-cols-3 gap-2 px-2 text-[8px] font-black uppercase tracking-[0.3em] text-[#6B7280]/50">
                            <span>Set</span>
                            <span className="text-center">Weight</span>
                            <span className="text-right">Reps</span>
                          </div>
                          {completed.map((s, idx) => (
                            <div key={s.n} className="grid grid-cols-3 items-center gap-2 px-2">
                              <span className="text-[10px] font-black text-[#6B7280]">SET {idx + 1}</span>
                              <div className="text-center">
                                <span className="text-xl font-black tabular-nums tracking-tighter text-white">
                                  {s.w}
                                </span>
                                <span className="ml-1 text-[9px] uppercase text-[#333333]">kg</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xl font-black tabular-nums tracking-tighter text-[#8B5CF6]">
                                  {s.r}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
