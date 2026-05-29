import { EXERCISE_SEED } from '@/constants/exercises';
import type { Exercise, MuscleGroup, Program, ProgramDay } from '@/types';

/** One line in a quick program / Logger template (ids from `EXERCISE_SEED`). */
export type LoggerTemplateExercise = {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Exercise['equipment'];
};

function templateByIds(ids: readonly string[]): LoggerTemplateExercise[] {
  return ids.map((id) => {
    const e = EXERCISE_SEED.find((x) => x.id === id);
    if (!e) {
      throw new Error(`EXERCISE_SEED missing workout template id: ${id}`);
    }
    return { exerciseId: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment };
  });
}

/** Stable empty template for Custom workout start (avoid new `[]` each render). */
export const EMPTY_WORKOUT_TEMPLATE: readonly LoggerTemplateExercise[] = [];

/** Quick program exercise lists — keep ids in sync with `EXERCISE_SEED`. */
export const WORKOUT_PROGRAM_TEMPLATES = {
  push: templateByIds([
    'barbell-bench-press',
    'incline-dumbbell-press',
    'overhead-press',
    'lateral-raise',
    'tricep-pushdown',
    'skull-crusher',
  ]),
  pull: templateByIds([
    'lat-pulldown',
    'barbell-row',
    'seated-cable-row',
    'face-pull',
    'dumbbell-curl',
    'hammer-curl',
  ]),
  legs: templateByIds([
    'back-squat',
    'leg-press',
    'romanian-deadlift',
    'lying-leg-curl',
    'standing-calf-raise',
    'plank',
  ]),
  full_body: templateByIds([
    'barbell-bench-press',
    'barbell-row',
    'overhead-press',
    'back-squat',
    'dumbbell-curl',
    'tricep-pushdown',
  ]),
  /** Import / custom quick start — same movement mix as full body. */
  custom: templateByIds([
    'barbell-bench-press',
    'barbell-row',
    'overhead-press',
    'back-squat',
    'dumbbell-curl',
    'tricep-pushdown',
  ]),
} as const;

export type WorkoutProgramTemplateKey = keyof typeof WORKOUT_PROGRAM_TEMPLATES;

/** Multi-day preset programs (keep exercise ids in sync with `EXERCISE_SEED`). */
export const PRESET_PROGRAMS: readonly Program[] = [
  {
    id: 'upper-lower-arch',
    name: 'Upper/Lower',
    type: 'template',
    days: [
      {
        dayName: 'Upper A',
        type: 'upper',
        exercises: [
          'barbell-row',
          'dumbbell-bench-press',
          'seated-cable-row',
          'dumbbell-shoulder-press',
          'hammer-curl',
          'rope-tricep-extension',
        ],
      },
      {
        dayName: 'Lower A',
        type: 'lower',
        exercises: [
          'back-squat',
          'leg-press',
          'leg-extension',
          'dumbbell-romanian-deadlift',
          'standing-calf-raise',
        ],
      },
      {
        dayName: 'Upper B',
        type: 'upper',
        exercises: [
          'barbell-bench-press',
          'lat-pulldown',
          'incline-dumbbell-press',
          'single-arm-dumbbell-row',
          'dumbbell-curl',
          'overhead-tricep-extension',
        ],
      },
      {
        dayName: 'Lower B',
        type: 'lower',
        exercises: [
          'deadlift',
          'lying-leg-curl',
          'bulgarian-split-squat',
          'hyperextension',
          'seated-calf-raise',
        ],
      },
    ],
  },
];

/**
 * Materialize a {@link ProgramDay}'s exercise ids into Logger template rows.
 * Silently skips ids that aren't present in `EXERCISE_SEED` (defensive — DB programs
 * can outlive seed changes).
 */
export function templateForProgramDay(day: ProgramDay): LoggerTemplateExercise[] {
  const rows: LoggerTemplateExercise[] = [];
  for (const id of day.exercises) {
    const e = EXERCISE_SEED.find((x) => x.id === id);
    if (!e) continue;
    rows.push({ exerciseId: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment });
  }
  return rows;
}

/**
 * Determine which day of a multi-day {@link Program} comes next based on recent workout history.
 *
 * Walks `recentSessions` (newest first) and matches each session's `name` against the program's
 * `dayName`s. The most recent match advances to `(idx + 1) % days.length`. If no recent session
 * matches any day name, returns day 0.
 */
export function getNextProgramDay(
  program: Program,
  recentSessions: readonly { name: string }[],
): { dayIndex: number; day: ProgramDay } {
  if (program.days.length === 0) {
    throw new Error(`Program "${program.id}" has no days`);
  }
  for (const session of recentSessions) {
    const idx = program.days.findIndex((d) => d.dayName === session.name);
    if (idx !== -1) {
      const next = (idx + 1) % program.days.length;
      return { dayIndex: next, day: program.days[next] };
    }
  }
  return { dayIndex: 0, day: program.days[0] };
}
