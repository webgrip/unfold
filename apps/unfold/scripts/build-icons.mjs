import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const brand = resolve(app, '../../docs/brand');
const art = name => readFileSync(resolve(brand, name), 'utf8');
const sized = (svg, width, height = width) => svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${width}" height="${height}"`);

const ink = '#141A1D';
const paper = '#F4F6F2';
const grafiet = '#5E6B66';
const tagline = 'Define work, follow it and review it. Ploeg runs it.';

const markPaths = [...art('mark-mono.svg').matchAll(/<path d="([^"]+)"/g)].map(match => match[1]).join('');
const editorIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="24" height="24" fill="none" role="img" aria-label="Unfold">
<path d="${markPaths}" fill="currentColor"/>
</svg>
`;

const webmanifest = `${JSON.stringify({
  name: 'Unfold',
  short_name: 'Unfold',
  description: tagline,
  icons: [
    { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: ink,
  background_color: paper,
  display: 'standalone',
  start_url: './',
}, null, 2)}\n`;

const text = {
  'public/site.webmanifest': webmanifest,
  'extensions/vscode/media/unfold.svg': editorIcon,
};

const check = process.argv.includes('--check');
const stale = [];
for (const [name, content] of Object.entries(text)) {
  const path = resolve(app, name);
  if (check) { if (!existsSync(path) || readFileSync(path, 'utf8') !== content) stale.push(`${name} is stale; run npm run icons:build`); }
  else writeFileSync(path, content);
}
if (stale.length) { console.error(stale.join('\n')); process.exit(1); }

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + 16 * pngs.length;
  pngs.forEach(({ size, data }, index) => {
    const at = index * 16;
    entries.writeUInt8(size, at); entries.writeUInt8(size, at + 1);
    entries.writeUInt16LE(1, at + 4); entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8); entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...pngs.map(png => png.data)]);
}

if (process.argv.includes('--png')) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.UNFOLD_CHROMIUM_BIN ? { executablePath: process.env.UNFOLD_CHROMIUM_BIN } : {});
  const shoot = async (html, width, height) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:none}svg{display:block}.frame{width:${width}px;height:${height}px}</style><div class="frame">${html}</div>`);
    const data = await (await page.$('.frame')).screenshot({ omitBackground: true });
    await page.close();
    return data;
  };
  const write = (name, data) => { const path = resolve(app, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
  const favicon = art('favicon.svg');
  const tile = art('tile.svg');
  write('public/favicon-16x16.png', await shoot(sized(favicon, 16), 16, 16));
  write('public/favicon-32x32.png', await shoot(sized(favicon, 32), 32, 32));
  write('public/apple-touch-icon.png', await shoot(sized(tile.replace(/ rx="[\d.]+"/, ''), 180), 180, 180));
  write('public/android-chrome-192x192.png', await shoot(sized(tile, 192), 192, 192));
  write('public/android-chrome-512x512.png', await shoot(sized(tile, 512), 512, 512));
  write('extensions/vscode/media/icon.png', await shoot(sized(tile, 256), 256, 256));
  const sizes = [16, 32, 48];
  write('public/favicon.ico', ico(await Promise.all(sizes.map(async size => ({ size, data: await shoot(sized(favicon, size), size, size) })))));
  const lockup = art('lockup-horizontal.svg').replace(/width="([\d.]+)" height="([\d.]+)"/, (match, width, height) => `width="${Math.round(Number(width) * 120 / Number(height))}" height="120"`);
  write('public/og-image.png', await shoot(`<div style="box-sizing:border-box;width:1200px;height:630px;padding:96px;background:${paper};display:flex;flex-direction:column;justify-content:flex-end;gap:28px;font-family:Archivo,'Helvetica Neue',Arial,sans-serif">${lockup}<p style="margin:0;font-size:34px;font-weight:500;color:${grafiet}">${tagline}</p></div>`, 1200, 630));
  await browser.close();
}
console.log(check ? 'Icons match the Unfold brand.' : `Built ${Object.keys(text).length} icon sources${process.argv.includes('--png') ? ' and the raster icons' : ''} from docs/brand.`);
