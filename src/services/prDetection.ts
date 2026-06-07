import type { Exercise, PrRecord, WorkoutSession } from '@/types';
import { epley1RM } from '@/services/progressMetrics';
import { canonicalExerciseId } from '@/services/progressionEngine';
import { db } from '@/services/db';

export function estimate1RM(weight: number, reps: number): number {
  return epley1RM(weight, reps);
}

/** Strength ordering: Epley when weight &gt; 0; else max reps (bodyweight / timed). */
export function strengthMetric(weight: number, reps: number, equipment: Exercise['equipment']): number {
  if (equipment === 'bodyweight' || weight <= 0) return reps;
  return epley1RM(weight, reps);
}

export function parseLoggerSetWeightReps(
  set: { weight: string; reps: string },
  equipment: Exercise['equipment'],
): { weight: number; reps: number } | null {
  const wRaw = set.weight.replace(',', '.').trim();
  const r = parseInt(set.reps.trim(), 10);
  if (!Number.isFinite(r) || r <= 0) return null;
  if (equipment === 'bodyweight') {
    const w = wRaw === '' ? 0 : parseFloat(wRaw);
    if (!Number.isFinite(w) || w < 0) return null;
    return { weight: w, reps: r };
  }
  const w = parseFloat(wRaw);
  if (!Number.isFinite(w) || w <= 0) return null;
  return { weight: w, reps: r };
}

/** Max strength metric from all completed sets in stored sessions for this exercise. */
export function maxHistoricalStrengthMetric(
  sessions: WorkoutSession[],
  exerciseId: string,
  equipment: Exercise['equipment'],
): number {
  const cid = canonicalExerciseId(exerciseId);
  let best = 0;
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (canonicalExerciseId(ex.exerciseId) !== cid) continue;
      for (const st of ex.sets) {
        if (!st.completed) continue;
        best = Math.max(best, strengthMetric(st.weight, st.reps, equipment));
      }
    }
  }
  return best;
}

/** Best metric among other completed sets in the current logger workout (same canonical exercise, excluding one cell). */
export function maxSameWorkoutOtherSetsMetric(
  exercises: { exerciseId: string; equipment: Exercise['equipment']; sets: { completed: boolean; weight: string; reps: string }[] }[],
  exIdx: number,
  setIdx: number,
): number {
  const targetId = canonicalExerciseId(exercises[exIdx].exerciseId);
  let best = 0;
  exercises.forEach((ex, ei) => {
    if (canonicalExerciseId(ex.exerciseId) !== targetId) return;
    ex.sets.forEach((st, si) => {
      if (ei === exIdx && si === setIdx) return;
      if (!st.completed) return;
      const p = parseLoggerSetWeightReps(st, ex.equipment);
      if (!p) return;
      best = Math.max(best, strengthMetric(p.weight, p.reps, ex.equipment));
    });
  });
  return best;
}

export function isSetPersonalRecord(
  sessions: WorkoutSession[],
  exercises: { exerciseId: string; equipment: Exercise['equipment']; sets: { completed: boolean; weight: string; reps: string }[] }[],
  exIdx: number,
  setIdx: number,
): boolean {
  const ex = exercises[exIdx];
  const set = ex.sets[setIdx];
  const p = parseLoggerSetWeightReps(set, ex.equipment);
  if (!p) return false;
  const cur = strengthMetric(p.weight, p.reps, ex.equipment);
  const hist = maxHistoricalStrengthMetric(sessions, ex.exerciseId, ex.equipment);
  const same = maxSameWorkoutOtherSetsMetric(exercises, exIdx, setIdx);
  return cur > Math.max(hist, same);
}

/**
 * True when `weight` is strictly greater than the max completed weight ever logged
 * for this exercise across stored sessions (weight-only PR, ignores reps/1RM).
 */
export async function checkIfPR(exerciseId: string, weight: number): Promise<boolean> {
  if (!Number.isFinite(weight) || weight <= 0) return false;
  const cid = canonicalExerciseId(exerciseId);
  const sessions = await db.workoutSessions.toArray();
  let maxWeight = 0;
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (canonicalExerciseId(ex.exerciseId) !== cid) continue;
      for (const st of ex.sets) {
        if (!st.completed) continue;
        if (st.weight > maxWeight) maxWeight = st.weight;
      }
    }
  }
  return weight > maxWeight;
}

export function buildPrRecordsForSession(
  sessionId: string,
  achievedAt: string,
  exercises: {
    exerciseId: string;
    exerciseName: string;
    equipment: Exercise['equipment'];
    sets: { completed: boolean; isPR?: boolean; weight: string; reps: string }[];
  }[],
): PrRecord[] {
  const out: PrRecord[] = [];
  for (const ex of exercises) {
    let best: PrRecord | null = null;
    let bestMetric = -1;
    for (const set of ex.sets) {
      if (!set.completed || !set.isPR) continue;
      const p = parseLoggerSetWeightReps(set, ex.equipment);
      if (!p) continue;
      const m = strengthMetric(p.weight, p.reps, ex.equipment);
      const est =
        ex.equipment === 'bodyweight' && p.weight <= 0 ? p.reps : epley1RM(p.weight, p.reps);
      if (m > bestMetric) {
        bestMetric = m;
        best = {
          exerciseId: canonicalExerciseId(ex.exerciseId),
          exerciseName: ex.exerciseName,
          weight: ex.equipment === 'bodyweight' ? 0 : p.weight,
          reps: p.reps,
          estimated1RM: est,
          achievedAt,
          sessionId,
        };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

export function formatPrLine(record: PrRecord): string {
  const w = record.weight;
  const r = record.reps;
  if (w > 0) {
    const ws = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, '');
    return `${record.exerciseName} — new PR: ${ws}kg × ${r}`;
  }
  return `${record.exerciseName} — new PR: ${r} reps`;
}
