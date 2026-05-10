import { useEffect, useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { db } from '@/services/db';
import type { WorkoutSession } from '@/types';

export type HistoryWorkoutPick = {
  sessionId: string;
  workoutName: string;
  workoutDate: string;
};

export interface HistoryScreenProps {
  onSelectWorkout: (workout: HistoryWorkoutPick) => void;
  onEditWorkout?: (sessionId: string) => void;
  /** Increment to refetch sessions after external edits. */
  refreshKey?: number;
}

function formatKg(n: number): string {
  return n.toLocaleString('en-GB');
}

function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min.toString().padStart(2, '0')}m`;
  return `${min}m`;
}

function formatWorkoutDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function sessionToRow(s: WorkoutSession) {
  const sets = s.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const muscles = [...new Set(s.exercises.map((e) => e.muscleGroup.toUpperCase()))];
  return {
    id: s.id,
    workoutName: s.name,
    workoutDate: formatWorkoutDate(s.finishedAt),
    duration: formatDurationMinutes(s.durationMinutes),
    volumeKg: s.totalVolume,
    sets,
    muscles,
  };
}

export default function HistoryScreen({ onSelectWorkout, onEditWorkout, refreshKey = 0 }: HistoryScreenProps) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const list = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
      if (!cancelled) {
        setSessions(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">History</h1>
        </header>
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">History</h1>
        </header>
        <Card className="border-border py-10 text-center">
          <p className="text-sm text-text-secondary">No workouts yet. Start your first workout!</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">History</h1>
      </header>

      <div className="flex flex-col gap-3">
        {sessions.map((s) => {
          const w = sessionToRow(s);
          return (
            <Card
              key={w.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                onSelectWorkout({
                  sessionId: s.id,
                  workoutName: w.workoutName,
                  workoutDate: w.workoutDate,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectWorkout({
                    sessionId: s.id,
                    workoutName: w.workoutName,
                    workoutDate: w.workoutDate,
                  });
                }
              }}
              className="cursor-pointer border-border transition-colors hover:border-accent/40 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold leading-snug text-text-primary">{w.workoutName}</h2>
                  <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{w.workoutDate}</span>
                  </div>
                  <p className="mt-2 text-[11px] font-medium leading-relaxed text-text-secondary">
                    <span aria-hidden>⏱</span> {w.duration}
                    <span className="mx-1.5 text-border">•</span>
                    <span aria-hidden>🏋</span> {formatKg(w.volumeKg)} kg
                    <span className="mx-1.5 text-border">•</span>
                    {w.sets} sets
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {w.muscles.map((m) => (
                      <span key={m}>
                        <Badge variant="secondary">{m}</Badge>
                      </span>
                    ))}
                  </div>
                  {onEditWorkout ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditWorkout(s.id);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
