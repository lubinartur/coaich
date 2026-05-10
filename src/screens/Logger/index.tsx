import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';
import { ProgressionStatusNote } from '@/components/ProgressionStatusNote';
import { Button, Card } from '@/components/ui';
import type { LoggerTemplateExercise } from '@/constants/workoutPrograms';
import { db, getProfile } from '@/services/db';
import { buildPrRecordsForSession, isSetPersonalRecord } from '@/services/prDetection';
import {
  canonicalExerciseId,
  formatTargetLineForExercise,
  getLastPerformedSummary,
  getRecLastLayout,
  isPlankExerciseName,
  parseRecommendLine,
  previewExerciseTarget,
  type ProgressionStatus,
} from '@/services/progressionEngine';
import type { Exercise, MuscleGroup, SessionExercise, WorkoutSession, WorkoutType } from '@/types';
import ExercisePicker from '@/screens/Logger/ExercisePicker';

type SetRow = {
  id: string;
  weight: string;
  reps: string;
  completed: boolean;
  /** True when this completed set beats all prior Dexie history + other sets this workout. */
  isPR?: boolean;
};

type LoggerExercise = {
  exerciseId: string;
  muscleGroup: MuscleGroup;
  name: string;
  equipment: Exercise['equipment'];
  recommend: string;
  last: string;
  progressionStatus: ProgressionStatus;
  sets: SetRow[];
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function createSet(): SetRow {
  return { id: makeId(), weight: '', reps: '', completed: false };
}

function createSetFromRecommend(recommend: string): SetRow {
  const p = parseRecommendLine(recommend);
  if (!p) return createSet();
  return { id: makeId(), weight: String(p.weight), reps: String(p.reps), completed: false };
}

function createSetForExercise(equipment: Exercise['equipment']): SetRow {
  if (equipment === 'bodyweight') {
    return { id: makeId(), weight: '0', reps: '', completed: false };
  }
  return createSet();
}

function skeletonFromTemplate(template: readonly LoggerTemplateExercise[]): LoggerExercise[] {
  return template.map((def) => ({
    exerciseId: def.exerciseId,
    muscleGroup: def.muscleGroup,
    name: def.name,
    equipment: def.equipment,
    recommend: '',
    last: '—',
    progressionStatus: 'first_session',
    sets: [createSetForExercise(def.equipment), createSetForExercise(def.equipment), createSetForExercise(def.equipment)],
  }));
}

async function buildLoggerExerciseRow(def: LoggerTemplateExercise): Promise<LoggerExercise> {
  const profile = await getProfile();
  const goal = profile?.goal ?? 'muscle';
  const pharma = profile?.pharmacology ?? 'natural';
  const preview = await previewExerciseTarget(def.exerciseId, def.name, goal, pharma);
  const progressionStatus: ProgressionStatus = preview?.progressionStatus ?? 'first_session';

  const target = await db.exerciseTargets.get(def.exerciseId);
  const last = await getLastPerformedSummary(def.exerciseId);
  const recommend = target
    ? formatTargetLineForExercise(def.exerciseId, def.name, target.weight, target.reps, target.sets, def.equipment)
    : '';
  const sets =
    target && target.sets > 0
      ? Array.from({ length: target.sets }, () => ({
          id: makeId(),
          weight: def.equipment === 'bodyweight' ? '0' : String(target.weight),
          reps: String(target.reps),
          completed: false,
        }))
      : [
          createSetForExercise(def.equipment),
          createSetForExercise(def.equipment),
          createSetForExercise(def.equipment),
        ];
  return {
    exerciseId: def.exerciseId,
    muscleGroup: def.muscleGroup,
    name: def.name,
    equipment: def.equipment,
    recommend,
    last: last ?? '—',
    progressionStatus,
    sets,
  };
}

async function buildLoggerExercisesFromTemplate(
  template: readonly LoggerTemplateExercise[],
): Promise<LoggerExercise[]> {
  if (template.length === 0) return [];
  return Promise.all(template.map((def) => buildLoggerExerciseRow(def)));
}

function toWorkoutType(t: string): WorkoutType {
  const allowed: WorkoutType[] = [
    'push',
    'pull',
    'legs',
    'full_body',
    'upper',
    'lower',
    'custom',
  ];
  return allowed.includes(t as WorkoutType) ? (t as WorkoutType) : 'custom';
}

function computeTotalVolume(exercises: LoggerExercise[]): number {
  let sum = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (!set.completed) continue;
      const w = parseFloat(set.weight.replace(',', '.'));
      const r = parseInt(set.reps, 10);
      if (Number.isFinite(w) && Number.isFinite(r) && w >= 0 && r >= 0) {
        sum += w * r;
      }
    }
  }
  return Math.round(sum * 10) / 10;
}

