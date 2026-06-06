import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Dumbbell, MessageCircle, Send, Sparkles, X, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  WORKOUT_PROGRAM_TEMPLATES,
  getNextProgramDay,
  templateForProgramDay,
  type LoggerTemplateExercise,
} from '@/constants/workoutPrograms';
import {
  buildCoachPromptData,
  calculateRecoveryScore,
  generateCoachChatReply,
  generateCoachMessage,
  getWorkoutRecommendation,
  type CoachChatMessage,
  type RecoveryScore,
  type RecommendedWorkoutType,
  type WorkoutRecommendation,
} from '@/services/coachService';
import { db, getProfile } from '@/services/db';
import {
  canonicalExerciseId,
  formatTargetLineForExercise,
  getLastPerformedSummary,
  parseRecommendLine,
  previewExerciseTarget,
  type ProgressionStatus,
} from '@/services/progressionEngine';
import { useTranslation } from '@/hooks/useTranslation';
import type { Exercise, Profile, Program, ProgramDay } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';

type ProgramWithNext = {
  program: Program;
  nextDay: ProgramDay;
};

type TodayExerciseRow = {
  exerciseId: string;
  name: string;
  equipment: Exercise['equipment'];
  rec: string;
  last: string;
  progressionStatus: ProgressionStatus;
};

type TodayStatusBadge = {
  label: 'REC' | 'HOLD' | 'BASE' | 'DELOAD';
  badgeClass: string;
  dotClass: string;
  pulse: boolean;
};

function getTodayStatusBadge(status: ProgressionStatus): TodayStatusBadge {
  switch (status) {
    case 'maintaining':
      return {
        label: 'HOLD',
        badgeClass:
          'inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#F59E0B]',
        dotClass: 'bg-[#F59E0B]',
        pulse: false,
      };
    case 'baseline':
    case 'first_session':
      return {
        label: 'BASE',
        badgeClass:
          'inline-flex items-center gap-1.5 rounded-full border border-[#6B7280]/40 bg-[#6B7280]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#6B7280]',
        dotClass: 'bg-[#6B7280]',
        pulse: false,
      };
    case 'deload':
      return {
        label: 'DELOAD',
        badgeClass:
          'inline-flex items-center gap-1.5 rounded-full border border-[#60A5FA]/40 bg-[#60A5FA]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#60A5FA]',
        dotClass: 'bg-[#60A5FA]',
        pulse: false,
      };
    default:
      return {
        label: 'REC',
        badgeClass:
          'inline-flex items-center gap-1.5 rounded-full border border-[#8B5CF6]/40 bg-[#8B5CF6]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#8B5CF6]',
        dotClass: 'bg-[#8B5CF6]',
        pulse: true,
      };
  }
}

