import type { APIRoute } from 'astro';

import geometry from '../brand/geometry.json';
import { brandToken } from '../lib/brand.ts';
import brandCss from '../styles/brand.css?raw';

export const GET: APIRoute = () => {
  const { frame, ink, accent } = geometry.favicon;
  const light = { ink: brandToken(brandCss, 'ink'), accent: brandToken(brandCss, 'accent') };
  const dark = { ink: brandToken(brandCss, 'paper'), accent: brandToken(brandCss, 'accent-night') };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame}" width="32" height="32">`,
    `<style>.ink{fill:${light.ink}}.accent{fill:${light.accent}}@media (prefers-color-scheme:dark){.ink{fill:${dark.ink}}.accent{fill:${dark.accent}}}</style>`,
    `<path class="ink" d="${ink}"/>`,
    `<path class="accent" d="${accent}"/>`,
    '</svg>',
  ].join('');
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
