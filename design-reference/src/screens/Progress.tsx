/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils';

export default function Progress() {
  return (
    <div className="p-6 space-y-12 animate-in fade-in duration-700 pb-32">
      <header>
        <h1 className="text-4xl font-black tracking-tighter">Progress</h1>
        <p className="text-[#6B7280] font-medium tracking-tight">Performance Analytics</p>
      </header>

      {/* Strength Score Card - Futuristic Glass Panel */}
      <section className="glass rounded-[32px] p-8 relative overflow-hidden border border-white/5 active:scale-[0.98] transition-transform">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">Current Strength Index</h3>
            <div className="bg-[#22C55E]/10 px-2 py-1 rounded-md border border-[#22C55E]/20">
               <span className="text-[10px] font-black text-[#22C55E] uppercase tracking-wider">Top 2%</span>
            </div>
          </div>
          
          <div className="flex items-baseline gap-4">
            <span className="text-7xl font-black tracking-tighter text-glow">842</span>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-[#22C55E] text-xs font-black font-mono">
                <TrendingUp size={14} /> +2.4%
              </span>
              <span className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">since last month</span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3 mt-10">
            {[
              { label: 'PUSH', val: 782, trend: '+4%', up: true },
              { label: 'PULL', val: 912, trend: '+1%', up: true },
              { label: 'LEGS', val: 832, trend: '-2%', up: false }
            ].map(s => (
              <div key={s.label} className="bg-[#050505]/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 transition-all hover:bg-[#050505]/60">
                <span className="text-[9px] font-black text-[#6B7280] block mb-2 tracking-[0.2em]">{s.label}</span>
                <span className="text-lg font-black block tracking-tighter">{s.val}</span>
                <div className={cn("text-[9px] font-black mt-2 flex items-center gap-1 uppercase tracking-tight", s.up ? "text-[#22C55E]" : "text-[#EF4444]")}>
                  {s.up ? <ArrowUpRight size={10} /> : <TrendingDown size={10} />}
                  {s.trend}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Animated Glow behind the index */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#8B5CF6]/5 blur-[80px] rounded-full pointer-events-none" />
      </section>

      {/* Benchmark Lifts - Editorial Typography */}
      <section className="space-y-6">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Benchmark Lifts (Est. 1RM)</h3>
          <button className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-widest underline underline-offset-4">History</button>
        </div>
        <div className="space-y-8">
          {[
            { name: 'Squat', weight: 145, diff: 5 },
            { name: 'Bench Press', weight: 112, diff: 2.5 },
            { name: 'Deadlift', weight: 190, diff: 10 },
            { name: 'Barbell Row', weight: 95, diff: 0 },
            { name: 'Lat Pulldown', weight: 88, diff: 4 }
          ].map(lift => (
            <div key={lift.name} className="group">
              <div className="flex justify-between items-end mb-3">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-[#6B7280] uppercase tracking-[0.2em] mb-1">{lift.name}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tighter transition-all group-hover:text-[#8B5CF6]">{lift.weight}</span>
                    <span className="text-sm font-black text-[#6B7280] uppercase tracking-widest">kg</span>
                  </div>
                </div>
                {lift.diff > 0 && (
                  <div className="flex items-center gap-1.5 bg-[#22C55E]/10 px-2 py-1 rounded-lg border border-[#22C55E]/20 mb-1 animate-bounce">
                    <TrendingUp size={12} className="text-[#22C55E]" />
                    <span className="text-[10px] font-black text-[#22C55E]">+{lift.diff}kg</span>
                  </div>
                )}
              </div>
              <div className="h-1.5 w-full bg-[#111111] rounded-full overflow-hidden border border-white/5 p-[1px]">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (lift.weight / 200) * 100)}%` }}
                  transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full bg-gradient-to-r from-[#8B5CF6]/40 to-[#8B5CF6] rounded-full shadow-glow" 
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Volume - Grid Style */}
      <section className="space-y-6 pt-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280] px-2 text-center">Weekly Saturation</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { group: 'CHEST', count: 12, target: 16 },
            { group: 'BACK', count: 18, target: 20 },
            { group: 'SHOULDERS', count: 10, target: 12 },
            { group: 'LEGS', count: 22, target: 16 },
          ].map(v => (
            <div key={v.group} className="bg-[#111111] border border-[#222222] rounded-3xl p-5 relative overflow-hidden">
              <div className="relative z-10 flex flex-col items-center">
                 <span className="text-[9px] font-black text-[#6B7280] tracking-widest mb-2">{v.group}</span>
                 <span className="text-2xl font-black tracking-tight">{Math.round((v.count / v.target) * 100)}%</span>
                 <span className="text-[9px] font-bold text-[#6B7280] uppercase mt-1">{v.count} / {v.target} Sets</span>
              </div>
              <div className="absolute inset-0 z-0">
                 <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.min(100, (v.count / v.target) * 100)}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className={cn(
                      "absolute bottom-0 left-0 right-0 opacity-20",
                      v.count > v.target ? "bg-[#8B5CF6]" : "bg-[#6B7280]"
                    )}
                 />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
