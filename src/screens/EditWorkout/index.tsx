import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import { db } from '@/services/db';
import {
  canonicalExerciseId,
  formatTargetLineForExercise,
  getLastPerformedSummary,
  isPlankExerciseName,
  parseRecommendLine,
  summarizeSessionExercise,
} from '@/services/progressionEngine';
import type { Exercise, MuscleGroup, SessionExercise, WorkoutSession } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';
import ExercisePicker from '@/screens/Logger/ExercisePicker';

type SetRow = {
  id: string;
  weight: string;
  reps: string;
  completed: boolean;
};

type EditExercise = {
  exerciseId: string;
  muscleGroup: MuscleGroup;
  name: string;
  equipment: Exercise['equipment'];
  recommend: string;
  last: string;
  sets: SetRow[];
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function createSet(): SetRow {
  return { id: makeId(), weight: '', reps: '', completed: false };
}

function createSetForEquipment(equipment: Exercise['equipment']): SetRow {
  if (equipment === 'bodyweight') {
    return { id: makeId(), weight: '0', reps: '', completed: false };
  }
  return createSet();
}

function createSetFromRecommendEdit(recommend: string, equipment: Exercise['equipment']): SetRow {
  const p = parseRecommendLine(recommend);
  if (!p) return createSetForEquipment(equipment);
  return { id: makeId(), weight: String(p.weight), reps: String(p.reps), completed: false };
}

async function sessionToEditExercises(session: WorkoutSession): Promise<EditExercise[]> {
  return Promise.all(
    session.exercises.map(async (ex) => {
      const meta = await db.exercises.get(canonicalExerciseId(ex.exerciseId));
      const equipment = meta?.equipment ?? 'barbell';
      return {
        exerciseId: ex.exerciseId,
        muscleGroup: ex.muscleGroup,
        name: ex.exerciseName,
        equipment,
        recommend: '',
        last: '—',
        sets: ex.sets.map((s) => ({
          id: makeId(),
          weight: equipment === 'bodyweight' ? '0' : String(s.weight),
          reps: String(s.reps),
          completed: s.completed,
        })),
      };
    }),
  );
}

async function buildRowFromLibraryExercise(ex: Exercise): Promise<EditExercise> {
  const target = await db.exerciseTargets.get(ex.id);
  const last = await getLastPerformedSummary(ex.id);
  const recommend = target
    ? formatTargetLineForExercise(ex.id, ex.name, target.weight, target.reps, target.sets, ex.equipment)
    : '';
  const sets =
    target && target.sets > 0
      ? Array.from({ length: target.sets }, () => ({
          id: makeId(),
          weight: ex.equipment === 'bodyweight' ? '0' : String(target.weight),
          reps: String(target.reps),
          completed: false,
        }))
      : [createSetForEquipment(ex.equipment), createSetForEquipment(ex.equipment), createSetForEquipment(ex.equipment)];
  return {
    exerciseId: ex.id,
    muscleGroup: ex.muscleGroup,
    name: ex.name,
    equipment: ex.equipment,
    recommend,
    last: last ?? '—',
    sets,
  };
}

function computeTotalVolume(exercises: EditExercise[]): number {
  let sum = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (!set.completed) continue;
      const w = parseFloat(set.weight.replace(',', '.'));
      const r = parseInt(set.reps, 10);
      if (Number.isFinite(w) && Number.isFinite(r) && w >= 0 && r >= 0) {
        sum += w * r;
      }
    }
  }
  return Math.round(sum * 10) / 10;
}

function buildSessionExercises(exercises: EditExercise[]): SessionExercise[] {
  return exercises.map((ex) => {
    const isBw = ex.equipment === 'bodyweight';
    return {
      exerciseId: canonicalExerciseId(ex.exerciseId),
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: ex.sets.map((s, i) => ({
        setNumber: i + 1,
        weight: isBw ? 0 : parseFloat(s.weight.replace(',', '.')) || 0,
        reps: parseInt(s.reps, 10) || 0,
        completed: s.completed,
      })),
    };
  });
}

