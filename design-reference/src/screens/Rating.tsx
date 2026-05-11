/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Sparkles, Smile, Meh, Frown } from 'lucide-react';
import { Workout, ExerciseRating } from '../types';
import { cn } from '../utils';

interface Props {
  workout: Workout;
  onGetReview: (workout: Workout) => void;
}

export default function Rating({ workout, onGetReview }: Props) {
  const [exercises, setExercises] = useState(workout.exercises.map(ex => ({ ...ex, rating: ExerciseRating.GOOD as ExerciseRating, note: '' })));
  const [loading, setLoading] = useState(false);

  const handleUpdateRating = (id: string, rating: ExerciseRating) => {
    setExercises(exs => exs.map(ex => ex.id === id ? { ...ex, rating } : ex));
  };

  const handleUpdateNote = (id: string, note: string) => {
    setExercises(exs => exs.map(ex => ex.id === id ? { ...ex, note } : ex));
  };

  const handleSubmit = async () => {
    setLoading(true);
    // Simulate AI Review processing
    setTimeout(() => {
      onGetReview({ ...workout, exercises });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen p-6 flex flex-col pt-12">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold">How did it go?</h1>
        <p className="text-[#6B7280] text-sm">Rate each exercise before your AI review</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-32">
        {exercises.map((ex) => (
          <div key={ex.id} className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl p-4 space-y-4">
            <h3 className="font-bold">{ex.name}</h3>
            <div className="flex gap-2">
              {[
                { type: ExerciseRating.GOOD, label: 'Good', color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/10', border: 'border-[#22C55E]/20', icon: Smile },
                { type: ExerciseRating.OKAY, label: 'Okay', color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10', border: 'border-[#F59E0B]/20', icon: Meh },
                { type: ExerciseRating.BAD, label: 'Bad', color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10', border: 'border-[#EF4444]/20', icon: Frown }
              ].map(r => {
                const isActive = ex.rating === r.type;
                const Icon = r.icon;
                return (
                  <button 
                    key={r.type}
                    onClick={() => handleUpdateRating(ex.id, r.type)}
                    className={cn(
                      "flex-1 py-3 px-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all",
                      isActive ? cn(r.bg, r.border, r.color) : "bg-[#141414] border-[#2A2A2A] text-[#6B7280]"
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{r.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="space-y-2">
              <textarea 
                placeholder="Add a note (e.g. felt light, shoulder tweak)" 
                className="w-full bg-[#141414] border border-[#2A2A2A] rounded-xl p-3 text-sm outline-none focus:border-[#8B5CF6] h-20 resize-none"
                value={ex.note}
                onChange={e => handleUpdateNote(ex.id, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent pointer-events-none max-w-[390px] mx-auto">
        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-[#8B5CF6] text-white py-5 rounded-xl font-bold flex items-center justify-center gap-2 pointer-events-auto shadow-xl shadow-[#8B5CF6]/30 disabled:opacity-50"
        >
          {loading ? "Generating Report..." : (
            <>
              <Sparkles size={20} fill="currentColor" />
              Get AI Review
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
