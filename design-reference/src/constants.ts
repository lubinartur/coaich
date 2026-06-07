/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExerciseDefinition, TargetStatus } from './types';

export const EXERCISES: ExerciseDefinition[] = [
  { id: '1', name: 'Bench Press', muscle: 'Chest', category: 'Chest' },
  { id: '2', name: 'Incline Dumbbell Press', muscle: 'Chest', category: 'Chest' },
  { id: '3', name: 'Barbell Row', muscle: 'Back', category: 'Back' },
  { id: '4', name: 'Lat Pulldown', muscle: 'Back', category: 'Back' },
  { id: '5', name: 'Squat', muscle: 'Legs', category: 'Legs' },
  { id: '6', name: 'Leg Press', muscle: 'Legs', category: 'Legs' },
  { id: '7', name: 'Shoulder Press', muscle: 'Shoulders', category: 'Shoulders' },
  { id: '8', name: 'Lateral Raise', muscle: 'Shoulders', category: 'Shoulders' },
  { id: '9', name: 'Bicep Curl', muscle: 'Biceps', category: 'Biceps' },
  { id: '10', name: 'Tricep Extension', muscle: 'Triceps', category: 'Triceps' },
  { id: '11', name: 'Deadlift', muscle: 'Back/Legs', category: 'Back' },
  { id: '12', name: 'Pull Ups', muscle: 'Back', category: 'Back' },
  { id: '13', name: 'Chest Flys', muscle: 'Chest', category: 'Chest' },
  { id: '14', name: 'Leg Curls', muscle: 'Legs', category: 'Legs' },
  { id: '15', name: 'Calf Raises', muscle: 'Legs', category: 'Legs' },
  { id: '16', name: 'Romanian Deadlift', muscle: 'Legs/Back', category: 'Legs' },
];

export const WORKOUT_TEMPLATES = [
  {
    name: 'Push',
    subtitle: 'Chest, Shoulders & Triceps',
    emoji: '🔥',
    exercises: ['1', '7', '10', '2', '8', '13'],
  },
  {
    name: 'Pull',
    subtitle: 'Back & Biceps',
    emoji: '💪',
    exercises: ['3', '4', '9', '12', '11'],
  },
  {
    name: 'Legs',
    subtitle: 'Quads, Hamstrings & Calves',
    emoji: '⚡',
    exercises: ['5', '6', '14', '15', '16'],
  },
  {
    name: 'Full Body',
    subtitle: 'Compound focus',
    emoji: '🏋️',
    exercises: ['1', '3', '5', '7'],
  },
];

export const STATUS_COLORS = {
  [TargetStatus.REC]: '#8B5CF6',
  [TargetStatus.HOLD]: '#F59E0B',
  [TargetStatus.BASE]: '#6B7280',
  [TargetStatus.DELOAD]: '#60A5FA',
};
