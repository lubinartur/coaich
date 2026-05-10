import { EXERCISE_SEED } from '@/constants/exercises';
import type { Exercise, MuscleGroup } from '@/types';

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
