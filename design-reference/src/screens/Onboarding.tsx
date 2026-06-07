/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, TrainingStatus } from '../types';
import { db } from '../db';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '../utils';

interface Props {
  onComplete: (profile: UserProfile) => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>({
    gender: '',
    age: 25,
    weight: 80,
    height: 180,
    goal: '',
    experience: '',
    environment: '',
    injuries: [],
    benchmarks: { benchPress: 0, squat: 0, deadlift: 0 },
    trainingStatus: TrainingStatus.NATURAL,
    onboarded: false
  });

  const nextStep = () => setStep(s => Math.min(s + 1, 7));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = async () => {
    const updatedProfile = { ...profile, onboarded: true };
    const p = await db.profile.toArray();
    if (p.length > 0) {
      await db.profile.update(p[0].id!, updatedProfile);
    }
    onComplete(updatedProfile);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold">Basic Info</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                {['Male', 'Female'].map(g => (
                  <button
                    key={g}
                    onClick={() => setProfile({ ...profile, gender: g as any })}
                    className={cn(
                      "flex-1 py-4 rounded-xl border transition-all",
                      profile.gender === g ? "bg-[#8B5CF6] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[#6B7280] text-sm mb-2 block">Age</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={e => setProfile({ ...profile, age: Number(e.target.value) })}
                    className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 focus:border-[#8B5CF6] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[#6B7280] text-sm mb-2 block">Weight (kg)</label>
                  <input
                    type="number"
                    value={profile.weight}
                    onChange={e => setProfile({ ...profile, weight: Number(e.target.value) })}
                    className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 focus:border-[#8B5CF6] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[#6B7280] text-sm mb-2 block">Height (cm)</label>
                  <input
                    type="number"
                    value={profile.height}
                    onChange={e => setProfile({ ...profile, height: Number(e.target.value) })}
                    className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 focus:border-[#8B5CF6] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">What is your goal?</h2>
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'muscle', label: '💪 Muscle', desc: 'Hypertrophy focused' },
                { id: 'strength', label: '🏋 Strength', desc: 'Powerlifting focus' },
                { id: 'loss', label: '🔥 Weight Loss', desc: 'Caloric deficit support' },
                { id: 'health', label: '❤️ Health', desc: 'General fitness' }
              ].map(g => (
                <button
                  key={g.id}
                  onClick={() => setProfile({ ...profile, goal: g.id })}
                  className={cn(
                    "p-6 rounded-2xl border text-left transition-all",
                    profile.goal === g.id ? "bg-[#1C1C1C] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                  )}
                >
                  <div className="font-bold text-lg">{g.label}</div>
                  <div className="text-[#6B7280] text-sm">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Experience Level</h2>
            <div className="grid grid-cols-1 gap-4">
              {['Beginner', 'Intermediate', 'Advanced'].map(e => (
                <button
                  key={e}
                  onClick={() => setProfile({ ...profile, experience: e })}
                  className={cn(
                    "p-6 rounded-2xl border text-left transition-all",
                    profile.experience === e ? "bg-[#1C1C1C] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                  )}
                >
                  <div className="font-bold text-lg">{e}</div>
                </button>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Training Environment</h2>
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'gym', label: '🏢 Gym', desc: 'Full equipment' },
                { id: 'home', label: '🏠 Home', desc: 'Dumbbells and bench' },
                { id: 'bodyweight', label: '🤸 Bodyweight', desc: 'No equipment' }
              ].map(e => (
                <button
                  key={e.id}
                  onClick={() => setProfile({ ...profile, environment: e.id })}
                  className={cn(
                    "p-6 rounded-2xl border text-left transition-all",
                    profile.environment === e.id ? "bg-[#1C1C1C] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                  )}
                >
                  <div className="font-bold text-lg">{e.label}</div>
                  <div className="text-[#6B7280] text-sm">{e.desc}</div>
                </button>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Injuries</h2>
            <div className="flex flex-wrap gap-3">
              {['Knees', 'Lower Back', 'Shoulders', 'Wrists', 'Ankles', 'None'].map(i => (
                <button
                  key={i}
                  onClick={() => {
                    if (i === 'None') {
                      setProfile({ ...profile, injuries: ['None'] });
                    } else {
                      const newInjuries = profile.injuries.includes(i)
                        ? profile.injuries.filter(inj => inj !== i)
                        : [...profile.injuries.filter(inj => inj !== 'None'), i];
                      setProfile({ ...profile, injuries: newInjuries });
                    }
                  }}
                  className={cn(
                    "px-6 py-3 rounded-full border transition-all",
                    profile.injuries.includes(i) ? "bg-[#8B5CF6] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Benchmark Weights (10 reps)</h2>
            <div className="space-y-4">
              {Object.entries({ benchPress: 'Bench Press', squat: 'Squat', deadlift: 'Deadlift' }).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[#6B7280] text-sm mb-2 block">{label} (kg)</label>
                  <input
                    type="number"
                    value={profile.benchmarks[key as keyof typeof profile.benchmarks]}
                    onChange={e => setProfile({
                      ...profile,
                      benchmarks: { ...profile.benchmarks, [key]: Number(e.target.value) }
                    })}
                    className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 focus:border-[#8B5CF6] outline-none"
                  />
                </div>
              ))}
              <button 
                onClick={nextStep}
                className="text-[#8B5CF6] text-sm font-medium pt-2 block"
              >
                Skip Benchmarks
              </button>
            </div>
          </div>
        );
      case 7:
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Training Status</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                {[TrainingStatus.NATURAL, TrainingStatus.ON_CYCLE].map(s => (
                  <button
                    key={s}
                    onClick={() => setProfile({ ...profile, trainingStatus: s })}
                    className={cn(
                      "flex-1 py-4 rounded-xl border transition-all",
                      profile.trainingStatus === s ? "bg-[#8B5CF6] border-[#8B5CF6]" : "bg-[#1C1C1C] border-[#2A2A2A]"
                    )}
                  >
                    {s === TrainingStatus.NATURAL ? 'Natural' : 'On Cycle'}
                  </button>
                ))}
              </div>
              {profile.trainingStatus === TrainingStatus.ON_CYCLE && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div>
                    <label className="text-[#6B7280] text-sm mb-2 block">Main Compound</label>
                    <input
                      type="text"
                      placeholder="e.g. Test E 250mg"
                      value={profile.cycleInfo?.compound || ''}
                      onChange={e => setProfile({ 
                        ...profile, 
                        cycleInfo: { 
                          compound: e.target.value, 
                          startDate: profile.cycleInfo?.startDate || new Date().toISOString() 
                        } 
                      })}
                      className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-xl p-4 focus:border-[#8B5CF6] outline-none"
                    />
                  </div>
                </div>
              )}
              <div className="bg-[#1C1C1C]/50 p-4 rounded-xl border border-[#2A2A2A] text-xs text-[#6B7280]">
                Stored locally only, never shared. Used to adjust recovery recommendations.
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen p-8 flex flex-col">
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map(s => (
          <div 
            key={s} 
            className={cn(
              "h-1.5 flex-1 rounded-full bg-[#2A2A2A] transition-all overflow-hidden",
              s <= step && "bg-[#8B5CF6]"
            )}
          />
        ))}
      </div>
      <div className="text-xs text-[#6B7280] mb-2">Step {step} of 7</div>
      
      <div className="flex-1">
        {renderStep()}
      </div>

      <div className="flex gap-4 pt-8">
        {step > 1 && (
          <button 
            onClick={prevStep}
            className="p-4 rounded-xl border border-[#2A2A2A] text-[#6B7280]"
          >
            <ChevronLeft />
          </button>
        )}
        <button
          onClick={step === 7 ? handleComplete : nextStep}
          className="flex-1 bg-[#8B5CF6] py-5 rounded-xl font-bold flex items-center justify-center gap-2"
        >
          {step === 7 ? "Let's Go" : "Continue"}
          {step < 7 && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}
