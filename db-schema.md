# CoAIch — Database Schema (Dexie / IndexedDB)

---

## Tables

### 1. profile

Stores user profile from onboarding.

```typescript

interface Profile {

  id: number;           // always 1, single record

  gender: 'male' | 'female';

  age: number;

  weight: number;       // kg

  height: number;       // cm

  goal: 'muscle' | 'strength' | 'weight_loss' | 'health';

  experience: 'beginner' | 'intermediate' | 'advanced';

  injuries: string[];   // ['knees', 'back', 'shoulders']

  pharmacology: 'natural' | 'on_cycle';

  cycleStartDate?: string;   // ISO date, if on_cycle

  restTimer: number;    // seconds, default 90

  language: 'en' | 'ru';

  // Benchmark lifts from onboarding (optional)

  benchPress10RM?: number;   // kg for 10 reps

  squat10RM?: number;

  deadlift10RM?: number;

}

```

---

### 2. exercises

Exercise library. Seeded on first launch.

```typescript

interface Exercise {

  id: string;           // 'barbell-row'

  name: string;         // 'Barbell Row'

  muscleGroup: MuscleGroup;

  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

  tier: 1 | 2 | 3;     // 1=primary, 2=secondary, 3=niche

  isCustom: boolean;    // user-added exercises

}

type MuscleGroup = 

  'chest' | 'back' | 'shoulders' | 

  'biceps' | 'triceps' | 'legs' | 

  'glutes' | 'core';

```

---

### 3. workoutSessions

Each completed workout.

```typescript

interface WorkoutSession {

  id: string;           // uuid

  name: string;         // 'Pull - Back & Biceps'

  type: 'push' | 'pull' | 'legs' | 'full_body' | 'upper' | 'lower' | 'custom';

  startedAt: string;    // ISO datetime

  finishedAt: string;   // ISO datetime

  durationMinutes: number;

  totalVolume: number;  // kg

  exercises: SessionExercise[];

  ratings: ExerciseRating[];   // from Rating screen

  aiReview?: AIReview;         // generated after Rating

}

interface SessionExercise {

  exerciseId: string;

  exerciseName: string;

  sets: SetLog[];

  muscleGroup: MuscleGroup;

}

interface SetLog {

  setNumber: number;

  weight: number;       // kg

  reps: number;

  completed: boolean;

}

interface ExerciseRating {

  exerciseId: string;

  rating: 'good' | 'okay' | 'bad';

  note?: string;

}

```

---

### 4. aiReviews

AI-generated review after each workout.

```typescript

interface AIReview {

  id: string;

  sessionId: string;

  generatedAt: string;

  intro: string;              // overall assessment paragraph

  wentWell: string[];         // positive points

  toImprove: string[];        // improvement points

  nextTargets: NextTarget[];  // targets for next session

  exerciseNotes: ExerciseNote[];

}

interface NextTarget {

  exerciseId: string;

  exerciseName: string;

  weight: number;

  reps: number;

  sets: number;

}

interface ExerciseNote {

  exerciseId: string;

  exerciseName: string;

  note: string;

}

```

---

### 5. exerciseTargets

AI targets saved per exercise. Loaded automatically in next workout.

```typescript

interface ExerciseTarget {

  exerciseId: string;   // primary key

  weight: number;

  reps: number;

  sets: number;

  source: 'ai' | 'progression_engine';

  updatedAt: string;    // ISO datetime

}

```

Key rule: targets are stored per exercise, not per workout.

When the same exercise appears in any future workout — target loads automatically.

---

### 6. programs

Workout programs/templates.

```typescript

interface Program {

  id: string;

  name: string;         // 'PPL', 'Full Body', etc.

  type: 'template' | 'custom' | 'ai_generated';

  days: ProgramDay[];

}

interface ProgramDay {

  dayName: string;      // 'Push', 'Pull', 'Legs'

  type: WorkoutType;

  exercises: string[];  // exerciseIds

}

```

---

## Dexie Setup

```typescript

import Dexie, { Table } from 'dexie';

class CoAIchDB extends Dexie {

  profile!: Table<Profile>;

  exercises!: Table<Exercise>;

  workoutSessions!: Table<WorkoutSession>;

  aiReviews!: Table<AIReview>;

  exerciseTargets!: Table<ExerciseTarget>;

  programs!: Table<Program>;

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

  }

}

export const db = new CoAIchDB();

```

---

## Key Queries

```typescript

// Get last session by workout type

const lastPullSession = await db.workoutSessions

  .where('type').equals('pull')

  .reverse()

  .first();

// Get AI target for exercise

const target = await db.exerciseTargets

  .get(exerciseId);

// Get all sessions last 7 days

const recent = await db.workoutSessions

  .where('startedAt')

  .above(sevenDaysAgo)

  .toArray();

```

