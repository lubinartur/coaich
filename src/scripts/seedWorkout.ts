import { db } from '@/services/db';
import type { WorkoutSession } from '@/types';

const JUNE_4_LOWER_B: WorkoutSession = {
  id: 'manual-june4-lower-b',
  name: 'Lower B',
  type: 'lower',
  startedAt: '2026-06-04T17:11:00.000Z',
  finishedAt: '2026-06-04T18:41:00.000Z',
  durationMinutes: 90,
  totalVolume: 8060,
  ratings: [],
  exercises: [
    {
      exerciseId: 'deadlift',
      exerciseName: 'Conventional Deadlift',
      muscleGroup: 'back',
      sets: [
        { setNumber: 1, weight: 60, reps: 8, completed: true },
        { setNumber: 2, weight: 80, reps: 8, completed: true },
        { setNumber: 3, weight: 100, reps: 6, completed: true },
        { setNumber: 4, weight: 100, reps: 6, completed: true },
        { setNumber: 5, weight: 120, reps: 4, completed: true },
        { setNumber: 6, weight: 100, reps: 6, completed: true },
      ],
    },
    {
      exerciseId: 'lying-leg-curl',
      exerciseName: 'Lying Leg Curl',
      muscleGroup: 'legs',
      sets: [
        { setNumber: 1, weight: 30, reps: 10, completed: true },
        { setNumber: 2, weight: 25, reps: 10, completed: true },
        { setNumber: 3, weight: 25, reps: 10, completed: true },
      ],
    },
    {
      exerciseId: 'bulgarian-split-squat',
      exerciseName: 'Bulgarian Split Squat',
      muscleGroup: 'legs',
      sets: [
        { setNumber: 1, weight: 10, reps: 10, completed: true },
        { setNumber: 2, weight: 10, reps: 9, completed: true },
        { setNumber: 3, weight: 10, reps: 10, completed: true },
      ],
    },
    {
      exerciseId: 'hyperextension',
      exerciseName: 'Hyperextension',
      muscleGroup: 'back',
      sets: [
        { setNumber: 1, weight: 10, reps: 10, completed: true },
        { setNumber: 2, weight: 0, reps: 15, completed: true },
        { setNumber: 3, weight: 0, reps: 15, completed: true },
      ],
    },
    {
      exerciseId: 'seated-calf-raise',
      exerciseName: 'Seated Calf Raise',
      muscleGroup: 'legs',
      sets: [
        { setNumber: 1, weight: 40, reps: 15, completed: true },
        { setNumber: 2, weight: 40, reps: 15, completed: true },
        { setNumber: 3, weight: 40, reps: 15, completed: true },
      ],
    },
  ],
};

/**
 * One-time migration: seed the June 4 "Lower B" session into Dexie.
 * Idempotent — `put` overwrites by primary key, and callers should guard with an existence check.
 */
export async function seedJune4Workout(): Promise<void> {
  await db.workoutSessions.put(JUNE_4_LOWER_B);
}
