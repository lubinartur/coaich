import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { db, getProfile } from '@/services/db';
import { generateWorkoutReview } from '@/services/aiService';
import { canonicalExerciseId, previewExerciseTarget } from '@/services/progressionEngine';
import type { ExerciseRating, NextTarget, WorkoutSession } from '@/types';

export type RatingExerciseItem = {
  exerciseId: string;
  exerciseName: string;
};

type RowState = {
  rating?: 'good' | 'okay' | 'bad';
  note?: string;
};

export interface RatingScreenProps {
  sessionId: string;
  onComplete: () => void;
  onBack: () => void;
}

export default function RatingScreen({ sessionId, onComplete, onBack }: RatingScreenProps) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Record<string, RowState>>({});
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await db.workoutSessions.get(sessionId);
      if (!cancelled) {
        setSession(s ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const exercises: RatingExerciseItem[] = useMemo(
    () =>
      session?.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
      })) ?? [],
    [session],
  );

  const setRating = useCallback((exerciseId: string, rating: 'good' | 'okay' | 'bad') => {
    setRatings((prev) => ({
      ...prev,
      [exerciseId]: { ...prev[exerciseId], rating, note: prev[exerciseId]?.note },
    }));
  }, []);

  const setNote = useCallback((exerciseId: string, note: string) => {
    setRatings((prev) => ({
      ...prev,
      [exerciseId]: { ...prev[exerciseId], note, rating: prev[exerciseId]?.rating },
    }));
  }, []);

  const allRated = useMemo(
    () => exercises.length > 0 && exercises.every((ex) => ratings[ex.exerciseId]?.rating),
    [exercises, ratings],
  );

  const toggleNote = (exerciseId: string) => {
    setExpandedNote((cur) => (cur === exerciseId ? null : exerciseId));
  };

  const handleComplete = async () => {
    if (!allRated || !session || generating) return;
    const list: ExerciseRating[] = exercises.map((ex) => {
      const r = ratings[ex.exerciseId]!;
      const out: ExerciseRating = {
        exerciseId: ex.exerciseId,
        rating: r.rating!,
      };
      const trimmed = r.note?.trim();
      if (trimmed) out.note = trimmed;
      return out;
    });
    setGenerating(true);
    try {
      await db.workoutSessions.update(sessionId, { ratings: list });
      const profile = await getProfile();
      if (!profile) {
        console.warn('Profile not found, skipping AI review');
        onComplete();
        return;
      }
      const nextTargets: NextTarget[] = [];
      for (const ex of session.exercises) {
        const id = canonicalExerciseId(ex.exerciseId);
        const preview = await previewExerciseTarget(id, ex.exerciseName, profile.goal, profile.pharmacology);
        if (!preview) continue;
        nextTargets.push({
          exerciseId: id,
          exerciseName: ex.exerciseName,
          weight: preview.weight,
          reps: preview.reps,
          sets: preview.sets,
        });
      }
      const sessionForPrompt: WorkoutSession = { ...session, ratings: list };
      const review = await generateWorkoutReview({
        profile,
        session: sessionForPrompt,
        ratings: list,
        nextTargets,
      });
      const id = crypto.randomUUID();
      const generatedAt = new Date().toISOString();
      await db.aiReviews.where('sessionId').equals(session.id).delete();
      await db.aiReviews.add({
        ...review,
        id,
        sessionId: session.id,
        generatedAt,
      });
      for (const t of review.nextTargets) {
        const exId = canonicalExerciseId(t.exerciseId);
        await db.exerciseTargets.put({
          exerciseId: exId,
          weight: t.weight,
          reps: t.reps,
          sets: t.sets,
          source: 'ai',
          updatedAt: generatedAt,
        });
      }
      onComplete();
    } finally {
      setGenerating(false);
    }
  };

  const ratingBtnBase =
    'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition-all active:scale-[0.98]';

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-bg px-5 pb-8 pt-10">
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (!session || exercises.length === 0) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-bg px-5 pb-8 pt-10">
        <p className="text-sm text-text-secondary">Workout not found.</p>
        <Button type="button" variant="secondary" className="mt-6" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-bg">
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
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">How did it go?</h1>
            <p className="mt-1 text-sm text-text-secondary">Rate each exercise before your AI review</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-32 no-scrollbar">
        <div className="flex flex-col gap-4">
          {exercises.map((ex) => {
            const row = ratings[ex.exerciseId];
            const selected = row?.rating;
            return (
              <Card key={ex.exerciseId} className="border-border">
                <h2 className="text-base font-bold text-text-primary">{ex.exerciseName}</h2>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRating(ex.exerciseId, 'good')}
                    className={`${ratingBtnBase} ${
                      selected === 'good'
                        ? 'border-success bg-success/20 text-success'
                        : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      😊
                    </span>
                    Good
                  </button>
                  <button
                    type="button"
                    onClick={() => setRating(ex.exerciseId, 'okay')}
                    className={`${ratingBtnBase} ${
                      selected === 'okay'
                        ? 'border-warning bg-warning/20 text-warning'
                        : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      😐
                    </span>
                    Okay
                  </button>
                  <button
                    type="button"
                    onClick={() => setRating(ex.exerciseId, 'bad')}
                    className={`${ratingBtnBase} ${
                      selected === 'bad'
                        ? 'border-red-500 bg-red-500/20 text-red-400'
                        : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      😞
                    </span>
                    Bad
                  </button>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toggleNote(ex.exerciseId)}
                    className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                  >
                    Add a note
                  </button>
                  {expandedNote === ex.exerciseId && (
                    <textarea
                      rows={3}
                      placeholder="What happened? (optional)"
                      className="mt-2 w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-accent"
                      value={row?.note ?? ''}
                      onChange={(e) => setNote(ex.exerciseId, e.target.value)}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-border bg-bg/95 backdrop-blur-md">
        <div className="pointer-events-auto w-full max-w-[390px] px-5 py-4">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!allRated || generating}
            onClick={() => void handleComplete()}
          >
            {generating ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                Generating…
              </span>
            ) : (
              'Get AI Review'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
