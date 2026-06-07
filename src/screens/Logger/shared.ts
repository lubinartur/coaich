import type { Exercise, MuscleGroup } from '@/types';
import type { ProgressionStatus } from '@/services/progressionEngine';

export type SetRow = {
  id: string;
  weight: string;
  reps: string;
  completed: boolean;
  /** True when this completed set beats all prior Dexie history + other sets this workout. */
  isPR?: boolean;
};

export type LoggerExercise = {
  exerciseId: string;
  muscleGroup: MuscleGroup;
  name: string;
  equipment: Exercise['equipment'];
  /** Timed hold: reps field is seconds. */
  timedHold: boolean;
  recommend: string;
  last: string;
  progressionStatus: ProgressionStatus;
  sets: SetRow[];
};

export type RecommendBadgeConfig = {
  label: 'REC' | 'HOLD' | 'BASE' | 'DELOAD';
  badgeClass: string;
  dotClass: string;
  pulse: boolean;
};

export function getRecommendBadgeConfig(rawLabel: string): RecommendBadgeConfig {
  const normalized = rawLabel.replace(':', '').trim().toUpperCase();
  switch (normalized) {
    case 'HOLD':
      return {
        label: 'HOLD',
        badgeClass:
          'inline-flex items-center gap-1 rounded-full overflow-hidden border border-[#F59E0B]/40 bg-[#F59E0B]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#F59E0B]',
        dotClass: 'bg-[#F59E0B]',
        pulse: false,
      };
    case 'BASE':
      return {
        label: 'BASE',
        badgeClass:
          'inline-flex items-center gap-1 rounded-full overflow-hidden border border-[#6B7280]/40 bg-[#6B7280]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#6B7280]',
        dotClass: 'bg-[#6B7280]',
        pulse: false,
      };
    case 'DELOAD':
      return {
        label: 'DELOAD',
        badgeClass:
          'inline-flex items-center gap-1 rounded-full overflow-hidden border border-[#60A5FA]/40 bg-[#60A5FA]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#60A5FA]',
        dotClass: 'bg-[#60A5FA]',
        pulse: false,
      };
    default:
      return {
        label: 'REC',
        badgeClass:
          'inline-flex items-center gap-1 rounded-full overflow-hidden border border-[#8B5CF6]/40 bg-[#8B5CF6]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#8B5CF6]',
        dotClass: 'bg-[#8B5CF6]',
        pulse: true,
      };
  }
}

export const fieldInputClass =
  'min-h-[64px] w-full min-w-0 rounded-xl border border-[#222222] bg-[#111111] px-2 py-5 text-center font-black tabular-nums text-2xl text-white outline-none transition-all focus:border-[#8B5CF6] focus:ring-4 focus:ring-[#8B5CF6]/10';

export const setActionsBtnClass =
  'flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#222222] bg-[#111111] py-3.5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#181818] hover:border-[#8B5CF6]/25 hover:text-[#8B5CF6] active:scale-[0.98]';
