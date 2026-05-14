import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n/translations';
import { db, getProfile } from '@/services/db';
import { generateWorkoutReview, generateCoachInsights } from '@/services/aiService';
import { canonicalExerciseId as canonicalId, previewExerciseTarget } from '@/services/progressionEngine';
import type { AIReview, ExerciseRating, NextTarget, PrRecord, WorkoutSession } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';

export interface ReviewScreenProps {
  /** When set, stats and exercise log are loaded from Dexie for this session. */
  sessionId?: string;
  workoutName: string;
  workoutDate: string;
  onBack: () => void;
  onEditWorkout?: () => void;
  /** Bump after external edits so session is re-fetched from Dexie. */
  dataRefreshKey?: number;
}

function formatDurationMinutes(totalMinutes: number, hourShort: string, minuteShort: string): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}${hourShort} ${min.toString().padStart(2, '0')}${minuteShort}`;
  return `${min}${minuteShort}`;
}

type StatTile = { label: string; value: string };

/** Stats grid only: always kg, comma thousands when ≥ 1000. */
function formatStatVolumeKg(volKg: number, locale: string): string {
  const rounded = Math.round(volKg);
  return rounded >= 1000 ? rounded.toLocaleString(locale) : String(rounded);
}

function exerciseVolumeKg(sets: { w: number; r: number; completed: boolean }[]): number {
  return sets.filter((s) => s.completed).reduce((a, s) => a + s.w * s.r, 0);
}

function formatVolumeDisplay(volKg: number, locale: string, kgUnit: string): string {
  return `${Math.round(volKg).toLocaleString(locale)}${kgUnit}`;
}

function stripJsonMarkers(rawText: string): string {
  return rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function extractReviewIntro(rawText: string, depth = 0): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;
  if (depth > 3) return stripJsonMarkers(trimmed);
  const clean = stripJsonMarkers(trimmed);
  if (!clean.startsWith('{')) return rawText;
  try {
    const parsed = JSON.parse(clean) as unknown;
    if (parsed && typeof parsed === 'object' && 'intro' in parsed) {
      const intro = (parsed as { intro?: unknown }).intro;
      if (typeof intro === 'string') {
        return extractReviewIntro(intro, depth + 1);
      }
    }
    return rawText;
  } catch {
    return rawText;
  }
}

const SECTION_HEADER_CLASS = 'text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]';
const OVERLAY_HEADER_TITLE_CLASS = 'text-lg font-bold text-white';
const BODY_TEXT_CLASS = 'text-base font-normal leading-relaxed text-[#AAAAAA]';
const EXERCISE_NAME_CLASS = 'text-base font-bold text-white';
const STAT_NUMBER_CLASS = 'text-3xl font-black tracking-tight text-white';
const SMALL_META_TEXT_CLASS = 'text-xs text-[#6B7280]';
const STAT_CARD_LABEL_CLASS = 'text-[9px] font-black uppercase tracking-widest text-[#6B7280]';
const PR_VALUE_CLASS = 'text-sm text-[#F59E0B]';
const NOTE_INDEX_CLASS = 'text-sm font-black text-[#8B5CF6]';

/** PR row title — same display name rules as session rows. */
function prDisplayName(r: PrRecord, fallbackExercise: string): string {
  return toDisplayName((r.exerciseName ?? '').trim() || fallbackExercise);
}

/** PR row subtitle: `77.5kg × 8` or `12 reps` (same rules as prDetection `formatPrLine`). */
function prWeightSubtitle(r: PrRecord, kgUnit: string, repsLabel: string): string {
  const w = r.weight;
  const reps = r.reps;
  if (w > 0) {
    const ws = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, '');
    return `${ws}${kgUnit} × ${reps}`;
  }
  return `${reps} ${repsLabel}`;
}

function dashStatTiles(t: (k: TranslationKey) => string): StatTile[] {
  return [
    { label: t('volume'), value: '—' },
    { label: t('sets'), value: '—' },
    { label: t('exercises'), value: '—' },
    { label: t('duration'), value: '—' },
  ];
}

export default function ReviewScreen({
  sessionId,
  workoutName,
  workoutDate,
  onBack,
  onEditWorkout,
  dataRefreshKey = 0,
}: ReviewScreenProps) {
  const { t, locale } = useTranslation();
  const [expandedLogKeys, setExpandedLogKeys] = useState<string[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(sessionId));
  const [prRecords, setPrRecords] = useState<PrRecord[]>([]);
  const [coachReview, setCoachReview] = useState<AIReview | null>(null);
  const [coachLoading, setCoachLoading] = useState(() => Boolean(sessionId));
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    void db.workoutSessions.get(sessionId).then((s) => {
      if (!cancelled) {
        setSession(s ?? null);
        setSessionLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  useEffect(() => {
    if (!sessionId) {
      setPrRecords([]);
      return;
    }
    let cancelled = false;
    void db.prRecords
      .where('sessionId')
      .equals(sessionId)
      .toArray()
      .then((rows) => {
        if (!cancelled) setPrRecords(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  useEffect(() => {
    if (!sessionId) {
      setCoachReview(null);
      setCoachLoading(false);
      return;
    }
    let cancelled = false;
    setCoachLoading(true);
    void db.aiReviews
      .where('sessionId')
      .equals(sessionId)
      .first()
      .then((row) => {
        if (!cancelled) {
          setCoachReview(row ?? null);
          setCoachLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, dataRefreshKey]);

  const prRecordsForDisplay = useMemo(() => {
    const resolveName = (r: PrRecord): string => {
      const raw = r as PrRecord & { exercise_name?: string };
      let name = (r.exerciseName ?? raw.exercise_name ?? '').trim();
      if (!name && session) {
        const cid = r.exerciseId;
        const ex = session.exercises.find(
          (e) => e.exerciseId === cid || canonicalId(e.exerciseId) === cid,
        );
        name = (ex?.exerciseName ?? '').trim();
      }
      return name || t('exercise');
    };
    return [...prRecords]
      .map((r) => ({ ...r, exerciseName: resolveName(r) }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
  }, [prRecords, session, t]);

  const displayStats = useMemo((): StatTile[] => {
    if (sessionId && sessionLoading) {
      return [];
    }
    if (!session) {
      return dashStatTiles(t);
    }
    const setCount = session.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const volKg = session.totalVolume;
    const durMin = Math.max(0, Math.round(session.durationMinutes));
    return [
      { label: t('volume'), value: formatStatVolumeKg(volKg, locale) },
      { label: t('sets'), value: String(setCount) },
      { label: t('exercises'), value: String(session.exercises.length) },
      { label: t('duration'), value: formatDurationMinutes(durMin, t('hourShort'), t('minuteShort')) },
    ];
  }, [locale, session, sessionId, sessionLoading, t]);

  const logExercises = useMemo(() => {
    if (!session) return [];
    return session.exercises.map((ex) => ({
      key: ex.exerciseId,
      name: ex.exerciseName,
      sets: ex.sets.map((st) => ({
        n: st.setNumber,
        w: st.weight,
        r: st.reps,
        completed: st.completed,
      })),
    }));
  }, [session]);

  const showStatsLoading = Boolean(sessionId && sessionLoading);

  const toggleLogExpand = (key: string) => {
    setExpandedLogKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleRegenerate = async () => {
    if (!sessionId || !session || regenerating) return;
    setRegenerating(true);
    try {
      const profile = await getProfile();
      if (!profile) return;
      const ratings: ExerciseRating[] = session.ratings ?? [];
      const nextTargets: NextTarget[] = [];
      for (const ex of session.exercises) {
        const id = canonicalId(ex.exerciseId);
        const preview = await previewExerciseTarget(id, ex.exerciseName, profile.goal, profile.pharmacology);
        if (!preview) continue;
        nextTargets.push({ exerciseId: id, exerciseName: ex.exerciseName, weight: preview.weight, reps: preview.reps, sets: preview.sets });
      }
      const review = await generateWorkoutReview({ profile, session, ratings, nextTargets });
      const id = crypto.randomUUID();
      const generatedAt = new Date().toISOString();
      await db.aiReviews.where('sessionId').equals(sessionId).delete();
      await db.aiReviews.add({ ...review, id, sessionId, generatedAt });
      setCoachReview({ ...review, id, sessionId, generatedAt });
      const recentSessions = await db.workoutSessions.orderBy('finishedAt').reverse().limit(5).toArray();
      void generateCoachInsights(sessionId, session, review, recentSessions);
    } catch (err) {
      console.error('handleRegenerate', err);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="min-h-screen w-full animate-in fade-in slide-in-from-bottom-8 bg-[#0A0A0A] pb-24 duration-700">
      <header className="sticky top-0 z-10 border-b border-[#2A2A2A] bg-[#0A0A0A]/80 px-6 pb-6 pt-6 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 shrink-0 p-1 text-white transition-opacity hover:opacity-80"
            aria-label={t('back')}
          >
            <ArrowLeft className="h-6 w-6" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B5CF6]" aria-hidden />
              <span className={SMALL_META_TEXT_CLASS}>{workoutDate}</span>
            </div>
            <h1 className={OVERLAY_HEADER_TITLE_CLASS}>{toDisplayName(workoutName)}</h1>
          </div>
        </div>
      </header>

      <div className="space-y-12 px-6 py-10">
        {showStatsLoading ? (
          <div className="flex justify-center py-12" aria-busy>
            <Loader2 className="h-8 w-8 shrink-0 animate-spin text-[#8B5CF6]" aria-hidden />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {displayStats.map((stat) => (
              <div
                key={stat.label}
                className="group relative overflow-hidden rounded-[24px] border border-[#222222] bg-[#111111] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#333333]"
              >
                <span className={`relative z-10 ${STAT_CARD_LABEL_CLASS}`}>{stat.label}</span>
                <div className="relative z-10 mt-2">
                  <div className={`${STAT_NUMBER_CLASS} transition-colors group-hover:text-[#8B5CF6]`}>
                    {stat.value}
                  </div>
                </div>
                <div
                  className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-white/[0.02] transition-transform duration-700 group-hover:scale-150"
                  aria-hidden
                />
              </div>
            ))}
          </div>
        )}

        {prRecordsForDisplay.length > 0 ? (
          <section className="relative overflow-hidden rounded-[32px] border border-[#F59E0B]/20 bg-gradient-to-br from-[#F59E0B]/10 to-transparent p-8 shadow-[0_0_40px_-12px_rgba(245,158,11,0.2)]">
            <div className="mb-5 flex items-center gap-2">
              <div className="rounded-lg bg-[#F59E0B] p-1.5 shadow-lg shadow-[#F59E0B]/20">
                <Trophy className="h-4 w-4 fill-black text-black" aria-hidden />
              </div>
              <h3 className={SECTION_HEADER_CLASS}>{t('personalRecords')}</h3>
            </div>
            <div className="divide-y divide-[#F59E0B]/15">
              {prRecordsForDisplay.map((r) => (
                <div key={r.id ?? `${r.exerciseId}-${r.achievedAt}`} className="py-3 first:pt-0 last:pb-0">
                  <p className={EXERCISE_NAME_CLASS}>{prDisplayName(r, t('exercise'))}</p>
                  <p className={`mt-1 ${PR_VALUE_CLASS}`}>{prWeightSubtitle(r, t('kgUnit'), t('reps').toLowerCase())}</p>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10" aria-hidden>
              <Sparkles className="h-20 w-20 text-[#F59E0B]" />
            </div>
          </section>
        ) : null}

        <section className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-black text-black shadow-xl shadow-white/10">
                AI
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">{t('coachAnalysis')}</h3>
                <p className="text-[10px] uppercase tracking-widest text-[#6B7280]">{t('postSessionIntelligence')}</p>
              </div>
            </div>
            {sessionId && coachReview ? (
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
                className="flex items-center gap-1.5 rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-xs font-bold text-[#6B7280] transition-all hover:border-[#8B5CF6]/40 hover:text-[#8B5CF6] disabled:opacity-40"
                aria-label="Regenerate AI review"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden />
                {regenerating ? '...' : 'AI'}
              </button>
            ) : null}
          </div>

          {sessionId && coachLoading ? (
            <div className="space-y-4 px-2" aria-busy>
              <div className="h-2 w-full animate-pulse rounded-full bg-[#111111]" />
              <div className="h-2 w-[90%] animate-pulse rounded-full bg-[#111111]" />
              <div className="h-2 w-[80%] animate-pulse rounded-full bg-[#111111]" />
            </div>
          ) : sessionId && !coachReview ? (
            <p className={`px-2 ${BODY_TEXT_CLASS}`}>{t('noAiReview')}</p>
          ) : coachReview ? (
            <div className="space-y-10 px-2">
              <p className={BODY_TEXT_CLASS}>{extractReviewIntro(coachReview.intro)}</p>

              <div className="grid grid-cols-1 gap-12">
                <div className="space-y-4">
                  <div className={`flex items-center gap-2 ${SECTION_HEADER_CLASS}`}>
                    <CheckCircle2 className="h-3 w-3 text-[#22C55E]" strokeWidth={3} aria-hidden />
                    {t('whatWentWell')}
                  </div>
                  <div className="space-y-3">
                    {coachReview.wentWell.map((p, i) => (
                      <div key={`${p}-${i}`} className="group flex gap-4">
                        <span className={`mt-1 ${SMALL_META_TEXT_CLASS}`}>{String(i + 1).padStart(2, '0')}</span>
                        <p className={BODY_TEXT_CLASS}>{p}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={`flex items-center gap-2 ${SECTION_HEADER_CLASS}`}>
                    <AlertCircle className="h-3 w-3 text-[#F59E0B]" strokeWidth={3} aria-hidden />
                    {t('toImprove')}
                  </div>
                  <div className="space-y-3">
                    {coachReview.toImprove.map((p, i) => (
                      <div key={`${p}-${i}`} className="group flex gap-4">
                        <span className={`mt-1 ${SMALL_META_TEXT_CLASS}`}>{String(i + 1).padStart(2, '0')}</span>
                        <p className={BODY_TEXT_CLASS}>{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {coachReview.exerciseNotes.length > 0 ? (
                <div className="space-y-4">
                  <div className={`flex items-center gap-2 ${SECTION_HEADER_CLASS}`}>
                    <MessageSquare className="h-3 w-3 text-[#8B5CF6]" strokeWidth={3} aria-hidden />
                    {t('exerciseNotes')}
                  </div>
                  <div className="space-y-3">
                    {coachReview.exerciseNotes.map((block, i) => (
                      <div key={`${block.exerciseId}-${block.exerciseName}-${i}`} className="group flex gap-4">
                        <span className={`mt-1 ${NOTE_INDEX_CLASS}`}>{String(i + 1).padStart(2, '0')}</span>
                        <div className="min-w-0 flex-1">
                          <p className={EXERCISE_NAME_CLASS}>{toDisplayName(block.exerciseName || t('exercise'))}</p>
                          <p className={`mt-1 ${BODY_TEXT_CLASS}`}>{block.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className={`px-2 ${BODY_TEXT_CLASS}`}>{t('noAiReview')}</p>
          )}
        </section>

        <section className="space-y-6">
          <h3 className={`px-2 text-center ${SECTION_HEADER_CLASS}`}>{t('exerciseLog')}</h3>
          {showStatsLoading ? (
            <div className="flex justify-center py-12" aria-busy>
              <Loader2 className="h-8 w-8 shrink-0 animate-spin text-[#8B5CF6]" aria-hidden />
            </div>
          ) : logExercises.length > 0 ? (
            <div className="space-y-4">
              {logExercises.map((ex) => {
                const completed = ex.sets.filter((s) => s.completed);
                const volDisp = formatVolumeDisplay(exerciseVolumeKg(ex.sets), locale, t('kgUnit'));
                const open = expandedLogKeys.includes(ex.key);
                return (
                  <div key={ex.key} className="overflow-hidden rounded-[32px] border border-[#222222] bg-[#111111]">
                    <button
                      type="button"
                      onClick={() => toggleLogExpand(ex.key)}
                      className="group flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-[#181818]"
                    >
                      <div>
                        <div className={`${EXERCISE_NAME_CLASS} transition-colors group-hover:text-[#8B5CF6]`}>
                          {toDisplayName(ex.name)}
                        </div>
                        <div className={`mt-1 ${SMALL_META_TEXT_CLASS}`}>
                          {completed.length} {t('setsUnit')} • {volDisp}
                        </div>
                      </div>
                      <div className="rounded-full bg-[#222222] p-2 transition-all group-hover:bg-[#8B5CF6]/20 group-hover:text-[#8B5CF6]">
                        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {open ? (
                        <motion.div
                          key={ex.key}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 border-t border-white/5 px-6 pb-6 pt-4">
                            <div className={`mb-2 grid grid-cols-3 gap-2 px-2 ${STAT_CARD_LABEL_CLASS}`}>
                              <span>{t('set')}</span>
                              <span className="text-center">{t('weight')}</span>
                              <span className="text-right">{t('reps')}</span>
                            </div>
                            {completed.map((s, idx) => (
                              <div key={s.n} className="grid grid-cols-3 items-center gap-2 px-2">
                                <span className={SMALL_META_TEXT_CLASS}>{idx + 1}</span>
                                <div className="text-center">
                                  <span className="text-base font-bold tabular-nums text-white">{s.w}</span>
                                  <span className={`ml-1 ${SMALL_META_TEXT_CLASS}`}>{t('kgUnit')}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-base font-bold tabular-nums text-white">{s.r}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`px-2 text-center text-sm ${BODY_TEXT_CLASS}`}>
              {sessionId ? t('workoutNotFound') : t('noExercisesYet')}
            </p>
          )}
        </section>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-[390px] border-t border-[#2A2A2A] bg-[#141414] p-4">
        <div className="flex gap-3">
          {sessionId && onEditWorkout ? (
            <button
              type="button"
              onClick={onEditWorkout}
              className="flex-1 rounded-2xl border border-[#2A2A2A] bg-transparent py-5 text-sm font-bold text-white"
            >
              {t('editWorkout')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-2xl bg-white py-5 text-sm font-bold text-black"
          >
            {t('done')}
          </button>
        </div>
      </footer>
    </div>
  );
}
