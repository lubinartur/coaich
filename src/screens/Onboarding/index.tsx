import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type {
  Profile,
  TrainingEnvironment,
} from '@/types';
import { db } from '@/services/db';
import { Button, Card } from '@/components/ui';

const STEPS = 7;

const inputClass =
  'w-full rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none transition-colors focus:border-accent font-mono';

type Goal = Profile['goal'];
type Experience = Profile['experience'];

interface OnboardingScreenProps {
  onComplete: () => void;
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

  /** Positive kg saved on profile as a finite number (optional benchmarks). */
  const parseOptionalKg = (v: string): number | undefined => {
    const t = v.trim().replace(',', '.');
    if (t === '') return undefined;
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.round(n * 10) / 10;
  };

  const finish = async () => {
    if (!step7Valid || !gender || !goal || !experience || !environment || !pharmacology) return;

    const benchPress10RM = parseOptionalKg(bench10);
    const squat10RM = parseOptionalKg(squat10);
    const deadlift10RM = parseOptionalKg(deadlift10);

    const profile: Profile = {
      id: 1,
      gender,
      age: Math.round(Number(age)),
      weight: Number(weight),
      height: Number(height),
      goal,
      experience,
      trainingEnvironment: environment,
      injuries: noneInjury ? [] : [...injuries],
      pharmacology,
      restTimer: 90,
      language: 'en',
      benchPress10RM,
      squat10RM,
      deadlift10RM,
    };

    if (pharmacology === 'on_cycle') {
      const trimmed = cycleCompound.trim();
      if (trimmed) profile.cycleCompound = trimmed;
      if (cycleStartDate.trim()) profile.cycleStartDate = cycleStartDate.trim();
    }

    await db.profile.put(profile);
    onComplete();
  };