/** Local-time `YYYY-MM-DD` for an ISO timestamp; safe `''` fallback when unparsable. */
function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Replace the calendar date of `iso` with `dateStr` (YYYY-MM-DD) while keeping the original time-of-day. */
function applyDateToIso(dateStr: string, iso: string | undefined): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const day = Number(dStr);
  const base = iso ? new Date(iso) : new Date();
  const hours = Number.isNaN(base.getTime()) ? 0 : base.getHours();
  const minutes = Number.isNaN(base.getTime()) ? 0 : base.getMinutes();
  const seconds = Number.isNaN(base.getTime()) ? 0 : base.getSeconds();
  const ms = Number.isNaN(base.getTime()) ? 0 : base.getMilliseconds();
  const next = new Date(y, m - 1, day, hours, minutes, seconds, ms);
  return next.toISOString();
}

async function syncExerciseTargetsFromSession(session: WorkoutSession): Promise<void> {
  for (const ex of session.exercises) {
    const sum = summarizeSessionExercise(ex);
    if (!sum) continue;
    await db.exerciseTargets.put({
      exerciseId: ex.exerciseId,
      weight: sum.weight,
      reps: sum.reps,
      sets: sum.sets,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    });
  }
}

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface p-2 text-center font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent';

export interface EditWorkoutScreenProps {
  sessionId: string;
  onSave: () => void;
  onClose: () => void;
}

