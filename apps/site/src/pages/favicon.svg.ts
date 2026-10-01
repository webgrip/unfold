import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

import Mark from '../components/Mark.astro';
import { brandToken } from '../lib/brand.ts';
import brandCss from '../styles/brand.css?raw';

export const GET: APIRoute = async () => {
  const container = await AstroContainer.create();
  const svg = await container.renderToString(Mark, {
    props: {
      size: 32,
      colors: { ground: brandToken(brandCss, 'ink'), stroke: brandToken(brandCss, 'accent') },
    },
  });
  const markup = svg
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\s+data-astro-[\w-]+(="[^"]*")?/g, '')
    .trim();
  return new Response(markup, { headers: { 'Content-Type': 'image/svg+xml' } });
};