  const selectedCard = (active: boolean) =>
    active
      ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
      : 'border-border hover:border-border bg-card';

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex shrink-0 flex-col px-5 pt-6">
        <div className="mb-4 flex items-center gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-primary transition-colors active:scale-[0.98]"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-10" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              <span>
                Step {step} of {STEPS}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${(step / STEPS) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 no-scrollbar">
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Basic info</h1>
              <p className="mt-1 text-sm text-text-secondary">Tell us a bit about you.</p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-secondary">Gender</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`rounded-xl border py-4 text-center text-sm font-semibold transition-all ${
                    gender === 'male'
                      ? 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
                      : 'border-border bg-surface text-text-primary active:scale-[0.98]'
                  }`}
                >
                  Male
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`rounded-xl border py-4 text-center text-sm font-semibold transition-all ${
                    gender === 'female'
                      ? 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
                      : 'border-border bg-surface text-text-primary active:scale-[0.98]'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Age</span>
              <input
                className={inputClass}
                inputMode="numeric"
                type="number"
                min={1}
                placeholder="Years"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Weight (kg)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                type="number"
                min={1}
                step="0.1"
                placeholder="kg"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Height (cm)</span>
              <input
                className={inputClass}
                inputMode="numeric"
                type="number"
                min={1}
                placeholder="cm"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Your goal</h1>
              <p className="mt-1 text-sm text-text-secondary">What are you training for?</p>
            </div>
            {(
              [
                {
                  id: 'muscle' as const,
                  icon: '💪',
                  title: 'Muscle',
                  desc: 'Build muscle mass',
                },
                {
                  id: 'strength' as const,
                  icon: '🏋️',
                  title: 'Strength',
                  desc: 'Get stronger',
                },
                {
                  id: 'weight_loss' as const,
                  icon: '🔥',
                  title: 'Weight Loss',
                  desc: 'Burn fat',
                },
                {
                  id: 'health' as const,
                  icon: '❤️',
                  title: 'Health',
                  desc: 'Stay healthy',
                },
              ] as const
            ).map((opt) => (
              <Card
                key={opt.id}
                padded
                onClick={() => setGoal(opt.id)}
                className={`${selectedCard(goal === opt.id)} flex flex-row items-center gap-4`}
              >
                <span className="text-3xl" aria-hidden>
                  {opt.icon}
                </span>
                <div>
                  <p className="font-bold text-text-primary">{opt.title}</p>
                  <p className="text-sm text-text-secondary">{opt.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Experience</h1>
              <p className="mt-1 text-sm text-text-secondary">How long have you been lifting?</p>
            </div>
            {(
              [
                {
                  id: 'beginner' as const,
                  title: 'Beginner',
                  desc: 'Less than 1 year',
                },
                {
                  id: 'intermediate' as const,
                  title: 'Intermediate',
                  desc: '1–3 years',
                },
                {
                  id: 'advanced' as const,
                  title: 'Advanced',
                  desc: '3+ years',
                },
              ] as const
            ).map((opt) => (
              <Card
                key={opt.id}
                padded
                onClick={() => setExperience(opt.id)}
                className={`${selectedCard(experience === opt.id)}`}
              >
                <p className="font-bold text-text-primary">{opt.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{opt.desc}</p>
              </Card>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Training environment</h1>
              <p className="mt-1 text-sm text-text-secondary">Where do you usually train?</p>
            </div>
            {(
              [
                {
                  id: 'gym' as const,
                  icon: '🏢',
                  title: 'Gym',
                  desc: 'Full equipment',
                },
                {
                  id: 'home' as const,
                  icon: '🏠',
                  title: 'Home',
                  desc: 'Dumbbells / basic gear',
                },
                {
                  id: 'bodyweight' as const,
                  icon: '🤸',
                  title: 'Bodyweight',
                  desc: 'No equipment',
                },
              ] as const
            ).map((opt) => (
              <Card
                key={opt.id}
                padded
                onClick={() => setEnvironment(opt.id)}
                className={`${selectedCard(environment === opt.id)} flex flex-row items-center gap-4`}
              >
                <span className="text-3xl" aria-hidden>
                  {opt.icon}
                </span>
                <div>
                  <p className="font-bold text-text-primary">{opt.title}</p>
                  <p className="text-sm text-text-secondary">{opt.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Injuries</h1>
              <p className="mt-1 text-sm text-text-secondary">Select any that apply.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {injuryOptions.map((opt) => {
                const on = injuries.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleInjury(opt.id)}
                    className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
                      on
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={selectNoneInjury}
                className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
                  noneInjury
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                None
              </button>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              We&apos;ll avoid exercises that stress these areas.
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Your working weights (10 reps)</h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Skip if you don&apos;t know — we&apos;ll calibrate after first workout
              </p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Bench Press (kg)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                type="number"
                min={0}
                step="0.5"
                placeholder="Optional"
                value={bench10}
                onChange={(e) => setBench10(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Squat (kg)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                type="number"
                min={0}
                step="0.5"
                placeholder="Optional"
                value={squat10}
                onChange={(e) => setSquat10(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Deadlift (kg)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                type="number"
                min={0}
                step="0.5"
                placeholder="Optional"
                value={deadlift10}
                onChange={(e) => setDeadlift10(e.target.value)}
              />
            </label>
            <div className="flex flex-col items-center gap-4 pt-2">
              <Button type="button" variant="link" onClick={skipBenchmarks}>
                Skip
              </Button>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Training status</h1>
              <p className="mt-1 text-sm text-text-secondary">This helps tailor volume guidance.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPharmacology('natural')}
                className={`rounded-xl border py-4 text-center text-sm font-semibold transition-all ${
                  pharmacology === 'natural'
                    ? 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
                    : 'border-border bg-surface text-text-primary active:scale-[0.98]'
                }`}
              >
                Natural
              </button>
              <button
                type="button"
                onClick={() => setPharmacology('on_cycle')}
                className={`rounded-xl border py-4 text-center text-sm font-semibold transition-all ${
                  pharmacology === 'on_cycle'
                    ? 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
                    : 'border-border bg-surface text-text-primary active:scale-[0.98]'
                }`}
              >
                On Cycle
              </button>
            </div>
            {pharmacology === 'on_cycle' && (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                    Compound (optional)
                  </span>
                  <input
                    className={inputClass}
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. Testosterone"
                    value={cycleCompound}
                    onChange={(e) => setCycleCompound(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Start date</span>
                  <input
                    className={inputClass}
                    type="date"
                    value={cycleStartDate}
                    onChange={(e) => setCycleStartDate(e.target.value)}
                  />
                </label>
              </div>
            )}
            <p className="text-xs leading-relaxed text-text-secondary">Stored locally only, never shared.</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-bg/95 px-5 py-4 backdrop-blur-md">
        {step === 7 ? (
          <Button variant="primary" size="lg" fullWidth disabled={!canContinue()} onClick={() => void finish()}>
            Let&apos;s Go
          </Button>
        ) : (
          <Button variant="primary" size="lg" fullWidth disabled={!canContinue()} onClick={goNext}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