export default function EditWorkoutScreen({ sessionId, onSave, onClose }: EditWorkoutScreenProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sessionName, setSessionName] = useState('');
  const [workoutDate, setWorkoutDate] = useState('');
  const [exercises, setExercises] = useState<EditExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseSession, setBaseSession] = useState<WorkoutSession | null>(null);

  const load = useCallback(async () => {
    const s = await db.workoutSessions.get(sessionId);
    if (!s) {
      onClose();
      return;
    }
    setBaseSession(s);
    setSessionName(s.name);
    setWorkoutDate(toDateInputValue(s.startedAt) || toDateInputValue(s.finishedAt));
    setExercises(await sessionToEditExercises(s));
    setLoading(false);
  }, [sessionId, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'completed', value: string | boolean): void {
    setExercises((prev) => {
      const next = prev.map((ex) => ({ ...ex, sets: ex.sets.map((x) => ({ ...x })) }));
      const row = next[exIdx].sets[setIdx];
      if (field === 'completed') {
        row.completed = value as boolean;
      } else {
        row[field] = value as string;
      }
      return next;
    });
  }

  const addSet = (exIdx: number) => {
    setExercises((prev) => {
      const next = prev.map((ex, i) =>
        i === exIdx
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                ex.recommend.trim()
                  ? createSetFromRecommendEdit(ex.recommend, ex.equipment)
                  : createSetForEquipment(ex.equipment),
              ],
            }
          : ex,
      );
      return next;
    });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => {
      const next = prev.map((ex) => ({ ...ex, sets: [...ex.sets] }));
      if (next[exIdx].sets.length <= 1) return prev;
      next[exIdx].sets.splice(setIdx, 1);
      return next;
    });
  };

  const removeExercise = (exIdx: number) => {
    if (!window.confirm(t('removeExerciseFromWorkoutConfirm'))) return;
    setExercises((prev) => prev.filter((_, i) => i !== exIdx));
  };

  const appendExercise = async (ex: Exercise) => {
    const row = await buildRowFromLibraryExercise(ex);
    setExercises((prev) => [...prev, row]);
  };

  const handleSave = async () => {
    if (!baseSession || exercises.length === 0) {
      window.alert(t('addAtLeastOneExercise'));
      return;
    }
    for (const ex of exercises) {
      if (ex.sets.length === 0) {
        window.alert(t('exerciseNeedsAtLeastOneSet').replace('{{name}}', ex.name));
        return;
      }
    }

    const built = buildSessionExercises(exercises);
    const totalVolume = computeTotalVolume(exercises);
    const nextStartedAt = workoutDate
      ? applyDateToIso(workoutDate, baseSession.startedAt)
      : baseSession.startedAt;
    const nextFinishedAt = workoutDate
      ? applyDateToIso(workoutDate, baseSession.finishedAt)
      : baseSession.finishedAt;
    const updated: WorkoutSession = {
      ...baseSession,
      name: sessionName.trim() || baseSession.name,
      startedAt: nextStartedAt,
      finishedAt: nextFinishedAt,
      exercises: built,
      totalVolume,
    };

    setSaving(true);
    try {
      await db.workoutSessions.put(updated);
      await syncExerciseTargetsFromSession(updated);
      onSave();
    } catch (e) {
      console.error('[EditWorkout] save', e);
      window.alert(t('couldNotSaveChanges'));
    } finally {
      setSaving(false);
    }
  };

  const tryClose = () => {
    if (window.confirm(t('discardChangesConfirm'))) {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-bg px-5 pt-10">
        <p className="text-sm text-text-secondary">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-bg">
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => void appendExercise(ex)}
      />

      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-bg/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={tryClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-primary transition-colors active:scale-[0.98]"
            aria-label={t('back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-text-primary">{t('editWorkout')}</h1>
            <p className="mt-0.5 text-xs text-text-secondary">{toDisplayName(sessionName)}</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-32 no-scrollbar">
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-text-secondary">
            {t('whenWasThisWorkout')}
          </label>
          <input
            type="date"
            value={workoutDate}
            onChange={(e) => setWorkoutDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent"
            style={{ colorScheme: 'dark' }}
          />
        </div>

        {exercises.map((ex, exIdx) => {
          const isBw = ex.equipment === 'bodyweight';
          const isPlank = isPlankExerciseName(ex.name);
          return (
          <Card key={`${ex.exerciseId}-${exIdx}`} className="border-border">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-text-primary">{toDisplayName(ex.name)}</h3>
              <button
                type="button"
                onClick={() => removeExercise(exIdx)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:border-red-500/40 hover:text-red-400"
                aria-label={t('removeExerciseAria')}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {ex.sets.map((set, setIdx) => (
                <div key={set.id} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 text-[10px] font-bold text-text-secondary">{setIdx + 1}</span>
                  {!isBw ? (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={t('weightPlaceholderInput')}
                        className={inputClass}
                        value={set.weight}
                        onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <span className="shrink-0 text-text-secondary">×</span>
                    </>
                  ) : null}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={isPlank ? t('secPlaceholderInput') : t('repsPlaceholderInput')}
                    className={`${inputClass} ${isBw ? 'flex-1' : ''}`}
                    value={set.reps}
                    onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    aria-label={set.completed ? t('uncompleteSet') : t('completeSet')}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      set.completed
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-surface text-text-secondary'
                    }`}
                    onClick={() => updateSet(exIdx, setIdx, 'completed', !set.completed)}
                  >
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    disabled={ex.sets.length <= 1}
                    onClick={() => removeSet(exIdx, setIdx)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors enabled:hover:border-red-500/40 enabled:hover:text-red-400 disabled:opacity-30"
                    aria-label={t('removeSetAria')}
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => addSet(exIdx)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#222222] bg-[#111111] py-3.5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#181818] hover:border-[#8B5CF6]/25 hover:text-[#8B5CF6] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                {t('addSetLabel')}
              </button>
            </div>
          </Card>
          );
        })}
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex flex-col justify-end gap-0 border-t border-border bg-bg/95 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[390px] flex-col gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] py-5 text-sm font-bold text-white transition-colors hover:border-[#8B5CF6]/40"
          >
            <Plus className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {t('addExercise')}
          </button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            disabled={saving || exercises.length === 0}
            onClick={() => void handleSave()}
          >
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
