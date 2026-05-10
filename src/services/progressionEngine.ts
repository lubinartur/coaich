import { estimate1RM, REP_RANGES, WEIGHT_INCREMENTS } from '@/constants/progression';
import { db, getProfile } from '@/services/db';
import type { Exercise, ExerciseTarget, Profile, SessionExercise, WorkoutSession } from '@/types';

export type ProgressionStatus =
  | 'first_session'
  | 'baseline'
  | 'maintaining'
  | 'rep_increment'
  | 'weight_increment'
  | 'gap_detected'
  | 'deload';

export type ProgressionEngineResult = {
  weight: number;
  reps: number;
  sets: number;
  source: 'progression_engine';
  progressionStatus: ProgressionStatus;
};

/** Tailwind-friendly deload accent (Today / Logger rec lines). */
const DELOAD_TEXT_CLASS = 'text-[#60A5FA]';
const DELOAD_DOT_CLASS = 'bg-[#60A5FA]';

export type DeloadCheckResult = {
  deloadNeeded: boolean;
  reason: string;
  consecutiveWeeks: number;
  /** True when deload was triggered by consecutive-week threshold (natural ≥4 or on-cycle ≥6). */
  weekThresholdHit: boolean;
};

/** Copy + dot colors for Today / Logger (no row for `first_session`). */
export function getProgressionStatusPresentation(
  status: ProgressionStatus,
): { text: string; textClass: string; dotClass: string } | null {
  if (status === 'first_session') return null;
  const map: Record<
    Exclude<ProgressionStatus, 'first_session'>,
    { text: string; textClass: string; dotClass: string }
  > = {
    baseline: {
      text: 'Establishing baseline',
      textClass: 'text-text-secondary',
      dotClass: 'bg-text-secondary/70',
    },
    maintaining: {
      text: 'Holding — consolidating volume',
      textClass: 'text-warning',
      dotClass: 'bg-warning',
    },
    rep_increment: {
      text: '↑ +1 rep target',
      textClass: 'text-success',
      dotClass: 'bg-success',
    },
    weight_increment: {
      text: '↑ Weight increase',
      textClass: 'text-success',
      dotClass: 'bg-success',
    },
    gap_detected: {
      text: 'Back after break — easing in',
      textClass: 'text-warning',
      dotClass: 'bg-warning',
    },
    deload: {
      text: 'Deload week — half volume',
      textClass: DELOAD_TEXT_CLASS,
      dotClass: DELOAD_DOT_CLASS,
    },
  };
  return map[status];
}

/** Short status copy for Today inline (no dot); `null` for `first_session`. */
export function getProgressionStatusInlineText(status: ProgressionStatus): string | null {
  if (status === 'first_session') return null;
  const map: Record<Exclude<ProgressionStatus, 'first_session'>, string> = {
    baseline: 'Baseline',
    maintaining: 'Holding',
    rep_increment: '↑ Reps',
    weight_increment: '↑ Weight',
    gap_detected: 'Easing in',
    deload: 'Deload',
  };
  return map[status];
}

/** Same prescription on REC and LAST (hide LAST; use unified prefix on Today / Logger). */
export function areRecAndLastDuplicate(rec: string, last: string): boolean {
  const r = rec.trim();
  const l = last.trim();
  if (!r || !l) return false;
  if (r.toLowerCase() === 'first session') return false;
  if (l === '—' || l === '-' || l === '–') return false;
  return r.toLowerCase().replace(/\s+/g, ' ') === l.toLowerCase().replace(/\s+/g, ' ');
}

export type RecLastLayout =
  | { kind: 'dual'; rec: string; last: string }
  | { kind: 'unified'; label: string; value: string; lineClass: string };