function missionDateSubtitle(locale: string): string {
  return new Date().toLocaleDateString(locale, { month: 'long', day: 'numeric' });
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
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<TodayExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reco, setReco] = useState<WorkoutRecommendation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [coachAiMessage, setCoachAiMessage] = useState<string | null>(null);
  const [coachAiLoading, setCoachAiLoading] = useState(false);
  const [coachMessageExpanded, setCoachMessageExpanded] = useState(false);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<string[]>([]);
  const [programsWithNext, setProgramsWithNext] = useState<ProgramWithNext[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState<RecoveryScore | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<CoachChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCoachMessageExpanded(false);
  }, [coachAiMessage]);

  useEffect(() => {
    setExpandedExerciseIds([]);
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [programs, recent] = await Promise.all([
          db.programs.toArray(),
          db.workoutSessions.orderBy('finishedAt').reverse().limit(20).toArray(),
        ]);
        if (cancelled) return;
        const list: ProgramWithNext[] = programs
          .filter((p) => p.days.length > 0)
          .map((p) => {
            const { day } = getNextProgramDay(p, recent);
            return { program: p, nextDay: day };
          });
        setProgramsWithNext(list);
      } catch (err) {
        console.error('[Today] load programs error', err);
        if (!cancelled) setProgramsWithNext([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  type QuickProgramKey = 'push' | 'pull' | 'legs' | 'full_body' | 'custom';

  const getProgramLabel = (program: QuickProgramKey) => {
    switch (program) {
      case 'push':
        return t('push');
      case 'pull':
        return t('pull');
      case 'legs':
        return t('legs');
      case 'full_body':
        return t('fullBody');
      default:
        return t('custom');
    }
  };

  const getWorkoutNameForProgram = (program: QuickProgramKey) => {
    switch (program) {
      case 'push':
        return t('pushWorkoutName');
      case 'pull':
        return t('pullWorkoutName');
      case 'legs':
        return t('legsWorkoutName');
      case 'full_body':
        return t('fullBodyWorkoutName');
      default:
        return t('customWorkoutName');
    }
  };

  const getFocusSubtitle = (type: RecommendedWorkoutType) => {
    switch (type) {
      case 'push':
        return t('focusPush');
      case 'pull':
        return t('focusPull');
      case 'legs':
        return t('focusLegs');
      default:
        return t('focusFullBody');
    }
  };

  const getBadgeLabel = (label: TodayStatusBadge['label']) => {
    switch (label) {
      case 'HOLD':
        return t('statusHold');
      case 'BASE':
        return t('statusBase');
      case 'DELOAD':
        return t('statusDeload');
      default:
        return t('statusRec');
    }
  };

  const startProgramDay = (day: ProgramDay) => {
    onStartWorkout?.({
      workoutName: day.dayName,
      workoutType: day.type,
      exerciseTemplate: templateForProgramDay(day),
      openExercisePickerOnMount: false,
    });
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setCoachAiMessage(null);
      setCoachAiLoading(false);
      setRecovery(null);
      try {
        const profile = await getProfile();
        if (cancelled) return;
        setProfile(profile ?? null);
        if (profile) {
          void calculateRecoveryScore(profile)
            .then((r) => {
              if (!cancelled) setRecovery(r);
            })
            .catch((err) => console.error('[Today] recovery score error', err));
        }

        const buildRowsForTemplate = async (
          p: Profile,
          templateKey: RecommendedWorkoutType,
          deloadWeek: boolean,
        ) => {
          const exercises = WORKOUT_PROGRAM_TEMPLATES[templateKey];
          return Promise.all(
            exercises.map(async (ex) => {
              try {
                const cid = canonicalExerciseId(ex.exerciseId);
                let storedTarget = await db.exerciseTargets.get(cid);
                if (!storedTarget && ex.exerciseId !== cid) {
                  storedTarget = await db.exerciseTargets.get(ex.exerciseId);
                }
                const preview = await previewExerciseTarget(ex.exerciseId, ex.name, p.goal, p.pharmacology, {
                  deloadWeek,
                });
                const target =
                  storedTarget != null
                    ? { weight: storedTarget.weight, reps: storedTarget.reps, sets: storedTarget.sets }
                    : preview != null
                      ? { weight: preview.weight, reps: preview.reps, sets: preview.sets }
                      : null;
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
                    : t('firstSession'),
                  last: last ?? '—',
                  progressionStatus: preview?.progressionStatus ?? 'first_session',
                };
              } catch (err) {
                console.error('[Today] exercise row load error', ex.exerciseId, err);
                return {
                  exerciseId: ex.exerciseId,
                  name: ex.name,
                  equipment: ex.equipment,
                  rec: t('firstSession'),
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
            workoutName: t('pushWorkoutName'),
            reasoning: t('completeOnboarding'),
          });
          setRows([]);
          setCoachAiMessage(t('completeOnboarding'));
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
            workoutName: t('pushWorkoutName'),
            reasoning: t('historyFallback'),
          });
          setCoachAiMessage(t('historyFallback'));
          setCoachAiLoading(false);
          const fallback = WORKOUT_PROGRAM_TEMPLATES.push;
          setRows(
            fallback.map((ex) => ({
              exerciseId: ex.exerciseId,
              name: ex.name,
              equipment: ex.equipment,
              rec: t('firstSession'),
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
  }, [refreshKey, t]);

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
  const toggleExerciseExpanded = (exerciseId: string) => {
    setExpandedExerciseIds((prev) =>
      prev.includes(exerciseId) ? prev.filter((id) => id !== exerciseId) : [...prev, exerciseId],
    );
  };

  const isRestRecommended = reco !== null && reco.workoutType === null;

  /**
   * Short card title from the recommendation (e.g. "Pull" from "Pull - Back & Biceps",
   * "Upper" from "Upper - Upper Body", "Full Body" from "Full Body").
   * Falls back to the localized program label when no name is set yet.
   */
  const workoutCardTitle = (() => {
    if (displayWorkoutName.length > 0) {
      const i = displayWorkoutName.indexOf(' - ');
      const raw = i === -1 ? displayWorkoutName : displayWorkoutName.slice(0, i);
      return toDisplayName(raw);
    }
    if (displayWorkoutType != null) return getProgramLabel(displayWorkoutType);
    return '';
  })();

  const recoveryView = recovery
    ? recovery.label === 'ready'
      ? { accent: '#22C55E', text: t('recoveryReady'), pillClass: 'border-[#22C55E]/40 bg-[#22C55E]/15 text-[#22C55E]' }
      : recovery.label === 'low'
        ? { accent: '#EF4444', text: t('recoveryLow'), pillClass: 'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#EF4444]' }
        : { accent: '#F59E0B', text: t('recoveryModerate'), pillClass: 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B]' }
    : null;

  const quickActions = [
    t('qaWhyWorkout'),
    t('qaWhyWeight'),
    t('qaShoulderHurts'),
    t('qaReplaceExercise'),
    t('qaShorterWorkout'),
    t('qaDidntSleep'),
  ];

  const sendCoachMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading || !profile) return;
    const userMsg: CoachChatMessage = { role: 'user', content: trimmed };
    const nextHistory: CoachChatMessage[] = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await generateCoachChatReply(
        {
          profile,
          recommendation: {
            type: reco?.workoutType ?? 'rest',
            name: reco?.workoutName ?? displayWorkoutName,
            reasoning: reco?.reasoning ?? '',
          },
        },
        nextHistory,
      );
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: t('coachChatError') }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (!chatOpen) return;
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatLoading, chatOpen]);

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
          <h1 className="text-4xl font-black tracking-tighter text-white">{t('today')}</h1>
          <p className="mt-1 text-sm font-medium tracking-tight text-[#6B7280]">
            {t('missionFor')} {missionDateSubtitle(locale)}
          </p>
        </div>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 shadow-[0_0_24px_-4px_rgba(139,92,246,0.35)] transition-transform active:scale-95"
          aria-label={t('refreshRecommendation')}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <Zap className="h-6 w-6 text-[#8B5CF6]" fill="currentColor" aria-hidden />
        </button>
      </header>

      {/* Recovery score */}
      {recoveryView ? (
        <section className="flex items-center justify-between gap-4 rounded-3xl border border-[#222222] bg-[#111111] p-6">
          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
              {t('recoveryScore')}
            </span>
            <span className="mt-1 block text-4xl font-black tabular-nums tracking-tighter text-white">
              {recovery?.score}
            </span>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold ${recoveryView.pillClass}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: recoveryView.accent }} aria-hidden />
            {recoveryView.text}
          </span>
        </section>
      ) : null}

      {/* Coach AI — glass accent */}
      <section className="relative overflow-hidden rounded-3xl border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 p-6 backdrop-blur-md">
        <div className="relative z-10 mb-3 flex items-center gap-2">
          <div className="rounded-sm bg-[#8B5CF6] p-1">
            <Sparkles className="h-2.5 w-2.5 text-white" fill="currentColor" strokeWidth={3} aria-hidden />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B5CF6]">
            {t('coachIntelligence')}
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
                {coachMessageExpanded ? t('readLess') : t('readMore')}
              </button>
            ) : null}
          </>
        ) : (
          <p className="relative z-10 text-lg font-medium leading-tight tracking-tight text-white/90">
            {loading ? t('buildingRecommendation') : '—'}
          </p>
        )}
        <div
          className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-[#8B5CF6]/20 blur-2xl transition-transform duration-1000 group-hover:scale-150"
          aria-hidden
        />
      </section>

      {/* Ask Coach — opens chat sheet */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="-mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#8B5CF6]/30 bg-transparent py-4 text-sm font-bold text-[#8B5CF6] transition-colors hover:bg-[#8B5CF6]/10 active:scale-[0.98]"
      >
        <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
        {t('askCoach')}
      </button>

      {/* Workout card — hardware shell */}
      <section className="overflow-hidden rounded-[32px] border border-[#222222] bg-[#111111] p-1 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)]">
        <div className="space-y-6 rounded-[31px] bg-[#181818] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              {reco?.isDeload ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-[#60A5FA]/30 bg-[#60A5FA]/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#60A5FA]">
                    {t('deloadWeek')}
                  </span>
                </div>
              ) : null}
              <h2 className="text-4xl font-black tracking-tighter text-white">
                {displayWorkoutType ? workoutCardTitle || '…' : '…'}
              </h2>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">
                {displayWorkoutType
                  ? reco?.isDeload
                    ? t('deloadSubtitle')
                    : `${getFocusSubtitle(displayWorkoutType)} • ${WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType].length} ${t('exercises').toLowerCase()}`
                  : t('loading')}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/30">
              <Dumbbell className="h-6 w-6 text-white" aria-hidden />
            </div>
          </div>

          <div className="pt-1">
            {loading ? (
              <p className="py-3 text-sm text-[#6B7280]">{t('loadingTargets')}</p>
            ) : displayRows.length > 0 ? (
              <>
                <div className="space-y-2">
                  {displayRows.map((ex) => {
                    const badge = getTodayStatusBadge(ex.progressionStatus);
                    const isExpanded = expandedExerciseIds.includes(ex.exerciseId);
                    const parsedTarget = parseRecommendLine(ex.rec.trim());
                    const isTimedTarget = /\d+s\s*×/i.test(ex.rec);
                    return (
                      <div
                        key={ex.exerciseId}
                        className="overflow-hidden rounded-2xl border border-[#222222] bg-[#111111]"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExerciseExpanded(ex.exerciseId)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                          aria-expanded={isExpanded}
                        >
                          <span className="min-w-0 flex-1 truncate text-base font-bold text-white">
                            {toDisplayName(ex.name)}
                          </span>
                          <div className="shrink-0">
                            <span className={badge.badgeClass}>
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${badge.dotClass} ${
                                  badge.pulse ? 'animate-pulse' : ''
                                }`}
                                aria-hidden
                              />
                              {getBadgeLabel(badge.label)}
                            </span>
                          </div>
                        </button>
                        {isExpanded ? (
                          <div className="border-t border-white/5 px-4 pb-3 pt-3">
                            {parsedTarget ? (
                              <>
                                <div className="mb-2 grid grid-cols-[42px_minmax(0,1fr)_64px] gap-2 text-[9px] font-black uppercase tracking-widest text-[#6B7280]">
                                  <span>{t('set')}</span>
                                  <span className="text-center">{t('weight')}</span>
                                  <span className="text-right">{isTimedTarget ? t('time') : t('reps')}</span>
                                </div>
                                <div className="space-y-2">
                                  {Array.from({ length: parsedTarget.sets }, (_, idx) => (
                                    <div
                                      key={`${ex.exerciseId}-target-${idx + 1}`}
                                      className="grid grid-cols-[42px_minmax(0,1fr)_64px] items-center gap-2"
                                    >
                                      <span className="text-xs text-[#6B7280]">{idx + 1}</span>
                                      <span className="text-center text-sm font-medium text-white">
                                        {ex.equipment === 'bodyweight'
                                          ? t('bodyweight')
                                          : `${parsedTarget.weight}${t('kgUnit')}`}
                                      </span>
                                      <span className="text-right text-sm font-medium text-[#8B5CF6]">
                                        {isTimedTarget ? `${parsedTarget.reps}${t('secShort')}` : parsedTarget.reps}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-[#6B7280]">{t('targetsWillAppear')}</p>
                            )}
                          </div>
                        ) : null}
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
                  displayWorkoutName.length > 0
                    ? displayWorkoutName
                    : getWorkoutNameForProgram(displayWorkoutType);
                onStartWorkout?.({
                  workoutName,
                  workoutType: displayWorkoutType,
                  exerciseTemplate: WORKOUT_PROGRAM_TEMPLATES[displayWorkoutType],
                  openExercisePickerOnMount: false,
                });
              }}
            >
              {t('deployWorkout')}
              <ArrowRight
                className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </section>

      {/* Programs — loaded from db.programs (seeded from PRESET_PROGRAMS). */}
      {programsWithNext.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
              {t('tacticalTemplates')}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {programsWithNext.map(({ program, nextDay }, idx) => (
              <button
                key={program.id}
                type="button"
                onClick={() => startProgramDay(nextDay)}
                className={`relative flex flex-col items-start gap-4 overflow-hidden rounded-[24px] border border-[#222222] p-5 text-left transition-all active:scale-[0.98] ${
                  idx === 0 ? 'bg-[#181818]' : 'bg-[#111111]'
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#222222]" aria-hidden>
                  <Dumbbell className="h-5 w-5 text-[#8B5CF6]" />
                </span>
                <div className="relative z-10">
                  <span className="block text-lg font-black tracking-tight text-white">
                    {program.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium tracking-wider text-[#6B7280]">
                    {t('nextDay').toUpperCase()}: {nextDay.dayName}
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
      ) : null}

      {/* Coach chat — bottom sheet */}
      <AnimatePresence>
        {chatOpen ? (
          <motion.div
            key="coach-chat"
            className="fixed inset-0 z-[70] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label={t('close')}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setChatOpen(false)}
            />
            <motion.div
              className="relative z-10 mx-auto flex max-h-[85vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-[#222222] bg-[#111111] shadow-[0_-12px_48px_-12px_rgba(0,0,0,0.8)]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            >
              <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[#2A2A2A]" aria-hidden />

              <header className="flex shrink-0 items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/30">
                    <Sparkles className="h-4 w-4 text-white" fill="currentColor" aria-hidden />
                  </div>
                  <span className="text-lg font-black tracking-tight text-white">{t('coach')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  aria-label={t('close')}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#222222] bg-[#1C1C1C] text-[#6B7280] transition-colors hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </header>

              {/* Quick actions */}
              <div className="shrink-0 px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((qa) => (
                    <button
                      key={qa}
                      type="button"
                      disabled={chatLoading}
                      onClick={() => void sendCoachMessage(qa)}
                      className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:border-[#8B5CF6]/40 hover:text-white disabled:opacity-40"
                    >
                      {qa}
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 no-scrollbar">
                {chatMessages.length === 0 && !chatLoading ? (
                  <p className="px-1 py-6 text-center text-sm text-[#6B7280]">{t('coachChatEmpty')}</p>
                ) : null}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'rounded-br-sm bg-[#8B5CF6] font-medium text-white'
                          : 'rounded-bl-sm border border-[#222222] bg-[#1C1C1C] text-white/90'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-[#222222] bg-[#1C1C1C] px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6] [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6] [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8B5CF6]" />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Free input */}
              <form
                className="flex shrink-0 items-center gap-2 border-t border-[#222222] bg-[#141414] px-4 py-3"
                style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCoachMessage(chatInput);
                }}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t('coachChatPlaceholder')}
                  className="min-w-0 flex-1 rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-3 text-sm text-white placeholder:text-[#6B7280] focus:border-[#8B5CF6]/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={chatLoading || chatInput.trim().length === 0}
                  aria-label={t('sendMessage')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/25 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-5 w-5" aria-hidden />
                </button>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
