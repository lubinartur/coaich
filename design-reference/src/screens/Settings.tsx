/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, Globe, Sliders, Shield, Download, ChevronRight } from 'lucide-react';
import { db } from '../db';
import { UserProfile } from '../types';

interface Props {
  onOpenImport: () => void;
}

export default function Settings({ onOpenImport }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function load() {
      const p = await db.profile.toArray();
      if (p.length > 0) setProfile(p[0]);
    }
    load();
  }, []);

  if (!profile) return null;

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 pb-24">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      <div className="space-y-6">
        {/* General */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#6B7280] text-[10px] font-bold uppercase tracking-widest pl-2">
            <Globe size={12} /> GENERAL
          </div>
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl overflow-hidden">
            <button className="w-full p-4 flex justify-between items-center text-left border-b border-[#2A2A2A]">
               <span className="text-sm">Language</span>
               <span className="text-sm font-bold text-[#8B5CF6]">ENGLISH</span>
            </button>
            <button className="w-full p-4 flex justify-between items-center text-left">
               <span className="text-sm">Units</span>
               <span className="text-sm font-bold text-[#8B5CF6]">METRIC (kg)</span>
            </button>
          </div>
        </section>

        {/* Profile */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#6B7280] text-[10px] font-bold uppercase tracking-widest pl-2">
            <User size={12} /> PROFILE
          </div>
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2">
               <button className="p-4 border-b border-r border-[#2A2A2A] text-left">
                  <span className="text-[10px] text-[#6B7280] block font-bold">GENDER</span>
                  <span className="text-sm font-bold">{profile.gender}</span>
               </button>
               <button className="p-4 border-b border-[#2A2A2A] text-left">
                  <span className="text-[10px] text-[#6B7280] block font-bold">AGE</span>
                  <span className="text-sm font-bold">{profile.age}</span>
               </button>
               <button className="p-4 border-r border-[#2A2A2A] text-left">
                  <span className="text-[10px] text-[#6B7280] block font-bold">WEIGHT</span>
                  <span className="text-sm font-bold">{profile.weight}kg</span>
               </button>
               <button className="p-4 text-left">
                  <span className="text-[10px] text-[#6B7280] block font-bold">HEIGHT</span>
                  <span className="text-sm font-bold">{profile.height}cm</span>
               </button>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#6B7280] text-[10px] font-bold uppercase tracking-widest pl-2">
            <Sliders size={12} /> PREFERENCES
          </div>
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl overflow-hidden">
             {[
               { label: 'Goal', val: profile.goal.toUpperCase() },
               { label: 'Experience', val: profile.experience.toUpperCase() },
               { label: 'Rest Timer', val: '90s' }
             ].map((pref, i) => (
               <button key={pref.label} className={i < 2 ? "w-full p-4 flex justify-between items-center text-left border-b border-[#2A2A2A]" : "w-full p-4 flex justify-between items-center text-left"}>
                  <span className="text-sm">{pref.label}</span>
                  <span className="text-sm font-bold text-[#8B5CF6]">{pref.val}</span>
               </button>
             ))}
          </div>
        </section>

        {/* Advanced */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#6B7280] text-[10px] font-bold uppercase tracking-widest pl-2">
            <Shield size={12} /> ADVANCED
          </div>
          <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-2xl overflow-hidden">
             <button className="w-full p-4 flex justify-between items-center text-left border-b border-[#2A2A2A]">
                <span className="text-sm">Pharmacology</span>
                <span className={profile.trainingStatus === 'ON_CYCLE' ? "text-sm font-bold text-[#EF4444]" : "text-sm font-bold text-[#22C55E]"}>
                  {profile.trainingStatus}
                </span>
             </button>
             <button 
               onClick={onOpenImport}
               className="w-full p-4 flex justify-between items-center text-left group"
             >
                <div className="flex items-center gap-3">
                   <Download size={16} className="text-[#6B7280]" />
                   <span className="text-sm">Import Past Workouts</span>
                </div>
                <ChevronRight size={18} className="text-[#2A2A2A] group-hover:text-[#8B5CF6] transition-colors" />
             </button>
          </div>
        </section>
      </div>
    </div>
  );
}
