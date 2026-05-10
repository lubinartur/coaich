import { useEffect, useState } from 'react';
import { Dumbbell, Play, Zap } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import {
  EMPTY_WORKOUT_TEMPLATE,
  WORKOUT_PROGRAM_TEMPLATES,
  type LoggerTemplateExercise,
} from '@/constants/workoutPrograms';
import {
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
  const [trainAnywayRows, setTrainAnywayRows] = useState<TodayExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reco, setReco] = useState<WorkoutRecommendation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTrainAnywayWorkout, setShowTrainAnywayWorkout] = useState(false);

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
      setShowTrainAnywayWorkout(false);
      try {
        const profile = await getProfile();
        if (cancelled) return;

        const buildRowsForTemplate = async (p: Profile, templateKey: RecommendedWorkoutType) => {
          const exercises = WORKOUT_PROGRAM_TEMPLATES[templateKey];
          return Promise.all(
            exercises.map(async (ex) => {
              try {
                const target = await getExerciseTarget(
                  ex.exerciseId,
                  ex.name,
                  p.goal,
                  p.pharmacology,
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
          setTrainAnywayRows([]);
          setLoading(false);
          return;
        }

        const recommendation = await getWorkoutRecommendation(profile);
        if (recommendation.workoutType === null) {
          setTrainAnywayRows([]);
          if (recommendation.trainAnywayType) {
            const builtTrain = await buildRowsForTemplate(profile, recommendation.trainAnywayType);
            if (!cancelled) setTrainAnywayRows(builtTrain);
          }
          if (!cancelled) {
            setReco(recommendation);
            setRows([]);
            setLoading(false);
          }
          return;
        }

        const built = await buildRowsForTemplate(profile, recommendation.workoutType);

        if (!cancelled) {
          setReco(recommendation);
          setRows(built);
          setTrainAnywayRows([]);
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
          setTrainAnywayRows([]);
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

  const usingTrainAnyway =
    Boolean(reco?.workoutType === null && showTrainAnywayWorkout && reco.trainAnywayType);

  let displayWorkoutType: RecommendedWorkoutType | null = null;
  let displayWorkoutName = '';
  if (reco?.workoutType != null) {
    displayWorkoutType = reco.workoutType;
    displayWorkoutName = reco.workoutName;
  } else if (reco && reco.workoutType === null && usingTrainAnyway && reco.trainAnywayType) {
    displayWorkoutType = reco.trainAnywayType;
    displayWorkoutName = reco.trainAnywayName ?? '';
  }

  const displayRows = usingTrainAnyway ? trainAnywayRows : rows;

  const displayHeadline =
    displayWorkoutName.length > 0
      ? (() => {
          const i = displayWorkoutName.indexOf(' - ');
          return i === -1 ? displayWorkoutName : displayWorkoutName.slice(0, i);
        })()
      : '';

  const isRestOnlyCard = reco !== null && reco.workoutType === null && !showTrainAnywayWorkout;

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
        <p className="text-[15px] leading-relaxed text-text-primary/90">
          {reco?.reasoning ?? 'Building your recommendation…'}
        </p>
      </Card>

      {/* Next workout or rest day */}
      {isRestOnlyCard ? (
        <Card className="relative border-border shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Badge variant="secondary">REST DAY</Badge>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">Rest Day</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-secondary">
                Recovery recommended. Listen to your body.
              </p>
              {reco.trainAnywayType ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="mt-4"
                  onClick={() => setShowTrainAnywayWorkout(true)}
                >
                  Train anyway
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="relative border-border shadow-xl">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <Badge variant="accent">NEXT WORKOUT</Badge>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                {displayWorkoutType ? displayHeadline : '…'}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-text-secondary">
                {displayWorkoutType
                  ? `${FOCUS_SUBTITLE[displayWorkoutType]} • ${WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType].length} exercises`
                  : 'Loading…'}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/20">
              <Dumbbell className="h-6 w-6" />
            </div>
          </div>

          <div className="mb-2 mt-1 flex flex-col px-1">
            {loading ? (
              <p className="py-4 text-sm text-text-secondary">Loading targets…</p>
            ) : (
              displayRows.map((ex, i) => {
                const layout = getRecLastLayout(ex.rec, ex.last, ex.progressionStatus);
                const statusInline = getProgressionStatusInlineText(ex.progressionStatus);
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
                            className={`shrink-0 whitespace-nowrap pl-2 text-right text-xs font-medium leading-snug ${layout.lineClass}`}
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
                            <span className="shrink-0 whitespace-nowrap pl-2 text-right text-xs font-medium leading-snug text-accent">
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

          <div className="flex flex-col gap-2">
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="link"
                className="px-4 py-3 text-[14px] font-semibold uppercase tracking-wide"
              >
                View Exercises
              </Button>
            </div>
            <Button
              variant="primary"
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
              <Play className="h-4 w-4 fill-white" aria-hidden />
              Start Workout
            </Button>
          </div>
        </Card>
      )}

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
