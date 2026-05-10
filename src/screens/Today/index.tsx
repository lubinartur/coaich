import { useEffect, useState } from 'react';
import { Dumbbell, Play, Zap } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import {
  EMPTY_WORKOUT_TEMPLATE,
  WORKOUT_PROGRAM_TEMPLATES,
  type LoggerTemplateExercise,
} from '@/constants/workoutPrograms';
import {
  buildCoachPromptData,
  generateCoachMessage,
  getWorkoutRecommendation,
  type RecommendedWorkoutType,
  type WorkoutRecommendation,
} from '@/services/coachService';
import { getProfile } from '@/services/db';
import {
  formatTargetLineForExercise,
  getExerciseTarget,
  getLastPerformedSummary,
  getProgressionStatusInlineText,
  getProgressionStatusPresentation,
  getRecLastLayout,
  type ProgressionStatus,
} from '@/services/progressionEngine';
import type { Exercise, Profile } from '@/types';

const QUICK_PROGRAMS = [
  { name: 'Push', emoji: '🔥', program: 'push' as const },
  { name: 'Pull', emoji: '🧗', program: 'pull' as const },
  { name: 'Legs', emoji: '🦵', program: 'legs' as const },
  { name: 'Full Body', emoji: '🏋️', program: 'full_body' as const },
  { name: 'Custom', emoji: '✨', program: 'custom' as const },
];

type TodayExerciseRow = {
  exerciseId: string;
  name: string;
  equipment: Exercise['equipment'];
  rec: string;
  last: string;
  progressionStatus: ProgressionStatus;
};

const FOCUS_SUBTITLE: Record<RecommendedWorkoutType, string> = {
  push: 'Chest, shoulders & triceps',
  pull: 'Back & biceps',
  legs: 'Legs, glutes & core',
  full_body: 'Full body',
};

export interface TodayScreenProps {
  onStartWorkout?: (payload: {
    workoutName: string;
    workoutType: string;
    exerciseTemplate: readonly LoggerTemplateExercise[];
    openExercisePickerOnMount?: boolean;
  }) => void;
}

