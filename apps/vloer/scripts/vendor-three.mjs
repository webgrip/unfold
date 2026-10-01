import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'node_modules', 'three');
const target = join(root, 'public', 'vendor', 'three');
const check = process.argv.includes('--check');

/** The three.js version the forge skin is written against; package.json pins the same devDependency. */
export const threeVersion = '0.165.0';
/**
 * The files copied into public/vendor/three/, so the browser imports them from Vloer's own origin under
 * `script-src 'self'` and without an import map. Each gets a flat kebab-case name that the static route accepts, and
 * every bare `three` import and every relative addon import is rewritten to the flat sibling. Run with `--check` to
 * compare the committed copy with a fresh one.
 */
export const vendoredFiles = Object.freeze({
  'build/three.module.min.js': 'three-module.js',
  'examples/jsm/environments/RoomEnvironment.js': 'room-environment.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js': 'rounded-box-geometry.js',
  'examples/jsm/postprocessing/EffectComposer.js': 'effect-composer.js',
  'examples/jsm/postprocessing/RenderPass.js': 'render-pass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js': 'unreal-bloom-pass.js',
  'examples/jsm/postprocessing/OutputPass.js': 'output-pass.js',
  'examples/jsm/postprocessing/Pass.js': 'pass.js',
  'examples/jsm/postprocessing/ShaderPass.js': 'shader-pass.js',
  'examples/jsm/postprocessing/MaskPass.js': 'mask-pass.js',
  'examples/jsm/shaders/CopyShader.js': 'copy-shader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js': 'luminosity-high-pass-shader.js',
  'examples/jsm/shaders/OutputShader.js': 'output-shader.js',
});

function rewrite(from, code) {
  return code.replace(/(\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\2/g, (match, keyword, quote, specifier) => {
    if (specifier === 'three') return `${keyword}${quote}./three-module.js${quote}`;
    if (!specifier.startsWith('.')) throw new Error(`${from} imports ${specifier}, which is not vendored`);
    const resolved = posix.join(posix.dirname(from), specifier);
    const flat = vendoredFiles[resolved];
    if (!flat) throw new Error(`${from} imports ${resolved}, which is not in the vendored list`);
    return `${keyword}${quote}./${flat}${quote}`;
  });
}

function build() {
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (manifest.version !== threeVersion) throw new Error(`node_modules/three is ${manifest.version}; run npm ci to get the pinned ${threeVersion}`);
  const files = new Map();
  for (const [from, to] of Object.entries(vendoredFiles)) {
    const header = `// three.js ${threeVersion} (MIT, see LICENSE in this folder): ${from}, vendored by scripts/vendor-three.mjs. Do not edit.\n`;
    const code = readFileSync(join(source, from), 'utf8');
    files.set(to, header + (from.startsWith('build/') ? code : rewrite(from, code)));
  }
  files.set('LICENSE', readFileSync(join(source, 'LICENSE'), 'utf8'));
  files.set('VERSION', `${threeVersion}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(source)) { process.stderr.write('node_modules/three is missing; run npm ci first.\n'); process.exit(1); }
  const files = build();
  if (check) {
    const present = existsSync(target) ? readdirSync(target) : [];
    const drift = [...files].filter(([name, content]) => !present.includes(name) || readFileSync(join(target, name), 'utf8') !== content).map(([name]) => name);
    const extra = present.filter(name => !files.has(name));
    if (drift.length || extra.length) {
      process.stderr.write(`public/vendor/three/ drifted from three ${threeVersion}: ${[...drift, ...extra.map(name => `${name} (unexpected)`)].join(', ')}. Run npm run vendor:three.\n`);
      process.exit(1);
    }
    process.stdout.write(`public/vendor/three/ matches three ${threeVersion}: ${files.size} files.\n`);
  } else {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const [name, content] of files) { mkdirSync(dirname(join(target, name)), { recursive: true }); writeFileSync(join(target, name), content); }
    process.stdout.write(`Vendored three ${threeVersion} into public/vendor/three/: ${files.size} files.\n`);
  }
}
