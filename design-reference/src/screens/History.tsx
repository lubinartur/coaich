/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ChevronRight, Calendar, Tag } from 'lucide-react';
import { db } from '../db';
import { Workout } from '../types';

interface Props {
  onViewWorkout: (id: string) => void;
}

export default function History({ onViewWorkout }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    async function loadWorkouts() {
      const data = await db.workouts.orderBy('date').reverse().toArray();
      setWorkouts(data);
    }
    loadWorkouts();
  }, []);

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 pb-24">
      <header>
        <h1 className="text-3xl font-bold">History</h1>
      </header>

      <div className="space-y-4">
        {workouts.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280] space-y-4">
            <div className="bg-[#1C1C1C] w-16 h-16 rounded-full flex items-center justify-center mx-auto text-[#2A2A2A]">
                 <Calendar size={32} />
            </div>
            <p>No workouts recorded yet.</p>
          </div>
        ) : (
          workouts.map(w => (
            <button 
              key={w.id}
              onClick={() => onViewWorkout(w.id!)}
              className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl p-5 text-left active:scale-[0.98] transition-all flex justify-between items-center group"
            >
              <div className="space-y-2">
                <div className="font-bold text-lg">{w.name}</div>
                <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                  <span className="tabular-nums">{new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>•</span>
                  <span>{Math.floor(w.duration / 60)} min</span>
                  <span>•</span>
                  <span>{(w.volume / 1000).toFixed(1)}t vol</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                   {/* Extract unique muscle categories from exercises */}
                   {Array.from(new Set(w.exercises.map(ex => ex.name.split(' ')[0]))).slice(0, 3).map(tag => (
                     <span key={tag} className="text-[10px] font-bold text-[#8B5CF6] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#8B5CF6]/10">
                        {tag}
                     </span>
                   ))}
                </div>
              </div>
              <ChevronRight size={20} className="text-[#2A2A2A] group-hover:text-[#8B5CF6] transition-colors" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
