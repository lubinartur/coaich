import { motion } from 'motion/react';
import { ArrowLeftRight, Check, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getRecLastLayout } from '@/services/progressionEngine';
import type { MuscleGroup } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';
import type { TranslationKey, TranslationLanguage } from '@/i18n/translations';
import {
  fieldInputClass,
  getRecommendBadgeConfig,
  setActionsBtnClass,
  type LoggerExercise,
  type RecommendBadgeConfig,
} from './shared';

type RemoveConfirmValue = { exIdx: number; name: string } | null;

export interface SortableExerciseProps {
  /** React reconciliation key — declared explicitly because the project does not have @types/react installed, so React's built-in handling of the special `key` prop is not applied. */
  key?: string | number | null;
  ex: LoggerExercise;
  exIdx: number;
  sortableId: string;
  updateSet: (
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps' | 'completed',
    value: string | boolean,
  ) => void;
  toggleSetComplete: (exIdx: number, setIdx: number) => void;
  addSet: (exIdx: number) => void;
  openPickerForSwap: (exIdx: number, muscleGroup: MuscleGroup) => void;
  setRemoveConfirm: (value: RemoveConfirmValue) => void;
  t: (key: TranslationKey) => string;
  lang: TranslationLanguage;
  getBadgeLabel: (label: RecommendBadgeConfig['label']) => string;
}

export default function SortableExercise({
  ex,
  exIdx,
  sortableId,
  updateSet,
  toggleSetComplete,
  addSet,
  openPickerForSwap,
  setRemoveConfirm,
  t,
  lang: _lang,
  getBadgeLabel,
}: SortableExerciseProps) {
  void _lang;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasLastData = (() => {
    const last = ex.last.trim();
    return last !== '' && last !== '—' && last !== '-' && last !== '–';
  })();
  const recLastLayout = getRecLastLayout(ex.recommend.trim(), ex.last.trim(), ex.progressionStatus);
  const isBw = ex.equipment === 'bodyweight';
  const isTimed = ex.timedHold;
  const recommendValue = recLastLayout.kind === 'unified' ? recLastLayout.value : ex.recommend.trim();
  const recommendBadge = ex.recommend.trim()
    ? getRecommendBadgeConfig(recLastLayout.kind === 'unified' ? recLastLayout.label : 'REC')
    : null;

  return (
    <div ref={setNodeRef} style={dragStyle}>
      <section className="space-y-6">
        <div className="flex items-end justify-between border-b border-[#222222] pb-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-white">{toDisplayName(ex.name)}</h3>
            <div className="mt-3 space-y-1 text-[12px] font-bold tracking-wide text-[#6B7280]">
              {recommendBadge && recommendValue ? (
                <div className="flex items-center gap-2">
                  <span className={recommendBadge.badgeClass}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${recommendBadge.dotClass} ${
                        recommendBadge.pulse ? 'animate-pulse' : ''
                      }`}
                      aria-hidden
                    />
                    <span>{getBadgeLabel(recommendBadge.label)}</span>
                  </span>
                  <span className="text-sm font-medium text-[#8B5CF6]">{recommendValue}</span>
                </div>
              ) : null}
              {recLastLayout.kind === 'dual' && hasLastData ? (
                <p className="font-mono">
                  {t('last')} {ex.last}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="p-2.5 text-[#444444] touch-none"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setRemoveConfirm({ exIdx, name: ex.name })}
              className="p-2.5 text-[#333333] transition-colors hover:text-red-400"
              aria-label={`${t('remove')} ${ex.name}`}
            >
              <Trash2 className="h-[18px] w-[18px] text-red-500" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div
            className={`grid items-end gap-3 px-1 pb-1 pt-0 text-[10px] font-black uppercase tracking-widest text-[#6B7280] sm:gap-4 ${
              isBw
                ? 'grid-cols-[32px_minmax(0,1fr)_52px]'
                : 'grid-cols-[32px_minmax(0,1fr)_16px_minmax(0,1fr)_52px]'
            }`}
          >
            <span aria-hidden className="block min-h-[1em]" />
            {!isBw ? (
              <>
                <span className="block text-center">{t('weight')}</span>
                <span className="flex justify-center" aria-hidden>
                  ×
                </span>
                <span className="block text-center">{t('reps')}</span>
              </>
            ) : (
              <>
                <span className="block text-center">{isTimed ? t('sec') : t('reps')}</span>
                <span aria-hidden className="block min-h-[1em]" />
              </>
            )}
            {!isBw ? <span aria-hidden className="block min-h-[1em]" /> : null}
          </div>
          <div className="space-y-5">
            {ex.sets.map((set, setIdx) => (
              <motion.div
                layout
                key={set.id}
                className={`grid items-center gap-3 rounded-2xl px-1 py-3 transition-all sm:gap-4 ${
                  isBw
                    ? 'grid-cols-[32px_minmax(0,1fr)_52px]'
                    : 'grid-cols-[32px_minmax(0,1fr)_16px_minmax(0,1fr)_52px]'
                } ${set.completed ? 'border border-[#22C55E]/10 bg-[#22C55E]/5' : 'bg-transparent'}`}
              >
                <div className="text-center">
                  <span className="block text-[10px] font-black text-[#6B7280]">{t('set')}</span>
                  <span className="text-sm font-black tabular-nums text-white">{setIdx + 1}</span>
                </div>
                {!isBw ? (
                  <>
                    <div className="min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        className={fieldInputClass}
                        value={set.weight}
                        onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </div>
                    <span className="flex shrink-0 items-center justify-center font-black text-[#333333]">×</span>
                  </>
                ) : null}
                <div className="min-w-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={isTimed ? t('seconds') : t('reps')}
                    className={fieldInputClass}
                    value={set.reps}
                    onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="flex min-w-0 items-stretch justify-end">
                  <button
                    type="button"
                    aria-label={set.completed ? t('uncompleteSet') : t('completeSet')}
                    className={`flex min-h-[64px] w-[52px] shrink-0 items-center justify-center rounded-xl border shadow-lg transition-all ${
                      set.completed
                        ? 'border-[#22C55E] bg-[#22C55E] text-white shadow-[#22C55E]/20'
                        : 'border-[#222222] bg-[#111111] text-[#333333] hover:border-[#8B5CF6]'
                    }`}
                    onClick={() => toggleSetComplete(exIdx, setIdx)}
                  >
                    <Check className="h-6 w-6" strokeWidth={4} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => addSet(exIdx)} className={setActionsBtnClass}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {t('add').replace(/^\+\s*/, '')}
          </button>
          <button
            type="button"
            className={setActionsBtnClass}
            onClick={() => openPickerForSwap(exIdx, ex.muscleGroup)}
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden />
            {t('swap')}
          </button>
        </div>
      </section>
    </div>
  );
}
