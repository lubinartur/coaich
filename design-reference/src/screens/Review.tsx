/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Trophy, Sparkles, CheckCircle2, AlertCircle, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Workout } from '../types';
import { generateWorkoutReview } from '../services/geminiService';
import { db } from '../db';
import { formatDuration } from '../utils';

interface Props {
  workout: Workout;
  onBack: () => void;
  onEdit: () => void;
}

export default function Review({ workout, onBack, onEdit }: Props) {
  const [report, setReport] = useState<Workout['aiReport'] | null>(workout.aiReport || null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workout.aiReport) {
      async function getReview() {
        const aiReport = await generateWorkoutReview(workout);
        setReport(aiReport);
        const finalWorkout = { ...workout, aiReport };
        await db.workouts.add(finalWorkout);
      }
      getReview();
    }
  }, [workout]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="min-h-screen pb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 bg-[#050505]">
      <header className="p-6 pb-6 sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-10 border-b border-white/5">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <button onClick={onEdit} className="text-[#8B5CF6] text-[10px] font-black uppercase tracking-widest bg-[#8B5CF6]/10 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/20 shadow-glow">
            Alter Session
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
            <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">{new Date(workout.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-glow uppercase">{workout.name}</h1>
        </div>
      </header>

      <div className="p-6 space-y-12">
        {/* Stats Grid - Brutalist Hardware Style */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'GROSS VOLUME', value: `${(workout.volume / 1000).toFixed(1)}t`, unit: 'metric' },
            { label: 'SEQUENCE COUNT', value: workout.sets, unit: 'sets' },
            { label: 'TACTICAL NODES', value: workout.exercises.length, unit: 'ex' },
            { label: 'ACTIVE TIME', value: formatDuration(workout.duration).split(' ')[0], unit: 'min' }
          ].map(stat => (
            <div key={stat.label} className="bg-[#111111] border border-[#222222] rounded-[24px] p-6 shadow-glass relative overflow-hidden group hover:border-[#333333] transition-colors">
              <span className="text-[9px] font-black text-[#6B7280] tracking-[0.15em] relative z-10">{stat.label}</span>
              <div className="flex items-baseline gap-1 mt-2 relative z-10">
                <div className="text-3xl font-black tracking-tighter group-hover:text-[#8B5CF6] transition-colors">{stat.value}</div>
                <div className="text-[9px] font-black text-[#333333] uppercase">{stat.unit}</div>
              </div>
              <div className="absolute -right-4 -bottom-4 bg-white/[0.02] w-16 h-16 rounded-full group-hover:scale-150 transition-transform duration-700" />
            </div>
          ))}
        </div>

        {/* PRs Section - High Alert Status */}
        <section className="glass-accent rounded-[32px] p-8 border border-[#F59E0B]/20 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-[#F59E0B] p-1.5 rounded-lg shadow-lg shadow-[#F59E0B]/20">
              <Trophy size={16} className="text-black" fill="currentColor" />
            </div>
            <h3 className="text-white font-black text-[11px] tracking-[0.2em] uppercase">Threshold Breaks</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
               <div className="text-3xl font-black text-[#F59E0B] tabular-nums">01</div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest">Bench Press</span>
                 <span className="text-lg font-bold tracking-tight">102.5kg × 8 <span className="text-[#F59E0B]">(New PR)</span></span>
               </div>
            </div>
            <div className="w-full h-[1px] bg-[#F59E0B]/10" />
            <div className="flex items-start gap-4">
               <div className="text-3xl font-black text-[#F59E0B] tabular-nums">02</div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest">Incline Press</span>
                 <span className="text-lg font-bold tracking-tight">85kg × 10 <span className="text-[#F59E0B]">(New PR)</span></span>
               </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Sparkles size={80} className="text-[#F59E0B]" />
          </div>
        </section>

        {/* AI Coach Report - Sophisticated Editorial */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black text-xs shadow-xl shadow-white/10">AI</div>
            <div>
               <h3 className="text-2xl font-black tracking-tighter uppercase">Coach Analysis</h3>
               <p className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest">Post-Session Intelligence</p>
            </div>
          </div>

          {!report ? (
             <div className="space-y-4 px-2">
               <div className="h-2 bg-[#111111] rounded-full w-full animate-pulse" />
               <div className="h-2 bg-[#111111] rounded-full w-[90%] animate-pulse" />
               <div className="h-2 bg-[#111111] rounded-full w-[80%] animate-pulse" />
             </div>
          ) : (
            <div className="space-y-10 px-2">
              <p className="text-xl font-medium italic leading-tight text-white/90 tracking-tight">{report.intro}</p>
              
              <div className="grid grid-cols-1 gap-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[#22C55E] text-[10px] font-black uppercase tracking-[0.2em]">
                    <CheckCircle2 size={12} strokeWidth={3} /> Success Signals
                  </div>
                  <div className="space-y-3">
                    {report.whatWentWell.map((p, i) => (
                      <div key={i} className="flex gap-4 group">
                        <span className="text-[#22C55E] font-black font-mono mt-1 opacity-40 group-hover:opacity-100 transition-opacity">0{i+1}</span>
                        <p className="text-base text-[#AAAAAA] leading-snug">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[#F59E0B] text-[10px] font-black uppercase tracking-[0.2em]">
                    <AlertCircle size={12} strokeWidth={3} /> Refinement Nodes
                  </div>
                  <div className="space-y-3">
                    {report.whatToImprove.map((p, i) => (
                      <div key={i} className="flex gap-4 group">
                        <span className="text-[#F59E0B] font-black font-mono mt-1 opacity-40 group-hover:opacity-100 transition-opacity">0{i+1}</span>
                        <p className="text-base text-[#AAAAAA] leading-snug">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[#111111] border border-[#222222] rounded-[32px] p-6 space-y-6">
                <div className="flex items-center gap-2 text-[#8B5CF6] text-[10px] font-black uppercase tracking-[0.2em]">
                  <TrendingUp size={12} strokeWidth={3} /> Next Session Trajectories
                </div>
                <div className="space-y-4">
                  {report.nextTargets.map((t, i) => (
                    <div key={i} className="flex justify-between items-center group">
                      <span className="text-white text-lg font-black tracking-tight uppercase group-hover:text-[#8B5CF6] transition-colors">{t.exercise}</span>
                      <div className="bg-[#222222] px-3 py-1 rounded-full border border-white/5">
                         <span className="text-[11px] font-black text-[#8B5CF6] tracking-tighter">{t.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Exercise Log - Detailed view */}
        <section className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280] px-2 text-center">Full Transmission Log</h3>
          <div className="space-y-4">
            {workout.exercises.map(ex => (
              <div key={ex.id} className="bg-[#111111] border border-[#222222] rounded-[32px] overflow-hidden">
                <button 
                  onClick={() => toggleExpand(ex.id)}
                  className="w-full text-left p-6 flex justify-between items-center group hover:bg-[#181818] transition-colors"
                >
                  <div>
                    <div className="font-black text-xl tracking-tight uppercase group-hover:text-[#8B5CF6] transition-colors">{ex.name}</div>
                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-[0.2em] mt-1">
                       {ex.sets.filter(s => s.completed).length} SEQUENCES • {(ex.sets.reduce((a, b) => a + b.weight * b.reps, 0) / 1000).toFixed(1)}t MASS
                    </div>
                  </div>
                  <div className="p-2 bg-[#222222] rounded-full group-hover:bg-[#8B5CF6]/20 group-hover:text-[#8B5CF6] transition-all">
                    {expanded.includes(ex.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                <AnimatePresence>
                  {expanded.includes(ex.id) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-6 overflow-hidden"
                    >
                      <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="grid grid-cols-3 gap-2 opacity-30 text-[8px] font-black uppercase tracking-[0.3em] mb-2 px-2">
                           <span>Sequence</span>
                           <span className="text-center">Load</span>
                           <span className="text-right">Freq</span>
                        </div>
                        {ex.sets.filter(s => s.completed).map((s, idx) => (
                          <div key={s.id} className="grid grid-cols-3 gap-2 items-center px-2">
                            <span className="text-[10px] font-black text-[#6B7280]">LOG-{idx+1}</span>
                            <div className="text-center">
                               <span className="text-xl font-black tracking-tighter tabular-nums">{s.weight}</span>
                               <span className="text-[9px] text-[#333333] ml-1 uppercase">kg</span>
                            </div>
                            <div className="text-right">
                               <span className="text-xl font-black tracking-tighter tabular-nums text-[#8B5CF6]">{s.reps}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="p-6 fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
        <button 
          onClick={onBack}
          className="w-full bg-white text-black font-black py-5 rounded-2xl transition-all active:scale-95 shadow-2xl pointer-events-auto uppercase tracking-widest text-sm shadow-white/20"
        >
          Archive Session
        </button>
      </div>
    </div>
  );
}
