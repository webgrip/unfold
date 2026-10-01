import { runAxeScan } from '@webgrip/astro-site-toolkit/axe-engine';

await runAxeScan({ a11yOnlyPages: ['/404.html', '/nl/404.html'] });
