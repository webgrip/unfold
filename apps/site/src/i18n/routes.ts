import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, type Locale } from './config.ts';

export const ROUTES = {
  home: '',
  privacy: '/privacy',
  thanks: '/thanks',
  signupProblem: '/signup-problem',
  notFound: '/404',
} as const;

export type RouteKey = keyof typeof ROUTES;

export function routePath(key: RouteKey, locale: Locale): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${prefix}${ROUTES[key]}` || '/';
}

export function absoluteUrl(path: string, site: string): string {
  return new URL(path, site).href;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export function alternatesFor(key: RouteKey, site: string): Alternate[] {
  return [
    ...LOCALES.map((locale) => ({
      hreflang: LOCALE_TAGS[locale],
      href: absoluteUrl(routePath(key, locale), site),
    })),
    { hreflang: 'x-default', href: absoluteUrl(routePath(key, DEFAULT_LOCALE), site) },
  ];
}
