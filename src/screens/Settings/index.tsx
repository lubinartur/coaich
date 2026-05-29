import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Download, Globe, LoaderCircle, Shield, Sliders, Upload, User, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import { db } from '@/services/db';
import { exportAllData, importAllData } from '@/services/dataExport';
import type { Profile } from '@/types';
import type { TranslationKey } from '@/i18n/translations';

const INJURY_OPTIONS = ['knees', 'back', 'shoulders', 'wrists', 'hips'] as const;

const GOAL_OPTIONS = ['muscle', 'strength', 'weight_loss', 'health'] as const satisfies readonly Profile['goal'][];

const EXPERIENCE_OPTIONS =
  ['beginner', 'intermediate', 'advanced'] as const satisfies readonly Profile['experience'][];

const TRAINING_ENVIRONMENT_OPTIONS =
  ['gym', 'home', 'bodyweight'] as const satisfies readonly Profile['trainingEnvironment'][];

const REST_PRESETS = [60, 90, 120, 180] as const;

function formatGoal(goal: Profile['goal'], t: (key: TranslationKey) => string): string {
  const m: Record<Profile['goal'], TranslationKey> = {
    muscle: 'muscle',
    strength: 'strengthGoal',
    weight_loss: 'weightLoss',
    health: 'health',
  };
  return t(m[goal]).toUpperCase();
}

function formatExperience(exp: Profile['experience'], t: (key: TranslationKey) => string): string {
  const m: Record<Profile['experience'], TranslationKey> = {
    beginner: 'beginner',
    intermediate: 'intermediate',
    advanced: 'advancedLevel',
  };
  return t(m[exp]).toUpperCase();
}

function formatTrainingEnvironment(
  env: Profile['trainingEnvironment'],
  t: (key: TranslationKey) => string,
): string {
  const m: Record<Profile['trainingEnvironment'], TranslationKey> = {
    gym: 'gym',
    home: 'home',
    bodyweight: 'bodyweightOnly',
  };
  return t(m[env]).toUpperCase();
}

function injuryLabel(id: string, t: (key: TranslationKey) => string): string {
  const m: Record<string, TranslationKey> = {
    knees: 'knees',
    lower_back: 'backArea',
    back: 'backArea',
    shoulders: 'shouldersArea',
    wrists: 'wrists',
    hips: 'hips',
  };
  const key = m[id];
  return key ? t(key) : id;
}

