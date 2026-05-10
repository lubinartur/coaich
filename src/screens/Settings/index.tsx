import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { db } from '@/services/db';
import type { Profile } from '@/types';

const INJURY_LABEL: Record<string, string> = {
  knees: 'KNEES',
  lower_back: 'LOWER BACK',
  shoulders: 'SHOULDERS',
};

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

function formatInjuries(injuries: string[]): string {
  if (!injuries.length) return 'NONE';
  return injuries.map((id) => INJURY_LABEL[id] ?? id.toUpperCase()).join(', ');
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

  const load = useCallback(async () => {
    const p = await db.profile.get(1);
    setProfile(p ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLanguage = async () => {
    if (!profile) return;
    const next: Profile['language'] = profile.language === 'en' ? 'ru' : 'en';
    const updated: Profile = { ...profile, language: next };
    await db.profile.put(updated);
    setProfile(updated);
  };

  const placeholder = () => {
    /* Edit flows — placeholder */
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

  return (
    <div className="flex flex-col gap-6 px-5 pb-12 pt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
      </header>

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
            <SettingsRow label="Gender" value={genderLabel} onPress={placeholder} />
            <SettingsRow label="Age" value={String(profile.age)} onPress={placeholder} />
            <SettingsRow label="Weight" value={`${profile.weight} KG`} onPress={placeholder} />
            <SettingsRow label="Height" value={`${profile.height} CM`} onPress={placeholder} />
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel>PREFERENCES</SectionLabel>
        <Card padded={false} className="overflow-hidden border-border px-0">
          <div className="px-4">
            <SettingsRow label="Goal" value={formatGoal(profile.goal)} onPress={placeholder} />
            <SettingsRow label="Experience" value={formatExperience(profile.experience)} onPress={placeholder} />
            <SettingsRow label="Injuries" value={formatInjuries(profile.injuries)} onPress={placeholder} />
            <SettingsRow label="Rest Timer" value={`${profile.restTimer}S`} onPress={placeholder} />
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
            <SettingsRow label="Pharmacology" value={pharmaLabel} onPress={placeholder} />
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
