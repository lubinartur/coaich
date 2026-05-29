import { checkDeloadNeeded, type DeloadCheckResult } from '@/services/progressionEngine';
import { db } from '@/services/db';
import type { MuscleGroup, Profile, WorkoutSession, WorkoutType } from '@/types';

const COACH_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const COACH_MAX_TOKENS = 1000;

export interface CoachPromptData {
  profile: Profile;
  lastSession: WorkoutSession | undefined;
  hoursSinceLast: number;
  recommendation: { type: string; name: string; reasoning: string };
  weeklyVolume: Record<string, number>;
  memoryFindings?: string[];
}

export type RecommendedWorkoutType = 'push' | 'pull' | 'legs' | 'full_body';

type SplitType = 'ppl' | 'upper_lower' | 'full_body';

function getSplitType(profile: Profile): SplitType {
  return profile.splitType ?? 'ppl';
}

/**
 * Resolves the display name shown in Today/Logger headers for a recommended workout type,
 * respecting the user's chosen split (PPL / Upper-Lower / Full Body) and language.
 */
function workoutNameForSplit(profile: Profile, type: RecommendedWorkoutType): string {
  const split = getSplitType(profile);
  const ru = profile.language === 'ru';
  if (split === 'full_body') return 'Full Body';
  if (split === 'upper_lower') {
    if (type === 'legs') return ru ? 'Lower - Низ тела' : 'Lower - Lower Body';
    return ru ? 'Upper - Верх тела' : 'Upper - Upper Body';
  }
  return WORKOUT_NAMES[type];
}

export interface WorkoutRecommendation {
  /** `null` = rest day (trained within recovery window). */
  workoutType: RecommendedWorkoutType | null;
  workoutName: string;
  reasoning: string;
  /** When `workoutType` is `null`, optional split to show if the user chooses “Train anyway”. */
  trainAnywayType?: RecommendedWorkoutType;
  trainAnywayName?: string;
  /** Planned deload week: same split, reduced sets in progression engine. */
  isDeload?: boolean;
  deloadConsecutiveWeeks?: number;
}

const buildCoachPrompt = (data: CoachPromptData): string => `

You are a smart personal trainer explaining today's workout recommendation.

Be brief — 2 sentences max. Natural tone, not robotic.

---

ATHLETE: ${data.profile.experience} level, goal: ${data.profile.goal}

PHARMACOLOGY: ${data.profile.pharmacology}

LAST WORKOUT: ${data.lastSession != null ? `${data.lastSession.name} — ${data.hoursSinceLast}h ago` : 'No completed workouts yet'}

RECOMMENDED TODAY: ${data.recommendation.type} (${data.recommendation.name})

REASON (technical): ${data.recommendation.reasoning}

WEEKLY VOLUME STATUS:

${Object.entries(data.weeklyVolume)
  .map(([muscle, sets]) => `${muscle}: ${sets} sets`)
  .join(', ')}
${data.memoryFindings && data.memoryFindings.length > 0
  ? `
ATHLETE MEMORY (patterns from recent sessions):
${data.memoryFindings.map((f) => `- ${f}`).join('\n')}
`
  : ''}
---

Write ONE short paragraph (2 sentences) explaining why this workout is recommended today.

Mention recovery time or volume balance if relevant.

Highlight the workout name in your response.

Language: ${data.profile.language === 'ru' ? 'Russian' : 'English'}

Respond with plain text only, no JSON.

Do not use markdown formatting. No bold (**text**), no asterisks, plain text only.

`;

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

