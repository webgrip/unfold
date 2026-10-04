import type { Locale } from './config.ts';
import { en, type Dictionary } from './en.ts';
import { nl } from './nl.ts';

export const DICTIONARIES: Record<Locale, Dictionary> = { en, nl };

export function dictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
