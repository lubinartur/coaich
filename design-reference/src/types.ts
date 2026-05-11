/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum TrainingStatus {
  NATURAL = 'NATURAL',
  ON_CYCLE = 'ON_CYCLE',
}

export enum TargetStatus {
  REC = 'REC',
  HOLD = 'HOLD',
  BASE = 'BASE',
  DELOAD = 'DELOAD',
}

export enum ExerciseRating {
  GOOD = 'GOOD',
  OKAY = 'OKAY',
  BAD = 'BAD',
}

export interface SetEntry {
  id: string;
  weight: number;
  reps: number;
  completed: boolean;
  isPR?: boolean;
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  name: string;
  status: TargetStatus;
  statusText: string;
  lastPerformance?: string;
  sets: SetEntry[];
  rating?: ExerciseRating;
  note?: string;
}

export interface Workout {
  id: string;
  name: string;
  type: string;
  date: number;
  duration: number; // in seconds
  volume: number;
  sets: number;
  exercises: ExerciseLog[];
  aiReport?: {
    intro: string;
    whatWentWell: string[];
    whatToImprove: string[];
    nextTargets: { exercise: string; target: string }[];
    exerciseNotes: string;
  };
}

export interface UserProfile {
  id?: number;
  gender: 'Male' | 'Female' | '';
  age: number;
  weight: number;
  height: number;
  goal: string;
  experience: string;
  environment: string;
  injuries: string[];
  benchmarks: {
    benchPress: number;
    squat: number;
    deadlift: number;
  };
  trainingStatus: TrainingStatus;
  cycleInfo?: {
    compound: string;
    startDate: string;
  };
  onboarded: boolean;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  muscle: string;
  category: string;
}
