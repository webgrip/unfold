import { defineConfig, globalIgnores } from 'eslint/config';
import webgrip from '@webgrip/eslint-config-astro';

export default defineConfig([...webgrip, globalIgnores(['.releaserc.cjs'])]);
