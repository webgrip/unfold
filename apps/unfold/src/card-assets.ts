import { createHash } from 'node:crypto';
import { maxSvgBytes, sanitizeSvg } from './svg-sanitize.ts';

/** What a theme asset is for: art behind the card's window, the card back, the set symbol or an art shader. */
export type AssetPurpose = 'art' | 'back' | 'symbol' | 'shader';
export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm' | 'image/svg+xml' | 'text/x-glsl';
export type PreparedAsset = { id: string; purpose: AssetPurpose; mediaType: MediaType; content: Buffer };

/** The media types each purpose accepts. Unfold decides the type from the bytes, never from the upload's name or header. */
export const assetPurposes: Readonly<Record<AssetPurpose, readonly MediaType[]>> = Object.freeze({
  art: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'] as MediaType[]),
  back: Object.freeze(['image/png', 'image/jpeg', 'image/webp'] as MediaType[]),
  symbol: Object.freeze(['image/svg+xml'] as MediaType[]),
  shader: Object.freeze(['text/x-glsl'] as MediaType[]),
});

/** The largest asset of each media type, in bytes. */
export const assetLimits: Readonly<Record<MediaType, number>> = Object.freeze({
  'image/png': 2 * 1024 * 1024, 'image/jpeg': 2 * 1024 * 1024, 'image/webp': 2 * 1024 * 1024,
  'video/mp4': 8 * 1024 * 1024, 'video/webm': 8 * 1024 * 1024,
  'image/svg+xml': maxSvgBytes, 'text/x-glsl': 16 * 1024,
});

/** The largest upload Unfold reads at all; anything bigger is refused before it is buffered. */
export const maxUploadBytes = Math.max(...Object.values(assetLimits));
/** The widest or tallest image Unfold accepts, in pixels. */
export const maxImageSide = 4096;

export class AssetError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'asset_rejected') { super(message); this.status = status; this.code = code; }
}

const mp4Brands = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'mmp4', 'M4V ']);

/** The media type the bytes are, from their signature: PNG, JPEG, WebP, MP4 or WebM, or null for anything else. */
export function sniff(bytes: Buffer): MediaType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.toString('latin1', 4, 8) === 'ftyp' && mp4Brands.has(bytes.toString('latin1', 8, 12))) return 'video/mp4';
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3 && bytes.subarray(0, 64).includes(Buffer.from('webm', 'latin1'))) return 'video/webm';
  return null;
}

/** An image's width and height from its header, or null when the header cannot be read. */
export function imageSize(bytes: Buffer, type: MediaType): { width: number; height: number } | null {
  try {
    if (type === 'image/png') return bytes.toString('latin1', 12, 16) === 'IHDR' ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null;
    if (type === 'image/webp') {
      const chunk = bytes.toString('latin1', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (type === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
        const size = bytes.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
        offset += 2 + size;
      }
      return null;
    }
  } catch { return null; }
  return null;
}

const forbiddenGlsl: [RegExp, string][] = [
  [/#/, 'uses a preprocessor directive (#)'],
  [/\buniform\b/, 'declares a uniform'],
  [/\bsampler\w*\b/, 'uses a sampler'],
  [/\btexture\w*\s*\(/, 'reads a texture'],
  [/\bmain\s*\(/, 'defines main'],
  [/\b(?:in|out|inout)\s+(?:highp\s+|mediump\s+|lowp\s+)?(?:float|int|vec[234]|mat[234])\s+\w+\s*;/, 'declares a global in or out variable'],
  [/\bprecision\b/, 'sets precision'],
  [/\bdiscard\b/, 'discards fragments'],
];

/**
 * What is wrong with an art shader's source: it must define `vec3 art_custom(vec2 uv, float t)` in printable ASCII
 * within the shader limit and bring no directive, uniform, sampler, texture read, main, precision or global in/out of
 * its own. The browser checks the same rules (`public/cards/skins/forge/art-compiler.js`) and compiles it; Unfold cannot
 * compile GLSL, so these rules are what the server enforces.
 */
export function checkArtSource(code: unknown): string[] {
  if (typeof code !== 'string' || !code.trim()) return ['The shader is empty.'];
  const problems: string[] = [];
  if (code.length > assetLimits['text/x-glsl']) problems.push(`The shader is longer than ${assetLimits['text/x-glsl']} characters.`);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(code)) problems.push('The shader contains characters other than printable ASCII.');
  if (!/\bvec3\s+art_custom\s*\(\s*vec2\s+\w+\s*,\s*float\s+\w+\s*\)/.test(code)) problems.push('The shader does not define vec3 art_custom(vec2 uv, float t).');
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const [pattern, reason] of forbiddenGlsl) if (pattern.test(stripped)) problems.push(`The shader ${reason}.`);
  return problems;
}

/**
 * Checks an uploaded theme asset for `purpose` and returns what Unfold stores: the media type from the bytes, the
 * content (a set symbol is the sanitized copy) and its id, the SHA-256 of that content. Refuses an empty or oversized
 * file, a type the purpose does not take, an image larger than `maxImageSide` on a side or with an unreadable header,
 * an SVG the sanitizer refuses and a shader that breaks the source rules.
 */
export function prepareAsset(purpose: string, bytes: Buffer): PreparedAsset {
  if (!Object.hasOwn(assetPurposes, purpose)) throw new AssetError('Choose what the file is for: art, back, symbol or shader.');
  const use = purpose as AssetPurpose;
  if (!bytes.length) throw new AssetError('The file is empty.');
  let mediaType: MediaType | null;
  let content = bytes;
  if (use === 'symbol') {
    if (bytes.length > assetLimits['image/svg+xml']) throw new AssetError(`A set symbol may be at most ${assetLimits['image/svg+xml'] / 1024} KiB.`, 413, 'asset_too_large');
    if (sniff(bytes)) throw new AssetError('A set symbol must be an SVG file.');
    try { content = Buffer.from(sanitizeSvg(bytes), 'utf8'); } catch (error: any) { throw new AssetError(error?.message || 'The SVG was refused.', 400, 'svg_rejected'); }
    mediaType = 'image/svg+xml';
  } else if (use === 'shader') {
    if (bytes.length > assetLimits['text/x-glsl']) throw new AssetError(`A shader may be at most ${assetLimits['text/x-glsl'] / 1024} KiB.`, 413, 'asset_too_large');
    const code = bytes.toString('utf8');
    const problems = checkArtSource(code);
    if (problems.length) throw new AssetError(problems.join(' '), 400, 'shader_rejected');
    content = Buffer.from(code.replace(/\r\n?/g, '\n'), 'utf8');
    mediaType = 'text/x-glsl';
  } else {
    mediaType = sniff(bytes);
    if (!mediaType || !assetPurposes[use].includes(mediaType)) throw new AssetError(use === 'back' ? 'A card back must be a PNG, JPEG or WebP image.' : 'Art must be a PNG, JPEG or WebP image, or an MP4 or WebM video.');
    if (bytes.length > assetLimits[mediaType]) throw new AssetError(`This ${mediaType.startsWith('video/') ? 'video' : 'image'} is larger than ${assetLimits[mediaType] / 1024 / 1024} MiB.`, 413, 'asset_too_large');
    if (mediaType.startsWith('image/')) {
      const size = imageSize(bytes, mediaType);
      if (!size || !size.width || !size.height) throw new AssetError('The image header could not be read.');
      if (size.width > maxImageSide || size.height > maxImageSide) throw new AssetError(`Images may be at most ${maxImageSide} pixels on a side.`);
    }
  }
  return { id: createHash('sha256').update(content).digest('hex'), purpose: use, mediaType, content };
}
