// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/site.ts';
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS } from './src/i18n/config.ts';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  compressHTML: false,
  trailingSlash: 'never',
  markdown: {
    syntaxHighlight: false,
  },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !/\/(404|thanks|signup-problem)$/.test(new URL(page).pathname.replace(/\/+$/, '')),
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: { ...LOCALE_TAGS },
      },
    }),
  ],
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      scriptDirective: {
        resources: ["'self'"],
      },
      styleDirective: {
        resources: ["'self'"],
      },
    },
  },
});
