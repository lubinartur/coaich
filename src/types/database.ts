/** Dexie / app domain types (db-schema.md) */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'core';

export type WorkoutType =
  | 'push'
  | 'pull'
  | 'legs'
  | 'full_body'
  | 'upper'
  | 'lower'
  | 'custom';

export type TrainingEnvironment = 'gym' | 'home' | 'bodyweight';

export interface Profile {
  id: number;
  gender: 'male' | 'female';
  age: number;
  weight: number;
  height: number;
  goal: 'muscle' | 'strength' | 'weight_loss' | 'health';
  experience: 'beginner' | 'intermediate' | 'advanced';
  /** Where the user trains (onboarding). */
  trainingEnvironment: TrainingEnvironment;
  injuries: string[];
  pharmacology: 'natural' | 'on_cycle';
  /** Optional compound label when `pharmacology` is `on_cycle`. */
  cycleCompound?: string;
  cycleStartDate?: string;
  restTimer: number;
  language: 'en' | 'ru';
  benchPress10RM?: number;
  squat10RM?: number;
  deadlift10RM?: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
  tier: 1 | 2 | 3;
  isCustom: boolean;
  /** Optional coaching cue (e.g. timed holds). */
  note?: string;
}

export interface SetLog {
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  exerciseName: string;
  sets: SetLog[];
  muscleGroup: MuscleGroup;
}

export interface ExerciseRating {
  exerciseId: string;
  rating: 'good' | 'okay' | 'bad';
  note?: string;
}

export interface NextTarget {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  sets: number;
}

export interface ExerciseNote {
  exerciseId: string;
  exerciseName: string;
  note: string;
}

export interface AIReview {
  id: string;
  sessionId: string;
  generatedAt: string;
  intro: string;
  wentWell: string[];
  toImprove: string[];
  nextTargets: NextTarget[];
  exerciseNotes: ExerciseNote[];
}

export interface WorkoutSession {
  id: string;
  name: string;
  type: WorkoutType;
  startedAt: string;
  finishedAt: string;
  durationMinutes: number;
  totalVolume: number;
  exercises: SessionExercise[];
  ratings: ExerciseRating[];
  aiReview?: AIReview;
  /** True when session was created via Settings → Import (not live Logger). */
  isImported?: boolean;
}

export interface ExerciseTarget {
  exerciseId: string;
  weight: number;
  reps: number;
  sets: number;
  source: 'ai' | 'progression_engine' | 'manual';
  updatedAt: string;
}

export interface ProgramDay {
  dayName: string;
  type: WorkoutType;
  exercises: string[];
}

export interface Program {
  id: string;
  name: string;
  type: 'template' | 'custom' | 'ai_generated';
  days: ProgramDay[];
}
