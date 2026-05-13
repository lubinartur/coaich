/** Anthropic Claude — workout Review (ai-prompts.md). */

import { EXERCISE_SEED } from '@/constants/exercises';
import { canonicalExerciseId, formatNextTargetLine, isTimedHoldExercise } from '@/services/progressionEngine';
import { db, type CoachMemoryEntry } from '@/services/db';
import type {
  AIReview,
  ExerciseRating,
  NextTarget,
  Profile,
  WorkoutSession,
} from '@/types';

export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
export const CLAUDE_MAX_TOKENS = 1000;

export type ReviewPromptData = {
  profile: Profile;
  session: WorkoutSession;
  ratings: ExerciseRating[];
  nextTargets: NextTarget[];
};

const buildReviewPrompt = (data: ReviewPromptData): string => `

You are an experienced, honest personal trainer analyzing a workout.

Be specific, use real numbers, avoid generic advice.

Be concise — no fluff, no excessive praise.

---

ATHLETE PROFILE:

- Goal: ${data.profile.goal}

- Experience: ${data.profile.experience}

- Pharmacology: ${data.profile.pharmacology}

---

WORKOUT:

- Type: ${data.session.type} (${data.session.name})

- Duration: ${data.session.durationMinutes} minutes

- Total volume: ${data.session.totalVolume}kg

- Exercises: ${data.session.exercises.length}

---

EXERCISES PERFORMED:

${data.session.exercises
  .map(
    (ex) => `

${ex.exerciseName}:

${ex.sets
  .map((s) => {
    const timed = isTimedHoldExercise(ex.exerciseId, ex.exerciseName);
    return timed
      ? `Set ${s.setNumber}: ${s.weight}kg × ${s.reps}s`
      : `Set ${s.setNumber}: ${s.weight}kg × ${s.reps} reps`;
  })
  .join('\n')}

Rating: ${data.ratings.find((r) => r.exerciseId === ex.exerciseId)?.rating || 'not rated'}

Note: ${data.ratings.find((r) => r.exerciseId === ex.exerciseId)?.note || 'none'}

`,
  )
  .join('\n')}

---

PROGRESSION TARGETS FOR NEXT SESSION (calculated by engine):

Each line is: "ExerciseName: weight × reps × sets" (or seconds instead of reps for timed holds). Copy the exercise name exactly as shown.

${data.nextTargets
  .map((t) => {
    const label = (t.exerciseName || '').trim() || '(exercise name missing in app data — infer from workout above)';
    return `${label}: ${formatNextTargetLine(t.exerciseId, t.exerciseName, t.weight, t.reps, t.sets)}`;
  })
  .join('\n')}

---

Respond ONLY in JSON format, no markdown, no backticks:

{

  "intro": "2-3 sentence overall assessment. Be honest.",

  "wentWell": ["specific positive point 1", "specific positive point 2"],

  "toImprove": ["specific improvement 1", "specific improvement 2"],

  "nextTargets": [

    {

      "exerciseName": "Barbell Bench Press",  ← must never be empty

      "weight": 95,

      "reps": 4,

      "sets": 3

    }

  ],

  "exerciseNotes": [

    {

      "exerciseName": "Lat Pulldown",

      "note": "specific note about this exercise"

    }

  ]

}

Each nextTargets object MUST include "exerciseName" as a non-empty string (the full human-readable exercise name). Never omit this field, never use "", and mirror the names from the progression list above.

Rules:

- If exercise rating was 'bad' — do NOT suggest increasing load

- Reference real exercise names and real numbers

- nextTargets must match the progression targets provided above

- nextTargets — exerciseName is required for every entry, never omit it.

- wentWell and toImprove: 2-3 items each, no more

- Language: ${data.profile.language === 'ru' ? 'Russian' : 'English'}

`;

type ExerciseNoteRaw = { exerciseId?: string; exerciseName?: string; note?: string };

type ParsedReviewShape = Omit<AIReview, 'id' | 'sessionId' | 'generatedAt' | 'nextTargets' | 'exerciseNotes'> & {
  nextTargets: Array<Partial<NextTarget> & { exerciseName?: string }>;
  exerciseNotes: ExerciseNoteRaw[];
};

