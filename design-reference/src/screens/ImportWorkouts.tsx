/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { WORKOUT_TEMPLATES, EXERCISES } from '../constants';
import { db } from '../db';
import { Workout, ExerciseLog } from '../types';
import { cn } from '../utils';

interface Props {
  onBack: () => void;
}

export default function ImportWorkouts({ onBack }: Props) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [template, setTemplate] = useState(WORKOUT_TEMPLATES[0]);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [imported, setImported] = useState<Workout[]>([]);

  const handleApplyTemplate = (t: typeof WORKOUT_TEMPLATES[0]) => {
    setTemplate(t);
    const newExs: ExerciseLog[] = t.exercises.map(id => {
      const def = EXERCISES.find(e => e.id === id)!;
      return {
        id: Math.random().toString(36).substr(2, 9),
        exerciseId: id,
        name: def.name,
        status: 'BASE' as any,
        statusText: 'Baseline',
        sets: [{ id: '1', weight: 0, reps: 0, completed: true }]
      };
    });
    setExercises(newExs);
  };

  const handleAddSet = (exId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id === exId) {
        return {
          ...ex,
          sets: [...ex.sets, { id: Math.random().toString(36).substr(2, 9), weight: 0, reps: 0, completed: true }]
        };
      }
      return ex;
    }));
  };

  const handleUpdateSet = (exId: string, setId: string, field: 'weight' | 'reps', val: number) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id === exId) {
        return {
          ...ex,
          sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: val } : s)
        };
      }
      return ex;
    }));
  };

  const handleSave = async () => {
    const w: Workout = {
      id: Math.random().toString(36).substr(2, 9),
      name: template.name,
      type: template.name,
      date: new Date(date).getTime(),
      duration: 3600, // mock
      volume: exercises.reduce((acc, ex) => acc + ex.sets.reduce((sa, s) => sa + s.weight * s.reps, 0), 0),
      sets: exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
      exercises
    };
    await db.workouts.add(w);
    setImported([w, ...imported]);
    setExercises([]);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <header className="p-6 border-b border-[#2A2A2A] sticky top-0 bg-[#0A0A0A] z-10">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="p-1 -ml-1">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Import Past Workouts</h1>
        </div>
        <p className="text-xs text-[#6B7280]">Add your training history to calibrate AI.</p>
      </header>

      <div className="p-6 space-y-8">
        {/* Date Picker */}
        <div>
          <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest block mb-3 pl-2">When was this workout?</label>
          <div className="relative">
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 pl-12 outline-none focus:border-[#8B5CF6]" 
            />
            <CalendarIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          </div>
        </div>

        {/* Templates */}
        <div>
           <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest block mb-3 pl-2">Program Type</label>
           <div className="grid grid-cols-2 gap-3">
             {WORKOUT_TEMPLATES.map(t => (
               <button 
                 key={t.name}
                 onClick={() => handleApplyTemplate(t)}
                 className={cn(
                   "p-4 rounded-xl border text-left transition-all",
                   template.name === t.name ? "bg-[#1C1C1C] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                 )}
               >
                 <span className="text-lg block mb-1">{t.emoji}</span>
                 <span className="font-bold text-sm block">{t.name}</span>
               </button>
             ))}
           </div>
        </div>

        {/* Exercise List */}
        {exercises.length > 0 && (
          <div className="space-y-6">
            <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest block mb-3 pl-2">Exericse & Sets</label>
            {exercises.map(ex => (
              <div key={ex.id} className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl p-4 space-y-4">
                 <div className="flex justify-between items-center">
                    <span className="font-bold">{ex.name}</span>
                    <button className="text-[10px] font-bold text-[#22C55E] uppercase tracking-wider bg-[#22C55E]/10 px-2 py-1 rounded">INCLUDED</button>
                 </div>
                 <div className="space-y-2">
                    {ex.sets.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-[#6B7280] w-12">SET {i+1}</span>
                        <input 
                          type="number" 
                          placeholder="kg"
                          value={s.weight || ''}
                          onChange={e => handleUpdateSet(ex.id, s.id, 'weight', Number(e.target.value))}
                          className="flex-1 bg-[#141414] border border-[#2A2A2A] p-2 rounded-lg text-center outline-none focus:border-[#8B5CF6]" 
                        />
                        <span className="text-[#6B7280]">×</span>
                        <input 
                          type="number" 
                          placeholder="reps"
                          value={s.reps || ''}
                          onChange={e => handleUpdateSet(ex.id, s.id, 'reps', Number(e.target.value))}
                          className="flex-1 bg-[#141414] border border-[#2A2A2A] p-2 rounded-lg text-center outline-none focus:border-[#8B5CF6]" 
                        />
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddSet(ex.id)}
                      className="w-full py-2 text-[10px] font-bold text-[#6B7280] uppercase tracking-widest"
                    >
                      + ADD SET
                    </button>
                 </div>
              </div>
            ))}
            
            <button className="w-full bg-[#1C1C1C] border border-[#2A2A2A] py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm text-[#6B7280]">
               <Plus size={18} /> Add Exercise
            </button>
            
            <button 
              onClick={handleSave}
              className="w-full bg-[#8B5CF6] py-5 rounded-xl font-bold shadow-xl shadow-[#8B5CF6]/20"
            >
              Save Workout
            </button>
          </div>
        )}

        {/* Imported List */}
        {imported.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-[#2A2A2A]">
             <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest block mb-1 pl-2">Recently Imported</label>
             {imported.map(w => (
               <div key={w.id} className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <div className="font-bold">{w.name}</div>
                    <div className="text-xs text-[#6B7280]">{new Date(w.date).toLocaleDateString()} • {w.exercises.length} exercises</div>
                  </div>
                  <button className="text-[#EF4444] p-2">
                    <Trash2 size={18} />
                  </button>
               </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
}
