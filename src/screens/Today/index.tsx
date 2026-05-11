import { useEffect, useState } from 'react';
import { ArrowRight, Dumbbell, Sparkles, Zap } from 'lucide-react';
import { motion } from 'motion/react';
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
import { progressionStatusDisplayText } from '@/utils/progressionDisplayLabels';
import { toDisplayName } from '@/utils/toDisplayName';

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

function operationLabel(type: RecommendedWorkoutType | null): string {
  if (!type) return '…';
  if (type === 'full_body') return 'FULL BODY';
  return type.toUpperCase();
}

function missionDateSubtitle(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** Split coach copy on ". " so each sentence can be spaced; preserves final segment without forcing a period. */
function splitCoachMessageIntoSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const parts = t.split('. ');
  if (parts.length === 1) return [parts[0]];
  return parts.map((p, i) => {
    const s = p.trim();
    if (i < parts.length - 1) return s.endsWith('.') ? s : `${s}.`;
    return s;
  });
}

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
  const [coachMessageExpanded, setCoachMessageExpanded] = useState(false);

  useEffect(() => {
    setCoachMessageExpanded(false);
  }, [coachAiMessage]);

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

  /** Short card title from recommendation (e.g. "Pull" from "Pull - Back & Biceps"), never goal labels. */
  const workoutCardTitle =
    displayWorkoutName.length > 0
      ? (() => {
          const i = displayWorkoutName.indexOf(' - ');
          const raw = i === -1 ? displayWorkoutName : displayWorkoutName.slice(0, i);
          return toDisplayName(raw);
        })()
      : displayWorkoutType
        ? displayWorkoutType === 'full_body'
          ? 'Full body'
          : toDisplayName(displayWorkoutType)
        : '';

  const recHoldPillClass =
    'text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wide bg-[#8B5CF6]/25 text-[#8B5CF6] border border-[#8B5CF6]/35';

  return (
    <motion.div
      className="flex flex-col gap-10 px-5 pb-10 pt-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white">Today</h1>
          <p className="mt-1 text-sm font-medium tracking-tight text-[#6B7280]">
            The mission for {missionDateSubtitle()}
          </p>
        </div>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 shadow-[0_0_24px_-4px_rgba(139,92,246,0.35)] transition-transform active:scale-95"
          aria-label="Refresh recommendation"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <Zap className="h-6 w-6 text-[#8B5CF6]" fill="currentColor" aria-hidden />
        </button>
      </header>

      {/* Coach AI — glass accent */}
      <section className="relative overflow-hidden rounded-3xl border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 p-6 backdrop-blur-md">
        <div className="relative z-10 mb-3 flex items-center gap-2">
          <div className="rounded-sm bg-[#8B5CF6] p-1">
            <Sparkles className="h-2.5 w-2.5 text-white" fill="currentColor" strokeWidth={3} aria-hidden />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B5CF6]">
            COAICH INTELLIGENCE
          </span>
        </div>
        {coachAiLoading ? (
          <div className="relative z-10 space-y-2.5" aria-busy>
            <div className="h-4 w-full animate-pulse rounded-md bg-[#2A2A2A]" />
            <div className="h-4 w-[92%] animate-pulse rounded-md bg-[#2A2A2A]" />
            <div className="h-4 w-[70%] animate-pulse rounded-md bg-[#2A2A2A]" />
          </div>
        ) : coachAiMessage ? (
          <>
            <div className="relative z-10 space-y-4">
              {(coachMessageExpanded
                ? splitCoachMessageIntoSentences(coachAiMessage)
                : splitCoachMessageIntoSentences(coachAiMessage).slice(0, 2)
              ).map((sentence, i) => (
                <p
                  key={i}
                  className="text-lg font-medium leading-relaxed tracking-tight text-white/90"
                >
                  {sentence}
                </p>
              ))}
            </div>
            {splitCoachMessageIntoSentences(coachAiMessage).length > 2 ? (
              <button
                type="button"
                className="relative z-10 mt-3 text-sm font-medium text-[#8B5CF6] underline decoration-[#8B5CF6]/40 underline-offset-2 hover:opacity-90"
                onClick={() => setCoachMessageExpanded((v) => !v)}
              >
                {coachMessageExpanded ? 'Read less' : 'Read more'}
              </button>
            ) : null}
          </>
        ) : (
          <p className="relative z-10 text-lg font-medium leading-tight tracking-tight text-white/90">
            {loading ? 'Building your recommendation…' : '—'}
          </p>
        )}
        <div
          className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-[#8B5CF6]/20 blur-2xl transition-transform duration-1000 group-hover:scale-150"
          aria-hidden
        />
      </section>

      {/* Workout card — hardware shell */}
      <section className="overflow-hidden rounded-[32px] border border-[#222222] bg-[#111111] p-1 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)]">
        <div className="space-y-6 rounded-[31px] bg-[#181818] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-[#333333] bg-[#222222] px-2 py-1">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                    Operation: {operationLabel(displayWorkoutType)}
                  </span>
                </div>
                {reco?.isDeload ? (
                  <>
                    {isRestRecommended ? (
                      <span className="rounded-md border border-[#2A2A2A] bg-[#141414] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                        Rest recommended
                      </span>
                    ) : null}
                    <span className="rounded-md border border-[#60A5FA]/30 bg-[#60A5FA]/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#60A5FA]">
                      Deload week
                    </span>
                  </>
                ) : isRestRecommended ? (
                  <span className="rounded-md border border-[#2A2A2A] bg-[#141414] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                    Rest recommended
                  </span>
                ) : null}
              </div>
              <h2 className="text-4xl font-black tracking-tighter text-white">
                {displayWorkoutType ? workoutCardTitle || '…' : '…'}
              </h2>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">
                {displayWorkoutType
                  ? reco?.isDeload
                    ? '50% volume — same weights, half the sets'
                    : `${FOCUS_SUBTITLE[displayWorkoutType]} • ${WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType].length} exercises`
                  : 'Loading…'}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/30">
              <Dumbbell className="h-6 w-6 text-white" aria-hidden />
            </div>
          </div>

          <div className="pt-1">
            {loading ? (
              <p className="py-3 text-sm text-[#6B7280]">Loading targets…</p>
            ) : displayRows.length > 0 ? (
              <>
                <div className="divide-y divide-[#2A2A2A]">
                  {displayRows.map((ex) => {
                    const layout = getRecLastLayout(ex.rec, ex.last, ex.progressionStatus);
                    const statusInline = getProgressionStatusInlineText(ex.progressionStatus);
                    const statusPres = getProgressionStatusPresentation(ex.progressionStatus);
                    const statusDisplay = progressionStatusDisplayText(statusInline, statusPres?.text);
                    const statusClass = statusPres?.textClass ?? 'text-[#8B5CF6]';
                    return (
                      <div
                        key={ex.exerciseId}
                        className="group flex cursor-default items-center justify-between gap-3 py-3"
                      >
                        <span className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-white transition-colors group-hover:text-[#8B5CF6]">
                          {toDisplayName(ex.name)}
                        </span>
                        <div className="flex min-w-0 shrink-0 items-center gap-2">
                          <span className={recHoldPillClass}>
                            {layout.kind === 'unified' ? layout.label.replace(':', '').trim() : 'REC'}
                          </span>
                          {statusDisplay ? (
                            <span className={`whitespace-nowrap text-[11px] font-mono font-bold ${statusClass}`}>
                              {statusDisplay}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!reco || loading || displayWorkoutType === null}
              className={`group flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-base font-black shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                isRestRecommended
                  ? 'border border-[#2A2A2A] bg-[#1C1C1C] text-[#8B5CF6] shadow-none'
                  : 'bg-[#8B5CF6] text-white shadow-[#8B5CF6]/20'
              }`}
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
              Start Workout
              <ArrowRight
                className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </section>

      {/* Tactical templates — 2×2 style grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Tactical Templates</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_PROGRAMS.map((prog, idx) => (
            <button
              key={prog.name}
              type="button"
              onClick={() => startQuickProgram(prog.program)}
              className={`relative flex flex-col items-start gap-4 overflow-hidden rounded-[24px] border border-[#222222] p-5 text-left transition-all active:scale-[0.98] ${
                idx === 0 ? 'bg-[#181818]' : 'bg-[#111111]'
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#222222] text-2xl" aria-hidden>
                {prog.emoji}
              </span>
              <div className="relative z-10">
                <span className="block text-lg font-black tracking-tight text-white">{prog.name}</span>
                <span className="mt-0.5 block text-[10px] font-medium tracking-wider text-[#6B7280]">
                  Quick start
                </span>
              </div>
              <Dumbbell
                className="pointer-events-none absolute -bottom-2 -right-2 h-[60px] w-[60px] rotate-12 scale-150 opacity-10 grayscale"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
