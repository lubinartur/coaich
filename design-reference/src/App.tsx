/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Home, BarChart2, Clock, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './db';
import { UserProfile, Workout } from './types';
import { cn } from './utils';

// Screens
import Onboarding from './screens/Onboarding';
import Today from './screens/Today';
import Logger from './screens/Logger';
import Rating from './screens/Rating';
import Review from './screens/Review';
import Progress from './screens/Progress';
import History from './screens/History';
import Settings from './screens/Settings';
import ImportWorkouts from './screens/ImportWorkouts';

type Screen = 'onboarding' | 'today' | 'logger' | 'rating' | 'review' | 'progress' | 'history' | 'settings' | 'import' | 'edit';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('today');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Partial<Workout> | null>(null);
  const [lastWorkoutId, setLastWorkoutId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const p = await db.profile.toArray();
      if (p.length > 0) {
        setProfile(p[0]);
        if (!p[0].onboarded) setCurrentScreen('onboarding');
      } else {
        const initialProfile: UserProfile = {
          gender: '',
          age: 0,
          weight: 0,
          height: 0,
          goal: '',
          experience: '',
          environment: '',
          injuries: [],
          benchmarks: { benchPress: 0, squat: 0, deadlift: 0 },
          trainingStatus: 'NATURAL' as any,
          onboarded: false
        };
        await db.profile.add(initialProfile);
        setProfile(initialProfile);
        setCurrentScreen('onboarding');
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const hideNav = ['onboarding', 'logger', 'rating', 'review', 'import', 'edit'].includes(currentScreen);

  if (isLoading) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col max-w-[390px] mx-auto overflow-x-hidden border-x border-[#1A1A1A] relative">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[60%] bg-[#8B5CF6]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-5%] right-[-10%] w-[60%] h-[50%] bg-[#8B5CF6]/5 blur-[100px] rounded-full" />
      </div>

      <main className="flex-1 overflow-y-auto pb-24 relative z-10">
        <AnimatePresence mode="wait">
          {currentScreen === 'onboarding' && (
            <Onboarding 
              onComplete={async (p) => {
                setProfile(p);
                setCurrentScreen('today');
              }} 
            />
          )}
          {currentScreen === 'today' && (
            <Today 
              onStartWorkout={(workout) => {
                setActiveWorkout(workout);
                setCurrentScreen('logger');
              }} 
            />
          )}
          {currentScreen === 'logger' && activeWorkout && (
            <Logger 
              workout={activeWorkout as Workout}
              onCancel={() => setCurrentScreen('today')}
              onFinish={(finishedWorkout) => {
                setActiveWorkout(finishedWorkout);
                setCurrentScreen('rating');
              }}
            />
          )}
          {currentScreen === 'rating' && activeWorkout && (
            <Rating 
              workout={activeWorkout as Workout}
              onGetReview={(reviewedWorkout) => {
                setActiveWorkout(reviewedWorkout);
                setCurrentScreen('review');
              }}
            />
          )}
          {currentScreen === 'review' && activeWorkout && (
            <Review 
              workout={activeWorkout as Workout}
              onBack={() => setCurrentScreen('today')}
              onEdit={() => setCurrentScreen('edit')}
            />
          )}
          {currentScreen === 'progress' && <Progress />}
          {currentScreen === 'history' && (
            <History 
              onViewWorkout={(id) => {
                setLastWorkoutId(id);
                // We'd fetch and set activeWorkout here then go to review
                setCurrentScreen('review');
              }}
            />
          )}
          {currentScreen === 'settings' && (
            <Settings 
              onOpenImport={() => setCurrentScreen('import')}
            />
          )}
          {currentScreen === 'import' && (
            <ImportWorkouts 
              onBack={() => setCurrentScreen('settings')}
            />
          )}
        </AnimatePresence>
      </main>

      {!hideNav && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 px-6">
          <nav className="flex items-center gap-2 bg-[#1C1C1C]/80 border border-[#2A2A2A]/50 px-2 py-2 rounded-full pointer-events-auto backdrop-blur-xl shadow-2xl">
            <button 
              onClick={() => setCurrentScreen('today')}
              className={cn(
                "p-3 transition-all flex items-center justify-center rounded-full", 
                currentScreen === 'today' ? "bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/40" : "text-[#6B7280] hover:text-white"
              )}
            >
              <Home size={20} />
            </button>
            <button 
              onClick={() => setCurrentScreen('progress')}
              className={cn(
                "p-3 transition-all flex items-center justify-center rounded-full", 
                currentScreen === 'progress' ? "bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/40" : "text-[#6B7280] hover:text-white"
              )}
            >
              <BarChart2 size={20} />
            </button>
            <button 
              onClick={() => setCurrentScreen('history')}
              className={cn(
                "p-3 transition-all flex items-center justify-center rounded-full", 
                currentScreen === 'history' ? "bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/40" : "text-[#6B7280] hover:text-white"
              )}
            >
              <Clock size={20} />
            </button>
            <button 
              onClick={() => setCurrentScreen('settings')}
              className={cn(
                "p-3 transition-all flex items-center justify-center rounded-full", 
                currentScreen === 'settings' ? "bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/40" : "text-[#6B7280] hover:text-white"
              )}
            >
              <SettingsIcon size={20} />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