function buildSessionExercises(exercises: LoggerExercise[]): SessionExercise[] {
  return exercises.map((ex) => {
    const isBw = ex.equipment === 'bodyweight';
    return {
      exerciseId: canonicalExerciseId(ex.exerciseId),
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: ex.sets.map((s, i) => ({
        setNumber: i + 1,
        weight: isBw ? 0 : parseFloat(s.weight.replace(',', '.')) || 0,
        reps: parseInt(s.reps, 10) || 0,
        completed: s.completed,
      })),
    };
  });
}

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface p-2 text-center font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent';

function formatRestMmSs(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export interface LoggerScreenProps {
  workoutName: string;
  workoutType: string;
  exerciseTemplate: readonly LoggerTemplateExercise[];
  openExercisePickerOnMount?: boolean;
  onFinish: (sessionId: string) => void;
  onClose: () => void;
}

export default function LoggerScreen({
  workoutName,
  workoutType,
  exerciseTemplate,
  openExercisePickerOnMount = false,
  onFinish,
  onClose,
}: LoggerScreenProps) {
  const [startedAt] = useState(() => new Date().toISOString());
  const [seconds, setSeconds] = useState(0);
  const [exercises, setExercises] = useState<LoggerExercise[]>(() => skeletonFromTemplate(exerciseTemplate));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<{ exIdx: number; name: string } | null>(null);
  const templateKey = exerciseTemplate.map((e) => e.exerciseId).join('|');
  const [restDurationSec, setRestDurationSec] = useState(90);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restZeroFlash, setRestZeroFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getProfile().then((p) => {
      if (cancelled || !p) return;
      const sec = typeof p.restTimer === 'number' && p.restTimer > 0 ? p.restTimer : 90;
      setRestDurationSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (openExercisePickerOnMount) {
      setPickerOpen(true);
    }
  }, [openExercisePickerOnMount]);

  useEffect(() => {
    let cancelled = false;
    setExercises(skeletonFromTemplate(exerciseTemplate));
    void (async () => {
      const built = await buildLoggerExercisesFromTemplate(exerciseTemplate);
      if (!cancelled) setExercises(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutName, workoutType, templateKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (restRemaining === null) return undefined;
    if (restRemaining <= 0) {
      setRestZeroFlash(true);
      const done = window.setTimeout(() => {
        setRestZeroFlash(false);
        setRestRemaining(null);
      }, 650);
      return () => window.clearTimeout(done);
    }
    const id = window.setInterval(() => {
      setRestRemaining((r) => (r === null || r <= 0 ? r : r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restRemaining]);

  const formatElapsed = useCallback((total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  const tryClose = () => {
    if (window.confirm('End workout?')) {
      onClose();
    }
  };

  const dismissRestTimer = useCallback(() => {
    setRestRemaining(null);
    setRestZeroFlash(false);
  }, []);

  const startRestTimer = useCallback(() => {
    setRestZeroFlash(false);
    setRestRemaining(restDurationSec);
  }, [restDurationSec]);

  const runPrCheck = useCallback(async (exIdx: number, setIdx: number) => {
    const sessions = await db.workoutSessions.toArray();
    setExercises((prev) => {
      const ex = prev[exIdx];
      if (!ex) return prev;
      const set = ex.sets[setIdx];
      if (!set?.completed) {
        return prev.map((row, i) =>
          i === exIdx ? { ...row, sets: row.sets.map((s, j) => (j === setIdx ? { ...s, isPR: false } : s)) } : row,
        );
      }
      const isPR = isSetPersonalRecord(sessions, prev, exIdx, setIdx);
      return prev.map((row, i) =>
        i === exIdx ? { ...row, sets: row.sets.map((s, j) => (j === setIdx ? { ...s, isPR } : s)) } : row,
      );
    });
  }, []);

  const toggleSetComplete = useCallback(
    (exIdx: number, setIdx: number) => {
      let willComplete = false;
      setExercises((prev) => {
        willComplete = !prev[exIdx].sets[setIdx].completed;
        const next = prev.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s })) }));
        const row = next[exIdx].sets[setIdx];
        row.completed = willComplete;
        row.isPR = false;
        return next;
      });
      if (willComplete) {
        startRestTimer();
        void runPrCheck(exIdx, setIdx);
      }
    },
    [runPrCheck, startRestTimer],
  );

  function updateSet(
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps' | 'completed',
    value: string | boolean,
  ): void {
    setExercises((prev) => {
      const next = prev.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s })) }));
      const row = next[exIdx].sets[setIdx];
      if (field === 'completed') {
        row.completed = value as boolean;
        if (!value) row.isPR = false;
      } else {
        row[field] = value as string;
        row.isPR = false;
      }
      return next;
    });
  }

  const confirmRemoveExercise = () => {
    if (!removeConfirm) return;
    const { exIdx } = removeConfirm;
    setRemoveConfirm(null);
    setExercises((prev) => prev.filter((_, i) => i !== exIdx));
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) => {
      const next = prev.map((ex, i) =>
        i === exIdx
          ? {
              ...ex,
              sets: [...ex.sets, ex.recommend.trim() ? createSetFromRecommend(ex.recommend) : createSetForExercise(ex.equipment)],
            }
          : ex,
      );
      return next;
    });
  };

  const appendExerciseFromLibrary = async (ex: Exercise) => {
    const row = await buildLoggerExerciseRow({
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
    });
    setExercises((prev) => [...prev, row]);
  };

  const handleFinish = async () => {
    if (exercises.length === 0) return;
    const id = crypto.randomUUID();
    const finishedAt = new Date().toISOString();
    const durationMinutes = Math.max(1, Math.ceil(seconds / 60));
    const totalVolume = computeTotalVolume(exercises);
    const session: WorkoutSession = {
      id,
      name: workoutName,
      type: toWorkoutType(workoutType),
      startedAt,
      finishedAt,
      durationMinutes,
      totalVolume,
      exercises: buildSessionExercises(exercises),
      ratings: [],
    };
    await db.workoutSessions.add(session);
    const prRows = buildPrRecordsForSession(id, finishedAt, exercises);
    if (prRows.length > 0) {
      await db.prRecords.bulkAdd(prRows);
    }
    onFinish(id);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-bg">
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => void appendExerciseFromLibrary(ex)}
      />

      {removeConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setRemoveConfirm(null)}
          />
          <Card className="relative z-10 w-full max-w-sm border-border p-5 shadow-2xl">
            <p className="text-center text-sm font-medium leading-snug text-text-primary">
              Remove {removeConfirm.name}?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                fullWidth
                className="flex-1"
                onClick={() => setRemoveConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                fullWidth
                className="flex-1"
                onClick={confirmRemoveExercise}
              >
                Remove
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-bg/95 px-5 py-4 backdrop-blur-md">
        <div className="mb-3 flex items-start gap-3">
          <button
            type="button"
            onClick={tryClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-primary transition-colors active:scale-[0.98]"
            aria-label="Close workout"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight text-text-primary">{workoutName}</h2>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-bold text-accent">
              <span aria-hidden>⏱</span>
              <span>{formatElapsed(seconds)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-32 no-scrollbar">
        {exercises.length === 0 ? (
          <Card className="border-border py-10 text-center">
            <p className="text-sm text-text-secondary">No exercises yet. Tap + Add Exercise to begin.</p>
          </Card>
        ) : (
          exercises.map((ex, exIdx) => {
            const recLastLayout = getRecLastLayout(
              ex.recommend.trim(),
              ex.last.trim(),
              ex.progressionStatus,
            );
            const isBw = ex.equipment === 'bodyweight';
            const isPlank = isPlankExerciseName(ex.name);
            return (
            <Card key={`${ex.exerciseId}-${exIdx}`} className="border-border">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 text-lg font-bold leading-tight text-text-primary">{ex.name}</h3>
                <button
                  type="button"
                  onClick={() => setRemoveConfirm({ exIdx, name: ex.name })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-text-secondary/50 transition-colors hover:text-red-400"
                  aria-label={`Remove ${ex.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {recLastLayout.kind === 'unified' ? (
                  <p className="font-mono text-[13px] font-bold uppercase leading-snug tracking-wide">
                    <span className="text-text-secondary">{recLastLayout.label} </span>
                    <span className={recLastLayout.lineClass}>{recLastLayout.value}</span>
                  </p>
                ) : (
                  <>
                    {ex.recommend.trim() ? (
                      <p className="font-mono text-[13px] font-bold uppercase leading-snug tracking-wide text-accent">
                        RECOMMEND {ex.recommend}
                      </p>
                    ) : null}
                    <p className="font-mono text-[13px] font-bold uppercase leading-snug tracking-wide text-text-secondary">
                      LAST {ex.last}
                    </p>
                  </>
                )}
                <ProgressionStatusNote status={ex.progressionStatus} />
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {ex.sets.map((set, setIdx) => (
                  <div key={set.id} className="flex items-center gap-2">
                    <span className="w-11 shrink-0 text-[10px] font-bold text-text-secondary">
                      SET {setIdx + 1}
                    </span>
                    {!isBw ? (
                      <>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="kg"
                          className={inputClass}
                          value={set.weight}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <span className="shrink-0 text-text-secondary">×</span>
                      </>
                    ) : null}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={isPlank ? 'sec' : 'reps'}
                      className={`${inputClass} ${isBw ? 'flex-1' : ''}`}
                      value={set.reps}
                      onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    {set.isPR ? (
                      <span
                        key={`pr-${set.id}-on`}
                        className="animate-pr-pop flex shrink-0 items-center gap-0.5 rounded border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#F59E0B]"
                        title="Personal record"
                      >
                        <span aria-hidden>🏆</span>
                        PR
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={set.completed ? 'Uncomplete set' : 'Complete set'}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        set.completed
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-surface text-text-secondary'
                      }`}
                      onClick={() => toggleSetComplete(exIdx, setIdx)}
                    >
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => addSet(exIdx)}
                  className="border border-border/50 bg-transparent px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-none hover:bg-surface/50 hover:text-text-primary"
                >
                  + ADD SET
                </Button>
                <button
                  type="button"
                  className="text-center text-xs text-text-secondary/50 underline-offset-2 hover:text-text-secondary hover:underline"
                >
                  swap exercise
                </button>
              </div>
            </Card>
            );
          })
        )}
      </div>

      {restRemaining !== null ? (
        <div
          className="fixed bottom-[5.75rem] left-0 right-0 z-[45] flex justify-center px-5 pointer-events-none"
          role="status"
          aria-live="polite"
          aria-label={`Rest timer ${formatRestMmSs(restRemaining)} remaining`}
        >
          <div
            className={`pointer-events-auto flex items-center gap-5 rounded-full border px-6 py-3 backdrop-blur-md bg-surface transition-[border-color,box-shadow] duration-150 ${
              restZeroFlash
                ? 'animate-pulse border-accent shadow-lg shadow-accent/35 ring-2 ring-accent/50'
                : 'border-accent/40'
            }`}
          >
            <span className="whitespace-nowrap font-mono text-sm font-bold tabular-nums tracking-tight text-text-primary">
              Rest {formatRestMmSs(restRemaining)}
            </span>
            <button
              type="button"
              onClick={dismissRestTimer}
              className="shrink-0 text-sm font-semibold text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
            >
              Skip
            </button>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-border bg-bg/95 backdrop-blur-md">
        <div className="pointer-events-auto flex w-full max-w-[390px] items-stretch gap-3 px-5 py-4">
          <Button type="button" variant="dark" size="md" className="min-w-0 flex-1" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            + Add Exercise
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="shrink-0 px-6"
            disabled={exercises.length === 0}
            onClick={() => void handleFinish()}
          >
            Finish
          </Button>
        </div>
      </div>
    </div>
  );
}