function emptyParsedReview(intro = ''): ParsedReviewShape {
  return {
    intro,
    wentWell: [],
    toImprove: [],
    nextTargets: [],
    exerciseNotes: [],
  };
}

function stripJsonMarkers(rawText: string): string {
  return rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function looksLikeJsonText(rawText: string): boolean {
  const clean = stripJsonMarkers(rawText);
  return clean.startsWith('{') || clean.startsWith('[');
}

function parseReviewResponseInternal(rawText: string, depth = 0): ParsedReviewShape | null {
  if (depth > 3) return null;
  const clean = stripJsonMarkers(rawText);
  if (!clean) return null;
  const parsed = JSON.parse(clean) as unknown;
  if (typeof parsed === 'string') {
    const nestedText = stripJsonMarkers(parsed).trim();
    if (!nestedText) return null;
    if (looksLikeJsonText(nestedText)) {
      return parseReviewResponseInternal(nestedText, depth + 1);
    }
    return emptyParsedReview(nestedText);
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  const introRaw = typeof o.intro === 'string' ? o.intro : String(o.intro ?? '');
  if (introRaw && looksLikeJsonText(introRaw)) {
    const nested = parseReviewResponseInternal(introRaw, depth + 1);
    if (nested) return nested;
  }
  return {
    intro: introRaw,
    wentWell: Array.isArray(o.wentWell) ? o.wentWell.map((x) => String(x)) : [],
    toImprove: Array.isArray(o.toImprove) ? o.toImprove.map((x) => String(x)) : [],
    nextTargets: Array.isArray(o.nextTargets) ? (o.nextTargets as ParsedReviewShape['nextTargets']) : [],
    exerciseNotes: Array.isArray(o.exerciseNotes) ? (o.exerciseNotes as ExerciseNoteRaw[]) : [],
  };
}

const parseReviewResponse = (rawText: string): ParsedReviewShape => {
  const clean = stripJsonMarkers(rawText).trim();
  try {
    return parseReviewResponseInternal(clean) ?? emptyParsedReview(clean);
  } catch (err) {
    console.error('Failed to parse AI review:', err);
    return emptyParsedReview(clean);
  }
};

/** Case-insensitive match; hyphens/dashes/underscores treated as spaces for name ↔ library id alignment. */
function normalizeForExerciseMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[-–—_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveExerciseId(session: WorkoutSession, exerciseName: string, hintId?: string): string {
  const n = normalizeForExerciseMatch(exerciseName);
  if (n) {
    const fromSession = session.exercises.find(
      (e) => normalizeForExerciseMatch(e.exerciseName) === n,
    );
    if (fromSession) return canonicalExerciseId(fromSession.exerciseId);
    const fromSeed = EXERCISE_SEED.find((ex) => normalizeForExerciseMatch(ex.name) === n);
    if (fromSeed) return canonicalExerciseId(fromSeed.id);
  }
  if (hintId?.trim()) return canonicalExerciseId(hintId.trim());
  return canonicalExerciseId(exerciseName);
}

function normalizeReviewFields(
  partial: ParsedReviewShape,
  session: WorkoutSession,
): Omit<AIReview, 'id' | 'sessionId' | 'generatedAt'> {
  const nextTargets: NextTarget[] = (partial.nextTargets ?? []).map((t) => {
    const raw = t as Partial<NextTarget> & { exerciseName?: string };
    const name =
      raw.exerciseName ?? session.exercises.find((e) => e.exerciseId === raw.exerciseId)?.exerciseName ?? '';
    return {
      exerciseId: resolveExerciseId(session, name, raw.exerciseId),
      exerciseName: name || String(raw.exerciseId ?? ''),
      weight: Number(raw.weight),
      reps: Number(raw.reps),
      sets: Number(raw.sets),
    };
  });

  const exerciseNotes = (partial.exerciseNotes ?? []).map((raw) => {
    const name = raw.exerciseName ?? '';
    return {
      exerciseId: resolveExerciseId(session, name, raw.exerciseId),
      exerciseName: name,
      note: String(raw.note ?? ''),
    };
  });

  return {
    intro: partial.intro,
    wentWell: partial.wentWell,
    toImprove: partial.toImprove,
    nextTargets,
    exerciseNotes,
  };
}

export const generateWorkoutReview = async (data: ReviewPromptData): Promise<AIReview> => {
  const baseId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  const prompt = buildReviewPrompt(data);

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    const res = await fetch('/api/anthropic', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const rawJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errText =
        typeof rawJson === 'object' && rawJson && 'error' in rawJson
          ? JSON.stringify((rawJson as { error: unknown }).error)
          : JSON.stringify(rawJson);
      const parsed = parseReviewResponse(errText);
      const normalized = normalizeReviewFields(parsed, data.session);
      return {
        id: baseId,
        sessionId: data.session.id,
        generatedAt,
        ...normalized,
        intro: normalized.intro || errText || `API error: ${res.status}`,
      };
    }

    const content = (rawJson as { content?: { type: string; text?: string }[] }).content;
    const textBlock = content?.find((c) => c.type === 'text');
    const rawText = textBlock?.text ?? '';
    const parsed = parseReviewResponse(rawText);
    const normalized = normalizeReviewFields(parsed, data.session);
    return {
      id: baseId,
      sessionId: data.session.id,
      generatedAt,
      ...normalized,
    };
  } catch (err) {
    console.error('generateWorkoutReview', err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: baseId,
      sessionId: data.session.id,
      generatedAt,
      intro: msg,
      wentWell: [],
      toImprove: [],
      nextTargets: [],
      exerciseNotes: [],
    };
  }
};

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export const generateCoachInsights = async (
  sessionId: string,
  session: WorkoutSession,
  review: AIReview,
  recentSessions: WorkoutSession[],
): Promise<void> => {
  const prompt = `
You are analyzing a workout and its review to extract coaching insights.
Be specific and factual. Use real numbers. English only.

CURRENT SESSION:
- Type: ${session.type} (${session.name})
- Duration: ${session.durationMinutes} min
- Volume: ${session.totalVolume}kg
- Exercises: ${session.exercises.map((e) => e.exerciseName).join(', ')}

REVIEW OUTCOME:
- Went well: ${review.wentWell.join('; ')}
- To improve: ${review.toImprove.join('; ')}
- Exercise notes: ${review.exerciseNotes.map((n) => `${n.exerciseName}: ${n.note}`).join('; ')}

RECENT HISTORY (last ${recentSessions.length} sessions):
${recentSessions
  .map((s) => `- ${s.name} on ${s.finishedAt.slice(0, 10)}: ${s.totalVolume}kg total`)
  .join('\n')}

Extract coaching insights. Respond ONLY in JSON, no markdown, no backticks:
{
  "summary": "3-5 sentences about this athlete's current state, trends, and what to watch.",
  "keyFindings": [
    "Specific finding 1 with numbers if possible",
    "Specific finding 2",
    "Specific finding 3"
  ]
}

Rules:
- keyFindings: 3-5 items max, each under 12 words
- summary: factual, no fluff, reference real numbers
- English only
`;

  try {
    const res = await fetch('/api/anthropic', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return;

    const rawJson = await res.json().catch(() => ({}));
    const content = (rawJson as { content?: { type: string; text?: string }[] }).content;
    const textBlock = content?.find((c) => c.type === 'text');
    const rawText = textBlock?.text ?? '';
    const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean) as { summary?: string; keyFindings?: string[] };

    const entry: CoachMemoryEntry = {
      id: crypto.randomUUID(),
      sessionId,
      generatedAt: new Date().toISOString(),
      weekNumber: getISOWeekNumber(new Date()),
      summary: parsed.summary ?? '',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
    };

    await db.coachMemory.add(entry);

    const all = await db.coachMemory.orderBy('generatedAt').toArray();
    if (all.length > 10) {
      const toDelete = all.slice(0, all.length - 10).map((e) => e.id);
      await db.coachMemory.bulkDelete(toDelete);
    }
  } catch (err) {
    console.error('generateCoachInsights failed', err);
  }
};
