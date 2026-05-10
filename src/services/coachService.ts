import { db } from '@/services/db';
import type { MuscleGroup, Profile, WorkoutSession, WorkoutType } from '@/types';

export type RecommendedWorkoutType = 'push' | 'pull' | 'legs' | 'full_body';

export interface WorkoutRecommendation {
  /** `null` = rest day (trained within recovery window). */
  workoutType: RecommendedWorkoutType | null;
  workoutName: string;
  reasoning: string;
  /** When `workoutType` is `null`, optional split to show if the user chooses “Train anyway”. */
  trainAnywayType?: RecommendedWorkoutType;
  trainAnywayName?: string;
}

const WORKOUT_NAMES: Record<RecommendedWorkoutType, string> = {
  push: 'Push - Chest & Shoulders',
  pull: 'Pull - Back & Biceps',
  legs: 'Legs - Quads & Hamstrings',
  full_body: 'Full Body',
};

const PUSH_MUSCLES: ReadonlySet<MuscleGroup> = new Set(['chest', 'shoulders', 'triceps']);
const PULL_MUSCLES: ReadonlySet<MuscleGroup> = new Set(['back', 'biceps']);
const LEGS_MUSCLES: ReadonlySet<MuscleGroup> = new Set(['legs', 'glutes', 'core']);

function normalizeRotationKey(type: WorkoutType): 'push' | 'pull' | 'legs' | 'full_body' {
  switch (type) {
    case 'push':
      return 'push';
    case 'pull':
      return 'pull';
    case 'legs':
      return 'legs';
    case 'full_body':
      return 'full_body';
    case 'upper':
      return 'push';
    case 'lower':
      return 'legs';
    case 'custom':
      return 'full_body';
    default:
      return 'full_body';
  }
}

function hoursSince(finishedAtIso: string, now: Date): number {
  const end = new Date(finishedAtIso).getTime();
  return (now.getTime() - end) / (1000 * 60 * 60);
}

