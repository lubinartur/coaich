/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trash2, Plus, ArrowRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Workout, ExerciseLog, SetEntry, TargetStatus } from '../types';
import { STATUS_COLORS, EXERCISES } from '../constants';
import { cn, formatDuration } from '../utils';

interface Props {
  workout: Workout;
  onCancel: () => void;
  onFinish: (workout: Workout) => void;
}

export default function Logger({ workout, onCancel, onFinish }: Props) {
  const [activeWorkout, setActiveWorkout] = useState<Workout>({ ...workout, date: Date.now() });
  const [elapsed, setElapsed] = useState(0);
  const [restTime, setRestTime] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const restTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current!);
  }, []);

  useEffect(() => {
    if (restTime !== null) {
      if (restTime <= 0) {
        setRestTime(null);
        return;
      }
      restTimerRef.current = setTimeout(() => setRestTime(restTime - 1), 1000);
    }
    return () => clearTimeout(restTimerRef.current!);
  }, [restTime]);

  const handleUpdateSet = (exerciseId: string, setId: string, updates: Partial<SetEntry>) => {
    const newExercises = activeWorkout.exercises.map(ex => {
      if (ex.id === exerciseId) {
        const newSets = ex.sets.map(s => {
          if (s.id === setId) {
            const updatedSet = { ...s, ...updates };
            if (updates.completed && !s.completed) {
              setRestTime(90); // 1:30 default rest
            }
            return updatedSet;
          }
          return s;
        });
        return { ...ex, sets: newSets };
      }
      return ex;
    });
    setActiveWorkout({ ...activeWorkout, exercises: newExercises });
  };

  const handleAddSet = (exerciseId: string) => {
    const newExercises = activeWorkout.exercises.map(ex => {
      if (ex.id === exerciseId) {
        const lastSet = ex.sets[ex.sets.length - 1];
        const newSet: SetEntry = {
          id: Math.random().toString(36).substr(2, 9),
          weight: lastSet?.weight || 0,
          reps: lastSet?.reps || 0,
          completed: false
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      }
      return ex;
    });
    setActiveWorkout({ ...activeWorkout, exercises: newExercises });
  };

  const handleDeleteExercise = (exerciseId: string) => {
    setActiveWorkout({
      ...activeWorkout,
      exercises: activeWorkout.exercises.filter(ex => ex.id !== exerciseId)
    });
  };

  const handleAddExercise = (defId: string) => {
    const def = EXERCISES.find(e => e.id === defId)!;
    const newEx: ExerciseLog = {
      id: Math.random().toString(36).substr(2, 9),
      exerciseId: defId,
      name: def.name,
      status: TargetStatus.BASE,
      statusText: 'Baseline',
      sets: [
        { id: '1', weight: 0, reps: 0, completed: false }
      ]
    };
    setActiveWorkout({
      ...activeWorkout,
      exercises: [...activeWorkout.exercises, newEx]
    });
    setShowPicker(false);
  };

  const handleFinish = () => {
    onFinish({
      ...activeWorkout,
      duration: elapsed,
      volume: activeWorkout.exercises.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + (s.completed ? s.weight * s.reps : 0), 0), 0),
      sets: activeWorkout.exercises.reduce((acc, ex) => acc + ex.sets.filter(s => s.completed).length, 0)
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col pt-4">
      {/* Header */}
      <header className="px-6 pb-4 border-b border-[#2A2A2A] sticky top-0 bg-[#0A0A0A] z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { if (confirm("End workout? Progress will be lost.")) onCancel(); }} className="p-1 -ml-1">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="font-bold text-lg">{activeWorkout.name}</h1>
            <p className="text-[#8B5CF6] text-sm tabular-nums font-mono font-medium">{formatDuration(elapsed)}</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-8 space-y-10 overflow-y-auto no-scrollbar">
        {activeWorkout.exercises.map((ex) => (
          <section key={ex.id} className="space-y-6">
            <div className="flex justify-between items-end border-b border-[#222222] pb-4">
              <div>
                <h3 className="font-black text-2xl tracking-tighter uppercase">{ex.name}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#222222] border border-[#333333]">
                     <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: STATUS_COLORS[ex.status] }} />
                     <span className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">{ex.status}</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold" style={{ color: STATUS_COLORS[ex.status] }}>{ex.statusText}</span>
                </div>
              </div>
              <button onClick={() => handleDeleteExercise(ex.id)} className="text-[#333333] hover:text-[#EF4444] p-1 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {ex.sets.map((set, idx) => (
                <motion.div 
                  layout
                  key={set.id} 
                  className={cn(
                    "grid grid-cols-[40px_1fr_20px_1fr_50px] items-center gap-4 p-2 rounded-2xl transition-all",
                    set.completed ? "bg-[#22C55E]/5 border border-[#22C55E]/10" : "bg-transparent"
                  )}
                >
                  <div className="text-center">
                    <span className="text-[10px] font-black text-[#6B7280] block">SET</span>
                    <span className="text-sm font-black tabular-nums">{idx + 1}</span>
                  </div>
                  
                  <div className="relative group">
                    <input 
                      type="number" 
                      className="bg-[#111111] border border-[#222222] w-full py-4 text-center outline-none font-black tabular-nums rounded-xl focus:border-[#8B5CF6] focus:ring-4 ring-[#8B5CF6]/10 transition-all text-lg" 
                      value={set.weight || ''} 
                      onFocus={e => e.target.select()}
                      onChange={e => handleUpdateSet(ex.id, set.id, { weight: Number(e.target.value) })}
                      placeholder="0"
                    />
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-[#333333] uppercase">Weight</span>
                  </div>

                  <span className="text-[#333333] text-center font-black">×</span>

                  <div className="relative group">
                    <input 
                      type="number" 
                      className="bg-[#111111] border border-[#222222] w-full py-4 text-center outline-none font-black tabular-nums rounded-xl focus:border-[#8B5CF6] focus:ring-4 ring-[#8B5CF6]/10 transition-all text-lg" 
                      value={set.reps || ''} 
                      onFocus={e => e.target.select()}
                      onChange={e => handleUpdateSet(ex.id, set.id, { reps: Number(e.target.value) })}
                      placeholder="0"
                    />
                     <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-[#333333] uppercase">Reps</span>
                  </div>

                  <button 
                    onClick={() => handleUpdateSet(ex.id, set.id, { completed: !set.completed })}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all border shadow-lg",
                      set.completed ? "bg-[#22C55E] border-[#22C55E] shadow-[#22C55E]/20" : "bg-[#111111] border-[#222222] text-[#333333] hover:border-[#8B5CF6]"
                    )}
                  >
                    <Check size={24} strokeWidth={4} className={set.completed ? "text-white" : "opacity-20"} />
                  </button>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button 
                onClick={() => handleAddSet(ex.id)}
                className="flex-1 py-3.5 rounded-xl bg-[#111111] border border-[#222222] text-[10px] font-black text-[#6B7280] flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#181818] uppercase tracking-widest"
              >
                <Plus size={14} /> Add Sequence
              </button>
            </div>
          </section>
        ))}

        <div className="h-40" /> {/* Spacer */}
      </div>

      {/* Rest Timer Overlay */}
      <AnimatePresence>
        {restTime !== null && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
          >
            <div className={cn(
              "bg-[#1C1C1C] border border-[#2A2A2A] px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl transition-all",
              restTime <= 0 && "bg-[#8B5CF6] animate-pulse"
            )}>
              <span className="text-sm font-bold tabular-nums w-20">Rest {Math.floor(restTime / 60)}:{(restTime % 60).toString().padStart(2, '0')}</span>
              <div className="h-4 w-[1px] bg-[#2A2A2A]" />
              <button onClick={() => setRestTime(null)} className="text-xs font-bold text-[#8B5CF6] uppercase">Skip</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#141414] border-t border-[#2A2A2A] p-4 flex gap-3 max-w-[390px] mx-auto z-30">
        <button 
          onClick={() => setShowPicker(true)}
          className="flex-1 bg-[#1C1C1C] border border-[#2A2A2A] py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
        >
          <Plus size={18} /> Add Exercise
        </button>
        <button 
          onClick={handleFinish}
          className="bg-[#8B5CF6] px-8 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-[#8B5CF6]/20"
        >
          Finish <ArrowRight size={18} />
        </button>
      </footer>

      {/* Picker Modal */}
      <AnimatePresence>
        {showPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPicker(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#141414] w-full max-w-[390px] rounded-t-3xl border-t border-[#2A2A2A] z-10 max-h-[85vh] flex flex-col p-6 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Add Exercise</h2>
                <button onClick={() => setShowPicker(false)} className="text-[#6B7280]">✕</button>
              </div>
              
              <input 
                type="text" 
                placeholder="Search exercises..." 
                className="bg-[#1C1C1C] border border-[#2A2A2A] w-full p-4 rounded-xl outline-none focus:border-[#8B5CF6]"
              />

              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-6 px-6">
                {['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core'].map(f => (
                  <button key={f} className={cn("px-4 py-2 rounded-full border text-xs font-bold h-fit", f === 'All' ? "bg-[#8B5CF6] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A] text-[#6B7280]")}>
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 -mx-6 px-6">
                {EXERCISES.map(ex => (
                  <button 
                    key={ex.id}
                    onClick={() => handleAddExercise(ex.id)}
                    className="w-full text-left p-4 rounded-xl bg-[#1C1C1C] border border-[#2A2A2A] flex justify-between items-center active:bg-[#2A2A2A]"
                  >
                    <div>
                      <div className="font-bold">{ex.name}</div>
                      <div className="text-[10px] text-[#6B7280] uppercase tracking-widest mt-1">{ex.muscle}</div>
                    </div>
                    <Plus size={18} className="text-[#8B5CF6]" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
