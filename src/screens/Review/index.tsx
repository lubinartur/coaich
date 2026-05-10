import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { db } from '@/services/db';
import { formatPrLine } from '@/services/prDetection';
import { formatNextTargetLine } from '@/services/progressionEngine';
import type { AIReview, PrRecord, WorkoutSession } from '@/types';

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

function formatKg(n: number): string {
  return n.toLocaleString('en-GB');
}

function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min.toString().padStart(2, '0')}m`;
  return `${min}m`;
}

const STATS = [
  { label: 'VOLUME', value: '8,420kg' },
  { label: 'SETS', value: '18' },
  { label: 'EXERCISES', value: '6' },
  { label: 'DURATION', value: '1h 05m' },
] as const;

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

export default function ReviewScreen({
  sessionId,
  workoutName,
  workoutDate,
  onBack,
  onEditWorkout,
  dataRefreshKey = 0,
}: ReviewScreenProps) {
  const [logOpen, setLogOpen] = useState(false);
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
        if (!cancelled) setPrRecords(rows.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName)));
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

  const displayStats = useMemo(() => {
    if (!session) {
      return [...STATS];
    }
    const setCount = session.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    return [
      { label: 'VOLUME' as const, value: `${formatKg(session.totalVolume)}kg` },
      { label: 'SETS' as const, value: String(setCount) },
      { label: 'EXERCISES' as const, value: String(session.exercises.length) },
      { label: 'DURATION' as const, value: formatDurationMinutes(session.durationMinutes) },
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

  return (
    <div className="flex min-h-screen w-full flex-col bg-bg">
      <header className="shrink-0 border-b border-border px-5 pb-4 pt-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-primary transition-colors active:scale-[0.98]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-bold leading-tight text-text-primary">{workoutName}</h1>
            <p className="mt-1 text-sm text-text-secondary">{workoutDate}</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 pb-10 no-scrollbar">
        <div className="flex flex-col gap-6">
          {/* Stats 2×2 */}
          <div className="grid grid-cols-2 gap-3">
            {displayStats.map((s) => (
              <Card key={s.label} className="flex flex-col items-center justify-center text-center">
                <p className="mb-1 text-[10px] font-bold tracking-widest text-text-secondary">{s.label}</p>
                <p className="font-mono text-xl font-bold tracking-tight text-text-primary">{s.value}</p>
              </Card>
            ))}
          </div>

          {prRecords.length > 0 ? (
            <Card className="border border-border">
              <h2 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#F59E0B]">
                <span aria-hidden>🏆</span>
                Personal Records
              </h2>
              <ul className="space-y-2 text-sm leading-snug text-text-primary">
                {prRecords.map((r) => (
                  <li key={r.id ?? `${r.exerciseId}-${r.achievedAt}`}>{formatPrLine(r)}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* AI Coach report */}
          <Card className="border border-border border-l-4 border-l-accent pl-1">
            <div className="flex items-center gap-2 pl-3">
              <span className="text-sm text-accent" aria-hidden>
                ✦
              </span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">COACH AI REPORT</p>
            </div>
            {sessionId && coachLoading ? (
              <div className="mt-4 space-y-3 pl-3 pr-2" aria-busy>
                <div className="h-4 w-full animate-pulse rounded bg-border" />
                <div className="h-4 w-[80%] animate-pulse rounded bg-border" />
                <div className="h-4 w-[60%] animate-pulse rounded bg-border" />
                <div className="flex justify-center py-6">
                  <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
                    aria-hidden
                  />
                </div>
              </div>
            ) : sessionId && !coachReview ? (
              <p className="mt-4 pl-3 pr-1 text-sm text-text-secondary">No AI review for this workout.</p>
            ) : coachReview ? (
              <>
                <p className="mt-4 pl-3 pr-1 text-sm italic leading-relaxed text-text-primary/90">
                  &ldquo;{coachReview.intro}&rdquo;
                </p>

                <div className="mt-6 space-y-6 pl-3 pr-1">
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success">
                      <span aria-hidden>✓</span>
                      WHAT WENT WELL
                    </h3>
                    <ul className="space-y-1.5 text-sm text-success">
                      {coachReview.wentWell.map((line, i) => (
                        <li key={`${line}-${i}`} className="flex gap-2">
                          <span aria-hidden>✓</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-warning">
                      <span aria-hidden>⚠</span>
                      WHAT TO IMPROVE
                    </h3>
                    <ul className="space-y-1.5 text-sm text-warning">
                      {coachReview.toImprove.map((line, i) => (
                        <li key={`${line}-${i}`} className="flex gap-2">
                          <span aria-hidden>⚠</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {coachReview.nextTargets.length > 0 ? (
                    <div>
                      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-accent">
                        <span aria-hidden>→</span>
                        NEXT WORKOUT TARGETS
                      </h3>
                      <ul className="space-y-2 text-xs text-text-secondary">
                        {coachReview.nextTargets.map((t, i) => (
                          <li key={`${t.exerciseId}-${i}`} className="font-mono text-accent">
                            {`${t.exerciseName}: ${formatNextTargetLine(t.exerciseId, t.exerciseName, t.weight, t.reps, t.sets)}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {coachReview.exerciseNotes.length > 0 ? (
                    <div>
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-primary">
                        EXERCISE NOTES
                      </h3>
                      <div className="space-y-4 text-sm italic leading-relaxed text-text-secondary">
                        {coachReview.exerciseNotes.map((block, i) => (
                          <p key={`${block.exerciseId}-${block.exerciseName}-${i}`}>
                            <span className="font-semibold not-italic text-text-primary">{block.exerciseName}: </span>
                            {block.note}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="mt-4 pl-3 pr-1 text-sm text-text-secondary">No AI review for this workout.</p>
            )}
          </Card>

          {sessionId && onEditWorkout ? (
            <Button type="button" variant="secondary" size="sm" fullWidth onClick={onEditWorkout}>
              Edit Workout
            </Button>
          ) : null}

          {/* Exercise log */}
          <div className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setLogOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
              aria-expanded={logOpen}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Exercise log</span>
              <ChevronRight
                className={`h-5 w-5 shrink-0 text-text-secondary transition-transform ${logOpen ? 'rotate-90' : ''}`}
                aria-hidden
              />
            </button>
            {logOpen && (
              <div className="border-t border-border px-4 pb-4 pt-2">
                <div className="flex flex-col gap-4">
                  {logExercises.map((ex) => (
                    <div key={ex.key}>
                      <p className="text-sm font-bold text-text-primary">{ex.name}</p>
                      <div className="mt-2 space-y-1.5 font-mono text-xs">
                        {ex.sets.map((st) => (
                          <p
                            key={st.n}
                            className={st.completed ? 'text-text-secondary' : 'text-text-secondary/50'}
                          >
                            <span>Set {st.n}</span>
                            <span className="text-text-secondary"> — </span>
                            <span className={st.completed ? 'text-text-primary' : 'text-text-primary/60'}>
                              {st.w}kg × {st.r}
                              {!st.completed ? ' (incomplete)' : ''}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
