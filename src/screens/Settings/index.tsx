import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { db } from '@/services/db';
import type { Profile } from '@/types';

const INJURY_LABEL: Record<string, string> = {
  knees: 'KNEES',
  lower_back: 'LOWER BACK',
  back: 'BACK',
  shoulders: 'SHOULDERS',
  wrists: 'WRISTS',
  hips: 'HIPS',
};

const INJURY_OPTIONS: { id: string; label: string }[] = [
  { id: 'knees', label: 'Knees' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'wrists', label: 'Wrists' },
  { id: 'hips', label: 'Hips' },
];

const GOAL_OPTIONS: { value: Profile['goal']; label: string }[] = [
  { value: 'muscle', label: 'Muscle' },
  { value: 'strength', label: 'Strength' },
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'health', label: 'Health' },
];

const EXPERIENCE_OPTIONS: { value: Profile['experience']; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TRAINING_ENVIRONMENT_OPTIONS: { value: Profile['trainingEnvironment']; label: string }[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'bodyweight', label: 'Bodyweight only' },
];

const REST_PRESETS = [60, 90, 120, 180] as const;

function formatGoal(goal: Profile['goal']): string {
  const m: Record<Profile['goal'], string> = {
    muscle: 'MUSCLE',
    strength: 'STRENGTH',
    weight_loss: 'WEIGHT LOSS',
    health: 'HEALTH',
  };
  return m[goal];
}

function formatExperience(exp: Profile['experience']): string {
  const m: Record<Profile['experience'], string> = {
    beginner: 'BEGINNER',
    intermediate: 'INTERMEDIATE',
    advanced: 'ADVANCED',
  };
  return m[exp];
}

function formatTrainingEnvironment(env: Profile['trainingEnvironment']): string {
  const m: Record<Profile['trainingEnvironment'], string> = {
    gym: 'GYM',
    home: 'HOME',
    bodyweight: 'BODYWEIGHT ONLY',
  };
  return m[env];
}

function formatInjuries(injuries: string[]): string {
  if (!injuries.length) return 'NONE';
  return injuries.map((id) => INJURY_LABEL[id] ?? id.toUpperCase()).join(', ');
}

type SheetId =
  | null
  | 'goal'
  | 'experience'
  | 'trainingEnvironment'
  | 'restTimer'
  | 'pharmacology'
  | 'injuries'
  | 'gender'
  | 'age'
  | 'weight'
  | 'height';

function sheetTitle(id: NonNullable<SheetId>): string {
  const titles: Record<NonNullable<SheetId>, string> = {
    goal: 'Goal',
    experience: 'Experience',
    trainingEnvironment: 'Training environment',
    restTimer: 'Rest timer',
    pharmacology: 'Pharmacology',
    injuries: 'Injuries',
    gender: 'Gender',
    age: 'Age',
    weight: 'Weight (kg)',
    height: 'Height (cm)',
  };
  return titles[id];
}

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full items-center justify-between gap-3 border-b border-border/40 py-3.5 text-left last:border-0 active:bg-surface/50"
    >
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex min-w-0 max-w-[55%] items-center justify-end gap-2">
        <span className="truncate text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {value}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      </div>
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">{children}</h2>
  );
}

export interface SettingsScreenProps {
  onOpenImport?: () => void;
}

