import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Frown, Loader2, Meh, Smile, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import { db, getProfile } from '@/services/db';
import { generateWorkoutReview } from '@/services/aiService';
import { canonicalExerciseId, previewExerciseTarget } from '@/services/progressionEngine';
import type { ExerciseRating, NextTarget, WorkoutSession } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';
import type { TranslationKey } from '@/i18n/translations';

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

const RATING_OPTIONS = [
  {
    rating: 'good' as const,
    labelKey: 'good' as TranslationKey,
    color: 'text-[#22C55E]',
    bg: 'bg-[#22C55E]/10',
    border: 'border-[#22C55E]/20',
    Icon: Smile,
  },
  {
    rating: 'okay' as const,
    labelKey: 'okay' as TranslationKey,
    color: 'text-[#F59E0B]',
    bg: 'bg-[#F59E0B]/10',
    border: 'border-[#F59E0B]/20',
    Icon: Meh,
  },
  {
    rating: 'bad' as const,
    labelKey: 'bad' as TranslationKey,
    color: 'text-[#EF4444]',
    bg: 'bg-[#EF4444]/10',
    border: 'border-[#EF4444]/20',
    Icon: Frown,
  },
];

export default function RatingScreen({ sessionId, onComplete, onBack }: RatingScreenProps) {
  const { t } = useTranslation();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Record<string, RowState>>({});
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

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-[#0A0A0A] px-6 pb-8 pt-12">
        <p className="text-sm text-[#6B7280]">{t('loading')}</p>
      </div>
    );
  }

  if (!session || exercises.length === 0) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-[#0A0A0A] px-6 pb-8 pt-12">
        <p className="text-sm text-[#6B7280]">{t('workoutNotFound')}</p>
        <Button type="button" variant="secondary" className="mt-6" onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0A0A0A]">
      <header className="shrink-0 border-b border-[#2A2A2A] px-6 pb-6 pt-10">
        <div className="mb-6 flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 p-1 text-white transition-opacity hover:opacity-80"
            aria-label={t('back')}
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>
        <h1 className="text-lg font-bold text-white">{t('howDidItGo')}</h1>
        <p className="mt-2 text-sm text-[#6B7280]">{t('rateBeforeReview')}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 pb-40 no-scrollbar">
        {exercises.map((ex) => {
          const row = ratings[ex.exerciseId];
          const selected = row?.rating;
          return (
            <div
              key={ex.exerciseId}
              className="space-y-4 rounded-2xl border border-[#2A2A2A] bg-[#1C1C1C] p-4"
            >
              <h2 className="font-bold text-white">{toDisplayName(ex.exerciseName)}</h2>
              <div className="flex gap-2">
                {RATING_OPTIONS.map((r) => {
                  const isActive = selected === r.rating;
                  const Icon = r.Icon;
                  return (
                    <button
                      key={r.rating}
                      type="button"
                      onClick={() => setRating(ex.exerciseId, r.rating)}
                      className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-3 transition-all active:scale-[0.98] ${
                        isActive
                          ? `${r.bg} ${r.border} ${r.color}`
                          : 'border-[#2A2A2A] bg-[#141414] text-[#6B7280]'
                      }`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} />
                      <span className="text-[10px] font-bold tracking-wider">{t(r.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
              <textarea
                placeholder={t('addNote')}
                className="h-20 w-full resize-none rounded-xl border border-[#2A2A2A] bg-[#141414] p-3 text-sm text-white outline-none placeholder:text-[#6B7280] focus:border-[#8B5CF6]"
                value={row?.note ?? ''}
                onChange={(e) => setNote(ex.exerciseId, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-[390px] bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent p-6">
        <button
          type="button"
          disabled={!allRated || generating}
          onClick={() => void handleComplete()}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] py-5 text-base font-bold text-white shadow-xl shadow-[#8B5CF6]/30 transition-all disabled:opacity-50"
        >
          {generating ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              {t('generating')}
            </span>
          ) : (
            <>
              <Sparkles className="h-5 w-5 shrink-0 fill-current" aria-hidden />
              {t('getAiReview')}
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
