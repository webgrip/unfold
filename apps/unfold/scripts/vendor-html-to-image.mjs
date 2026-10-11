import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'node_modules', 'html-to-image');
const target = join(root, 'public', 'vendor', 'html-to-image');
const check = process.argv.includes('--check');

/** The html-to-image version Report a problem rasterises the page with: the exact devDependency package.json pins. */
export const htmlToImageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies['html-to-image'];

/**
 * The files copied into public/vendor/html-to-image/: every ES module of the package, each relative import given its
 * `.js` extension so the browser loads it from Unfold's own origin under `script-src 'self'`, plus the MIT licence
 * and the version. Run with `--check` to compare the committed copy with a fresh one.
 */
export function vendoredFiles() {
  const files = {};
  for (const name of readdirSync(join(source, 'es')).filter(file => file.endsWith('.js')).sort()) {
    files[name] = readFileSync(join(source, 'es', name), 'utf8').replace(/(\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\2/g, (match, keyword, quote, specifier) => {
      if (!specifier.startsWith('./')) throw new Error(`html-to-image ${name} imports ${specifier}, which is not vendored`);
      return `${keyword}${quote}${specifier.endsWith('.js') ? specifier : `${specifier}.js`}${quote}`;
    }).replace(/\n\/\/# sourceMappingURL=.*$/m, '\n');
  }
  files.LICENSE = readFileSync(join(source, 'LICENSE'), 'utf8');
  files.VERSION = `${htmlToImageVersion}\n`;
  return files;
}

const files = vendoredFiles();
if (check) {
  const present = existsSync(target) ? readdirSync(target) : [];
  const stale = [...Object.entries(files).filter(([name, code]) => !existsSync(join(target, name)) || readFileSync(join(target, name), 'utf8') !== code).map(([name]) => name), ...present.filter(name => !(name in files))];
  if (stale.length) { process.stderr.write(`public/vendor/html-to-image/ is stale (${stale.join(', ')}); run npm run vendor:html-to-image\n`); process.exit(1); }
  process.stdout.write(`public/vendor/html-to-image/ matches html-to-image ${htmlToImageVersion}: ${Object.keys(files).length} files.\n`);
} else {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const [name, code] of Object.entries(files)) writeFileSync(join(target, name), code);
  process.stdout.write(`Vendored html-to-image ${htmlToImageVersion} into public/vendor/html-to-image/\n`);
}