export default function SettingsScreen({ onOpenImport }: SettingsScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<SheetId>(null);

  /** Draft state for sheets */
  const [pharmaMode, setPharmaMode] = useState<Profile['pharmacology']>('natural');
  const [cycleDateInput, setCycleDateInput] = useState('');
  const [injuryDraft, setInjuryDraft] = useState<string[]>([]);
  const [textDraft, setTextDraft] = useState('');

  const load = useCallback(async () => {
    const p = await db.profile.get(1);
    setProfile(p ?? null);
    setLoading(false);
  }, []);

  const reloadProfile = useCallback(async () => {
    const p = await db.profile.get(1);
    setProfile(p ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!sheet || !profile) return;
    if (sheet === 'pharmacology') {
      setPharmaMode(profile.pharmacology);
      setCycleDateInput(profile.cycleStartDate?.slice(0, 10) ?? '');
    }
    if (sheet === 'injuries') {
      setInjuryDraft(profile.injuries.map((id) => (id === 'lower_back' ? 'back' : id)));
    }
    if (sheet === 'age') setTextDraft(String(profile.age));
    if (sheet === 'weight') setTextDraft(String(profile.weight));
    if (sheet === 'height') setTextDraft(String(profile.height));
  }, [sheet, profile]);

  const closeSheet = () => setSheet(null);

  const toggleLanguage = async () => {
    if (!profile) return;
    const next: Profile['language'] = profile.language === 'en' ? 'ru' : 'en';
    await db.profile.update(1, { language: next });
    await reloadProfile();
  };

  const applyGoal = async (goal: Profile['goal']) => {
    await db.profile.update(1, { goal });
    await reloadProfile();
    closeSheet();
  };

  const applyExperience = async (experience: Profile['experience']) => {
    await db.profile.update(1, { experience });
    await reloadProfile();
    closeSheet();
  };

  const applyTrainingEnvironment = async (trainingEnvironment: Profile['trainingEnvironment']) => {
    await db.profile.update(1, { trainingEnvironment });
    await reloadProfile();
    closeSheet();
  };

  const applyRestTimer = async (restTimer: number) => {
    await db.profile.update(1, { restTimer });
    await reloadProfile();
    closeSheet();
  };

  const applyPharmacology = async () => {
    if (!profile) return;
    if (pharmaMode === 'natural') {
      const { cycleCompound: _cc, cycleStartDate: _cs, ...rest } = profile;
      void _cc;
      void _cs;
      await db.profile.put({ ...rest, pharmacology: 'natural' });
    } else {
      const dateIso = cycleDateInput.trim() || profile.cycleStartDate || '';
      await db.profile.put({
        ...profile,
        pharmacology: 'on_cycle',
        ...(dateIso ? { cycleStartDate: dateIso } : {}),
      });
    }
    await reloadProfile();
    closeSheet();
  };

  const toggleInjuryOption = (id: string) => {
    setInjuryDraft((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const saveInjuries = async () => {
    await db.profile.update(1, { injuries: [...injuryDraft] });
    await reloadProfile();
    closeSheet();
  };

  const applyGender = async (gender: Profile['gender']) => {
    await db.profile.update(1, { gender });
    await reloadProfile();
    closeSheet();
  };

  const saveNumericField = async (field: 'age' | 'weight' | 'height') => {
    if (!profile) return;
    const raw = textDraft.trim().replace(',', '.');
    const n = field === 'age' ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const value = field === 'age' ? Math.round(n) : Math.round(n * 10) / 10;
    if (field === 'age') await db.profile.update(1, { age: value });
    else if (field === 'weight') await db.profile.update(1, { weight: value });
    else await db.profile.update(1, { height: value });
    await reloadProfile();
    closeSheet();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-12 pt-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-6 px-5 pb-12 pt-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary">No profile found. Complete onboarding first.</p>
      </div>
    );
  }

  const langLabel = profile.language === 'en' ? 'ENGLISH' : 'RUSSIAN';
  const genderLabel = profile.gender === 'male' ? 'MALE' : 'FEMALE';
  const pharmaLabel = profile.pharmacology === 'natural' ? 'NATURAL' : 'ON CYCLE';

  const optionBtn = (active: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
      active
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border bg-surface text-text-primary hover:border-accent/40'
    }`;

  return (
    <div className="flex flex-col gap-6 px-5 pb-12 pt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
      </header>

      {sheet ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0"
          role="presentation"
          onClick={closeSheet}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-sheet-title"
            className="max-h-[85vh] w-full max-w-[390px] overflow-y-auto rounded-t-2xl border border-border border-b-0 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <h2 id="settings-sheet-title" className="text-base font-bold text-text-primary">
                {sheetTitle(sheet)}
              </h2>
              <button
                type="button"
                onClick={closeSheet}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 p-4 pb-8">
              {sheet === 'goal' &&
                GOAL_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={optionBtn(profile.goal === o.value)}
                    onClick={() => void applyGoal(o.value)}
                  >
                    {o.label}
                  </button>
                ))}

              {sheet === 'experience' &&
                EXPERIENCE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={optionBtn(profile.experience === o.value)}
                    onClick={() => void applyExperience(o.value)}
                  >
                    {o.label}
                  </button>
                ))}

              {sheet === 'trainingEnvironment' &&
                TRAINING_ENVIRONMENT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={optionBtn(profile.trainingEnvironment === o.value)}
                    onClick={() => void applyTrainingEnvironment(o.value)}
                  >
                    {o.label}
                  </button>
                ))}

              {sheet === 'restTimer' && (
                <>
                  <p className="text-xs text-text-secondary">Presets (seconds)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {REST_PRESETS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={optionBtn(profile.restTimer === sec)}
                        onClick={() => void applyRestTimer(sec)}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </>
              )}

              {sheet === 'pharmacology' && (
                <>
                  <button
                    type="button"
                    className={optionBtn(pharmaMode === 'natural')}
                    onClick={() => setPharmaMode('natural')}
                  >
                    Natural
                  </button>
                  <button
                    type="button"
                    className={optionBtn(pharmaMode === 'on_cycle')}
                    onClick={() => setPharmaMode('on_cycle')}
                  >
                    On cycle
                  </button>
                  {pharmaMode === 'on_cycle' ? (
                    <label className="mt-2 block">
                      <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                        Cycle start date
                      </span>
                      <input
                        type="date"
                        value={cycleDateInput}
                        onChange={(e) => setCycleDateInput(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text-primary outline-none focus:border-accent"
                      />
                    </label>
                  ) : null}
                  <Button type="button" variant="primary" size="lg" fullWidth onClick={() => void applyPharmacology()}>
                    Save
                  </Button>
                </>
              )}

              {sheet === 'injuries' && (
                <>
                  <button
                    type="button"
                    className={optionBtn(injuryDraft.length === 0)}
                    onClick={() => setInjuryDraft([])}
                  >
                    None
                  </button>
                  {INJURY_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={optionBtn(injuryDraft.includes(o.id))}
                      onClick={() => toggleInjuryOption(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                  <Button type="button" variant="primary" size="lg" fullWidth onClick={() => void saveInjuries()}>
                    Save
                  </Button>
                </>
              )}

              {sheet === 'gender' && (
                <>
                  <button
                    type="button"
                    className={optionBtn(profile.gender === 'male')}
                    onClick={() => void applyGender('male')}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    className={optionBtn(profile.gender === 'female')}
                    onClick={() => void applyGender('female')}
                  >
                    Female
                  </button>
                </>
              )}

              {(sheet === 'age' || sheet === 'weight' || sheet === 'height') && (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text-primary outline-none focus:border-accent"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => void saveNumericField(sheet)}
                  >
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <SectionLabel>GENERAL</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow label="Language" value={langLabel} onPress={() => void toggleLanguage()} />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>PROFILE</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow label="Gender" value={genderLabel} onPress={() => setSheet('gender')} />
            <SettingsRow label="Age" value={String(profile.age)} onPress={() => setSheet('age')} />
            <SettingsRow label="Weight" value={`${profile.weight} KG`} onPress={() => setSheet('weight')} />
            <SettingsRow label="Height" value={`${profile.height} CM`} onPress={() => setSheet('height')} />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>PREFERENCES</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow label="Goal" value={formatGoal(profile.goal)} onPress={() => setSheet('goal')} />
            <SettingsRow
              label="Experience"
              value={formatExperience(profile.experience)}
              onPress={() => setSheet('experience')}
            />
            <SettingsRow
              label="Training Environment"
              value={formatTrainingEnvironment(profile.trainingEnvironment)}
              onPress={() => setSheet('trainingEnvironment')}
            />
            <SettingsRow label="Injuries" value={formatInjuries(profile.injuries)} onPress={() => setSheet('injuries')} />
            <SettingsRow label="Rest Timer" value={`${profile.restTimer}S`} onPress={() => setSheet('restTimer')} />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>DATA</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow
              label="Import past workouts"
              value="OPEN"
              onPress={() => {
                onOpenImport?.();
              }}
            />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>ADVANCED</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow label="Pharmacology" value={pharmaLabel} onPress={() => setSheet('pharmacology')} />
            {profile.pharmacology === 'on_cycle' && (
              <div className="border-t border-border/40 pb-4 pt-3">
                {profile.cycleCompound ? (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Compound{' '}
                    <span className="font-semibold normal-case text-text-primary">{profile.cycleCompound}</span>
                  </p>
                ) : null}
                {profile.cycleStartDate ? (
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Start date{' '}
                    <span className="font-mono font-semibold normal-case text-text-primary">
                      {profile.cycleStartDate}
                    </span>
                  </p>
                ) : null}
                {!profile.cycleCompound && !profile.cycleStartDate ? (
                  <p className="text-xs text-text-secondary">No cycle details saved.</p>
                ) : null}
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
