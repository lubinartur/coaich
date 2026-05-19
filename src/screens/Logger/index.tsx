import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Button, Card } from '@/components/ui';
import type { LoggerTemplateExercise } from '@/constants/workoutPrograms';
import { useTranslation } from '@/hooks/useTranslation';
import { db, getProfile } from '@/services/db';
import { buildPrRecordsForSession, isSetPersonalRecord } from '@/services/prDetection';
import {
  canonicalExerciseId,
  formatTargetLineForExercise,
  getLastPerformedSummary,
  isTimedHoldExercise,
  parseRecommendLine,
  previewExerciseTarget,
  type ProgressionStatus,
} from '@/services/progressionEngine';
import type { Exercise, MuscleGroup, SessionExercise, WorkoutSession, WorkoutType } from '@/types';
import ExercisePicker, { type ExercisePickerFilter } from '@/screens/Logger/ExercisePicker';
import SortableExercise from '@/screens/Logger/SortableExercise';
import {
  fieldInputClass,
  getRecommendBadgeConfig,
  setActionsBtnClass,
  type LoggerExercise,
  type RecommendBadgeConfig,
  type SetRow,
} from '@/screens/Logger/shared';
import { toDisplayName } from '@/utils/toDisplayName';

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


function formatRestMmSs(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function findNextIncompleteExIdx(list: LoggerExercise[], completedIdx: number): number | null {
  const incomplete = (ex: LoggerExercise) => !(ex.sets.length > 0 && ex.sets.every((s) => s.completed));
  for (let j = completedIdx + 1; j < list.length; j++) {
    if (incomplete(list[j])) return j;
  }
  for (let j = 0; j < completedIdx; j++) {
    if (incomplete(list[j])) return j;
  }
  return null;
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
  const { t, lang } = useTranslation();
  /** Wall-clock start when user taps Start; used for saved duration (accurate when backgrounded). */
  const [workoutStartMs, setWorkoutStartMs] = useState<number | null>(null);
  const [sessionStartedAtIso, setSessionStartedAtIso] = useState<string | null>(null);
  /** Bumps once per second while workout is running so the header re-reads Date.now() (not used to accumulate duration). */
  const [, setClockTick] = useState(0);
  /** Workout clock runs only after the user taps Start Session (not on mount). */
  const [isStarted, setIsStarted] = useState(false);
  const [exercises, setExercises] = useState<LoggerExercise[]>(() => skeletonFromTemplate(exerciseTemplate));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [swapExIdx, setSwapExIdx] = useState<number | null>(null);
  const [pickerInitialFilter, setPickerInitialFilter] = useState<ExercisePickerFilter | undefined>(undefined);
  const [removeConfirm, setRemoveConfirm] = useState<{ exIdx: number; name: string } | null>(null);
  /** Single expanded exercise accordion; `0` = first exercise open by default. */
  const [expandedExIdx, setExpandedExIdx] = useState<number | null>(0);
  const templateKey = exerciseTemplate.map((e) => e.exerciseId).join('|');
  const templateLoadGenRef = useRef(0);
  const [restDurationSec, setRestDurationSec] = useState(90);
  /** Wall-clock end of rest period (ms); remaining is derived from Date.now(). */
  const [restEndTime, setRestEndTime] = useState<number | null>(null);
  /** Bumps once per second while rest is active so UI re-reads Date.now(). */
  const [restTick, setRestTick] = useState(0);
  const [restZeroFlash, setRestZeroFlash] = useState(false);
  const restCompleteHandledRef = useRef(false);
  const addExerciseFooterLabel = lang === 'ru' ? 'Упражнение' : 'Exercise';
  const startFooterLabel = lang === 'ru' ? 'Начать' : 'Start';
  const finishFooterLabel = lang === 'ru' ? 'Завершить' : 'Finish';

  const getBadgeLabel = (label: RecommendBadgeConfig['label']) => {
    switch (label) {
      case 'HOLD':
        return t('statusHold');
      case 'BASE':
        return t('statusBase');
      case 'DELOAD':
        return t('statusDeload');
      default:
        return t('statusRec');
    }
  };

  const localizedWorkoutName = (() => {
    switch (workoutType) {
      case 'push':
        return t('pushWorkoutName');
      case 'pull':
        return t('pullWorkoutName');
      case 'legs':
        return t('legsWorkoutName');
      case 'full_body':
        return t('fullBodyWorkoutName');
      case 'custom':
        return workoutName === 'Custom Workout' ? t('customWorkoutName') : toDisplayName(workoutName);
      default:
        return toDisplayName(workoutName);
    }
  })();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
    const sk = skeletonFromTemplate(exerciseTemplate);
    setExercises(sk);
    setExpandedExIdx(sk.length > 0 ? 0 : null);
    const template = exerciseTemplate;
    void (async () => {
      const built = await buildLoggerExercisesFromTemplate(template);
      if (cancelled || gen !== templateLoadGenRef.current) return;
      setExercises(built);
      setExpandedExIdx(built.length > 0 ? 0 : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutName, workoutType, templateKey, exerciseTemplate]);

  /** Re-sync header elapsed when returning from background; no interval for workout wall time. */
  useEffect(() => {
    if (workoutStartMs == null) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setClockTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [workoutStartMs]);

  const restRemaining = useMemo(() => {
    if (restEndTime == null) return null;
    void restTick;
    return Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
  }, [restEndTime, restTick]);

  useEffect(() => {
    if (restEndTime == null) {
      restCompleteHandledRef.current = false;
      return undefined;
    }
    const bump = () => setRestTick((n) => n + 1);
    const id = window.setInterval(bump, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [restEndTime]);

  useEffect(() => {
    if (restEndTime == null || restRemaining === null || restRemaining > 0) return undefined;
    if (restCompleteHandledRef.current) return undefined;
    restCompleteHandledRef.current = true;
    setRestZeroFlash(true);
    const done = window.setTimeout(() => {
      setRestZeroFlash(false);
      setRestEndTime(null);
      restCompleteHandledRef.current = false;
    }, 650);
    return () => window.clearTimeout(done);
  }, [restEndTime, restRemaining]);

  const formatElapsed = useCallback((total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  const tryClose = () => {
    if (window.confirm(t('endWorkout'))) {
      onClose();
    }
  };

  const dismissRestTimer = useCallback(() => {
    setRestEndTime(null);
    setRestZeroFlash(false);
    restCompleteHandledRef.current = false;
  }, []);

  const startRestTimer = useCallback(() => {
    setRestZeroFlash(false);
    restCompleteHandledRef.current = false;
    setRestEndTime(Date.now() + restDurationSec * 1000);
    setRestTick((n) => n + 1);
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
        if (willComplete) {
          const ex = next[exIdx];
          const allDone = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
          if (allDone) {
            const nextIdx = findNextIncompleteExIdx(next, exIdx);
            queueMicrotask(() => setExpandedExIdx(nextIdx));
          }
        }
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
    const nextLen = exercises.length - 1;
    setExpandedExIdx((exp) => {
      if (nextLen <= 0) return null;
      if (exp === null) return 0;
      if (exp === exIdx) return Math.min(exIdx, nextLen - 1);
      if (exp > exIdx) return exp - 1;
      return exp;
    });
    setExercises((prev) => prev.filter((_, i) => i !== exIdx));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExercises((prev) => {
      const oldIndex = prev.findIndex((_, i) => `ex-${i}` === active.id);
      const newIndex = prev.findIndex((_, i) => `ex-${i}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      queueMicrotask(() => {
        setExpandedExIdx((exp) => {
          if (exp === null) return null;
          if (exp === oldIndex) return newIndex;
          if (oldIndex < newIndex) {
            if (exp > oldIndex && exp <= newIndex) return exp - 1;
          } else if (oldIndex > newIndex) {
            if (exp >= newIndex && exp < oldIndex) return exp + 1;
          }
          return exp;
        });
      });
      return arrayMove(prev, oldIndex, newIndex);
    });
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

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => {
      const ex = prev[exIdx];
      if (!ex || ex.sets.length <= 1) return prev;
      return prev.map((row, i) =>
        i === exIdx ? { ...row, sets: row.sets.filter((_, j) => j !== setIdx) } : row,
      );
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
    const finishedAtMs = Date.now();
    const finishedAt = new Date(finishedAtMs).toISOString();
    const startMs = workoutStartMs ?? finishedAtMs;
    const durationMinutes = Math.max(1, Math.round((finishedAtMs - startMs) / 60000));
    const totalVolume = computeTotalVolume(exercises);
    const session: WorkoutSession = {
      id,
      name: workoutName,
      type: toWorkoutType(workoutType),
      startedAt: sessionStartedAtIso ?? new Date(startMs).toISOString(),
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
            aria-label={t('close')}
            onClick={() => setRemoveConfirm(null)}
          />
          <Card className="relative z-10 w-full max-w-sm border-[#2A2A2A] bg-[#1C1C1C] p-5 shadow-2xl">
            <p className="text-center text-sm font-medium leading-snug text-white">
              {t('remove')} {removeConfirm.name}?
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
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                fullWidth
                className="flex-1"
                onClick={confirmRemoveExercise}
              >
                {t('remove')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="sticky top-0 z-10 border-b border-[#2A2A2A] bg-[#0A0A0A] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.65)]">
        <header className="flex shrink-0 items-center gap-4 px-6 py-4">
          <button
            type="button"
            onClick={tryClose}
            className="-ml-1 shrink-0 p-1 text-white transition-opacity hover:opacity-80"
            aria-label={t('closeWorkout')}
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">{localizedWorkoutName}</h1>
            <p className="font-mono text-sm font-medium tabular-nums text-[#6B7280]">
              {formatElapsed(
                workoutStartMs == null ? 0 : Math.max(0, Math.floor((Date.now() - workoutStartMs) / 1000)),
              )}
            </p>
          </div>
        </header>
      </div>

      <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-4 py-8 pb-40 no-scrollbar">
        {exercises.length === 0 ? (
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] py-10 text-center">
            <p className="text-sm text-[#6B7280]">{t('noExercisesYet')}</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={exercises.map((_, i) => `ex-${i}`)} strategy={verticalListSortingStrategy}>
              {exercises.map((ex, exIdx) => (
                <SortableExercise
                  key={`ex-${exIdx}`}
                  sortableId={`ex-${exIdx}`}
                  ex={ex}
                  exIdx={exIdx}
                  targetLine={ex.recommend.trim()}
                  progressionStatus={ex.progressionStatus}
                  expanded={expandedExIdx === exIdx}
                  onAccordionToggle={() => setExpandedExIdx((p) => (p === exIdx ? null : exIdx))}
                  updateSet={updateSet}
                  toggleSetComplete={toggleSetComplete}
                  addSet={addSet}
                  removeSet={removeSet}
                  openPickerForSwap={openPickerForSwap}
                  setRemoveConfirm={setRemoveConfirm}
                  t={t}
                  lang={lang}
                  getBadgeLabel={getBadgeLabel}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AnimatePresence>
        {restEndTime !== null || restZeroFlash ? (
          <motion.div
            key="rest-timer"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            className="fixed bottom-[100px] left-1/2 z-40 -translate-x-1/2"
            role="status"
            aria-live="polite"
            aria-label={`${t('rest')} ${formatRestMmSs(restRemaining ?? 0)} ${t('remaining')}`}
          >
            <div
              className={`flex min-h-[64px] items-center rounded-2xl border px-6 py-4 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.55)] transition-all ${
                restZeroFlash
                  ? 'animate-pulse border-[#8B5CF6] bg-[#8B5CF6] text-white shadow-[#8B5CF6]/35'
                  : 'border-[#8B5CF6]/25 bg-[#1C1C1C] shadow-black/40'
              }`}
            >
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${
                    restZeroFlash ? 'text-white/85' : 'text-[#6B7280]'
                  }`}
                >
                  {t('rest')}
                </span>
                <span
                  className={`font-mono text-2xl font-black tabular-nums leading-none ${
                    restZeroFlash ? 'text-white' : 'text-[#8B5CF6]'
                  }`}
                >
                  {formatRestMmSs(restRemaining ?? 0)}
                </span>
              </span>
              <div className={`mx-5 h-8 w-px shrink-0 ${restZeroFlash ? 'bg-white/30' : 'bg-[#2A2A2A]'}`} aria-hidden />
              <button
                type="button"
                onClick={dismissRestTimer}
                className={`shrink-0 text-base font-bold ${restZeroFlash ? 'text-white' : 'text-[#8B5CF6]'}`}
              >
                {t('skip')}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-[390px] gap-3 border-t border-[#2A2A2A] bg-[#141414] p-4">
        <button
          type="button"
          onClick={openPickerForAdd}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] py-5 text-sm font-bold text-white transition-colors hover:border-[#8B5CF6]/40"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden />
          {addExerciseFooterLabel}
        </button>
        {!isStarted ? (
          <button
            type="button"
            disabled={exercises.length === 0}
            onClick={() => {
              const ms = Date.now();
              setWorkoutStartMs(ms);
              setSessionStartedAtIso(new Date(ms).toISOString());
              setIsStarted(true);
            }}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#22C55E] py-5 text-sm font-bold text-white shadow-lg shadow-[#22C55E]/25 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startFooterLabel}
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={exercises.length === 0}
            onClick={() => void handleFinish()}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#8B5CF6] py-5 text-sm font-bold text-white shadow-lg shadow-[#8B5CF6]/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finishFooterLabel}
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </button>
        )}
      </footer>
    </div>
  );
}
