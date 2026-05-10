import type { MuscleGroup, WorkoutSession } from '@/types';
import { canonicalExerciseId } from '@/services/progressionEngine';

/** Epley-style estimate from a single set (per product spec). */
export function epley1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export function sessionFinishedMs(s: WorkoutSession): number {
  return new Date(s.finishedAt).getTime();
}

/**
 * For each session in the window, take the completed set with highest weight×reps for this exercise,
 * compute Epley 1RM for that set, then return the max across sessions.
 */
export function bestEpley1RMInWindow(
  sessions: WorkoutSession[],
  exerciseId: string,
  startMs: number,
  endMs: number,
): number {
  const cid = canonicalExerciseId(exerciseId);
  let bestAcrossSessions = 0;
  for (const s of sessions) {
    const t = sessionFinishedMs(s);
    if (t < startMs || t > endMs) continue;
    const ex = s.exercises.find((e) => canonicalExerciseId(e.exerciseId) === cid);
    if (!ex) continue;
    let bestW = 0;
    let bestR = 0;
    let bestProduct = 0;
    for (const st of ex.sets) {
      if (!st.completed) continue;
      const p = st.weight * st.reps;
      if (p > bestProduct) {
        bestProduct = p;
        bestW = st.weight;
        bestR = st.reps;
      }
    }
    if (bestProduct > 0) {
      const est = epley1RM(bestW, bestR);
      if (est > bestAcrossSessions) bestAcrossSessions = est;
    }
  }
  return bestAcrossSessions;
}

/** Max Epley 1RM over any single completed set (lifetime PR estimate). */
export function allTimeBestEpley1RM(sessions: WorkoutSession[], exerciseId: string): number {
  const cid = canonicalExerciseId(exerciseId);
  let best = 0;
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (canonicalExerciseId(ex.exerciseId) !== cid) continue;
      for (const st of ex.sets) {
        if (!st.completed) continue;
        best = Math.max(best, epley1RM(st.weight, st.reps));
      }
    }
  }
  return best;
}

const OVERALL_LIFT_IDS = [
  'barbell-bench-press',
  'back-squat',
  'romanian-deadlift',
  'barbell-row',
  'overhead-press',
] as const;

export function overallStrengthScore(sessions: WorkoutSession[], startMs: number, endMs: number): number {
  const sum = OVERALL_LIFT_IDS.reduce(
    (acc, id) => acc + bestEpley1RMInWindow(sessions, id, startMs, endMs),
    0,
  );
  return Math.round(sum / OVERALL_LIFT_IDS.length);
}

const PUSH_IDS = ['barbell-bench-press', 'overhead-press', 'incline-dumbbell-press'] as const;
const PULL_IDS = ['lat-pulldown', 'barbell-row', 'seated-cable-row'] as const;
const LEGS_IDS = ['back-squat', 'leg-press', 'romanian-deadlift'] as const;

export type SplitKey = 'push' | 'pull' | 'legs';

const SPLIT_MAP: Record<SplitKey, readonly string[]> = {
  push: PUSH_IDS,
  pull: PULL_IDS,
  legs: LEGS_IDS,
};

/** Average of the three lifts’ best Epley in the window (zeros included in denominator). */
export function splitAverage1RM(
  sessions: WorkoutSession[],
  split: SplitKey,
  startMs: number,
  endMs: number,
): number {
  const ids = SPLIT_MAP[split];
  const sum = ids.reduce((acc, id) => acc + bestEpley1RMInWindow(sessions, id, startMs, endMs), 0);
  return sum / ids.length;
}

export const BENCHMARK_LIFT_DEFS = [
  { label: 'Squat', exerciseId: 'back-squat' },
  { label: 'Bench Press', exerciseId: 'barbell-bench-press' },
  { label: 'Deadlift', exerciseId: 'deadlift' },
  { label: 'Barbell Row', exerciseId: 'barbell-row' },
  { label: 'Lat Pulldown', exerciseId: 'lat-pulldown' },
] as const;

export type VolumeMuscleKey = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core';

const VOLUME_ORDER: VolumeMuscleKey[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];

function volumeKeyForMuscle(mg: MuscleGroup): VolumeMuscleKey {
  if (mg === 'glutes') return 'legs';
  return mg;
}

/** Count completed working sets in [startMs, endMs] by display muscle (glutes → legs). */
export function workingSetsByMuscle(
  sessions: WorkoutSession[],
  startMs: number,
  endMs: number,
): Record<VolumeMuscleKey, number> {
  const acc: Record<VolumeMuscleKey, number> = {
    chest: 0,
    back: 0,
    shoulders: 0,
    biceps: 0,
    triceps: 0,
    legs: 0,
    core: 0,
  };
  for (const s of sessions) {
    const t = sessionFinishedMs(s);
    if (t < startMs || t > endMs) continue;
    for (const ex of s.exercises) {
      const k = volumeKeyForMuscle(ex.muscleGroup);
      for (const st of ex.sets) {
        if (st.completed) acc[k] += 1;
      }
    }
  }
  return acc;
}

export function volumeRowsForUi(
  sessions: WorkoutSession[],
  startMs: number,
  endMs: number,
): { key: VolumeMuscleKey; label: string; sets: number }[] {
  const counts = workingSetsByMuscle(sessions, startMs, endMs);
  const label: Record<VolumeMuscleKey, string> = {
    chest: 'CHEST',
    back: 'BACK',
    shoulders: 'SHOULDERS',
    biceps: 'BICEPS',
    triceps: 'TRICEPS',
    legs: 'LEGS',
    core: 'CORE',
  };
  return VOLUME_ORDER.map((key) => ({ key, label: label[key], sets: counts[key] }));
}

export function hasAnyCompletedSet(sessions: WorkoutSession[]): boolean {
  for (const s of sessions) {
    for (const ex of s.exercises) {
      for (const st of ex.sets) {
        if (st.completed) return true;
      }
    }
  }
  return false;
}

export function rollingWeekWindows(nowMs: number): {
  thisStart: number;
  thisEnd: number;
  prevStart: number;
  prevEnd: number;
} {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const thisEnd = nowMs;
  const thisStart = thisEnd - WEEK_MS;
  const prevEnd = thisStart - 1;
  const prevStart = thisStart - WEEK_MS;
  return { thisStart, thisEnd, prevStart, prevEnd };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}
