import { defineConfig, globalIgnores } from 'eslint/config';
import webgrip from '@webgrip/eslint-config-astro';

export default defineConfig([
  ...webgrip,
  globalIgnores(['.releaserc.cjs', 'public/demo/', 'replay/']),
  {
    files: ['ops/dns/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'AAAA',
          'CF_PROXY_ON',
          'CF_SINGLE_REDIRECT',
          'D',
          'DefaultTTL',
          'DnsProvider',
          'IGNORE',
          'MX',
          'NewDnsProvider',
          'NewRegistrar',
          'TXT',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
]);
