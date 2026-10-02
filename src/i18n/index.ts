import type { Locale } from '@/data/types';
import { uz, type Dictionary } from './uz';
import { ru } from './ru';

export type { Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { uz, ru };

export const locales: Locale[] = ['uz', 'ru'];

export const localeLabels: Record<Locale, string> = { uz: 'UZ', ru: 'RU' };

/** Every dotted leaf path of the dictionary, e.g. `student.home.priorities`. */
export type TranslationKey = LeafPaths<Dictionary>;

type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

export type TranslationVars = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(locale: Locale, key: TranslationKey, vars?: TranslationVars): string {
  const value = lookup(dictionaries[locale], key) ?? lookup(dictionaries.uz, key);
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}
