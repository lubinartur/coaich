/** Anthropic Claude — workout Review (ai-prompts.md). */

import { EXERCISE_SEED } from '@/constants/exercises';
import { canonicalExerciseId, formatNextTargetLine, isTimedHoldExercise } from '@/services/progressionEngine';
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
  const parsed = JSON.parse(clean) as unknown;
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
  try {
    return parseReviewResponseInternal(rawText) ?? emptyParsedReview(rawText);
  } catch (err) {
    console.error('Failed to parse AI review:', err);
    return emptyParsedReview(rawText);
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

function viteEnv(key: string): string | undefined {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  return env[key];
}

export const generateWorkoutReview = async (data: ReviewPromptData): Promise<AIReview> => {
  const apiKey = viteEnv('VITE_ANTHROPIC_API_KEY');
  const baseId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  if (!apiKey?.trim()) {
    return {
      id: baseId,
      sessionId: data.session.id,
      generatedAt,
      intro: 'Missing VITE_ANTHROPIC_API_KEY. Add it to your .env file.',
      wentWell: [],
      toImprove: [],
      nextTargets: [],
      exerciseNotes: [],
    };
  }

  const prompt = buildReviewPrompt(data);

  try {
    const res = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
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
