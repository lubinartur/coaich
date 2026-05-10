import { useEffect, useState } from 'react';
import { BottomNav, type BottomNavTab } from '@/components/layout/BottomNav';
import {
  EMPTY_WORKOUT_TEMPLATE,
  WORKOUT_PROGRAM_TEMPLATES,
  type LoggerTemplateExercise,
} from '@/constants/workoutPrograms';
import { db, hasProfile, seedExercisesIfEmpty } from '@/services/db';
import OnboardingScreen from '@/screens/Onboarding';
import LoggerScreen from '@/screens/Logger';
import RatingScreen from '@/screens/Rating';
import ReviewScreen from '@/screens/Review';
import HistoryScreen from '@/screens/History';
import EditWorkoutScreen from '@/screens/EditWorkout';
import ProgressScreen from '@/screens/Progress';
import SettingsScreen from '@/screens/Settings';
import ImportScreen from '@/screens/Import';
import TodayScreen from '@/screens/Today';

type WorkoutOverlay = 'logger' | 'rating' | 'review' | 'import' | 'editWorkout' | null;

type EditWorkoutContext = {
  sessionId: string;
  returnTo: 'review' | 'history';
};

type ActiveWorkoutState = {
  workoutName: string;
  workoutType: string;
  exerciseTemplate: readonly LoggerTemplateExercise[];
  openExercisePickerOnMount: boolean;
};

export default function App() {
  const [tab, setTab] = useState<BottomNavTab>('today');
  const [booting, setBooting] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [overlay, setOverlay] = useState<WorkoutOverlay>(null);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutState>({
    workoutName: 'Pull - Back & Biceps',
    workoutType: 'pull',
    exerciseTemplate: WORKOUT_PROGRAM_TEMPLATES.pull,
    openExercisePickerOnMount: false,
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reviewMeta, setReviewMeta] = useState({ workoutName: '', workoutDate: '' });
  const [reviewBackTab, setReviewBackTab] = useState<'today' | 'history'>('today');
  const [editContext, setEditContext] = useState<EditWorkoutContext | null>(null);
  const [reviewDataRefresh, setReviewDataRefresh] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    void (async () => {
      await seedExercisesIfEmpty();
      const exists = await hasProfile();
      setNeedsOnboarding(!exists);
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen justify-center bg-bg">
        <div className="flex w-full max-w-[390px] items-center justify-center border-x border-border">
          <div className="h-8 w-8 animate-pulse rounded-full border-2 border-border border-t-accent" aria-hidden />
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div className="flex min-h-screen justify-center bg-bg">
        <div className="relative min-h-screen w-full max-w-[390px] overflow-hidden border-x border-border shadow-2xl">
          <OnboardingScreen
            onComplete={() => {
              setNeedsOnboarding(false);
              setTab('today');
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-bg">
      <div className="relative flex min-h-screen w-full max-w-[390px] flex-col overflow-hidden border-x border-border bg-bg shadow-2xl">
        {overlay === 'import' ? (
          <ImportScreen
            onBack={() => {
              setOverlay(null);
              setTab('settings');
            }}
          />
        ) : overlay === 'logger' ? (
          <LoggerScreen
            workoutName={activeWorkout.workoutName}
            workoutType={activeWorkout.workoutType}
            exerciseTemplate={activeWorkout.exerciseTemplate}
            openExercisePickerOnMount={activeWorkout.openExercisePickerOnMount}
            onFinish={(sessionId) => {
              setActiveSessionId(sessionId);
              setOverlay('rating');
            }}
            onClose={() => setOverlay(null)}
          />
        ) : overlay === 'rating' && activeSessionId ? (
          <RatingScreen
            sessionId={activeSessionId}
            onBack={() => {
              setActiveSessionId(null);
              setOverlay(null);
            }}
            onComplete={() => {
              void (async () => {
                const s = await db.workoutSessions.get(activeSessionId);
                if (s) {
                  setReviewMeta({
                    workoutName: s.name,
                    workoutDate: new Date(s.finishedAt).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }),
                  });
                }
                setReviewBackTab('today');
                setOverlay('review');
              })();
            }}
          />
        ) : overlay === 'editWorkout' && editContext ? (
          <EditWorkoutScreen
            sessionId={editContext.sessionId}
            onSave={() => {
              const ctx = editContext;
              void (async () => {
                if (ctx.returnTo === 'review') {
                  const s = await db.workoutSessions.get(ctx.sessionId);
                  if (s) {
                    setReviewMeta({
                      workoutName: s.name,
                      workoutDate: new Date(s.finishedAt).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      }),
                    });
                  }
                  setReviewDataRefresh((n) => n + 1);
                  setOverlay('review');
                } else {
                  setHistoryRefreshKey((n) => n + 1);
                  setOverlay(null);
                }
                setEditContext(null);
              })();
            }}
            onClose={() => {
              const ctx = editContext;
              if (ctx.returnTo === 'review') {
                setOverlay('review');
              } else {
                setOverlay(null);
              }
              setEditContext(null);
            }}
          />
        ) : overlay === 'review' ? (
          <ReviewScreen
            sessionId={activeSessionId ?? undefined}
            workoutName={reviewMeta.workoutName}
            workoutDate={reviewMeta.workoutDate}
            dataRefreshKey={reviewDataRefresh}
            onEditWorkout={
              activeSessionId
                ? () => {
                    setEditContext({ sessionId: activeSessionId, returnTo: 'review' });
                    setOverlay('editWorkout');
                  }
                : undefined
            }
            onBack={() => {
              setOverlay(null);
              setTab(reviewBackTab);
              setActiveSessionId(null);
            }}
          />
        ) : (
          <>
            <main className="flex-1 overflow-y-auto pb-24 no-scrollbar">
              {tab === 'today' && (
                <TodayScreen
                  onStartWorkout={(payload) => {
                    setActiveWorkout({
                      workoutName: payload.workoutName,
                      workoutType: payload.workoutType,
                      exerciseTemplate: payload.exerciseTemplate,
                      openExercisePickerOnMount: payload.openExercisePickerOnMount ?? false,
                    });
                    setOverlay('logger');
                  }}
                />
              )}
              {tab === 'progress' && <ProgressScreen />}
              {tab === 'history' && (
                <HistoryScreen
                  refreshKey={historyRefreshKey}
                  onEditWorkout={(sessionId) => {
                    setEditContext({ sessionId, returnTo: 'history' });
                    setOverlay('editWorkout');
                  }}
                  onSelectWorkout={({ sessionId, workoutName, workoutDate }) => {
                    setActiveSessionId(sessionId);
                    setReviewBackTab('history');
                    setReviewMeta({ workoutName, workoutDate });
                    setOverlay('review');
                  }}
                />
              )}
              {tab === 'settings' && (
                <SettingsScreen
                  onOpenImport={() => {
                    setOverlay('import');
                  }}
                />
              )}
            </main>
            <BottomNav active={tab} onChange={setTab} />
          </>
        )}
      </div>
    </div>
  );
}