function formatInjuries(injuries: string[], t: (key: TranslationKey) => string): string {
  if (!injuries.length) return t('none').toUpperCase();
  return injuries.map((id) => injuryLabel(id, t).toUpperCase()).join(', ');
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
  | 'height'
  | 'splitType';

const SPLIT_OPTIONS = ['ppl', 'upper_lower', 'full_body'] as const satisfies
  readonly NonNullable<Profile['splitType']>[];

function formatSplitType(
  split: NonNullable<Profile['splitType']>,
  t: (key: TranslationKey) => string,
): string {
  const m: Record<NonNullable<Profile['splitType']>, TranslationKey> = {
    ppl: 'splitPPL',
    upper_lower: 'splitUpperLower',
    full_body: 'splitFullBody',
  };
  return t(m[split]);
}

function sheetTitle(id: NonNullable<SheetId>, t: (key: TranslationKey) => string): string {
  const titles: Record<NonNullable<SheetId>, TranslationKey> = {
    goal: 'goal',
    experience: 'experience',
    trainingEnvironment: 'trainingEnvironment',
    restTimer: 'restTimer',
    pharmacology: 'pharmacology',
    injuries: 'injuries',
    gender: 'gender',
    age: 'age',
    weight: 'weightKg',
    height: 'heightCm',
    splitType: 'splitType',
  };
  return t(titles[id]);
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 pl-2 text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

export interface SettingsScreenProps {
  onOpenImport?: () => void;
}

export default function SettingsScreen({ onOpenImport }: SettingsScreenProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [advancedFeedback, setAdvancedFeedback] = useState<string | null>(null);
  const [importingData, setImportingData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!advancedFeedback) return undefined;
    const timeout = window.setTimeout(() => setAdvancedFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [advancedFeedback]);

  const closeSheet = () => setSheet(null);

  const toggleLanguage = async () => {
    if (!profile) return;
    const next: Profile['language'] = profile.language === 'en' ? 'ru' : 'en';
    await db.profile.update(1, { language: next });
    window.location.reload();
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

  const applySplitType = async (splitType: NonNullable<Profile['splitType']>) => {
    await db.profile.update(1, { splitType });
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

  const handleExportData = async () => {
    try {
      await exportAllData();
      setAdvancedFeedback(t('exported'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('exportFailed');
      setAdvancedFeedback(message);
    }
  };

  const handleImportClick = () => {
    if (importingData) return;
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportingData(true);
    setAdvancedFeedback(null);
    try {
      await importAllData(file);
      setAdvancedFeedback(t('imported'));
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('importFailed');
      setAdvancedFeedback(message);
    } finally {
      setImportingData(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 bg-transparent px-6 pb-24 pt-8">
        <h1 className="text-4xl font-black tracking-tighter text-white">{t('settings')}</h1>
        <p className="text-sm text-[#6B7280]">{t('loading')}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-6 bg-transparent px-6 pb-24 pt-8">
        <h1 className="text-4xl font-black tracking-tighter text-white">{t('settings')}</h1>
        <p className="text-sm text-[#6B7280]">{t('noProfileFound')}</p>
      </div>
    );
  }

  const langLabel = profile.language === 'en' ? t('english').toUpperCase() : t('russian').toUpperCase();
  const genderLabel = profile.gender === 'male' ? t('male').toUpperCase() : t('female').toUpperCase();
  const pharmaLabel =
    profile.pharmacology === 'natural' ? t('natural').toUpperCase() : t('onCycle').toUpperCase();

  const optionBtn = (active: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
      active
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border bg-surface text-text-primary hover:border-accent/40'
    }`;

  return (
    <div className="animate-in fade-in flex flex-col gap-8 bg-transparent px-6 pb-24 pt-8 duration-500">
      <header>
        <h1 className="text-4xl font-black tracking-tighter text-white">{t('settings')}</h1>
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
                {sheetTitle(sheet, t)}
              </h2>
              <button
                type="button"
                onClick={closeSheet}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 p-4 pb-8">
              {sheet === 'goal' &&
                GOAL_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={optionBtn(profile.goal === o)}
                    onClick={() => void applyGoal(o)}
                  >
                    {formatGoal(o, t)}
                  </button>
                ))}

              {sheet === 'experience' &&
                EXPERIENCE_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={optionBtn(profile.experience === o)}
                    onClick={() => void applyExperience(o)}
                  >
                    {formatExperience(o, t)}
                  </button>
                ))}

              {sheet === 'trainingEnvironment' &&
                TRAINING_ENVIRONMENT_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={optionBtn(profile.trainingEnvironment === o)}
                    onClick={() => void applyTrainingEnvironment(o)}
                  >
                    {formatTrainingEnvironment(o, t)}
                  </button>
                ))}

              {sheet === 'restTimer' && (
                <>
                  <p className="text-xs text-text-secondary">{t('presetsSeconds')}</p>
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
                    {t('natural')}
                  </button>
                  <button
                    type="button"
                    className={optionBtn(pharmaMode === 'on_cycle')}
                    onClick={() => setPharmaMode('on_cycle')}
                  >
                    {t('onCycle')}
                  </button>
                  {pharmaMode === 'on_cycle' ? (
                    <label className="mt-2 block">
                      <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                        {t('cycleStartDate')}
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
                    {t('save')}
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
                    {t('none')}
                  </button>
                  {INJURY_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={optionBtn(injuryDraft.includes(o))}
                      onClick={() => toggleInjuryOption(o)}
                    >
                      {injuryLabel(o, t)}
                    </button>
                  ))}
                  <Button type="button" variant="primary" size="lg" fullWidth onClick={() => void saveInjuries()}>
                    {t('save')}
                  </Button>
                </>
              )}

              {sheet === 'splitType' &&
                SPLIT_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={optionBtn((profile.splitType ?? 'ppl') === o)}
                    onClick={() => void applySplitType(o)}
                  >
                    {formatSplitType(o, t)}
                  </button>
                ))}

              {sheet === 'gender' && (
                <>
                  <button
                    type="button"
                    className={optionBtn(profile.gender === 'male')}
                    onClick={() => void applyGender('male')}
                  >
                    {t('male')}
                  </button>
                  <button
                    type="button"
                    className={optionBtn(profile.gender === 'female')}
                    onClick={() => void applyGender('female')}
                  >
                    {t('female')}
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
                    {t('save')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <SectionLabel icon={Globe}>{t('general')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1C1C1C]">
          <button
            type="button"
            onClick={() => void toggleLanguage()}
            className="flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('language')}</span>
            <span className="text-sm font-bold text-[#8B5CF6]">{langLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => setSheet('splitType')}
            className="flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('splitType')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#8B5CF6]">
                {formatSplitType(profile.splitType ?? 'ppl', t)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
          <div className="flex w-full items-center justify-between p-4">
            <span className="text-sm text-white">{t('units')}</span>
            <span className="text-sm font-bold text-[#8B5CF6]">{t('metricKg')}</span>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel icon={User}>{t('profile')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1C1C1C]">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setSheet('gender')}
              className="border-b border-r border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="block text-[10px] font-bold text-[#6B7280]">{t('gender').toUpperCase()}</span>
              <span className="text-sm font-bold text-white">{genderLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('age')}
              className="border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="block text-[10px] font-bold text-[#6B7280]">{t('age').toUpperCase()}</span>
              <span className="text-sm font-bold text-white">{profile.age}</span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('weight')}
              className="border-r border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="block text-[10px] font-bold text-[#6B7280]">{t('weight').toUpperCase()}</span>
              <span className="text-sm font-bold text-white">
                {profile.weight}
                {t('kgUnit')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('height')}
              className="p-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="block text-[10px] font-bold text-[#6B7280]">{t('heightCm').toUpperCase()}</span>
              <span className="text-sm font-bold text-white">
                {profile.height}
                {t('cmUnit')}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSheet('trainingEnvironment')}
            className="flex w-full items-center justify-between border-t border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('trainingEnvironment')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#8B5CF6]">
                {formatTrainingEnvironment(profile.trainingEnvironment, t)}
              </span>
              <ChevronRight className="h-4 w-4 text-[#6B7280]" aria-hidden />
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSheet('injuries')}
            className="flex w-full items-center justify-between border-t border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('injuries')}</span>
            <div className="flex items-center gap-2">
              <span className="max-w-[55%] truncate text-right text-sm font-bold text-[#8B5CF6]">
                {formatInjuries(profile.injuries, t)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
        </div>
      </section>

      <section>
        <SectionLabel icon={Sliders}>{t('preferences')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1C1C1C]">
          <button
            type="button"
            onClick={() => setSheet('goal')}
            className="flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('goal')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#8B5CF6]">{formatGoal(profile.goal, t)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSheet('experience')}
            className="flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('experience')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#8B5CF6]">{formatExperience(profile.experience, t)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSheet('restTimer')}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('restTimer')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#8B5CF6]">
                {profile.restTimer}
                {t('secShort')}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
        </div>
      </section>

      <section>
        <SectionLabel icon={Shield}>{t('advanced')}</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1C1C1C]">
          <button
            type="button"
            onClick={() => setSheet('pharmacology')}
            className="flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-sm text-white">{t('pharmacology')}</span>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-bold ${
                  profile.pharmacology === 'on_cycle' ? 'text-[#EF4444]' : 'text-[#22C55E]'
                }`}
              >
                {pharmaLabel}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden />
            </div>
          </button>
          {profile.pharmacology === 'on_cycle' && (
            <div className="border-b border-[#2A2A2A] px-4 pb-4 pt-3">
              {profile.cycleCompound ? (
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
                  {t('compound')}{' '}
                  <span className="font-semibold normal-case text-white">{profile.cycleCompound}</span>
                </p>
              ) : null}
              {profile.cycleStartDate ? (
                <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
                  {t('startDate')}{' '}
                  <span className="font-mono font-semibold normal-case text-white">{profile.cycleStartDate}</span>
                </p>
              ) : null}
              {!profile.cycleCompound && !profile.cycleStartDate ? (
                <p className="text-xs text-[#6B7280]">{t('noCycleDetailsSaved')}</p>
              ) : null}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenImport?.()}
            className="group flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-[#6B7280]" aria-hidden />
              <span className="text-sm text-white">{t('importPastWorkouts')}</span>
            </div>
            <ChevronRight
              className="h-[18px] w-[18px] text-[#2A2A2A] transition-colors group-hover:text-[#8B5CF6]"
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => void handleExportData()}
            className="group flex w-full items-center justify-between border-b border-[#2A2A2A] p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-[#6B7280]" aria-hidden />
              <span className="text-sm text-white">{t('exportData')}</span>
            </div>
            <span className="text-sm font-bold text-[#8B5CF6]">
              {advancedFeedback === t('exported') ? t('exported') : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={importingData}
            className="group flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              {importingData ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-[#8B5CF6]" aria-hidden />
              ) : (
                <Upload className="h-4 w-4 text-[#6B7280]" aria-hidden />
              )}
              <span className="text-sm text-white">{t('importData')}</span>
            </div>
            <span
              className={`text-sm font-bold ${
                advancedFeedback && advancedFeedback !== t('exported') ? 'text-[#8B5CF6]' : 'text-[#6B7280]'
              }`}
            >
              {importingData ? t('importing') : advancedFeedback && advancedFeedback !== t('exported') ? advancedFeedback : ''}
            </span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void handleImportFile(e)}
        />
      </section>
    </div>
  );
}
