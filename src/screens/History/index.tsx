import { useEffect, useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { db } from '@/services/db';
import type { WorkoutSession } from '@/types';
import { toDisplayName } from '@/utils/toDisplayName';

export type HistoryWorkoutPick = {
  sessionId: string;
  workoutName: string;
  workoutDate: string;
};

export interface HistoryScreenProps {
  onSelectWorkout: (workout: HistoryWorkoutPick) => void;
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

export default function HistoryScreen({ onSelectWorkout, refreshKey = 0 }: HistoryScreenProps) {
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
            <div
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
              className="cursor-pointer rounded-[24px] border border-[#222222] bg-[#111111] p-4 transition-colors hover:border-[#333333] active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black tracking-tight text-white">
                    {toDisplayName(w.workoutName)}
                  </h2>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[#6B7280]">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{w.workoutDate}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#6B7280]">
                    {w.duration}
                    <span className="mx-1.5">•</span>
                    {formatKg(w.volumeKg)} kg
                    <span className="mx-1.5">•</span>
                    {w.sets} sets
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {w.muscles.map((m) => (
                      <span
                        key={m}
                        className="rounded-md bg-[#222222] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#6B7280]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-[#6B7280]" aria-hidden />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
