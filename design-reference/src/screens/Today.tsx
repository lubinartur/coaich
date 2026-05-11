/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Zap, Dumbbell, Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { WORKOUT_TEMPLATES, EXERCISES, STATUS_COLORS } from '../constants';
import { TargetStatus, Workout, ExerciseLog } from '../types';
import { cn } from '../utils';

interface Props {
  onStartWorkout: (workout: Partial<Workout>) => void;
}

export default function Today({ onStartWorkout }: Props) {
  // Mock data for the "Next Workout"
  const nextWorkoutTemplate = WORKOUT_TEMPLATES[1]; // Pull
  const nextWorkoutExercises: ExerciseLog[] = nextWorkoutTemplate.exercises.map(id => {
    const def = EXERCISES.find(e => e.id === id)!;
    return {
      id: Math.random().toString(36).substr(2, 9),
      exerciseId: id,
      name: def.name,
      status: TargetStatus.REC,
      statusText: '↑ Reps',
      sets: [
        { id: '1', weight: 60, reps: 10, completed: false },
        { id: '2', weight: 60, reps: 10, completed: false },
        { id: '3', weight: 60, reps: 10, completed: false }
      ]
    };
  });

  const handleStart = () => {
    onStartWorkout({
      name: nextWorkoutTemplate.name,
      type: nextWorkoutTemplate.name,
      exercises: nextWorkoutExercises,
      date: Date.now()
    });
  };

  return (
    <div className="p-6 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tighter">Today</h1>
          <p className="text-[#6B7280] font-medium tracking-tight">The mission for may 10</p>
        </div>
        <div className="bg-[#8B5CF6]/10 p-3 rounded-2xl border border-[#8B5CF6]/20 shadow-glow">
          <Zap size={24} className="text-[#8B5CF6]" fill="currentColor" />
        </div>
      </header>

      {/* Coach AI Card - Glowing Glass */}
      <section className="glass-accent rounded-3xl p-6 relative overflow-hidden group">
        <div className="flex items-center gap-2 mb-3">
          <div className="bg-[#8B5CF6] p-1 rounded-sm">
            <Sparkles size={10} className="text-white" fill="currentColor" strokeWidth={3} />
          </div>
          <span className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-[0.2em]">CoAIch Intelligence</span>
        </div>
        <p className="text-lg font-medium leading-tight tracking-tight text-white/90">
          Recovery optimal (88%). Execute a high-tension <span className="text-[#8B5CF6] text-glow">Pull Session</span> today to maximize latent growth.
        </p>
        
        {/* Subtle animated background element */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#8B5CF6]/20 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-1000" />
      </section>

      {/* Next Workout Card - Hardware Look */}
      <section className="bg-[#111111] border border-[#222222] rounded-[32px] p-1 overflow-hidden shadow-glass">
        <div className="bg-[#181818] rounded-[31px] p-6 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-[#222222] border border-[#333333] mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" />
                <span className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">Operation: Pull</span>
              </div>
              <h2 className="text-3xl font-black tracking-tighter">Hypertrophy</h2>
              <p className="text-[#6B7280] text-sm font-medium">Back & Biceps • 6 Stages</p>
            </div>
            <div className="w-12 h-12 bg-[#8B5CF6] rounded-2xl flex items-center justify-center shadow-lg shadow-[#8B5CF6]/30">
              <Dumbbell size={24} className="text-white" />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {nextWorkoutExercises.slice(0, 3).map((ex, idx) => (
              <div key={ex.id} className="group cursor-pointer">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-base tracking-tight group-hover:text-[#8B5CF6] transition-colors">{ex.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[ex.status], color: 'white' }}>
                      {ex.status}
                    </span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: STATUS_COLORS[ex.status] }}>{ex.statusText}</span>
                  </div>
                </div>
                <div className="h-[1px] w-full bg-[#222222] group-last:hidden" />
              </div>
            ))}
          </div>

          <button 
            onClick={handleStart}
            className="w-full bg-[#8B5CF6] text-white font-black py-5 rounded-2xl transition-all active:scale-95 shadow-lg shadow-[#8B5CF6]/20 flex items-center justify-center gap-2 group"
          >
            Deploy Workout
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Quick Programs - Bento Style */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Tactical Templates</h3>
          <button className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-widest">See All</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {WORKOUT_TEMPLATES.map((t, idx) => (
            <button 
              key={t.name}
              className={cn(
                "p-5 rounded-[24px] border border-[#222222] flex flex-col items-start gap-4 active:scale-95 transition-all text-left relative overflow-hidden",
                idx === 0 ? "bg-[#181818]" : "bg-[#111111]"
              )}
            >
              <span className="text-2xl bg-[#222222] w-10 h-10 flex items-center justify-center rounded-xl">{t.emoji}</span>
              <div className="relative z-10">
                <span className="font-black text-lg block tracking-tight">{t.name}</span>
                <span className="text-[10px] font-medium text-[#6B7280] block uppercase tracking-wider">{t.subtitle.split(' ')[0]}</span>
              </div>
              <div className="absolute -right-2 -bottom-2 opacity-10 grayscale scale-150 transform rotate-12">
                 <Dumbbell size={60} />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