function startOfWeekMonday(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diffFromMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rotationFromLastSession(last: WorkoutSession | undefined, prev: WorkoutSession | undefined): RecommendedWorkoutType {
  if (!last) return 'push';

  const L = normalizeRotationKey(last.type);
  const P = prev ? normalizeRotationKey(prev.type) : null;

  if (L === 'full_body') return 'push';

  if (L === 'push') return 'pull';

  if (L === 'pull') {
    if (P === 'legs') return 'push';
    return 'legs';
  }

  if (L === 'legs') {
    if (P === 'pull') return 'push';
    if (P === 'push') return 'pull';
    return 'push';
  }

  return 'push';
}

/** Next split in push → pull → legs cycle (avoids repeating the same focus). */
function pickDifferentSplit(last: RecommendedWorkoutType): RecommendedWorkoutType {
  const order: RecommendedWorkoutType[] = ['push', 'pull', 'legs'];
  const idx = order.indexOf(last);
  if (idx === -1) return 'pull';
  return order[(idx + 1) % order.length];
}

function countWeeklySetsByFocus(sessions: WorkoutSession[], now: Date): { push: number; pull: number; legs: number } {
  const weekStart = startOfWeekMonday(now).toISOString();
  const counts = { push: 0, pull: 0, legs: 0 };

  for (const s of sessions) {
    if (s.finishedAt < weekStart) continue;
    for (const ex of s.exercises) {
      const mg = ex.muscleGroup;
      for (const st of ex.sets) {
        if (!st.completed) continue;
        if (PUSH_MUSCLES.has(mg)) counts.push += 1;
        else if (PULL_MUSCLES.has(mg)) counts.pull += 1;
        else if (LEGS_MUSCLES.has(mg)) counts.legs += 1;
      }
    }
  }

  return counts;
}

/** Prefer a split whose focus has the fewest completed sets this week (ties → pull, push, legs). */
function weeklyPrioritySplit(weekly: { push: number; pull: number; legs: number }): RecommendedWorkoutType | null {
  const entries: [RecommendedWorkoutType, number][] = [
    ['pull', weekly.pull],
    ['push', weekly.push],
    ['legs', weekly.legs],
  ];
  const min = Math.min(weekly.push, weekly.pull, weekly.legs);
  if (min > 0) return null;

  const zeros = entries.filter(([, n]) => n === 0).map(([k]) => k);
  if (zeros.length === 0) return null;
  if (zeros.length === 1) return zeros[0];

  const priority: RecommendedWorkoutType[] = ['pull', 'push', 'legs'];
  for (const p of priority) {
    if (zeros.includes(p)) return p;
  }
  return zeros[0];
}

function composeReasoning(segments: string[], maxLen = 260): string {
  const text = segments.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function goalPhrase(profile: Profile): string {
  switch (profile.goal) {
    case 'strength':
      return 'Keep intensity controlled as you progress.';
    case 'weight_loss':
      return 'Consistency beats perfection for your goal.';
    case 'health':
      return 'Steady volume supports overall health.';
    case 'muscle':
    default:
      return 'Progressive overload still applies.';
  }
}

/**
 * Active split recommendation (rotation, recovery copy, weekly balance) — used for normal days
 * and for “train anyway” on rest days (same logic, ignoring the sub-8h rest gate).
 */
async function recommendActiveWorkout(
  profile: Profile,
  now: Date,
  last: WorkoutSession | undefined,
  prev: WorkoutSession | undefined,
): Promise<{ workoutType: RecommendedWorkoutType; workoutName: string; reasoning: string }> {
  const weekStartIso = startOfWeekMonday(now).toISOString();
  const weekSessions = await db.workoutSessions.where('finishedAt').aboveOrEqual(weekStartIso).toArray();

  let workoutType = rotationFromLastSession(last, prev);
  const hours = last ? hoursSince(last.finishedAt, now) : Number.POSITIVE_INFINITY;

  const weekly = countWeeklySetsByFocus(weekSessions, now);
  const weeklyPick = weeklyPrioritySplit(weekly);

  let recoveryNote = '';
  let weeklyNote = '';
  let rotationExplain = '';

  if (!last) {
    rotationExplain = 'No completed sessions on file yet — starting from a balanced default.';
  } else {
    const lastLabel = normalizeRotationKey(last.type);
    rotationExplain =
      lastLabel === 'full_body'
        ? 'After a full-body session, any split works — defaulting to push for structure.'
        : `Last session was ${lastLabel} — rotating for balanced training.`;
  }

  if (last && hours < 24) {
    const lastRot = normalizeRotationKey(last.type);
    if (lastRot === 'full_body') {
      if (workoutType === 'full_body') workoutType = 'pull';
    } else {
      const lastSplit = lastRot as RecommendedWorkoutType;
      if (workoutType === lastSplit) {
        workoutType = pickDifferentSplit(lastSplit);
      }
    }
    recoveryNote = `Only ${Math.max(1, Math.round(hours))}h since your last workout — favor a different focus (or rest) instead of repeating the same split.`;
  } else if (last && hours >= 24 && hours <= 48) {
    recoveryNote = 'Roughly a day of recovery — a normal training window.';
  } else if (last && hours > 72) {
    recoveryNote = "You've had a longer break — any workout type is fine when you're ready.";
  }

  if (weeklyPick) {
    const lastRot = last ? normalizeRotationKey(last.type) : null;
    const lastSplit =
      lastRot && lastRot !== 'full_body' ? (lastRot as RecommendedWorkoutType) : null;
    const shortRecoverySame = hours < 24 && lastSplit !== null && weeklyPick === lastSplit;

    if (shortRecoverySame) {
      weeklyNote = `${weeklyPick} volume is behind this week, but spacing since your last session comes first.`;
    } else {
      workoutType = weeklyPick;
      weeklyNote = `No completed sets for that pattern yet this week — prioritizing ${weeklyPick} volume.`;
    }
  }

  const workoutName = WORKOUT_NAMES[workoutType];
  const reasoning = composeReasoning([rotationExplain, recoveryNote, weeklyNote, goalPhrase(profile)]);

  return { workoutType, workoutName, reasoning };
}

/**
 * Coach recommendation: rotation from last session, recovery window, weekly volume balance.
 * Loads last 5 sessions (finishedAt desc) plus this week’s sessions for set counts.
 */
export async function getWorkoutRecommendation(profile: Profile): Promise<WorkoutRecommendation> {
  const now = new Date();

  const lastFive = await db.workoutSessions.orderBy('finishedAt').reverse().limit(5).toArray();
  const last = lastFive[0];
  const prev = lastFive[1];
  const hoursSinceLast = last ? hoursSince(last.finishedAt, now) : Number.POSITIVE_INFINITY;

  if (last && hoursSinceLast < 8) {
    const train = await recommendActiveWorkout(profile, now, last, prev);
    return {
      workoutType: null,
      workoutName: 'Rest Day',
      reasoning: 'You trained recently. Rest or do light activity today.',
      trainAnywayType: train.workoutType,
      trainAnywayName: train.workoutName,
    };
  }

  return recommendActiveWorkout(profile, now, last, prev);
}
