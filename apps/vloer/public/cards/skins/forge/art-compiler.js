import { prelude } from './shader-prelude.js';
import { frontShader } from './front-shader.js';

/** The longest art shader the forge accepts, in characters. The server enforces the same limit. */
export const maxArtSource = 16384;

const forbidden = Object.freeze([
  [/#/, 'uses a preprocessor directive (#)'],
  [/\buniform\b/, 'declares a uniform'],
  [/\bsampler\w*\b/, 'uses a sampler'],
  [/\btexture\w*\s*\(/, 'reads a texture'],
  [/\bmain\s*\(/, 'defines main'],
  [/\b(?:in|out|inout)\s+(?:highp\s+|mediump\s+|lowp\s+)?(?:float|int|vec[234]|mat[234])\s+\w+\s*;/, 'declares a global in or out variable'],
  [/\bprecision\b/, 'sets precision'],
  [/\bdiscard\b/, 'discards fragments'],
]);

/**
 * The rules a theme's art shader must follow before it is compiled: GLSL ES 3.0 text that defines
 * `vec3 art_custom(vec2 uv, float t)` and brings no directive, uniform, sampler, texture read, main, precision or
 * global in/out of its own, in printable ASCII and at most `maxArtSource` characters. Returns what is wrong; empty
 * means the source may be compiled. The server checks the same rules when the shader is stored.
 * @param {unknown} code
 * @returns {string[]}
 */
export function checkArtSource(code) {
  if (typeof code !== 'string' || !code.trim()) return ['The shader is empty.'];
  const problems = [];
  if (code.length > maxArtSource) problems.push(`The shader is longer than ${maxArtSource} characters.`);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(code)) problems.push('The shader contains characters other than printable ASCII.');
  if (!/\bvec3\s+art_custom\s*\(\s*vec2\s+\w+\s*,\s*float\s+\w+\s*\)/.test(code)) problems.push('The shader does not define vec3 art_custom(vec2 uv, float t).');
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const [pattern, reason] of forbidden) if (pattern.test(stripped)) problems.push(`The shader ${reason}.`);
  return problems;
}

/**
 * Takes the first fenced code block out of a model's reply (```glsl preferred), or the reply itself when it has no
 * fence. Answers an empty string for an empty reply.
 * @param {unknown} reply
 */
export function extractShader(reply) {
  const text = typeof reply === 'string' ? reply : '';
  const fenced = /```glsl[^\n]*\n([\s\S]*?)```/i.exec(text) ?? /```[a-z]*\n([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

const vertexSource = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0); vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const lines = text => text.split('\n').length - 1;

function relabel(log, source, code) {
  const start = lines(source.slice(0, source.indexOf(code))) + 1;
  const end = start + lines(code);
  return log.replace(/\b(\d+):(\d+):/g, (match, file, line) => {
    const at = Number(line);
    return at >= start && at <= end ? `${file}:${at - start + 1}:` : match;
  });
}

function probeSource(code) {
  return `#version 300 es
precision highp float; precision highp int;
uniform float uT; in vec2 vUv; out vec4 outColor;
${prelude}
${code}
void main() { outColor = vec4(art_custom(vUv, uT), 1.0); }`;
}

let context = null;

function gl() {
  if (context && !context.isContextLost()) return context;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  context = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  return context;
}

function compile(g, type, source) {
  const shader = g.createShader(type);
  g.shaderSource(shader, source);
  g.compileShader(shader);
  const ok = g.getShaderParameter(shader, g.COMPILE_STATUS);
  const log = g.getShaderInfoLog(shader) || '';
  if (!ok) { g.deleteShader(shader); return { shader: null, log: log || 'The shader did not compile.' }; }
  return { shader, log: '' };
}

function frame(g, program, t) {
  g.useProgram(program);
  g.uniform1f(g.getUniformLocation(program, 'uT'), t);
  g.viewport(0, 0, 64, 48);
  g.drawArrays(g.TRIANGLES, 0, 3);
  const pixels = new Uint8Array(64 * 48 * 4);
  g.readPixels(0, 0, 64, 48, g.RGBA, g.UNSIGNED_BYTE, pixels);
  return pixels;
}

/**
 * Compiles a theme's art shader in this browser on its own (so the log's line numbers count from the shader's first
 * line) and then exactly as the forge will draw it (inside the full front shader, with every foil and art preset
 * beside it), then renders a 64 × 48 probe at t = 0 and t = 10 and refuses a picture that is one flat colour. The code only ever runs on the GPU. Answers `{ ok: true }` or `{ ok: false, log }` with the
 * compiler's log or the reason, which the generator sends back to the model.
 * @param {string} code
 * @returns {{ ok: true } | { ok: false, log: string }}
 */
export function compileArt(code) {
  const problems = checkArtSource(code);
  if (problems.length) return { ok: false, log: problems.join('\n') };
  const g = gl();
  if (!g) return { ok: false, log: 'This browser has no WebGL2, so the shader cannot be checked here.' };
  const probe = probeSource(code);
  const vertex = compile(g, g.VERTEX_SHADER, vertexSource);
  const fragment = compile(g, g.FRAGMENT_SHADER, probe);
  if (!vertex.shader || !fragment.shader) {
    if (vertex.shader) g.deleteShader(vertex.shader);
    if (fragment.shader) g.deleteShader(fragment.shader);
    return { ok: false, log: fragment.shader ? vertex.log : relabel(fragment.log, probe, code) };
  }
  const front = `#version 300 es\n${frontShader({ key: 'custom', code }, 'holo')}`;
  const full = compile(g, g.FRAGMENT_SHADER, front);
  if (!full.shader) { g.deleteShader(vertex.shader); g.deleteShader(fragment.shader); return { ok: false, log: `${relabel(full.log, front, code)}\nA helper name may clash with the card's own shader library; prefix every helper with cu_.` }; }
  g.deleteShader(full.shader);
  const program = g.createProgram();
  g.attachShader(program, vertex.shader);
  g.attachShader(program, fragment.shader);
  g.linkProgram(program);
  const linked = g.getProgramParameter(program, g.LINK_STATUS);
  const linkLog = g.getProgramInfoLog(program) || 'The shader did not link.';
  try {
    if (!linked) return { ok: false, log: linkLog };
    const first = frame(g, program, 0);
    const later = frame(g, program, 10);
    let varied = false;
    for (let i = 4; i < first.length && !varied; i += 4) if (first[i] !== first[0] || first[i + 1] !== first[1] || first[i + 2] !== first[2]) varied = true;
    const moved = first.some((value, index) => value !== later[index]);
    if (!varied && !moved) return { ok: false, log: 'The shader compiled, but it paints one flat colour (often black, or NaN, which reads back as black). Paint a picture with light and shade that moves over time.' };
    return { ok: true };
  } finally {
    g.deleteProgram(program);
    g.deleteShader(vertex.shader);
    g.deleteShader(fragment.shader);
  }
}
