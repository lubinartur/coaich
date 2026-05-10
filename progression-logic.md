# CoAIch — Progression Logic

---

## Core Principle

Progression is deterministic first. AI only explains the decision in natural language.

Rule: **Increase reps first. Increase weight after top of rep range is reached.**

---

## Rep Ranges by Goal

```typescript

const REP_RANGES = {

  strength:     { min: 4,  max: 6  },

  muscle:       { min: 8,  max: 12 },

  weight_loss:  { min: 12, max: 15 },

  health:       { min: 10, max: 15 },

};

```

---

## Progression Rules

### Rule 1 — Increase reps

If current reps < max of rep range → add 1 rep next session.

```

Example (muscle goal):

100kg × 8 × 3 → 100kg × 9 × 3

100kg × 9 × 3 → 100kg × 10 × 3

100kg × 11 × 3 → 100kg × 12 × 3

```

### Rule 2 — Increase weight

If current reps >= max of rep range → increase weight, reset reps to min.

```

Example (muscle goal):

100kg × 12 × 3 → 102.5kg × 8 × 3

```

### Weight increments by equipment

```typescript

const WEIGHT_INCREMENTS = {

  barbell:    2.5,   // kg

  dumbbell:   2.0,   // per dumbbell

  machine:    5.0,

  cable:      2.5,

};

```

### Dumbbell rule

Weight is per dumbbell. Volume = weight × 2 × reps × sets.

---

## Progression Guards (Safety)

Block progression if any of these are true:

```typescript

const shouldBlockProgression = (session: WorkoutSession): boolean => {

  // Failed sets — user didn't complete planned reps

  if (hasFailedSets(session)) return true;

  // Rating was 'bad' on this exercise

  if (exerciseRating === 'bad') return true;

  // Large rep drop — more than 20% fewer reps than target

  if (repDropPercent > 0.20) return true;

  // Session too short — under 15 minutes (likely incomplete)

  if (session.durationMinutes < 15) return true;

  return false;

};

```

When blocked → maintain current weight and reps. AI explains why.

---

## Volume Targets (MEV/MAV per muscle group)

Used by Coach AI to balance weekly volume.

```typescript

const VOLUME_TARGETS = {

  // sets per week

  chest:     { mev: 10, mav: 16, mrv: 22 },

  back:      { mev: 10, mav: 18, mrv: 25 },

  shoulders: { mev: 8,  mav: 14, mrv: 20 },

  biceps:    { mev: 6,  mav: 12, mrv: 18 },

  triceps:   { mev: 6,  mav: 12, mrv: 18 },

  legs:      { mev: 10, mav: 18, mrv: 25 },

  glutes:    { mev: 8,  mav: 14, mrv: 20 },

  core:      { mev: 6,  mav: 10, mrv: 16 },

};

// On cycle — upper limits increase by 20%

const ON_CYCLE_MULTIPLIER = 1.2;

```

MEV = Minimum Effective Volume

MAV = Maximum Adaptive Volume  

MRV = Maximum Recoverable Volume

---

## 1RM Estimation (Epley Formula)

```typescript

const estimate1RM = (weight: number, reps: number): number => {

  return weight * (1 + reps / 30);

};

// Example: 100kg × 8 reps → 1RM ≈ 127kg

```

Used for Progress screen Benchmark Lifts.

---

## Overall Strength Score

```typescript

const calculateStrengthScore = (sessions: WorkoutSession[]): number => {

  // Sum of estimated 1RM for key lifts

  // Bench Press + Squat + Deadlift + Barbell Row + OHP

  // Normalized to bodyweight

};

const calculateSplitScore = (sessions: WorkoutSession[], type: 'push' | 'pull' | 'legs') => {

  // Average 1RM progress for exercises in that split

};

```

---

## Deload Logic

### Automatic Deload Detection

```typescript

const shouldRecommendDeload = (data: DeloadCheckData): boolean => {

  // Rule 1 — 4 consecutive training weeks (natural)

  if (data.pharmacology === 'natural' && data.consecutiveWeeks >= 4) return true;

  // Rule 2 — 6 consecutive training weeks (on cycle)

  if (data.pharmacology === 'on_cycle' && data.consecutiveWeeks >= 6) return true;

  // Rule 3 — Multiple bad ratings in a row

  if (data.recentBadRatings >= 3) return true;

  // Rule 4 — Volume dropping despite targets (fatigue signal)

  if (data.volumeTrendDown && data.weeklyDropPercent > 0.15) return true;

  return false;

};

```

### Deload Week Rules

- Volume reduced by 40-50% (fewer sets, not lighter weight)

- Weights stay the same — maintain strength

- No progression during deload week

- AI Review tone changes — recovery-focused, not performance-focused

```typescript

const applyDeloadTargets = (normalTarget: ExerciseTarget): ExerciseTarget => {

  return {

    ...normalTarget,

    sets: Math.ceil(normalTarget.sets * 0.5), // half the sets

    weight: normalTarget.weight,              // same weight

    reps: normalTarget.reps,                 // same reps

  };

};

```

### Today Screen During Deload

Coach AI message changes:

> "This is your deload week. Same weights, half the volume. Focus on recovery and technique."

Workout cards show "DELOAD" badge instead of "NEXT WORKOUT".

### Resuming After Deload

After deload week — progression resumes from where it left off.

Consecutive weeks counter resets to 0.

Logic for Today screen recommendation:

```typescript

const getNextWorkout = async (): Promise<WorkoutRecommendation> => {

  const lastSession = await getLastSession();

  const hoursSinceLast = getHoursSince(lastSession.finishedAt);

  const weeklyVolume = await getWeeklyVolume();

  // Recovery check — minimum 24h between same muscle groups

  // Push after Pull or Legs (not Push after Push)

  // Balance weekly volume toward MAV targets

  // If volume for muscle group > MRV → skip it this session

  return {

    type: 'pull',

    name: 'Pull',

    focusMuscles: ['back', 'biceps'],

    exercises: [...],  // from last pull session or template

    reasoning: string, // passed to Claude for natural language explanation

  };

};

```

