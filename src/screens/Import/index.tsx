import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import {
  WORKOUT_PROGRAM_TEMPLATES,
  type LoggerTemplateExercise,
  type WorkoutProgramTemplateKey,
} from '@/constants/workoutPrograms';
import ExercisePicker from '@/screens/Logger/ExercisePicker';
import { db } from '@/services/db';
import { canonicalExerciseId, isPlankExerciseName } from '@/services/progressionEngine';
import type { Exercise, MuscleGroup, SessionExercise, SetLog, WorkoutSession, WorkoutType } from '@/types';

const PROGRAM_CARDS: { key: WorkoutProgramTemplateKey; label: string; emoji: string }[] = [
  { key: 'push', label: 'Push', emoji: '🔥' },
  { key: 'pull', label: 'Pull', emoji: '🧗' },
  { key: 'legs', label: 'Legs', emoji: '🦵' },
  { key: 'full_body', label: 'Full Body', emoji: '🏋️' },
  { key: 'custom', label: 'Custom', emoji: '✨' },
];

const IMPORT_NAME: Record<WorkoutProgramTemplateKey, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  full_body: 'Full Body',
  custom: 'Custom',
};

type ImportSetRow = {
  id: string;
  weight: string;
  reps: string;
};

type ImportRow = {
  importRowId: string;
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Exercise['equipment'];
  sets: ImportSetRow[];
  included: boolean;
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function createEmptySetRows(count: number): ImportSetRow[] {
  return Array.from({ length: count }, () => ({ id: makeId(), weight: '', reps: '' }));
}

function importRowFromTemplate(ex: LoggerTemplateExercise): ImportRow {
  return {
    importRowId: makeId(),
    exerciseId: ex.exerciseId,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    equipment: ex.equipment,
    sets: createEmptySetRows(3),
    included: true,
  };
}

function rowsFromTemplate(key: WorkoutProgramTemplateKey): ImportRow[] {
  return WORKOUT_PROGRAM_TEMPLATES[key].map(importRowFromTemplate);
}

function importRowFromExercise(ex: Exercise): ImportRow {
  return {
    importRowId: makeId(),
    exerciseId: ex.id,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    equipment: ex.equipment,
    sets: createEmptySetRows(3),
    included: true,
  };
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function templateKeyToWorkoutType(key: WorkoutProgramTemplateKey): WorkoutType {
  return key;
}

/** Skips sets where both weight and reps are empty; keeps order; rejects partially filled rows. */
function parseRowToSetLogs(row: ImportRow): SetLog[] | null {
  const isBw = row.equipment === 'bodyweight';
  const out: SetLog[] = [];
  for (let i = 0; i < row.sets.length; i++) {
    const s = row.sets[i];
    const wEmpty = s.weight.trim() === '';
    const rEmpty = s.reps.trim() === '';
    if (wEmpty && rEmpty) continue;

    if (rEmpty) return null;
    if (!isBw && wEmpty) return null;

    const wRaw = s.weight.replace(',', '.').trim();
    const w = isBw ? (wEmpty ? 0 : parseFloat(wRaw)) : parseFloat(wRaw);
    const r = parseInt(s.reps.trim(), 10);
    if (!isBw) {
      if (!Number.isFinite(w) || w <= 0) return null;
    } else if (!Number.isFinite(w) || w < 0) {
      return null;
    }
    if (!Number.isFinite(r) || r <= 0) return null;
    out.push({
      setNumber: out.length + 1,
      weight: isBw ? 0 : w,
      reps: r,
      completed: true,
    });
  }
  return out.length ? out : null;
}

function buildSessionExercise(row: ImportRow): SessionExercise | null {
  if (!row.included) return null;
  const sets = parseRowToSetLogs(row);
  if (!sets?.length) return null;
  return {
    exerciseId: canonicalExerciseId(row.exerciseId),
    exerciseName: row.name,
    muscleGroup: row.muscleGroup,
    sets,
  };
}

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface p-2 text-center font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent';

const selectedCard = (active: boolean) =>
  active
    ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
    : 'border-border bg-card hover:border-accent/30';

export interface ImportScreenProps {
  onBack: () => void;
}

export default function ImportScreen({ onBack }: ImportScreenProps) {
  const [workoutDate, setWorkoutDate] = useState(todayDateInputValue);
  const [programKey, setProgramKey] = useState<WorkoutProgramTemplateKey>('pull');
  const [rows, setRows] = useState<ImportRow[]>(() => rowsFromTemplate('pull'));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imported, setImported] = useState<WorkoutSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    setRows(rowsFromTemplate(programKey));
    setFeedback(null);
  }, [programKey]);

  const loadImported = useCallback(async () => {
    const all = await db.workoutSessions.toArray();
    const list = all
      .filter((s) => s.isImported === true)
      .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());
    setImported(list);
  }, []);

  useEffect(() => {
    void loadImported();
  }, [loadImported]);

  const clearErrorFeedback = () => {
    setFeedback((f) => (f?.kind === 'error' ? null : f));
  };

  const updateRow = (idx: number, patch: Partial<ImportRow>) => {
    clearErrorFeedback();
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const updateSet = (rowIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    clearErrorFeedback();
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, sets: r.sets.map((s) => ({ ...s })) }));
      const row = next[rowIdx];
      if (!row) return prev;
      row.sets[setIdx][field] = value;
      return next;
    });
  };

  const addSet = (rowIdx: number) => {
    clearErrorFeedback();
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx ? { ...r, sets: [...r.sets, { id: makeId(), weight: '', reps: '' }] } : r,
      ),
    );
  };

  const removeSet = (rowIdx: number, setIdx: number) => {
    clearErrorFeedback();
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx || r.sets.length <= 1) return r;
        return { ...r, sets: r.sets.filter((_, j) => j !== setIdx) };
      }),
    );
  };

  const appendExerciseFromLibrary = (ex: Exercise) => {
    clearErrorFeedback();
    setRows((prev) => [...prev, importRowFromExercise(ex)]);
  };

  const saveWorkout = async (resetAfter: boolean): Promise<boolean> => {
    const exercises: SessionExercise[] = [];
    let totalVolume = 0;
    for (const row of rows) {
      const ex = buildSessionExercise(row);
      if (!ex) continue;
      exercises.push(ex);
      for (const st of ex.sets) {
        totalVolume += st.weight * st.reps;
      }
    }
    if (exercises.length === 0) {
      console.error('[Import] saveWorkout: no exercises to save after build');
      setFeedback({
        kind: 'error',
        message: 'Please enter weight and reps for at least one set per exercise',
      });
      return false;
    }
    totalVolume = Math.round(totalVolume * 10) / 10;

    const startedAt = `${workoutDate}T09:00:00.000Z`;
    const finishedAt = `${workoutDate}T10:30:00.000Z`;
    const durationMinutes = Math.max(
      15,
      Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000),
    );

    const wt = templateKeyToWorkoutType(programKey);
    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      name: `${IMPORT_NAME[programKey]} (imported)`,
      type: wt,
      startedAt,
      finishedAt,
      durationMinutes,
      totalVolume,
      exercises,
      ratings: [],
      isImported: true,
    };

    setSaving(true);
    try {
      await db.workoutSessions.add(session);

      for (const row of rows) {
        if (!row.included) continue;
        const ex = buildSessionExercise(row);
        if (!ex) continue;
        const first = ex.sets[0];
        await db.exerciseTargets.put({
          exerciseId: canonicalExerciseId(row.exerciseId),
          weight: first.weight,
          reps: first.reps,
          sets: ex.sets.length,
          source: 'manual',
          updatedAt: new Date().toISOString(),
        });
      }

      await loadImported();

      if (resetAfter) {
        setWorkoutDate(todayDateInputValue());
        setRows(rowsFromTemplate(programKey));
      }
      return true;
    } catch (err) {
      console.error('[Import] save workout', err);
      setFeedback({
        kind: 'error',
        message: 'Could not save workout. Please try again.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const logRowValidation = (context: string) => {
    const details = rows.map((row, idx) => {
      const parsed = row.included ? parseRowToSetLogs(row) : null;
      const ok = !row.included || (parsed != null && parsed.length > 0);
      return {
        index: idx,
        name: row.name,
        included: row.included,
        ok,
        setCount: parsed?.length ?? 0,
      };
    });
    console.log(`[Import] ${context} row validation`, details);
    return details;
  };

  const handleSave = async () => {
    console.log('[Import] handleSave called');
    setFeedback(null);

    const details = logRowValidation('handleSave');
    const included = rows.filter((r) => r.included);
    if (included.length === 0) {
      setFeedback({ kind: 'error', message: 'Please include at least one exercise' });
      return;
    }
    const invalidIncluded = details.filter((d) => d.included && !d.ok);
    if (invalidIncluded.length > 0) {
      setFeedback({
        kind: 'error',
        message: 'Please enter weight and reps for at least one set per exercise',
      });
      return;
    }

    const ok = await saveWorkout(false);
    if (ok) {
      setFeedback({ kind: 'success', message: 'Workout saved. Returning…' });
      window.setTimeout(() => {
        setFeedback(null);
        onBack();
      }, 1200);
    }
  };

  const handleAddAnother = async () => {
    console.log('[Import] handleAddAnother called');
    setFeedback(null);

    const details = logRowValidation('handleAddAnother');
    const included = rows.filter((r) => r.included);
    if (included.length === 0) {
      setFeedback({ kind: 'error', message: 'Please include at least one exercise' });
      return;
    }
    const invalidIncluded = details.filter((d) => d.included && !d.ok);
    if (invalidIncluded.length > 0) {
      setFeedback({
        kind: 'error',
        message: 'Please enter weight and reps for at least one set per exercise',
      });
      return;
    }

    const ok = await saveWorkout(true);
    if (ok) {
      setFeedback({ kind: 'success', message: 'Workout saved. You can import another below.' });
      window.setTimeout(() => setFeedback(null), 4000);
    }
  };

  const deleteImported = async (id: string) => {
    if (!window.confirm('Delete this imported workout?')) return;
    await db.workoutSessions.delete(id);
    await loadImported();
  };

  const typeLabel = (t: WorkoutType) => {
    const m: Partial<Record<WorkoutType, string>> = {
      push: 'Push',
      pull: 'Pull',
      legs: 'Legs',
      full_body: 'Full Body',
      custom: 'Custom',
      upper: 'Upper',
      lower: 'Lower',
    };
    return m[t] ?? t;
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => appendExerciseFromLibrary(ex)}
      />

      <header className="shrink-0 border-b border-border px-5 pb-4 pt-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-primary transition-colors active:scale-[0.98]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">Import Past Workouts</h1>
            <p className="mt-1 text-sm text-text-secondary">Add recent workouts so AI knows your starting point</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 pb-40 no-scrollbar">
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-text-secondary">
            When was this workout?
          </label>
          <input
            type="date"
            value={workoutDate}
            onChange={(e) => {
              clearErrorFeedback();
              setWorkoutDate(e.target.value);
            }}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-mono text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-secondary">Program type</p>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {PROGRAM_CARDS.map((p) => (
              <Card
                key={p.key}
                padded={false}
                role="button"
                tabIndex={0}
                onClick={() => setProgramKey(p.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setProgramKey(p.key);
                  }
                }}
                className={`flex h-24 min-w-[100px] shrink-0 flex-col items-center justify-center gap-2 ${selectedCard(programKey === p.key)}`}
              >
                <span className="text-2xl" aria-hidden>
                  {p.emoji}
                </span>
                <span className="text-xs font-bold uppercase tracking-tight text-text-secondary">{p.label}</span>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Exercises</p>
          {rows.map((row, idx) => {
            const isBw = row.equipment === 'bodyweight';
            const isPlank = isPlankExerciseName(row.name);
            return (
              <Card key={row.importRowId} className="border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text-primary">{row.name}</p>
                    <div className="mt-2">
                      <Badge variant="secondary">{row.muscleGroup.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateRow(idx, { included: !row.included })}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      row.included
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-surface text-text-secondary'
                    }`}
                  >
                    {row.included ? 'Included' : 'Excluded'}
                  </button>
                </div>
                {row.included ? (
                  <div className="mt-4 flex flex-col gap-2">
                    {row.sets.map((set, setIdx) => (
                      <div key={set.id} className="flex items-center gap-2">
                        <span className="w-11 shrink-0 text-[10px] font-bold text-text-secondary">
                          SET {setIdx + 1}
                        </span>
                        {!isBw ? (
                          <>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="kg"
                              className={inputClass}
                              value={set.weight}
                              onChange={(e) => updateSet(idx, setIdx, 'weight', e.target.value)}
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <span className="shrink-0 text-text-secondary">×</span>
                          </>
                        ) : null}
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={isPlank ? 'sec' : 'reps'}
                          className={`${inputClass} ${isBw ? 'flex-1' : ''}`}
                          value={set.reps}
                          onChange={(e) => updateSet(idx, setIdx, 'reps', e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                          type="button"
                          disabled={row.sets.length <= 1}
                          onClick={() => removeSet(idx, setIdx)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors enabled:hover:border-red-500/40 enabled:hover:text-red-400 disabled:opacity-30"
                          aria-label="Remove set"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addSet(idx)}
                      className="mt-1 w-full border border-border/50 bg-transparent px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-none hover:bg-surface/50 hover:text-text-primary"
                    >
                      + ADD SET
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}

          <Button
            type="button"
            variant="dark"
            size="md"
            fullWidth
            className="mt-1"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            + Add Exercise
          </Button>
        </div>

        {imported.length > 0 ? (
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              Imported workouts
            </p>
            <div className="flex flex-col gap-2">
              {imported.map((s) => (
                <Card key={s.id} className="flex items-center justify-between gap-3 border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {new Date(s.finishedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {typeLabel(s.type)} · {s.exercises.length} exercises
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteImported(s.id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary transition-colors hover:border-red-500/50 hover:text-red-400"
                    aria-label="Delete imported workout"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-border bg-bg/95 backdrop-blur-md">
        <div className="pointer-events-auto flex w-full max-w-[390px] flex-col gap-2 px-5 py-4">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save Workout
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            disabled={saving}
            onClick={() => void handleAddAnother()}
          >
            Add Another
          </Button>
          {feedback?.kind === 'error' ? (
            <p className="text-center text-sm font-medium leading-snug text-red-400">{feedback.message}</p>
          ) : null}
          {feedback?.kind === 'success' ? (
            <p className="text-center text-sm font-medium leading-snug text-success">{feedback.message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