export function getRecLastLayout(rec: string, last: string, status: ProgressionStatus): RecLastLayout {
  if (!areRecAndLastDuplicate(rec, last)) {
    return { kind: 'dual', rec, last };
  }
  const value = rec.trim();
  switch (status) {
    case 'maintaining':
      return { kind: 'unified', label: 'HOLD:', value, lineClass: 'text-warning' };
    case 'baseline':
      return { kind: 'unified', label: 'BASE:', value, lineClass: 'text-text-secondary' };
    case 'gap_detected':
      return { kind: 'unified', label: 'EASE IN:', value, lineClass: 'text-warning' };
    case 'first_session':
      return { kind: 'unified', label: 'START:', value, lineClass: 'text-text-secondary' };
    case 'deload':
      return { kind: 'unified', label: 'DELOAD:', value, lineClass: DELOAD_TEXT_CLASS };
    case 'rep_increment':
    case 'weight_increment':
      return { kind: 'unified', label: 'NEXT:', value, lineClass: 'text-accent' };
    default:
      return { kind: 'unified', label: 'REC:', value, lineClass: 'text-accent' };
  }
}

function roundWeightKg(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatWeightForDisplay(w: number): string {
  const r = roundWeightKg(w);
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
}

/** UI line e.g. `70kg × 10 × 3` */
export function formatTargetLine(weight: number, reps: number, sets: number): string {
  return `${formatWeightForDisplay(weight)}kg × ${reps} × ${sets}`;
}

export function isPlankExerciseName(name: string): boolean {
  return name.toLowerCase().includes('plank');
}

/** Display line for targets / last performance (bodyweight + timed plank). */
export function formatTargetLineForExercise(
  exerciseId: string,
  exerciseName: string,
  weight: number,
  reps: number,
  sets: number,
  equipment?: Exercise['equipment'],
): string {
  void exerciseId;
  const plank = isPlankExerciseName(exerciseName);
  if (equipment === 'bodyweight') {
    if (plank) return `${reps} sec × ${sets}`;
    return `Bodyweight · ${reps} × ${sets}`;
  }
  if (weight <= 0 && plank) {
    return `${reps} sec × ${sets}`;
  }
  return formatTargetLine(weight, reps, sets);
}

/**
 * Parse RECOMMEND lines from {@link formatTargetLine} / {@link formatTargetLineForExercise}.
 */
export function parseRecommendLine(recommend: string): { weight: string; reps: string; sets: number } | null {
  const raw = recommend.trim();
  if (!raw) return null;
  let compact = raw
    .replace(/\s+/g, '')
    .replace(/×/g, 'x')
    .replace(/\*/g, 'x')
    .toLowerCase();
  compact = compact.replace(/·/g, '');

  const kg = compact.match(/^([\d.,]+)kgx(\d+)x(\d+)$/);
  if (kg) {
    const sets = parseInt(kg[3], 10);
    if (!Number.isFinite(sets) || sets < 1) return null;
    return {
      weight: String(kg[1].replace(',', '.')),
      reps: String(kg[2]),
      sets: Math.min(20, sets),
    };
  }
  const sec = compact.match(/^(\d+)secx(\d+)$/);
  if (sec) {
    const sets = parseInt(sec[2], 10);
    if (!Number.isFinite(sets) || sets < 1) return null;
    return { weight: '0', reps: String(sec[1]), sets: Math.min(20, sets) };
  }
  const bw = compact.match(/^bodyweight(\d+)x(\d+)$/);
  if (bw) {
    const sets = parseInt(bw[2], 10);
    if (!Number.isFinite(sets) || sets < 1) return null;
    return { weight: '0', reps: String(bw[1]), sets: Math.min(20, sets) };
  }
  return null;
}

function repRangeForGoal(goal: Profile['goal']): { min: number; max: number } {
  const g = goal in REP_RANGES ? goal : 'muscle';
  return REP_RANGES[g as keyof typeof REP_RANGES];
}

/** Old Logger ids → canonical `EXERCISE_SEED` ids (history lookup / saves). */
const LEGACY_EXERCISE_ID_TO_CANONICAL: Record<string, string> = {
  'bicep-curl': 'dumbbell-curl',
  'close-grip-bench-press': 'close-grip-bench',
};

/** Normalize exercise id when writing new sessions so progression matches seed ids. */
export function canonicalExerciseId(exerciseId: string): string {
  return LEGACY_EXERCISE_ID_TO_CANONICAL[exerciseId] ?? exerciseId;
}

function profileHasCalibration(profile: Profile): boolean {
  const b = profile.benchPress10RM;
  const s = profile.squat10RM;
  const d = profile.deadlift10RM;
  return (
    (typeof b === 'number' && Number.isFinite(b) && b > 0) ||
    (typeof s === 'number' && Number.isFinite(s) && s > 0) ||
    (typeof d === 'number' && Number.isFinite(d) && d > 0)
  );
}

function workingPctFromExperience(exp: Profile['experience']): number {
  switch (exp) {
    case 'beginner':
      return 0.65;
    case 'intermediate':
      return 0.72;
    case 'advanced':
      return 0.77;
    default:
      return 0.65;
  }
}

function roundToNearest2Dot5Kg(w: number): number {
  if (!Number.isFinite(w) || w < 0) return 0;
  return Math.round(w / 2.5) * 2.5;
}

/**
 * First-day targets from onboarding 10RM benchmarks (bench / squat / deadlift).
 * Uses e1RM = estimate1RM(anchor10, 10), then experience % of 1RM; rounds to 2.5 kg.
 */
export function estimateBaselineFromCalibration(
  exerciseId: string,
  profile: Profile,
): { weight: number; reps: number; sets: number } | null {
  if (!profileHasCalibration(profile)) return null;

  const idEarly = canonicalExerciseId(exerciseId);
  if (idEarly === 'plank') {
    return { weight: 0, reps: 60, sets: 3 };
  }

  const bench =
    typeof profile.benchPress10RM === 'number' && profile.benchPress10RM > 0
      ? profile.benchPress10RM
      : undefined;
  const squat =
    typeof profile.squat10RM === 'number' && profile.squat10RM > 0 ? profile.squat10RM : undefined;
  const dead =
    typeof profile.deadlift10RM === 'number' && profile.deadlift10RM > 0 ? profile.deadlift10RM : undefined;

  const id = canonicalExerciseId(exerciseId);

  const anchor10: number | null = (() => {
    switch (id) {
      case 'barbell-bench-press':
        return bench ?? null;
      case 'incline-dumbbell-press':
        return bench != null ? bench * 0.65 : null;
      case 'machine-chest-press':
        return bench != null ? bench * 0.75 : null;
      case 'overhead-press':
        return bench != null ? bench * 0.55 : null;
      case 'back-squat':
        return squat ?? null;
      case 'leg-press':
        return squat != null ? squat * 1.4 : null;
      case 'romanian-deadlift':
        return dead != null ? dead * 0.75 : null;
      case 'hip-thrust':
        return dead != null ? dead * 0.65 : null;
      case 'lat-pulldown':
        return bench != null ? bench * 0.7 : null;
      case 'barbell-row':
        return bench != null ? bench * 0.75 : null;
      case 'seated-cable-row':
        return bench != null ? bench * 0.65 : null;
      case 'dumbbell-curl':
      case 'hammer-curl':
        return bench != null ? bench * 0.25 : null;
      case 'tricep-pushdown':
      case 'skull-crusher':
        return bench != null ? bench * 0.3 : null;
      case 'lateral-raise':
        return bench != null ? bench * 0.15 : null;
      case 'face-pull':
        return bench != null ? bench * 0.2 : null;
      case 'lying-leg-curl':
        return squat != null ? squat * 0.3 : null;
      case 'standing-calf-raise':
        return squat != null ? squat * 0.5 : null;
      default:
        return null;
    }
  })();

  if (anchor10 == null || !Number.isFinite(anchor10) || anchor10 <= 0) return null;

  const e1rm = estimate1RM(anchor10, 10);
  const rawWorking = e1rm * workingPctFromExperience(profile.experience);
  const weight = Math.max(2.5, roundToNearest2Dot5Kg(rawWorking));
  const reps = repRangeForGoal(profile.goal).min;
  return { weight, reps, sets: 3 };
}

function matchesExerciseLookup(storedExerciseId: string, lookupId: string): boolean {
  if (storedExerciseId === lookupId) return true;
  return LEGACY_EXERCISE_ID_TO_CANONICAL[storedExerciseId] === lookupId;
}

function sessionContainsExercise(session: WorkoutSession, exerciseId: string): boolean {
  return session.exercises.some((e) => matchesExerciseLookup(e.exerciseId, exerciseId));
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diffFromMonday = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diffFromMonday);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sessionInWeek(s: WorkoutSession, weekStart: Date): boolean {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  const a = weekStart.toISOString();
  const b = end.toISOString();
  return s.finishedAt >= a && s.finishedAt < b;
}

/**
 * Deload signals from recent history (last 6 weeks in Dexie + last 3 sessions for ratings).
 */
export async function checkDeloadNeeded(profile: Profile, now: Date = new Date()): Promise<DeloadCheckResult> {
  const sixWeeksStart = new Date(now);
  sixWeeksStart.setDate(sixWeeksStart.getDate() - 42);
  sixWeeksStart.setHours(0, 0, 0, 0);
  const windowSessions = await db.workoutSessions
    .where('finishedAt')
    .aboveOrEqual(sixWeeksStart.toISOString())
    .toArray();

  let consecutiveWeeks = 0;
  let weekRule = false;
  const weekThreshold = profile.pharmacology === 'on_cycle' ? 6 : 4;

  if (windowSessions.length > 0) {
    const sorted = [...windowSessions].sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
    const anchorMonday = startOfWeekMonday(new Date(sorted[0].finishedAt));

    for (let i = 0; i < 6; i++) {
      const ws = new Date(anchorMonday);
      ws.setDate(ws.getDate() - 7 * i);
      const has = windowSessions.some((s) => sessionInWeek(s, ws));
      if (has) consecutiveWeeks += 1;
      else break;
    }
    weekRule = consecutiveWeeks >= weekThreshold;
  }

  const lastThree = await db.workoutSessions.orderBy('finishedAt').reverse().limit(3).toArray();
  const badStreak =
    lastThree.length === 3 &&
    lastThree.every((s) => s.ratings.filter((r) => r.rating === 'bad').length >= 2);

  const currentMonday = startOfWeekMonday(now);
  const weekVolume = (offsetFromCurrentMonday: number) => {
    const mon = new Date(currentMonday);
    mon.setDate(mon.getDate() - 7 * offsetFromCurrentMonday);
    const end = new Date(mon);
    end.setDate(end.getDate() + 7);
    return windowSessions
      .filter((s) => s.finishedAt >= mon.toISOString() && s.finishedAt < end.toISOString())
      .reduce((a, s) => a + (Number.isFinite(s.totalVolume) ? s.totalVolume : 0), 0);
  };

  let volumeDrop = false;
  if (windowSessions.length > 0) {
    const v1 = weekVolume(1);
    const v2 = weekVolume(2);
    const v3 = weekVolume(3);
    volumeDrop =
      v3 > 0 &&
      v2 > 0 &&
      v1 > 0 &&
      v1 < v2 * 0.85 &&
      v2 < v3 * 0.85;
  }

  const deloadNeeded = weekRule || badStreak || volumeDrop;
  let reason = '';
  if (deloadNeeded) {
    if (weekRule) {
      reason =
        profile.pharmacology === 'on_cycle'
          ? `${consecutiveWeeks} consecutive training weeks (on-cycle guideline).`
          : `${consecutiveWeeks} consecutive training weeks without a break.`;
    } else if (badStreak) {
      reason = 'Last three workouts each had 2+ exercises rated rough — recovery may be lagging.';
    } else {
      reason = 'Weekly volume fell over 15% for two weeks in a row.';
    }
  }

  return { deloadNeeded, reason, consecutiveWeeks, weekThresholdHit: weekRule };
}

/** Whole calendar days between the more recent `finishedAt` and the older one. */
function daysBetweenSessions(newerFinishedAt: string, olderFinishedAt: string): number {
  const a = new Date(newerFinishedAt).getTime();
  const b = new Date(olderFinishedAt).getTime();
  return Math.floor((a - b) / 86400000);
}

async function loadSessionsContainingExercise(
  exerciseId: string,
  limit: number,
): Promise<WorkoutSession[]> {
  const ordered = await db.workoutSessions.orderBy('finishedAt').reverse().toArray();
  const out: WorkoutSession[] = [];
  for (const s of ordered) {
    if (sessionContainsExercise(s, exerciseId)) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function getSessionExercise(session: WorkoutSession, exerciseId: string): SessionExercise | undefined {
  return session.exercises.find((e) => matchesExerciseLookup(e.exerciseId, exerciseId));
}

/** Incomplete set counts as failed only if the user logged load/reps (planned work not finished). */
function hasFailedSets(ex: SessionExercise): boolean {
  return ex.sets.some((s) => {
    if (s.completed) return false;
    const touched = (Number.isFinite(s.weight) && s.weight > 0) || (Number.isFinite(s.reps) && s.reps > 0);
    return touched;
  });
}

function avgCompletedReps(ex: SessionExercise): number {
  const done = ex.sets.filter((s) => s.completed && s.reps > 0);
  if (done.length === 0) return 0;
  return done.reduce((a, s) => a + s.reps, 0) / done.length;
}

/** Min reps among completed sets — conservative progression anchor. */
function minCompletedReps(ex: SessionExercise): number {
  const done = ex.sets.filter((s) => s.completed && s.reps > 0);
  if (done.length === 0) return 0;
  return Math.min(...done.map((s) => s.reps));
}

function representativeWeight(ex: SessionExercise): number | null {
  const done = ex.sets.filter((s) => s.completed && s.weight >= 0);
  if (done.length === 0) return null;
  const first = done[0].weight;
  const allSame = done.every((s) => s.weight === first);
  if (allSame) return roundWeightKg(first);
  const sum = done.reduce((a, s) => a + s.weight, 0);
  return roundWeightKg(sum / done.length);
}

/**
 * Working-set summary from a logged exercise.
 * Returns null if there is no usable completed work.
 */
export function summarizeSessionExercise(ex: SessionExercise): {
  weight: number;
  reps: number;
  sets: number;
} | null {
  const weight = representativeWeight(ex);
  if (weight == null) return null;
  const reps = minCompletedReps(ex);
  if (reps <= 0) return null;
  return {
    weight,
    reps,
    sets: ex.sets.length,
  };
}

function exerciseRatingIsBad(session: WorkoutSession, exerciseId: string): boolean {
  return session.ratings.some(
    (r) =>
      r.rating === 'bad' &&
      (r.exerciseId === exerciseId || LEGACY_EXERCISE_ID_TO_CANONICAL[r.exerciseId] === exerciseId),
  );
}

function explainBlockProgression(
  session: WorkoutSession,
  ex: SessionExercise,
  exerciseId: string,
  prevAvgReps: number | null,
): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (session.durationMinutes < 10) reasons.push(`durationMinutes=${session.durationMinutes}<10`);
  if (hasFailedSets(ex)) reasons.push('hasFailedSets(incomplete set with logged weight/reps)');
  if (exerciseRatingIsBad(session, exerciseId)) reasons.push('exerciseRatingBad');
  const lastAvg = avgCompletedReps(ex);
  if (prevAvgReps != null && prevAvgReps > 0 && lastAvg > 0 && lastAvg < prevAvgReps * 0.8) {
    reasons.push(`repDrop lastAvg=${lastAvg.toFixed(2)} prevAvg=${prevAvgReps.toFixed(2)}`);
  }
  return { blocked: reasons.length > 0, reasons };
}

async function resolveWeightIncrementKg(exerciseId: string): Promise<number> {
  const meta = await db.exercises.get(exerciseId);
  const eq = meta?.equipment;
  if (eq && eq in WEIGHT_INCREMENTS) {
    return WEIGHT_INCREMENTS[eq as keyof typeof WEIGHT_INCREMENTS];
  }
  return 2.5;
}

async function persistTarget(exerciseId: string, pick: Pick<ExerciseTarget, 'weight' | 'reps' | 'sets'>) {
  const full: ExerciseTarget = {
    exerciseId,
    weight: pick.weight,
    reps: pick.reps,
    sets: pick.sets,
    source: 'progression_engine',
    updatedAt: new Date().toISOString(),
  };
  await db.exerciseTargets.put(full);
}

/**
 * Last performance line for UI (most recent session containing this exercise).
 */
export async function getLastPerformedSummary(exerciseId: string): Promise<string | null> {
  try {
    const sessions = await loadSessionsContainingExercise(exerciseId, 1);
    const s = sessions[0];
    if (!s) return null;
    const ex = getSessionExercise(s, exerciseId);
    if (!ex) return null;
    const sum = summarizeSessionExercise(ex);
    if (!sum) return null;
    const cid = canonicalExerciseId(exerciseId);
    const meta = await db.exercises.get(cid);
    return formatTargetLineForExercise(cid, ex.exerciseName, sum.weight, sum.reps, sum.sets, meta?.equipment);
  } catch {
    return null;
  }
}

/**
 * Computes next target from session history, persists `exerciseTargets`, returns payload for UI.
 * - No history → if profile has bench/squat/deadlift 10RM calibrations, estimated baseline from
 *   {@link estimateBaselineFromCalibration} (`progressionStatus: baseline`); else `null`.
 * - One session → same weight/reps/sets as last performance (baseline).
 * - Two+ sessions → at top of rep range (`lastReps >= max`): always bump weight (never blocked).
 *   Below max: guards apply; if blocked maintain; else +1 rep same weight.
 *
 * @param options.persist When `false`, computes targets + `progressionStatus` without writing Dexie (Logger preview).
 */
export async function getExerciseTarget(
  exerciseId: string,
  exerciseName: string,
  goal: Profile['goal'],
  pharmacology: Profile['pharmacology'],
  options?: { persist?: boolean; deloadWeek?: boolean },
): Promise<ProgressionEngineResult | null> {
  const persist = options?.persist !== false;
  const deloadWeek = options?.deloadWeek === true;
  try {
    void exerciseName;

    if (deloadWeek) {
      const sessionsDw = await loadSessionsContainingExercise(exerciseId, 2);
      if (sessionsDw.length === 0) {
        const profileDw = await getProfile();
        if (!profileDw || !profileHasCalibration(profileDw)) return null;
        const calDw = estimateBaselineFromCalibration(exerciseId, profileDw);
        if (!calDw) return null;
        const setsDw = Math.max(1, Math.ceil(calDw.sets / 2));
        const nextDw = { weight: calDw.weight, reps: calDw.reps, sets: setsDw };
        if (persist) await persistTarget(exerciseId, nextDw);
        return { ...nextDw, source: 'progression_engine', progressionStatus: 'deload' };
      }
      const lastSessionDw = sessionsDw[0];
      const lastExDw = getSessionExercise(lastSessionDw, exerciseId);
      if (!lastExDw) return null;
      const lastPerfDw = summarizeSessionExercise(lastExDw);
      if (!lastPerfDw) return null;
      const setsDeload = Math.max(1, Math.ceil(lastPerfDw.sets / 2));
      const nextDeload = {
        weight: lastPerfDw.weight,
        reps: lastPerfDw.reps,
        sets: setsDeload,
      };
      if (persist) await persistTarget(exerciseId, nextDeload);
      return { ...nextDeload, source: 'progression_engine', progressionStatus: 'deload' };
    }

    const sessions = await loadSessionsContainingExercise(exerciseId, 2);
    console.log('[progressionEngine] getExerciseTarget lookup', {
      exerciseId,
      sessionsFound: sessions.length,
      exerciseIdsBySession: sessions.map((s) => ({
        sessionId: s.id,
        exerciseIds: s.exercises.map((e) => e.exerciseId),
      })),
    });

    if (sessions.length === 0) {
      const profile = await getProfile();
      if (!profile || !profileHasCalibration(profile)) return null;
      const cal = estimateBaselineFromCalibration(exerciseId, profile);
      if (!cal) return null;
      if (persist) await persistTarget(exerciseId, cal);
      return {
        ...cal,
        source: 'progression_engine',
        progressionStatus: 'baseline',
      };
    }

    const lastSession = sessions[0];
    const lastEx = getSessionExercise(lastSession, exerciseId);
    if (!lastEx) return null;

    const lastPerf = summarizeSessionExercise(lastEx);
    if (!lastPerf) return null;

    if (sessions.length === 1) {
      if (persist) await persistTarget(exerciseId, lastPerf);
      return { ...lastPerf, source: 'progression_engine', progressionStatus: 'baseline' };
    }

    const prevSession = sessions[1];
    const gapDays = daysBetweenSessions(lastSession.finishedAt, prevSession.finishedAt);
    if (gapDays > 14) {
      console.log(
        `[progressionEngine] gap detected: ${gapDays} days since last session, returning baseline`,
        {
          exerciseId,
          lastFinishedAt: lastSession.finishedAt,
          previousFinishedAt: prevSession.finishedAt,
        },
      );
      if (persist) await persistTarget(exerciseId, lastPerf);
      return { ...lastPerf, source: 'progression_engine', progressionStatus: 'gap_detected' };
    }

    const profile = await getProfile();
    const effectiveGoal = profile?.goal ?? goal;
    const effectivePharmacology = profile?.pharmacology ?? pharmacology;
    const range = repRangeForGoal(effectiveGoal);

    const prevEx = getSessionExercise(prevSession, exerciseId);
    const prevPerf = prevEx ? summarizeSessionExercise(prevEx) : null;
    const prevAvgReps =
      prevEx && prevPerf != null ? avgCompletedReps(prevEx) : null;

    const lastRepsAnchor = lastPerf.reps;
    const prevRepsAnchor = prevPerf?.reps ?? null;

    const inc = await resolveWeightIncrementKg(exerciseId);

    console.log('[progressionEngine] getExerciseTarget 2+ sessions', {
      exerciseId,
      paramGoal: goal,
      effectiveGoalFromDexie: effectiveGoal,
      pharmacology: effectivePharmacology,
      repRange: range,
      lastSessionRepsMin: lastRepsAnchor,
      previousSessionRepsMin: prevRepsAnchor,
      lastSessionAvgReps: avgCompletedReps(lastEx),
      previousSessionAvgReps: prevEx && prevPerf != null ? avgCompletedReps(prevEx) : null,
      prevAvgRepsForGuard: prevAvgReps,
      durationMinutes: lastSession.durationMinutes,
      atOrAboveRepMax: lastPerf.reps >= range.max,
    });

    let next: { weight: number; reps: number; sets: number };

    if (lastPerf.reps >= range.max) {
      next = {
        weight: roundWeightKg(lastPerf.weight + inc),
        reps: range.min,
        sets: lastPerf.sets,
      };
      console.log('[progressionEngine] progression decision: weight increment triggered', {
        reason: 'lastReps >= repRange.max (guards not applied to weight progression)',
        lastReps: lastPerf.reps,
        repRangeMax: range.max,
        repRangeMin: range.min,
        pharmacology: effectivePharmacology,
        lastWeight: lastPerf.weight,
        incrementKg: inc,
        next,
      });
    } else {
      const { blocked, reasons } = explainBlockProgression(lastSession, lastEx, exerciseId, prevAvgReps);
      const blockReasonsFull = reasons.length ? reasons.join(' | ') : '';
      console.log('[progressionEngine] rep-path guards', {
        blocked,
        blockReasons: reasons,
        blockReasonsFull,
      });

      if (blocked) {
        next = lastPerf;
        const progressionStatus: ProgressionStatus = 'maintaining';
        console.log('[progressionEngine] progression decision: blocking - maintaining', {
          baseline: lastPerf,
          next,
          progressionStatus,
        });
        if (persist) await persistTarget(exerciseId, next);
        return { ...next, source: 'progression_engine', progressionStatus };
      }
      next = {
        weight: roundWeightKg(lastPerf.weight),
        reps: lastPerf.reps + 1,
        sets: lastPerf.sets,
      };
      console.log('[progressionEngine] progression decision: rep increment triggered', {
        baseline: lastPerf,
        next,
      });
    }

    if (persist) await persistTarget(exerciseId, next);
    return {
      ...next,
      source: 'progression_engine',
      progressionStatus: lastPerf.reps >= range.max ? 'weight_increment' : 'rep_increment',
    };
  } catch (err) {
    console.error('[progressionEngine] getExerciseTarget', exerciseId, err);
    return null;
  }
}

/** Read-only progression + next target for UI (does not write `exerciseTargets`). */
export async function previewExerciseTarget(
  exerciseId: string,
  exerciseName: string,
  goal: Profile['goal'],
  pharmacology: Profile['pharmacology'],
  options?: { deloadWeek?: boolean },
): Promise<ProgressionEngineResult | null> {
  return getExerciseTarget(exerciseId, exerciseName, goal, pharmacology, {
    persist: false,
    deloadWeek: options?.deloadWeek,
  });
}
