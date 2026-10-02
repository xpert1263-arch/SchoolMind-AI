import { useMemo } from 'react';
import { createTranslator, type Translator } from '.';
import { resolveText, type Locale, type Text } from '@/data/types';
import { useLocale } from '@/state/store';

export interface I18n {
  locale: Locale;
  /** UI copy by dotted key: `t('student.home.priorities')`. */
  t: Translator;
  /** Demo content that ships in both languages. */
  text: (value: Text) => string;
}

export function useI18n(): I18n {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      t: createTranslator(locale),
      text: (value: Text) => resolveText(value, locale),
    }),
    [locale],
  );
}
