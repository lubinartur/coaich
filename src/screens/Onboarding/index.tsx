import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Profile, TrainingEnvironment } from '@/types';
import { db } from '@/services/db';
import { seedInitialTargetsFromProfile } from '@/services/progressionEngine';

const STEPS = 7;

const fieldInputClass =
  'w-full rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4 text-base text-white outline-none transition-colors placeholder:text-[#6B7280]/60 focus:border-[#8B5CF6]';

type Goal = Profile['goal'];
type Experience = Profile['experience'];

interface OnboardingScreenProps {
  onComplete: () => void;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type TrainingStatusDraft = 'NATURAL' | 'ON_CYCLE';

/** Intermediate onboarding payload (maps 1:1 from UI / design-reference style fields). */
type OnboardingDraftPayload = {
  gender: 'male' | 'female';
  age: number;
  weight: number;
  height: number;
  goal: string;
  experience: string;
  environment: TrainingEnvironment;
  injuries: string[];
  benchmarks: Partial<{ benchPress: number; squat: number; deadlift: number }>;
  trainingStatus: TrainingStatusDraft;
  cycleInfo?: { compound?: string; startDate?: string };
};

function mapOnboardingDraftToDexieProfile(draft: OnboardingDraftPayload): Profile {
  const ALLOWED_GOALS: Profile['goal'][] = ['muscle', 'strength', 'weight_loss', 'health'];
  let mappedGoal: Profile['goal'] =
    draft.goal === 'loss' ? 'weight_loss' : (draft.goal as Profile['goal']);
  if (!ALLOWED_GOALS.includes(mappedGoal)) {
    mappedGoal = 'health';
  }

  const expLower = draft.experience.toLowerCase();
  const experience = (
    expLower === 'beginner' || expLower === 'intermediate' || expLower === 'advanced'
      ? expLower
      : 'beginner'
  ) as Profile['experience'];

  const pharmacology: Profile['pharmacology'] =
    draft.trainingStatus === 'ON_CYCLE' ? 'on_cycle' : 'natural';

  const profile: Profile = {
    id: 1,
    gender: draft.gender,
    age: draft.age,
    weight: draft.weight,
    height: draft.height,
    goal: mappedGoal,
    experience,
    trainingEnvironment: draft.environment,
    injuries: draft.injuries,
    pharmacology,
    restTimer: 90,
    language: 'en',
  };

  const { benchPress, squat, deadlift } = draft.benchmarks;
  if (benchPress != null && benchPress > 0 && Number.isFinite(benchPress)) {
    profile.benchPress10RM = Math.round(benchPress * 10) / 10;
  }
  if (squat != null && squat > 0 && Number.isFinite(squat)) {
    profile.squat10RM = Math.round(squat * 10) / 10;
  }
  if (deadlift != null && deadlift > 0 && Number.isFinite(deadlift)) {
    profile.deadlift10RM = Math.round(deadlift * 10) / 10;
  }

  if (pharmacology === 'on_cycle') {
    const compound = draft.cycleInfo?.compound?.trim();
    if (compound) profile.cycleCompound = compound;
    const start = draft.cycleInfo?.startDate?.trim();
    if (start) profile.cycleStartDate = start;
  }

  return profile;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(1);

  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [environment, setEnvironment] = useState<TrainingEnvironment | null>(null);

  const [injuries, setInjuries] = useState<string[]>([]);
  const [noneInjury, setNoneInjury] = useState(false);

  const [bench10, setBench10] = useState('');
  const [squat10, setSquat10] = useState('');
  const [deadlift10, setDeadlift10] = useState('');

  const [pharmacology, setPharmacology] = useState<'natural' | 'on_cycle' | null>(null);
  const [cycleCompound, setCycleCompound] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState('');

  const injuryOptions = useMemo(
    () =>
      [
        { id: 'knees', label: 'Knees' },
        { id: 'lower_back', label: 'Lower Back' },
        { id: 'shoulders', label: 'Shoulders' },
      ] as const,
    [],
  );

  const toggleInjury = (id: string) => {
    setNoneInjury(false);
    setInjuries((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectNoneInjury = () => {
    setNoneInjury(true);
    setInjuries([]);
  };

  const step5Valid = noneInjury || injuries.length > 0;

  const step1Valid =
    gender !== null &&
    age.trim() !== '' &&
    weight.trim() !== '' &&
    height.trim() !== '' &&
    !Number.isNaN(Number(age)) &&
    Number(age) > 0 &&
    !Number.isNaN(Number(weight)) &&
    Number(weight) > 0 &&
    !Number.isNaN(Number(height)) &&
    Number(height) > 0;

  const step7Valid = pharmacology !== null;

  const canContinue = (): boolean => {
    switch (step) {
      case 1:
        return step1Valid;
      case 2:
        return goal !== null;
      case 3:
        return experience !== null;
      case 4:
        return environment !== null;
      case 5:
        return step5Valid;
      case 6:
        return true;
      case 7:
        return step7Valid;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step < STEPS && canContinue()) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const skipBenchmarks = () => {
    setBench10('');
    setSquat10('');
    setDeadlift10('');
    setStep(7);
  };

  const parseOptionalKg = (v: string): number | undefined => {
    const t = v.trim().replace(',', '.');
    if (t === '') return undefined;
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.round(n * 10) / 10;
  };

  const handleComplete = async () => {
    if (!step7Valid || !gender || !goal || !experience || !environment || !pharmacology) return;

    const benchPress = parseOptionalKg(bench10);
    const squat = parseOptionalKg(squat10);
    const deadlift = parseOptionalKg(deadlift10);

    const draft: OnboardingDraftPayload = {
      gender,
      age: Math.round(Number(age)),
      weight: Number(weight),
      height: Number(height),
      goal,
      experience,
      environment,
      injuries: noneInjury ? [] : [...injuries],
      benchmarks: {
        ...(benchPress != null ? { benchPress } : {}),
        ...(squat != null ? { squat } : {}),
        ...(deadlift != null ? { deadlift } : {}),
      },
      trainingStatus: pharmacology === 'on_cycle' ? 'ON_CYCLE' : 'NATURAL',
      cycleInfo:
        pharmacology === 'on_cycle'
          ? {
              compound: cycleCompound.trim() || undefined,
              startDate: cycleStartDate.trim() || undefined,
            }
          : undefined,
    };

    const finalProfile = mapOnboardingDraftToDexieProfile(draft);
    await db.profile.put(finalProfile);
    await seedInitialTargetsFromProfile(finalProfile);
    onComplete();
  };

  const choiceCard = (active: boolean) =>
    cx(
      'rounded-2xl border p-6 text-left transition-all active:scale-[0.99]',
      active ? 'border-[#8B5CF6] bg-[#1C1C1C] shadow-[0_0_24px_rgba(139,92,246,0.12)]' : 'border-[#2A2A2A] bg-[#1C1C1C] hover:border-[#3F3F3F]',
    );

  const genderBtn = (g: 'male' | 'female', label: string) => (
    <button
      type="button"
      onClick={() => setGender(g)}
      className={cx(
        'flex-1 rounded-xl border py-4 text-center text-sm font-bold transition-all active:scale-[0.99]',
        gender === g
          ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/25'
          : 'border-[#2A2A2A] bg-[#1C1C1C] text-white hover:border-[#3F3F3F]',
      )}
    >
      {label}
    </button>
  );

  const pharmaBtn = (p: 'natural' | 'on_cycle', label: string) => (
    <button
      type="button"
      onClick={() => setPharmacology(p)}
      className={cx(
        'flex-1 rounded-xl border py-4 text-center text-sm font-bold transition-all active:scale-[0.99]',
        pharmacology === p
          ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/25'
          : 'border-[#2A2A2A] bg-[#1C1C1C] text-white hover:border-[#3F3F3F]',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-white">
      <div className="shrink-0 px-6 pb-4 pt-8">
        <div className="mb-6 flex gap-2">
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              className={cx('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-[#8B5CF6]' : 'bg-[#2A2A2A]')}
            />
          ))}
        </div>
        <p className="text-xs font-medium text-[#6B7280]">
          Step {step} of {STEPS}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-8 pb-4"
          >
            {step === 1 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Basic info</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">Tell us a bit about you.</p>
                </div>
                <div className="flex gap-4">{genderBtn('male', 'Male')}{genderBtn('female', 'Female')}</div>
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Age</span>
                    <input
                      className={fieldInputClass}
                      inputMode="numeric"
                      type="number"
                      min={1}
                      placeholder="Years"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Weight (kg)</span>
                    <input
                      className={fieldInputClass}
                      inputMode="decimal"
                      type="number"
                      min={1}
                      step="0.1"
                      placeholder="kg"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Height (cm)</span>
                    <input
                      className={fieldInputClass}
                      inputMode="numeric"
                      type="number"
                      min={1}
                      placeholder="cm"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">What is your goal?</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">We&apos;ll tune your plan around this.</p>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {(
                    [
                      { id: 'muscle' as const, label: '💪 Muscle', desc: 'Hypertrophy focused' },
                      { id: 'strength' as const, label: '🏋️ Strength', desc: 'Powerlifting focus' },
                      { id: 'weight_loss' as const, label: '🔥 Weight loss', desc: 'Caloric deficit support' },
                      { id: 'health' as const, label: '❤️ Health', desc: 'General fitness' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGoal(opt.id)}
                      className={choiceCard(goal === opt.id)}
                    >
                      <div className="text-lg font-bold">{opt.label}</div>
                      <div className="mt-1 text-sm text-[#6B7280]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Experience level</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">How long have you been training?</p>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {(
                    [
                      { id: 'beginner' as const, title: 'Beginner', desc: 'Less than 1 year' },
                      { id: 'intermediate' as const, title: 'Intermediate', desc: '1–3 years' },
                      { id: 'advanced' as const, title: 'Advanced', desc: '3+ years' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExperience(opt.id)}
                      className={choiceCard(experience === opt.id)}
                    >
                      <div className="text-lg font-bold">{opt.title}</div>
                      <div className="mt-1 text-sm text-[#6B7280]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Training environment</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">Where do you usually train?</p>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {(
                    [
                      { id: 'gym' as const, label: '🏢 Gym', desc: 'Full equipment' },
                      { id: 'home' as const, label: '🏠 Home', desc: 'Dumbbells and bench' },
                      { id: 'bodyweight' as const, label: '🤸 Bodyweight', desc: 'No equipment' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEnvironment(opt.id)}
                      className={choiceCard(environment === opt.id)}
                    >
                      <div className="text-lg font-bold">{opt.label}</div>
                      <div className="mt-1 text-sm text-[#6B7280]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Injuries</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">Select any that apply.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {injuryOptions.map((opt) => {
                    const on = injuries.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleInjury(opt.id)}
                        className={cx(
                          'rounded-full border px-6 py-3 text-sm font-semibold transition-all active:scale-[0.98]',
                          on
                            ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white'
                            : 'border-[#2A2A2A] bg-[#1C1C1C] text-white hover:border-[#3F3F3F]',
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={selectNoneInjury}
                    className={cx(
                      'rounded-full border px-6 py-3 text-sm font-semibold transition-all active:scale-[0.98]',
                      noneInjury
                        ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white'
                        : 'border-[#2A2A2A] bg-[#1C1C1C] text-white hover:border-[#3F3F3F]',
                    )}
                  >
                    None
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-[#6B7280]">We&apos;ll avoid exercises that stress these areas.</p>
              </>
            ) : null}

            {step === 6 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Benchmark weights (10 reps)</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
                    Optional — skip if you don&apos;t know; we&apos;ll calibrate after your first workout.
                  </p>
                </div>
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Bench press (kg)</span>
                    <input
                      className={fieldInputClass}
                      inputMode="decimal"
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="Optional"
                      value={bench10}
                      onChange={(e) => setBench10(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Squat (kg)</span>
                    <input
                      className={fieldInputClass}
                      inputMode="decimal"
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="Optional"
                      value={squat10}
                      onChange={(e) => setSquat10(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[#6B7280]">Deadlift (kg)</span>
                    <input
                      className={fieldInputClass}
                      inputMode="decimal"
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="Optional"
                      value={deadlift10}
                      onChange={(e) => setDeadlift10(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={skipBenchmarks}
                  className="block pt-2 text-sm font-medium text-[#8B5CF6] transition-colors hover:text-[#A78BFA]"
                >
                  Skip benchmarks
                </button>
              </>
            ) : null}

            {step === 7 ? (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Training status</h2>
                  <p className="mt-2 text-sm text-[#6B7280]">Helps tailor volume and recovery guidance.</p>
                </div>
                <div className="flex gap-4">
                  {pharmaBtn('natural', 'Natural')}
                  {pharmaBtn('on_cycle', 'On cycle')}
                </div>
                {pharmacology === 'on_cycle' ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <label className="block space-y-2">
                      <span className="text-sm text-[#6B7280]">Main compound (optional)</span>
                      <input
                        className={fieldInputClass}
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. Test E 250mg"
                        value={cycleCompound}
                        onChange={(e) => setCycleCompound(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm text-[#6B7280]">Cycle start date</span>
                      <input
                        className={fieldInputClass}
                        type="date"
                        value={cycleStartDate}
                        onChange={(e) => setCycleStartDate(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C]/50 p-4 text-xs leading-relaxed text-[#6B7280]">
                  Stored locally only, never shared. Used to adjust recovery recommendations.
                </div>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 gap-4 border-t border-[#2A2A2A] bg-[#0A0A0A] px-6 py-6">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#2A2A2A] text-[#6B7280] transition-colors hover:border-[#3F3F3F] hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2} />
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canContinue()}
          onClick={step === 7 ? () => void handleComplete() : goNext}
          className={cx(
            'flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] py-5 text-base font-bold text-white shadow-lg shadow-[#8B5CF6]/20 transition-all',
            !canContinue() ? 'cursor-not-allowed opacity-40' : 'active:scale-[0.99] hover:bg-[#7C3AED]',
          )}
        >
          {step === 7 ? "Let's go" : 'Continue'}
          {step < 7 ? <ChevronRight className="h-5 w-5" strokeWidth={2} /> : null}
        </button>
      </div>
    </div>
  );
}
