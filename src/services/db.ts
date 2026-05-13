import Dexie, { type Table } from 'dexie';
import type {
  AIReview,
  Exercise,
  ExerciseTarget,
  PrRecord,
  Profile,
  Program,
  WorkoutSession,
} from '@/types';
import { EXERCISE_SEED } from '@/constants/exercises';

export interface CoachMemoryEntry {
  id: string;
  sessionId: string;
  generatedAt: string;
  weekNumber: number;
  summary: string;
  keyFindings: string[];
}

export class CoAIchDB extends Dexie {
  profile!: Table<Profile>;
  exercises!: Table<Exercise>;
  workoutSessions!: Table<WorkoutSession>;
  aiReviews!: Table<AIReview>;
  exerciseTargets!: Table<ExerciseTarget>;
  programs!: Table<Program>;
  prRecords!: Table<PrRecord>;
  coachMemory!: Table<CoachMemoryEntry>;

  constructor() {
    super('coaich-db');
    this.version(1).stores({
      profile: '++id',
      exercises: 'id, muscleGroup, equipment, tier',
      workoutSessions: 'id, type, startedAt',
      aiReviews: 'id, sessionId',
      exerciseTargets: 'exerciseId',
      programs: 'id, type',
    });
    /** Index `finishedAt` for progression / ordering (was missing in v1). */
    this.version(2).stores({
      workoutSessions: 'id, type, startedAt, finishedAt',
    });
    this.version(3).stores({
      prRecords: '++id, exerciseId, sessionId, achievedAt',
    });
    this.version(4).stores({
      coachMemory: 'id, sessionId, generatedAt, weekNumber',
    });
  }
}

export const db = new CoAIchDB();

/** Seed exercise library on first launch (Dexie only — no localStorage). */
export async function seedExercisesIfEmpty(): Promise<void> {
  const n = await db.exercises.count();
  if (n === 0) {
    await db.exercises.bulkPut(EXERCISE_SEED);
    return;
  }
  const existingIds = new Set(await db.exercises.toCollection().primaryKeys());
  const missing = EXERCISE_SEED.filter((ex) => !existingIds.has(ex.id));
  if (missing.length > 0) {
    await db.exercises.bulkPut(missing);
  }
}

export async function hasProfile(): Promise<boolean> {
  const count = await db.profile.count();
  return count > 0;
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get(1);
}