function countWeeklySetsByMuscleGroup(sessions: WorkoutSession[], now: Date): Record<string, number> {
  const weekStart = startOfWeekMonday(now).toISOString();
  const groups: MuscleGroup[] = [
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'legs',
    'glutes',
    'core',
  ];
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g] = 0;
  for (const s of sessions) {
    if (s.finishedAt < weekStart) continue;
    for (const ex of s.exercises) {
      const mg = ex.muscleGroup;
      for (const st of ex.sets) {
        if (!st.completed) continue;
        counts[mg] = (counts[mg] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Build prompt inputs for {@link generateCoachMessage} (last session, hours since, weekly sets per muscle).
 */
export async function buildCoachPromptData(
  profile: Profile,
  recommendation: WorkoutRecommendation,
): Promise<CoachPromptData> {
  const now = new Date();
  const weekStartIso = startOfWeekMonday(now).toISOString();
  const weekSessions = await db.workoutSessions.where('finishedAt').aboveOrEqual(weekStartIso).toArray();
  const lastFive = await db.workoutSessions.orderBy('finishedAt').reverse().limit(1).toArray();
  const lastSession = lastFive[0];
  const hoursSinceLast = lastSession ? hoursSince(lastSession.finishedAt, now) : Number.POSITIVE_INFINITY;
  const weeklyVolume = countWeeklySetsByMuscleGroup(weekSessions, now);
  return {
    profile,
    lastSession,
    hoursSinceLast,
    recommendation: {
      type: recommendation.workoutType ?? 'rest',
      name: recommendation.workoutName,
      reasoning: recommendation.reasoning,
    },
    weeklyVolume,
  };
}

export const generateCoachMessage = async (data: CoachPromptData): Promise<string> => {
  const fallback = `Ready for your ${data.recommendation.type} session today.`;

  let memoryFindings: string[] = [];
  try {
    const entries = await db.coachMemory
      .orderBy('generatedAt')
      .reverse()
      .limit(4)
      .toArray();
    memoryFindings = entries.flatMap((e) => e.keyFindings).slice(0, 20);
  } catch {
    // memory table may be empty on first use
  }

  const promptData: CoachPromptData = { ...data, memoryFindings };
  const prompt = buildCoachPrompt(promptData);

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    const res = await fetch('/api/anthropic', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: COACH_CLAUDE_MODEL,
        max_tokens: COACH_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const rawJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      return fallback;
    }

    const content = (rawJson as { content?: { type: string; text?: string }[] }).content;
    const textBlock = content?.find((c) => c.type === 'text');
    const text = textBlock?.text?.trim() ?? '';
    return text.length > 0 ? text : fallback;
  } catch {
    return fallback;
  }
};

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
  const split = getSplitType(profile);
  const hours = last ? hoursSince(last.finishedAt, now) : Number.POSITIVE_INFINITY;

  if (split === 'full_body') {
    let recoveryNote = '';
    if (last && hours < 24) {
      recoveryNote = `Only ${Math.max(1, Math.round(hours))}h since your last workout — recovery first.`;
    } else if (last && hours >= 24 && hours <= 48) {
      recoveryNote = 'Roughly a day of recovery — a normal training window.';
    } else if (last && hours > 72) {
      recoveryNote = "You've had a longer break — any workout is fine when you're ready.";
    }
    const reasoning = composeReasoning([
      'Full-body split — every session hits the whole body.',
      recoveryNote,
      goalPhrase(profile),
    ]);
    return {
      workoutType: 'full_body',
      workoutName: workoutNameForSplit(profile, 'full_body'),
      reasoning,
    };
  }

  if (split === 'upper_lower') {
    const lastLabel = last ? normalizeRotationKey(last.type) : null;
    let workoutType: RecommendedWorkoutType;
    let rotationExplain: string;
    if (!lastLabel) {
      workoutType = 'push';
      rotationExplain = 'No completed sessions on file yet — starting from upper.';
    } else if (lastLabel === 'legs') {
      workoutType = 'push';
      rotationExplain = 'Last session was lower — rotating to upper.';
    } else if (lastLabel === 'push' || lastLabel === 'pull') {
      workoutType = 'legs';
      rotationExplain = 'Last session was upper — rotating to lower.';
    } else {
      workoutType = 'push';
      rotationExplain = 'After a full-body session, alternating to upper for structure.';
    }
    let recoveryNote = '';
    if (last && hours < 24) {
      recoveryNote = `Only ${Math.max(1, Math.round(hours))}h since your last workout — keep loads light or rest if needed.`;
    } else if (last && hours >= 24 && hours <= 48) {
      recoveryNote = 'Roughly a day of recovery — a normal training window.';
    } else if (last && hours > 72) {
      recoveryNote = "You've had a longer break — either upper or lower is fine.";
    }
    const reasoning = composeReasoning([rotationExplain, recoveryNote, goalPhrase(profile)]);
    return {
      workoutType,
      workoutName: workoutNameForSplit(profile, workoutType),
      reasoning,
    };
  }

  const weekStartIso = startOfWeekMonday(now).toISOString();
  const weekSessions = await db.workoutSessions.where('finishedAt').aboveOrEqual(weekStartIso).toArray();

  let workoutType = rotationFromLastSession(last, prev);

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

  const workoutName = workoutNameForSplit(profile, workoutType);
  const reasoning = composeReasoning([rotationExplain, recoveryNote, weeklyNote, goalPhrase(profile)]);

  return { workoutType, workoutName, reasoning };
}

/**
 * Coach recommendation: rotation from last session, recovery window, weekly volume balance.
 * Loads last 5 sessions (finishedAt desc) plus this week’s sessions for set counts.
 */
function mergeDeloadReasoning(deload: DeloadCheckResult, activeReasoning: string): string {
  const headline = deload.weekThresholdHit
    ? deload.consecutiveWeeks === 1
      ? "You've trained 1 week straight. Time for a deload."
      : `You've trained ${deload.consecutiveWeeks} weeks straight. Time for a deload.`
    : deload.reason;
  return composeReasoning([headline, activeReasoning]);
}

export async function getWorkoutRecommendation(profile: Profile): Promise<WorkoutRecommendation> {
  const now = new Date();
  const deload = await checkDeloadNeeded(profile, now);

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
      isDeload: deload.deloadNeeded,
      deloadConsecutiveWeeks: deload.consecutiveWeeks,
    };
  }

  const active = await recommendActiveWorkout(profile, now, last, prev);
  if (!deload.deloadNeeded) {
    return active;
  }

  return {
    ...active,
    reasoning: mergeDeloadReasoning(deload, active.reasoning),
    isDeload: true,
    deloadConsecutiveWeeks: deload.consecutiveWeeks,
  };
}
