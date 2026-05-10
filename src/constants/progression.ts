/** Deterministic progression constants (progression-logic.md) */

import type { MuscleGroup } from '@/types';

export const REP_RANGES = {
  strength: { min: 4, max: 6 },
  muscle: { min: 8, max: 12 },
  weight_loss: { min: 12, max: 15 },
  health: { min: 10, max: 15 },
} as const;

export const WEIGHT_INCREMENTS = {
  barbell: 2.5,
  dumbbell: 2.0,
  machine: 5.0,
  cable: 2.5,
} as const;

export type VolumeBand = { mev: number; mav: number; mrv: number };

export const VOLUME_TARGETS: Record<MuscleGroup, VolumeBand> = {
  chest: { mev: 10, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  shoulders: { mev: 8, mav: 14, mrv: 20 },
  biceps: { mev: 6, mav: 12, mrv: 18 },
  triceps: { mev: 6, mav: 12, mrv: 18 },
  legs: { mev: 10, mav: 18, mrv: 25 },
  glutes: { mev: 8, mav: 14, mrv: 20 },
  core: { mev: 6, mav: 10, mrv: 16 },
};

export const ON_CYCLE_MULTIPLIER = 1.2;

export function estimate1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}
