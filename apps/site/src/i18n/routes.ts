import type { Audience } from '../data/catalogue.ts';
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, type Locale } from './config.ts';

export const ROUTES = {
  home: '',
  features: '/features',
  integrations: '/integrations',
  forAgencies: '/for/agencies',
  forTeams: '/for/teams',
  forDevelopers: '/for/developers',
  forPlatform: '/for/platform',
  privacy: '/privacy',
  thanks: '/thanks',
  signupProblem: '/signup-problem',
  notFound: '/404',
} as const;

export type RouteKey = keyof typeof ROUTES;

export const AUDIENCE_ROUTES = {
  agencies: 'forAgencies',
  teams: 'forTeams',
  developers: 'forDevelopers',
  platform: 'forPlatform',
} as const satisfies Record<Audience, RouteKey>;

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
