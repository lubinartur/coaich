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
import {
  buildPrRecordsForSession,
  checkIfPR,
  isSetPersonalRecord,
  parseLoggerSetWeightReps,
} from '@/services/prDetection';
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

const WORKOUT_DRAFT_KEY = 'coaich-workout-draft';
/** Drafts older than this are considered stale and ignored on restore. */
const WORKOUT_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface WorkoutDraft {
  exercises: LoggerExercise[];
  workoutName: string;
  workoutType: string;
  workoutStartMs: number | null;
  sessionStartedAtIso: string | null;
  isStarted: boolean;
  savedAt: number;
}

/** Synchronously read a non-stale workout draft from localStorage (used as a lazy state initializer). */
function readFreshWorkoutDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(WORKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkoutDraft>;
    if (
      !parsed ||
      !Array.isArray(parsed.exercises) ||
      parsed.exercises.length === 0 ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > WORKOUT_DRAFT_MAX_AGE_MS) return null;
    return {
      exercises: parsed.exercises as LoggerExercise[],
      workoutName: typeof parsed.workoutName === 'string' ? parsed.workoutName : '',
      workoutType: typeof parsed.workoutType === 'string' ? parsed.workoutType : 'custom',
      workoutStartMs: typeof parsed.workoutStartMs === 'number' ? parsed.workoutStartMs : null,
      sessionStartedAtIso: typeof parsed.sessionStartedAtIso === 'string' ? parsed.sessionStartedAtIso : null,
      isStarted: parsed.isStarted === true,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function clearWorkoutDraft(): void {
  try {
    localStorage.removeItem(WORKOUT_DRAFT_KEY);
  } catch {
    // ignore storage errors (private mode / quota)
  }
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
  const [prBanner, setPrBanner] = useState<{ show: boolean; exerciseName: string; weight: number } | null>(null);
  /** Weight PRs already celebrated this session (key: canonicalId-weight) so we don't re-trigger. */
  const prCelebratedRef = useRef<Set<string>>(new Set());
  /** Non-null while a recoverable draft is awaiting the user's restore/decision. */
  const [restoreDraft, setRestoreDraft] = useState<WorkoutDraft | null>(() => readFreshWorkoutDraft());
  /** Set when a draft is restored so name/type follow the draft rather than the freshly-mounted props. */
  const [restoredMeta, setRestoredMeta] = useState<{ name: string; type: string } | null>(null);
  const effectiveWorkoutName = restoredMeta?.name ?? workoutName;
  const effectiveWorkoutType = restoredMeta?.type ?? workoutType;
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
    switch (effectiveWorkoutType) {
      case 'push':
        return t('pushWorkoutName');
      case 'pull':
        return t('pullWorkoutName');
      case 'legs':
        return t('legsWorkoutName');
      case 'full_body':
        return t('fullBodyWorkoutName');
      case 'custom':
        return effectiveWorkoutName === 'Custom Workout' ? t('customWorkoutName') : toDisplayName(effectiveWorkoutName);
      default:
        return toDisplayName(effectiveWorkoutName);
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

  /**
   * Persist an in-progress workout to localStorage on every change so an iOS PWA kill
   * doesn't lose data. Skipped while a restore prompt is pending so the recoverable
   * draft isn't overwritten before the user decides.
   */
  useEffect(() => {
    if (restoreDraft) return;
    if (exercises.length === 0) return;
    const draft: WorkoutDraft = {
      exercises,
      workoutName: effectiveWorkoutName,
      workoutType: effectiveWorkoutType,
      workoutStartMs,
      sessionStartedAtIso,
      isStarted,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [
    exercises,
    effectiveWorkoutName,
    effectiveWorkoutType,
    workoutStartMs,
    sessionStartedAtIso,
    isStarted,
    restoreDraft,
  ]);

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
      clearWorkoutDraft();
      onClose();
    }
  };

  const handleRestoreDraft = () => {
    if (!restoreDraft) return;
    // Invalidate any in-flight template build so it can't overwrite the restored exercises.
    templateLoadGenRef.current += 1;
    setExercises(restoreDraft.exercises);
    setExpandedExIdx(restoreDraft.exercises.length > 0 ? 0 : null);
    setRestoredMeta({ name: restoreDraft.workoutName, type: restoreDraft.workoutType });
    setWorkoutStartMs(restoreDraft.workoutStartMs);
    setSessionStartedAtIso(restoreDraft.sessionStartedAtIso);
    setIsStarted(restoreDraft.isStarted);
    setRestoreDraft(null);
  };

  const handleDiscardDraft = () => {
    clearWorkoutDraft();
    setRestoreDraft(null);
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

  const celebratePrIfNeeded = useCallback(
    async (exIdx: number, setIdx: number) => {
      const ex = exercises[exIdx];
      const set = ex?.sets[setIdx];
      if (!ex || !set || ex.equipment === 'bodyweight') return;
      const parsed = parseLoggerSetWeightReps(set, ex.equipment);
      if (!parsed || parsed.weight <= 0) return;
      const key = `${canonicalExerciseId(ex.exerciseId)}-${parsed.weight}`;
      if (prCelebratedRef.current.has(key)) return;
      const isPr = await checkIfPR(ex.exerciseId, parsed.weight);
      if (!isPr) return;
      prCelebratedRef.current.add(key);
      setPrBanner({ show: true, exerciseName: toDisplayName(ex.name), weight: parsed.weight });
    },
    [exercises],
  );

  useEffect(() => {
    if (!prBanner?.show) return undefined;
    const id = window.setTimeout(() => setPrBanner(null), 2500);
    return () => window.clearTimeout(id);
  }, [prBanner]);

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
        void celebratePrIfNeeded(exIdx, setIdx);
      }
    },
    [exercises, runPrCheck, startRestTimer, celebratePrIfNeeded],
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
    let sessionName = effectiveWorkoutName;
    if (effectiveWorkoutType === 'custom') {
      const fallback = lang === 'ru' ? 'Своя' : 'Custom';
      const entered = window.prompt(lang === 'ru' ? 'Название тренировки' : 'Workout name', fallback);
      sessionName = entered && entered.trim() ? entered.trim() : fallback;
    }
    const id = crypto.randomUUID();
    const finishedAtMs = Date.now();
    const finishedAt = new Date(finishedAtMs).toISOString();
    const startMs = workoutStartMs ?? finishedAtMs;
    const durationMinutes = Math.max(1, Math.round((finishedAtMs - startMs) / 60000));
    const totalVolume = computeTotalVolume(exercises);
    const session: WorkoutSession = {
      id,
      name: sessionName,
      type: toWorkoutType(effectiveWorkoutType),
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
    clearWorkoutDraft();
    onFinish(id);
  };

  const restoreDraftName = restoreDraft ? toDisplayName(restoreDraft.workoutName) : '';
  const restoreBannerText =
    lang === 'ru'
      ? `Найдена незавершённая тренировка ${restoreDraftName}. Восстановить?`
      : `Found an unfinished workout: ${restoreDraftName}. Restore it?`;
  const restoreLabel = lang === 'ru' ? 'Восстановить' : 'Restore';
  const startFreshLabel = lang === 'ru' ? 'Начать заново' : 'Start fresh';

  const prWeightStr = prBanner
    ? Number.isInteger(prBanner.weight)
      ? String(prBanner.weight)
      : prBanner.weight.toFixed(1).replace(/\.0$/, '')
    : '';
  const prBannerText = prBanner
    ? lang === 'ru'
      ? `Личный рекорд! ${prBanner.exerciseName} — ${prWeightStr}${t('kgUnit')}`
      : `Personal Record! ${prBanner.exerciseName} — ${prWeightStr}${t('kgUnit')}`
    : '';

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0A0A0A] pt-1">
      <AnimatePresence>
        {prBanner?.show ? (
          <motion.div
            key="pr-banner"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[80] w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#F59E0B]/50 bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] px-5 py-3 text-center text-sm font-black text-[#1A1206] shadow-[0_14px_44px_-10px_rgba(245,158,11,0.65)]">
              <span aria-hidden>🏆</span>
              <span className="min-w-0">{prBannerText}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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

      {restoreDraft ? (
        <div className="shrink-0 border-b border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-4 py-3">
          <p className="text-sm font-medium leading-snug text-white">{restoreBannerText}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="flex-1 whitespace-nowrap rounded-xl bg-[#8B5CF6] py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98]"
            >
              {restoreLabel}
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="flex-1 whitespace-nowrap rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] py-2.5 text-sm font-bold text-white transition-colors hover:border-[#8B5CF6]/40"
            >
              {startFreshLabel}
            </button>
          </div>
        </div>
      ) : null}

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