export default function TodayScreen({ onStartWorkout }: TodayScreenProps) {
  const [rows, setRows] = useState<TodayExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reco, setReco] = useState<WorkoutRecommendation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [coachAiMessage, setCoachAiMessage] = useState<string | null>(null);
  const [coachAiLoading, setCoachAiLoading] = useState(false);
  const [showExercises, setShowExercises] = useState(false);

  const startQuickProgram = (program: (typeof QUICK_PROGRAMS)[number]['program']) => {
    if (program === 'custom') {
      onStartWorkout?.({
        workoutName: 'Custom Workout',
        workoutType: 'custom',
        exerciseTemplate: EMPTY_WORKOUT_TEMPLATE,
        openExercisePickerOnMount: true,
      });
      return;
    }
    const map = {
      push: {
        workoutName: 'Push - Chest & Shoulders',
        workoutType: 'push',
        template: WORKOUT_PROGRAM_TEMPLATES.push,
      },
      pull: {
        workoutName: 'Pull - Back & Biceps',
        workoutType: 'pull',
        template: WORKOUT_PROGRAM_TEMPLATES.pull,
      },
      legs: {
        workoutName: 'Legs - Quads & Hamstrings',
        workoutType: 'legs',
        template: WORKOUT_PROGRAM_TEMPLATES.legs,
      },
      full_body: {
        workoutName: 'Full Body',
        workoutType: 'full_body',
        template: WORKOUT_PROGRAM_TEMPLATES.full_body,
      },
    }[program];
    onStartWorkout?.({
      workoutName: map.workoutName,
      workoutType: map.workoutType,
      exerciseTemplate: map.template,
      openExercisePickerOnMount: false,
    });
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setCoachAiMessage(null);
      setCoachAiLoading(false);
      try {
        const profile = await getProfile();
        if (cancelled) return;

        const buildRowsForTemplate = async (
          p: Profile,
          templateKey: RecommendedWorkoutType,
          deloadWeek: boolean,
        ) => {
          const exercises = WORKOUT_PROGRAM_TEMPLATES[templateKey];
          return Promise.all(
            exercises.map(async (ex) => {
              try {
                const target = await getExerciseTarget(
                  ex.exerciseId,
                  ex.name,
                  p.goal,
                  p.pharmacology,
                  { deloadWeek, persist: false },
                );
                const last = await getLastPerformedSummary(ex.exerciseId);
                return {
                  exerciseId: ex.exerciseId,
                  name: ex.name,
                  equipment: ex.equipment,
                  rec: target
                    ? formatTargetLineForExercise(
                        ex.exerciseId,
                        ex.name,
                        target.weight,
                        target.reps,
                        target.sets,
                        ex.equipment,
                      )
                    : 'First session',
                  last: last ?? '—',
                  progressionStatus: target?.progressionStatus ?? 'first_session',
                };
              } catch (err) {
                console.error('[Today] exercise row load error', ex.exerciseId, err);
                return {
                  exerciseId: ex.exerciseId,
                  name: ex.name,
                  equipment: ex.equipment,
                  rec: 'First session',
                  last: '—',
                  progressionStatus: 'first_session' as const,
                };
              }
            }),
          );
        };

        if (!profile) {
          setReco({
            workoutType: 'push',
            workoutName: 'Push - Chest & Shoulders',
            reasoning: 'Complete onboarding to unlock personalized coaching.',
          });
          setRows([]);
          setCoachAiMessage('Complete onboarding to unlock personalized coaching.');
          setCoachAiLoading(false);
          setLoading(false);
          return;
        }

        const recommendation = await getWorkoutRecommendation(profile);
        if (cancelled) return;

        setCoachAiLoading(true);
        void (async () => {
          try {
            const data = await buildCoachPromptData(profile, recommendation);
            const msg = await generateCoachMessage(data);
            if (!cancelled) setCoachAiMessage(msg);
          } finally {
            if (!cancelled) setCoachAiLoading(false);
          }
        })();

        if (recommendation.workoutType === null) {
          if (recommendation.trainAnywayType) {
            const builtTrain = await buildRowsForTemplate(
              profile,
              recommendation.trainAnywayType,
              recommendation.isDeload === true,
            );
            if (!cancelled) setRows(builtTrain);
          } else if (!cancelled) {
            setRows([]);
          }
          if (!cancelled) {
            setReco(recommendation);
            setLoading(false);
          }
          return;
        }

        const built = await buildRowsForTemplate(
          profile,
          recommendation.workoutType,
          recommendation.isDeload === true,
        );

        if (!cancelled) {
          setReco(recommendation);
          setRows(built);
          setLoading(false);
        }
      } catch (err) {
        console.error('[Today] load targets error', err);
        if (!cancelled) {
          setReco({
            workoutType: 'push',
            workoutName: 'Push - Chest & Shoulders',
            reasoning: 'Could not load your history — defaulting to push. Pull to refresh later.',
          });
          setCoachAiMessage('Could not load your history — defaulting to push. Pull to refresh later.');
          setCoachAiLoading(false);
          const fallback = WORKOUT_PROGRAM_TEMPLATES.push;
          setRows(
            fallback.map((ex) => ({
              exerciseId: ex.exerciseId,
              name: ex.name,
              equipment: ex.equipment,
              rec: 'First session',
              last: '—',
              progressionStatus: 'first_session' as const,
            })),
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  let displayWorkoutType: RecommendedWorkoutType | null = null;
  let displayWorkoutName = '';
  if (reco?.workoutType != null) {
    displayWorkoutType = reco.workoutType;
    displayWorkoutName = reco.workoutName;
  } else if (reco?.workoutType === null && reco.trainAnywayType) {
    displayWorkoutType = reco.trainAnywayType;
    displayWorkoutName = reco.trainAnywayName ?? '';
  }

  const displayRows = rows;

  const isRestRecommended = reco !== null && reco.workoutType === null;

  const displayHeadline =
    displayWorkoutName.length > 0
      ? (() => {
          const i = displayWorkoutName.indexOf(' - ');
          return i === -1 ? displayWorkoutName : displayWorkoutName.slice(0, i);
        })()
      : '';

  return (
    <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Today</h1>
          <p className="mt-0.5 text-sm font-medium text-text-secondary">What to train today</p>
        </div>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/10 transition-transform active:scale-95"
          aria-label="Refresh recommendation"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <Zap className="h-6 w-6 text-accent" aria-hidden />
        </button>
      </div>

      {/* Coach AI */}
      <Card className="relative overflow-hidden border-border bg-card/30 backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-base text-accent" aria-hidden>
            ✦
          </span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">Coach AI</h3>
        </div>
        {coachAiLoading ? (
          <div className="space-y-2.5" aria-busy>
            <div className="h-4 w-full animate-pulse rounded-md bg-border" />
            <div className="h-4 w-[92%] animate-pulse rounded-md bg-border" />
            <div className="h-4 w-[70%] animate-pulse rounded-md bg-border" />
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed text-text-primary/90">
            {coachAiMessage ?? (loading ? 'Building your recommendation…' : '—')}
          </p>
        )}
      </Card>

      <Card className="relative border-border shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            {reco?.isDeload ? (
              <div className="flex flex-wrap items-center gap-2">
                {isRestRecommended ? (
                  <Badge
                    variant="secondary"
                    className="border border-border/70 bg-surface/40 font-medium text-text-secondary"
                  >
                    Rest recommended
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="bg-[#60A5FA]/15 text-[#60A5FA]">
                  DELOAD WEEK
                </Badge>
              </div>
            ) : isRestRecommended ? (
              <Badge
                variant="secondary"
                className="border border-border/70 bg-surface/40 font-medium text-text-secondary"
              >
                Rest recommended
              </Badge>
            ) : (
              <Badge variant="accent">NEXT WORKOUT</Badge>
            )}
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
              {displayWorkoutType ? displayHeadline : '…'}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-text-secondary">
              {displayWorkoutType
                ? reco?.isDeload
                  ? '50% volume — same weights, half the sets'
                  : `${FOCUS_SUBTITLE[displayWorkoutType]} • ${WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType].length} exercises`
                : 'Loading…'}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/20">
            <Dumbbell className="h-6 w-6" />
          </div>
        </div>

        {showExercises ? (
          <div className="mb-2 mt-1 flex flex-col px-1">
            {loading ? (
              <p className="py-4 text-sm text-text-secondary">Loading targets…</p>
            ) : (
              displayRows.map((ex, i) => {
                const layout = getRecLastLayout(ex.rec, ex.last, ex.progressionStatus);
                const statusInline = getProgressionStatusInlineText(ex.progressionStatus);
                const statusPres = getProgressionStatusPresentation(ex.progressionStatus);
                const statusClass = statusPres?.textClass ?? 'text-accent';
                return (
                  <div
                    key={ex.exerciseId}
                    className={`flex flex-col gap-1 py-3 ${i !== 0 ? 'border-t border-border/20' : ''}`}
                  >
                    <p className="text-base font-semibold text-text-primary">{ex.name}</p>
                    {layout.kind === 'unified' ? (
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <p
                          className={`min-w-0 font-mono text-sm font-bold leading-snug tracking-tight ${layout.lineClass}`}
                        >
                          <span>{layout.label}</span> {layout.value}
                        </p>
                        {statusInline ? (
                          <span
                            className={`shrink-0 whitespace-nowrap pl-2 text-right text-xs font-medium leading-snug ${statusClass}`}
                          >
                            {statusInline}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 items-baseline justify-between gap-3">
                          <p className="min-w-0 font-mono text-sm font-bold leading-snug tracking-tight text-accent">
                            <span>REC:</span> {layout.rec}
                          </p>
                          {statusInline ? (
                            <span
                              className={`shrink-0 whitespace-nowrap pl-2 text-right text-xs font-medium leading-snug ${statusClass}`}
                            >
                              {statusInline}
                            </span>
                          ) : null}
                        </div>
                        <p className="font-mono text-xs font-medium leading-snug text-text-secondary">
                          LAST: {layout.last}
                        </p>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex justify-center py-2">
            <Button
              type="button"
              variant="link"
              className="px-4 py-3 text-[14px] font-semibold uppercase tracking-wide"
              onClick={() => setShowExercises((v) => !v)}
            >
              {showExercises ? 'Hide Exercises' : 'View Exercises'}
            </Button>
          </div>
          <Button
            variant={isRestRecommended ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            type="button"
            disabled={!reco || loading || displayWorkoutType === null}
            onClick={() => {
              if (!reco || displayWorkoutType === null) return;
              const workoutName =
                reco.workoutType !== null ? reco.workoutName : reco.trainAnywayName ?? reco.workoutName;
              onStartWorkout?.({
                workoutName,
                workoutType: displayWorkoutType,
                exerciseTemplate: WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType],
                openExercisePickerOnMount: false,
              });
            }}
          >
            <Play className={`h-4 w-4 ${isRestRecommended ? 'text-accent' : 'fill-white'}`} aria-hidden />
            Start Workout
          </Button>
        </div>
      </Card>

      {/* Quick programs */}
      <div className="mt-2">
        <h4 className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          QUICK PROGRAMS
        </h4>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-4">
          {QUICK_PROGRAMS.map((prog) => (
            <Card
              key={prog.name}
              padded={false}
              role="button"
              tabIndex={0}
              onClick={() => startQuickProgram(prog.program)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  startQuickProgram(prog.program);
                }
              }}
              className="flex h-24 min-w-[100px] shrink-0 flex-col items-center justify-center gap-2 bg-surface/30 transition-all hover:border-accent/40 active:scale-95"
            >
              <span className="text-2xl" aria-hidden>
                {prog.emoji}
              </span>
              <span className="text-xs font-bold uppercase tracking-tight text-text-secondary">{prog.name}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
