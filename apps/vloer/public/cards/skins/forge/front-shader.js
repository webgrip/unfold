import { prelude } from './shader-prelude.js';
import { foils } from './shader-foils.js';
import { art } from './shader-art.js';

function artCall(look, uv) {
  if (look.key === 'media') return `texture(uArtTex, ${uv}).rgb`;
  if (look.key === 'custom') return `art_custom(${uv}, uTime)`;
  return `art_${look.key}(${uv}, uTime)`;
}

/**
 * The front's fragment shader for one art and one foil pattern. A theme's shader art (`look.code`, compiled in the
 * browser before it was stored) is placed after the preset library and called as `art_custom`; uploaded art samples
 * `uArtTex`. A card's rarity colours only the frame band (the mask's green outside the art window): `uRarity.x`
 * blends it through the tier's metal (`uMetalLo` to `uMetalHi`), `.y` adds iridescence, `.z` is the predicted glow
 * at the edge in `uHint`, and `.w` the reveal's light sweeping along the frame.
 * @param {{ key: string, code?: string }} look
 * @param {string} patternKey
 */
export function frontShader(look, patternKey) {
  const custom = look.key === 'custom' ? `\n${look.code}\n` : '';
  return `precision highp float; precision highp int;
uniform sampler2D uFace, uMask, uHeight, uArtTex;
uniform vec4 uArtRect; uniform float uTime; uniform vec2 uP; uniform vec3 uV; uniform float uIntensity; uniform vec3 uCover; uniform float uBorder;
uniform float uSeed; uniform float uCrack, uMend, uCrackSeed; uniform vec2 uImpact; uniform float uFlash, uDesat; uniform float uRelief; uniform vec2 uTexel; uniform float uArtDepth; uniform float uWipe; uniform float uGlint;
uniform vec3 uMetalLo, uMetalHi, uHint; uniform vec4 uRarity;
in vec2 vUv; out vec4 outColor;
${prelude}
${foils}
${art}${custom}
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 crackField(vec2 uv){
  vec2 q = (uv - uImpact) * vec2(0.716, 1.0);
  float best = 9.0, reach = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k) + uCrackSeed * 17.0;
    float a = float(k) * 1.0471976 + (hash11(fk + 3.1) - 0.5) * 0.9;
    float len = 0.22 + 0.5 * hash11(fk * 7.3);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 p0 = vec2(0.0);
    for (int s = 0; s < 8; s++) {
      float fs = float(s);
      float turn = (hash11(fk * 13.0 + fs * 1.7) - 0.5) * 0.9;
      dir = normalize(dir + vec2(-dir.y, dir.x) * turn);
      vec2 p1 = p0 + dir * len / 8.0;
      float d = seg(q, p0, p1);
      float along = (fs + 0.5) / 8.0 * len;
      if (d < best) { best = d; reach = along; }
      if (s == 3) {
        vec2 bdir = normalize(dir + vec2(-dir.y, dir.x) * (hash11(fk) > 0.5 ? 1.2 : -1.2));
        vec2 b1 = p1 + bdir * len * 0.22;
        float db = seg(q, p1, b1);
        if (db < best) { best = db; reach = along + 0.05; }
      }
      p0 = p1;
    }
  }
  return vec2(best, reach);
}
void main(){
  vec4 face = texture(uFace, vUv);
  vec4 m = texture(uMask, vUv);
  float hC = texture(uHeight, vUv).r;
  float hL = texture(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(uHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(uHeight, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture(uHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec3 N = normalize(vec3((hL - hR) * uRelief, (hD - hU) * uRelief, 1.0));
  vec3 Vd = normalize(uV);
  vec2 auv = (vUv - uArtRect.xy) / (uArtRect.zw - uArtRect.xy);
  vec2 par = -Vd.xy / max(Vd.z, 0.35) * uArtDepth;
  vec2 artUv = clamp((auv - 0.5) * 0.9 + 0.5 + par, 0.0, 1.0);
  vec3 artC = ${artCall(look, 'artUv')};
  vec2 wall = auv + par * 2.2;
  float edgeDist = min(min(wall.x, 1.0 - wall.x), min(wall.y * 1.4, (1.0 - wall.y) * 1.4));
  artC *= mix(0.4, 1.0, smoothstep(-0.005, 0.07, edgeDist));
  vec3 base = mix(artC, face.rgb, face.a);
  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
  FoilIn fb = FoilIn(vUv, uP, Vd, uTime, base, luma, m.r, m.g, m.b, uSeed, uIntensity);
  vec3 matte = foil_none(fb);
  float cover = clamp(m.g * uCover.x + m.r * uCover.y + (1.0 - clamp(m.g + m.r, 0.0, 1.0)) * uCover.z, 0.0, 1.0);
  float sweep = vUv.x * 0.75 + (1.0 - vUv.y) * 0.25;
  cover *= smoothstep(uWipe, uWipe - 0.08, sweep);
  FoilIn ff = fb;
  ff.intensity = uIntensity * cover;
  vec3 foiled = foil_${patternKey}(ff);
  vec3 col = mix(matte, foiled, step(0.001, cover));
  float frameBand = m.g * (1.0 - m.r);
  if (uRarity.x > 0.001) {
    float fl = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float ramp = clamp(fl * 1.6 + 0.25 * (vUv.x - vUv.y) + 0.35 * dot(Vd.xy, vec2(0.6, 0.4)), 0.0, 1.0);
    vec3 metal = mix(uMetalLo, uMetalHi, ramp);
    metal = mix(metal, spectrum(vUv.x * 0.9 + vUv.y * 0.7 + dot(Vd.xy, vec2(0.8, 0.5)) + uTime * 0.02) * (0.55 + 0.6 * ramp), uRarity.y);
    col = mix(col, metal * (0.5 + 0.7 * fl), frameBand * uRarity.x * (1.0 - 0.25 * cover));
  }
  if (uRarity.z > 0.001) {
    vec2 rimUv = min(vUv, 1.0 - vUv) * vec2(1.0, 1.397);
    float rimGlow = smoothstep(0.035, 0.0, min(rimUv.x, rimUv.y));
    col += uHint * rimGlow * frameBand * uRarity.z * (0.45 + 0.35 * sin(uTime * 2.4));
  }
  if (uRarity.w < 1.3) col += mix(uHint, vec3(1.0), 0.4) * exp(-pow((vUv.x * 0.6 + (1.0 - vUv.y) * 0.4 - uRarity.w) * 30.0, 2.0)) * frameBand * 0.7;
  if (uBorder > 0.5) {
    vec2 q = (vUv - 0.5) * vec2(0.716, 1.0);
    float ang = atan(q.y, q.x) / TAU + 0.5;
    float d = fract(fract(uTime * 0.085) - ang);
    float comet = exp(-d * 7.0) * 0.9 + exp(-(1.0 - d) * 90.0);
    float d2 = fract(fract(uTime * 0.085 + 0.5) - ang);
    comet += exp(-d2 * 7.0) * 0.5;
    float band = m.g * (1.0 - m.r);
    vec3 hue = spectrum(ang * 2.0 - uTime * 0.04);
    col = fl_screen(col, (hue * 0.6 + 0.3) * comet * band * 0.8);
  }
  vec2 pos = (vUv - 0.5) * vec2(0.716, 1.0);
  vec2 lp = uP * vec2(0.716, 1.0) * 0.62;
  vec3 L = normalize(vec3(lp - pos, 0.48));
  float lambert = dot(N, L) - L.z;
  vec3 Hh = normalize(L + Vd);
  float shine = clamp((hC - 0.52) * 2.5, 0.0, 1.0) * 0.45 * (1.0 - m.b * 0.5) + m.g * (1.0 - m.r) * 0.6;
  float spec = max(pow(clamp(dot(N, Hh), 0.0, 1.0), 48.0) - pow(clamp(Hh.z, 0.0, 1.0), 48.0), 0.0);
  col *= 1.0 + lambert * 1.4;
  col += spec * shine * vec3(1.0, 0.96, 0.88) * 0.85;
  if (uCrack > 0.0) {
    vec2 cf = crackField(vUv);
    float on = step(cf.y, uCrack * 0.7 + 0.02);
    float line = smoothstep(0.0032, 0.0006, cf.x) * on;
    float halo = smoothstep(0.012, 0.0, cf.x) * on;
    float gold = uMend > 0.0 ? step(cf.y, uMend * 0.7 + 0.02) : 0.0;
    vec3 dark = mix(col * 0.45, vec3(0.02), line);
    col = mix(col, dark, line * (1.0 - gold) + halo * 0.25 * (1.0 - gold));
    vec3 g = vec3(1.0, 0.8, 0.38) * (1.02 + 0.18 * sin(uTime * 3.0 + cf.y * 40.0));
    float ridge = 0.85 + 0.45 * max(dot(normalize(vec3(L.xy, 0.8)), vec3(0.0, 0.0, 1.0)), 0.0);
    col = mix(col, g * ridge, line * gold);
    col += vec3(1.0, 0.7, 0.3) * halo * gold * 0.14;
  }
  if (uWipe < 1.1) col += vec3(1.0, 0.92, 0.75) * exp(-pow((sweep - uWipe) * 38.0, 2.0)) * 0.55;
  if (uGlint < 1.3) col += vec3(1.0, 0.95, 0.82) * exp(-pow((sweep - uGlint) * 24.0, 2.0)) * 0.42;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(l), uDesat);
  col += uFlash * vec3(1.0, 0.95, 0.85);
  outColor = vec4(toLin(col), 1.0);
}`;
}
