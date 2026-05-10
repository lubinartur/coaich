import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui';
import { db } from '@/services/db';
import type { Exercise, MuscleGroup } from '@/types';

export type ExercisePickerFilter = 'all' | MuscleGroup | 'legs_glutes';

const FILTER_CHIPS: { label: string; value: ExercisePickerFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Chest', value: 'chest' },
  { label: 'Back', value: 'back' },
  { label: 'Shoulders', value: 'shoulders' },
  { label: 'Biceps', value: 'biceps' },
  { label: 'Triceps', value: 'triceps' },
  { label: 'Legs', value: 'legs_glutes' },
  { label: 'Core', value: 'core' },
];

function matchesFilter(ex: Exercise, filter: ExercisePickerFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'legs_glutes') return ex.muscleGroup === 'legs' || ex.muscleGroup === 'glutes';
  return ex.muscleGroup === filter;
}

function muscleBadgeLabel(m: MuscleGroup): string {
  if (m === 'glutes') return 'GLUTES';
  return m.toUpperCase();
}

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  /** Called when user selects an exercise from the library. */
  onPick: (exercise: Exercise) => void;
  /** When opening, pre-select this muscle filter (e.g. swap exercise). */
  initialFilter?: ExercisePickerFilter;
}

export default function ExercisePicker({ open, onClose, onPick, initialFilter }: ExercisePickerProps) {
  const [list, setList] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ExercisePickerFilter>('all');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const rows = await db.exercises.toArray();
      rows.sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) setList(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setFilter('all');
    } else {
      setQuery('');
      setFilter(initialFilter ?? 'all');
    }
  }, [open, initialFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((ex) => {
      if (!matchesFilter(ex, filter)) return false;
      if (!q) return true;
      return ex.name.toLowerCase().includes(q);
    });
  }, [list, query, filter]);

  const handlePick = useCallback(
    (ex: Exercise) => {
      onPick(ex);
      onClose();
    },
    [onPick, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close exercise picker"
        onClick={onClose}
      />
      <div className="relative z-10 mx-auto flex h-[min(88vh,640px)] w-full max-w-[390px] flex-col rounded-t-2xl border border-border bg-card shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-text-primary">Add Exercise</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-text-primary transition-colors active:scale-[0.98]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 space-y-3 border-b border-border px-5 py-3">
          <input
            type="search"
            placeholder="Search exercises..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-accent"
          />
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {FILTER_CHIPS.map((chip) => {
              const active = filter === chip.value;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setFilter(chip.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-surface text-text-secondary'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-6 no-scrollbar">
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-text-secondary">No exercises match.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(ex)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border hover:bg-surface/80 active:scale-[0.99]"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{ex.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {muscleBadgeLabel(ex.muscleGroup)}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
