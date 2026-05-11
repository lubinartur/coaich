import { useEffect, useMemo, useState } from 'react';
import { db } from '@/services/db';
import { translations, type TranslationKey, type TranslationLanguage } from '@/i18n/translations';

const DEFAULT_LANGUAGE: TranslationLanguage = 'en';

export const useTranslation = () => {
  const [lang, setLang] = useState<TranslationLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let cancelled = false;

    void db.profile.get(1).then((profile) => {
      if (!cancelled && profile?.language) {
        setLang(profile.language);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const t = useMemo(
    () => (key: TranslationKey): string => translations[lang][key] || translations.en[key] || key,
    [lang],
  );

  return { t, lang, locale: lang === 'ru' ? 'ru-RU' : 'en-US' };
};
