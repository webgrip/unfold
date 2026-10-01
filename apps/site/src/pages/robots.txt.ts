import type { APIRoute } from 'astro';
import { SITE_INDEXABLE, SITE_URL } from '../config/site.ts';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\n${SITE_INDEXABLE ? 'Allow' : 'Disallow'}: /\n\nSitemap: ${new URL('/sitemap-index.xml', SITE_URL).href}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
