import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { LoggerTemplateExercise } from '@/constants/workoutPrograms';
import { db, getProfile } from '@/services/db';
import { buildPrRecordsForSession, isSetPersonalRecord } from '@/services/prDetection';
import {
  canonicalExerciseId,
  formatTargetLineForExercise,
  getLastPerformedSummary,
  getProgressionStatusInlineText,
  getProgressionStatusPresentation,
  getRecLastLayout,
  isTimedHoldExercise,
  parseRecommendLine,
  previewExerciseTarget,
  type ProgressionStatus,
} from '@/services/progressionEngine';
import type { Exercise, MuscleGroup, SessionExercise, WorkoutSession, WorkoutType } from '@/types';
import ExercisePicker, { type ExercisePickerFilter } from '@/screens/Logger/ExercisePicker';
import { progressionStatusDisplayText } from '@/utils/progressionDisplayLabels';
import { toDisplayName } from '@/utils/toDisplayName';

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
  /** Timed hold: reps field is seconds. */
  timedHold: boolean;
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
    timedHold: isTimedHoldExercise(def.exerciseId, def.name, undefined),
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
  const cid = canonicalExerciseId(def.exerciseId);

  let storedTarget = await db.exerciseTargets.get(cid);
  if (!storedTarget && def.exerciseId !== cid) {
    storedTarget = await db.exerciseTargets.get(def.exerciseId);
  }

  const preview = await previewExerciseTarget(def.exerciseId, def.name, goal, pharma);
  const progressionStatus: ProgressionStatus = preview?.progressionStatus ?? 'first_session';

  const meta = await db.exercises.get(cid);
  const timedHold = isTimedHoldExercise(def.exerciseId, def.name, meta?.timedHold);

  const target =
    storedTarget != null
      ? { weight: storedTarget.weight, reps: storedTarget.reps, sets: storedTarget.sets }
      : preview != null
        ? { weight: preview.weight, reps: preview.reps, sets: preview.sets }
        : null;

  const last = await getLastPerformedSummary(def.exerciseId);
  /** Dexie / engine may omit sets or use 0; still apply weight×reps with a sensible set count. */
  const numSets = target != null ? Math.max(1, Number(target.sets) || 3) : 0;
  const recommend = target
    ? formatTargetLineForExercise(
        def.exerciseId,
        def.name,
        target.weight,
        target.reps,
        numSets,
        def.equipment,
        timedHold,
      )
    : '';
  const sets =
    target != null && numSets > 0
      ? Array.from({ length: numSets }, () => ({
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
    timedHold,
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

function muscleGroupToPickerFilter(mg: MuscleGroup): ExercisePickerFilter {
  if (mg === 'legs' || mg === 'glutes') return 'legs_glutes';
  return mg;
}

async function buildSwappedLoggerExercise(old: LoggerExercise, picked: Exercise): Promise<LoggerExercise> {
  const profile = await getProfile();
  const goal = profile?.goal ?? 'muscle';
  const pharma = profile?.pharmacology ?? 'natural';
  const cid = canonicalExerciseId(picked.id);

  let storedTarget = await db.exerciseTargets.get(cid);
  if (!storedTarget && picked.id !== cid) {
    storedTarget = await db.exerciseTargets.get(picked.id);
  }

  const preview = await previewExerciseTarget(picked.id, picked.name, goal, pharma);
  const progressionStatus: ProgressionStatus = preview?.progressionStatus ?? 'first_session';
  const timedHold = isTimedHoldExercise(picked.id, picked.name, picked.timedHold);

  const target =
    storedTarget != null
      ? { weight: storedTarget.weight, reps: storedTarget.reps, sets: storedTarget.sets }
      : preview != null
        ? { weight: preview.weight, reps: preview.reps, sets: preview.sets }
        : null;

  const last = await getLastPerformedSummary(picked.id);
  const numSets = target != null ? Math.max(1, Number(target.sets) || 3) : 0;
  const recommend = target
    ? formatTargetLineForExercise(
        picked.id,
        picked.name,
        target.weight,
        target.reps,
        numSets,
        picked.equipment,
        timedHold,
      )
    : '';

  let sets: SetRow[];
  if (target != null && numSets > 0) {
    sets = Array.from({ length: numSets }, () => ({
      id: makeId(),
      weight: picked.equipment === 'bodyweight' ? '0' : String(target.weight),
      reps: String(target.reps),
      completed: false,
    }));
  } else {
    sets = old.sets.map((s) => ({
      id: makeId(),
      weight: picked.equipment === 'bodyweight' ? '0' : s.weight,
      reps: s.reps,
      completed: false,
      isPR: false,
    }));
  }

  return {
    exerciseId: picked.id,
    muscleGroup: picked.muscleGroup,
    name: picked.name,
    equipment: picked.equipment,
    timedHold,
    recommend,
    last: last ?? '—',
    progressionStatus,
    sets,
  };
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

const fieldInputClass =
  'min-h-[64px] w-full min-w-0 rounded-xl border border-[#222222] bg-[#111111] px-2 py-5 text-center font-black tabular-nums text-2xl text-white outline-none transition-all focus:border-[#8B5CF6] focus:ring-4 focus:ring-[#8B5CF6]/10';

const setActionsBtnClass =
  'flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#222222] bg-[#111111] py-3.5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#181818] hover:border-[#8B5CF6]/25 hover:text-[#8B5CF6] active:scale-[0.98]';

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
  /** Workout clock runs only after the user taps Start Session (not on mount). */
  const [isStarted, setIsStarted] = useState(false);
  const [exercises, setExercises] = useState<LoggerExercise[]>(() => skeletonFromTemplate(exerciseTemplate));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [swapExIdx, setSwapExIdx] = useState<number | null>(null);
  const [pickerInitialFilter, setPickerInitialFilter] = useState<ExercisePickerFilter | undefined>(undefined);
  const [removeConfirm, setRemoveConfirm] = useState<{ exIdx: number; name: string } | null>(null);
  const templateKey = exerciseTemplate.map((e) => e.exerciseId).join('|');
  const templateLoadGenRef = useRef(0);
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
      setSwapExIdx(null);
      setPickerInitialFilter(undefined);
      setPickerOpen(true);
    }
  }, [openExercisePickerOnMount]);

  useEffect(() => {
    const gen = ++templateLoadGenRef.current;
    let cancelled = false;
    setExercises(skeletonFromTemplate(exerciseTemplate));
    const template = exerciseTemplate;
    void (async () => {
      const built = await buildLoggerExercisesFromTemplate(template);
      if (cancelled || gen !== templateLoadGenRef.current) return;
      setExercises(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutName, workoutType, templateKey, exerciseTemplate]);

  useEffect(() => {
    if (!isStarted) return undefined;
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isStarted]);

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
      if (!set) return prev;

      if (!set.completed) {
        if (set.isPR !== true) return prev;
        return prev.map((row, i) =>
          i === exIdx ? { ...row, sets: row.sets.map((s, j) => (j === setIdx ? { ...s, isPR: false } : s)) } : row,
        );
      }

      const isPR = isSetPersonalRecord(sessions, prev, exIdx, setIdx);
      if (Boolean(set.isPR) === isPR) return prev;
      return prev.map((row, i) =>
        i === exIdx ? { ...row, sets: row.sets.map((s, j) => (j === setIdx ? { ...s, isPR } : s)) } : row,
      );
    });
  }, []);

  const toggleSetComplete = useCallback(
    (exIdx: number, setIdx: number) => {
      const willComplete = !exercises[exIdx]?.sets[setIdx]?.completed;
      setExercises((prev) => {
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
    [exercises, runPrCheck, startRestTimer],
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

  const closePicker = () => {
    setPickerOpen(false);
    setSwapExIdx(null);
    setPickerInitialFilter(undefined);
  };

  const handlePickerPick = (ex: Exercise) => {
    const swapIdx = swapExIdx;
    if (swapIdx !== null) {
      setExercises((prev) => {
        const oldRow = prev[swapIdx];
        if (!oldRow) return prev;
        void buildSwappedLoggerExercise(oldRow, ex).then((row) => {
          setExercises((p) => (p[swapIdx] ? p.map((e, i) => (i === swapIdx ? row : e)) : p));
        });
        return prev;
      });
      closePicker();
      return;
    }
    void appendExerciseFromLibrary(ex);
  };

  const openPickerForAdd = () => {
    setSwapExIdx(null);
    setPickerInitialFilter(undefined);
    setPickerOpen(true);
  };

  const openPickerForSwap = (exIdx: number, muscleGroup: MuscleGroup) => {
    setSwapExIdx(exIdx);
    setPickerInitialFilter(muscleGroupToPickerFilter(muscleGroup));
    setPickerOpen(true);
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
    const prRows = buildPrRecordsForSession(
      id,
      finishedAt,
      exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        equipment: ex.equipment,
        sets: ex.sets,
      })),
    );
    if (prRows.length > 0) {
      await db.prRecords.bulkAdd(prRows);
    }
    onFinish(id);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0A0A0A] pt-1">
      <ExercisePicker
        open={pickerOpen}
        onClose={closePicker}
        onPick={handlePickerPick}
        initialFilter={pickerInitialFilter}
      />

      {removeConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setRemoveConfirm(null)}
          />
          <Card className="relative z-10 w-full max-w-sm border-[#2A2A2A] bg-[#1C1C1C] p-5 shadow-2xl">
            <p className="text-center text-sm font-medium leading-snug text-white">
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

      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[#2A2A2A] bg-[#0A0A0A]/95 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={tryClose}
            className="-ml-1 p-1 text-white transition-opacity hover:opacity-80"
            aria-label="Close workout"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">{toDisplayName(workoutName)}</h1>
            <p className="font-mono text-sm font-medium tabular-nums text-[#8B5CF6]">{formatElapsed(seconds)}</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-4 py-8 pb-40 no-scrollbar">
        {exercises.length === 0 ? (
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] py-10 text-center">
            <p className="text-sm text-[#6B7280]">No exercises yet. Tap Add Exercise to begin.</p>
          </div>
        ) : (
          exercises.map((ex, exIdx) => {
            const recLastLayout = getRecLastLayout(
              ex.recommend.trim(),
              ex.last.trim(),
              ex.progressionStatus,
            );
            const isBw = ex.equipment === 'bodyweight';
            const isTimed = ex.timedHold;
            const pres = getProgressionStatusPresentation(ex.progressionStatus);
            const statusInline = getProgressionStatusInlineText(ex.progressionStatus);
            const statusDisplay = progressionStatusDisplayText(statusInline, pres?.text);
            return (
              <section key={`${ex.exerciseId}-${exIdx}`} className="space-y-6">
                <div className="flex items-end justify-between border-b border-[#222222] pb-4">
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-white">{toDisplayName(ex.name)}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2 py-0.5">
                        <div
                          className={`h-1 w-1 rounded-full animate-pulse ${pres?.dotClass ?? 'bg-[#6B7280]'}`}
                          aria-hidden
                        />
                        {pres == null && statusInline == null ? (
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                            START
                          </span>
                        ) : null}
                      </div>
                      {statusDisplay ? (
                        <span
                          className={`text-[11px] font-mono font-bold ${pres?.textClass ?? 'text-[#8B5CF6]'}`}
                        >
                          {statusDisplay}
                        </span>
                      ) : !pres ? (
                        <span className="text-[11px] font-mono font-bold text-[#6B7280]">First session</span>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-1 font-mono text-[12px] font-bold tracking-wide text-[#6B7280]">
                      {recLastLayout.kind === 'unified' ? (
                        <p>
                          <span className="text-[#6B7280]">{recLastLayout.label} </span>
                          <span className={recLastLayout.lineClass}>{recLastLayout.value}</span>
                        </p>
                      ) : (
                        <>
                          {ex.recommend.trim() ? (
                            <p className="text-[#8B5CF6]">Recommend {ex.recommend}</p>
                          ) : null}
                          <p>Last {ex.last}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirm({ exIdx, name: ex.name })}
                    className="p-1 text-[#333333] transition-colors hover:text-red-400"
                    aria-label={`Remove ${ex.name}`}
                  >
                    <Trash2 className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>

                <div className="space-y-2">
                  <div
                    className={`grid items-end gap-3 px-1 pb-1 pt-0 text-[10px] font-black uppercase tracking-widest text-[#6B7280] sm:gap-4 ${
                      isBw
                        ? 'grid-cols-[32px_minmax(0,1fr)_52px]'
                        : 'grid-cols-[32px_minmax(0,1fr)_16px_minmax(0,1fr)_52px]'
                    }`}
                  >
                    <span aria-hidden className="block min-h-[1em]" />
                    {!isBw ? (
                      <>
                        <span className="block text-center">Weight</span>
                        <span className="flex justify-center" aria-hidden>
                          ×
                        </span>
                        <span className="block text-center">Reps</span>
                      </>
                    ) : (
                      <>
                        <span className="block text-center">{isTimed ? 'Sec' : 'Reps'}</span>
                        <span aria-hidden className="block min-h-[1em]" />
                      </>
                    )}
                    {!isBw ? <span aria-hidden className="block min-h-[1em]" /> : null}
                  </div>
                  <div className="space-y-5">
                    {ex.sets.map((set, setIdx) => (
                      <motion.div
                        layout
                        key={set.id}
                        className={`grid items-center gap-3 rounded-2xl px-1 py-3 transition-all sm:gap-4 ${
                          isBw
                            ? 'grid-cols-[32px_minmax(0,1fr)_52px]'
                            : 'grid-cols-[32px_minmax(0,1fr)_16px_minmax(0,1fr)_52px]'
                        } ${set.completed ? 'border border-[#22C55E]/10 bg-[#22C55E]/5' : 'bg-transparent'}`}
                      >
                        <div className="text-center">
                          <span className="block text-[10px] font-black text-[#6B7280]">SET</span>
                          <span className="text-sm font-black tabular-nums text-white">{setIdx + 1}</span>
                        </div>
                        {!isBw ? (
                          <>
                            <div className="min-w-0">
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="0"
                                className={fieldInputClass}
                                value={set.weight}
                                onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                                onFocus={(e) => e.currentTarget.select()}
                              />
                            </div>
                            <span className="flex shrink-0 items-center justify-center font-black text-[#333333]">×</span>
                          </>
                        ) : null}
                        <div className="min-w-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="0"
                            aria-label={isTimed ? 'Seconds' : 'Reps'}
                            className={fieldInputClass}
                            value={set.reps}
                            onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                          />
                        </div>
                        <div className="flex min-w-0 items-stretch justify-end">
                          <button
                            type="button"
                            aria-label={set.completed ? 'Uncomplete set' : 'Complete set'}
                            className={`flex min-h-[64px] w-[52px] shrink-0 items-center justify-center rounded-xl border shadow-lg transition-all ${
                              set.completed
                                ? 'border-[#22C55E] bg-[#22C55E] text-white shadow-[#22C55E]/20'
                                : 'border-[#222222] bg-[#111111] text-[#333333] hover:border-[#8B5CF6]'
                            }`}
                            onClick={() => toggleSetComplete(exIdx, setIdx)}
                          >
                            <Check className="h-6 w-6" strokeWidth={4} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => addSet(exIdx)}
                    className={setActionsBtnClass}
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    ＋ Add
                  </button>
                  <button
                    type="button"
                    className={setActionsBtnClass}
                    onClick={() => openPickerForSwap(exIdx, ex.muscleGroup)}
                  >
                    <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden />
                    ⇄ Swap
                  </button>
                </div>
              </section>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {restRemaining !== null ? (
          <motion.div
            key="rest-timer"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2.5rem)] max-w-[360px] -translate-x-1/2"
            role="status"
            aria-live="polite"
            aria-label={`Rest timer ${formatRestMmSs(restRemaining)} remaining`}
          >
            <div
              className={`flex items-center gap-4 rounded-full border px-6 py-3 shadow-2xl transition-all ${
                restZeroFlash
                  ? 'animate-pulse border-[#8B5CF6] bg-[#8B5CF6] text-white'
                  : 'border-[#2A2A2A] bg-[#1C1C1C]'
              }`}
            >
              <span className="w-20 text-sm font-bold tabular-nums text-white">
                Rest {formatRestMmSs(restRemaining)}
              </span>
              <div className="h-4 w-px bg-[#2A2A2A]" aria-hidden />
              <button
                type="button"
                onClick={dismissRestTimer}
                className="text-xs font-bold text-[#8B5CF6]"
              >
                Skip
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-[390px] gap-3 border-t border-[#2A2A2A] bg-[#141414] p-4">
        <button
          type="button"
          onClick={openPickerForAdd}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] py-4 text-sm font-bold text-white transition-colors hover:border-[#8B5CF6]/40"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden />
          Add Exercise
        </button>
        {!isStarted ? (
          <button
            type="button"
            disabled={exercises.length === 0}
            onClick={() => setIsStarted(true)}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#22C55E]/25 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start Session
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={exercises.length === 0}
            onClick={() => void handleFinish()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#8B5CF6]/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Finish
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </button>
        )}
      </footer>
    </div>
  );
}
