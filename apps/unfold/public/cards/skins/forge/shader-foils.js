/** The forge foil library (GLSL ES 3.0): `FoilIn` and one `vec3 foil_<pattern>(FoilIn f)` per foil pattern, each returning the final colour, and `f.base` when `f.intensity` is 0. */
export const foils = `#ifndef FOIL_IN_DECLARED
#define FOIL_IN_DECLARED
struct FoilIn {
  vec2  uv;
  vec2  p;
  vec3  V;
  float t;
  vec3  base;
  float luma;
  float art;
  float frame;
  float panel;
  float seed;
  float intensity;
};
#endif

const float FL_ASPECT = 0.7159091;

struct FlCtx {
  vec2  pos;
  vec2  lp;
  vec3  L;
  vec3  V;
  vec3  H;
  vec2  g;
  float edge;
  float near;
  float pfc;
  float lit;
  float face;
};

FlCtx fl_ctx(FoilIn f) {
  FlCtx c;
  c.pos = (f.uv - 0.5) * vec2(FL_ASPECT, 1.0);
  c.lp = clamp(f.p, -1.25, 1.25) * vec2(FL_ASPECT, 1.0) * 0.55;
  vec2 d = c.lp - c.pos;
  c.L = normalize(vec3(d, 0.62));
  c.V = dot(f.V, f.V) > 1e-8 ? normalize(f.V) : vec3(0.0, 0.0, 1.0);
  c.H = normalize(c.L + c.V);
  c.g = c.L.xy + c.V.xy * 1.6;
  vec2 e = abs(f.uv - 0.5) * 2.0;
  c.edge = smoothstep(0.25, 1.35, length(e * vec2(1.0, 0.92)));
  c.near = exp(-dot(d, d) * 9.0);
  c.pfc = sat(length(f.p));
  c.lit = 0.5 + 0.32 * c.edge + 0.18 * c.pfc + 0.4 * c.near;
  c.face = sat(1.0 - f.art - f.frame - f.panel);
  return c;
}

float fl_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 fl_screen(vec3 b, vec3 s) { return 1.0 - (1.0 - b) * (1.0 - clamp(s, 0.0, 1.0)); }

vec3 fl_dodge(vec3 b, vec3 s) { return b / max(1.0 - clamp(s, 0.0, 1.0), 0.22); }

vec3 fl_tint(vec3 b, vec3 tint, float k) { return b * mix(vec3(1.0), tint * 1.45, sat(k)); }

vec3 fl_rainbow(float x) {
  return mix(spectrum(-x), hsv2rgb(vec3(fract(x), 0.78, 1.0)), 0.55);
}

vec3 fl_gold(float l) {
  vec3 a = vec3(0.16, 0.085, 0.025);
  vec3 b = vec3(0.70, 0.46, 0.15);
  vec3 c = vec3(0.97, 0.84, 0.50);
  return l < 0.55 ? mix(a, b, smoothstep(0.0, 0.55, l)) : mix(b, c, smoothstep(0.55, 1.0, l));
}

float fl_lines(float x) {
  float w = fwidth(x);
  float s = 0.5 + 0.5 * cos(TAU * x);
  return mix(s, 0.5, smoothstep(0.22, 0.55, w));
}

float fl_regionAmount(FoilIn f, FlCtx c, float wArt, float wFrame, float wFace, float wPanel) {
  float ink = smoothstep(0.22, 0.72, f.luma);
  return f.art * wArt + f.frame * wFrame + c.face * wFace + f.panel * wPanel * mix(0.25, 1.0, ink);
}

vec3 fl_soft(vec3 base, vec3 col) {
  col = max(col, 0.0);
  vec3 s0 = clamp(max(base, vec3(0.74)), 0.0, 0.975);
  vec3 r = 0.98 - s0;
  vec3 sh = s0 + r * (1.0 - exp(-max(col - s0, 0.0) / r));
  return mix(col, sh, step(s0, col));
}

vec3 fl_out(FoilIn f, vec3 col) {
  vec3 o = mix(f.base, fl_soft(f.base, col), sat(f.intensity));
  return f.intensity <= 0.0 ? f.base : o;
}

float fl_flake(vec2 cellId, float seed, vec3 H, float spread, float lobe) {
  vec2 h = hash22(cellId + seed * 97.0);
  vec3 n = normalize(vec3((h - 0.5) * spread, 1.0));
  return smoothstep(lobe, 1.0, dot(n, H));
}

float fl_point(vec2 q, float seed, float size) {
  vec2 id = floor(q);
  vec2 j = (hash22(id + seed * 23.0 + 5.0) - 0.5) * 0.5;
  vec2 d = fract(q) - 0.5 - j;
  return 1.0 - smoothstep(size * 0.3, size, length(d));
}

vec3 foil_none(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float lobe = pow(sat(c.H.z), 18.0);
  float sheen = (0.05 * lobe + 0.025 * c.edge * c.pfc) * (1.0 - 0.7 * f.panel);
  vec3 col = fl_screen(f.base, vec3(1.0, 0.985, 0.96) * sheen);
  return fl_out(f, col);
}

vec3 foil_holo(FoilIn f) {
  FlCtx c = fl_ctx(f);
  vec2 uv = f.uv;
  float slide = c.g.x * 0.9 + c.g.y * 0.2;
  float hue = uv.x * 1.25 + uv.y * 0.4 - slide * 1.3 + f.seed;

  float s1 = slide * 1.7;
  float s2 = -slide * 0.95;
  float bars1 = 0.5 + 0.5 * cos(TAU * (uv.x * 5.5 + s1));
  float bars2 = 0.5 + 0.5 * cos(TAU * (uv.x * 9.3 + s2 + 0.3));
  float pillar = pow(bars1 * 0.62 + bars2 * 0.38, 2.6);
  pillar = 0.2 + 0.8 * pillar;
  vec3 tint = fl_rainbow(hue + bars2 * 0.18);

  float scan = 0.8 + 0.2 * fl_lines(uv.x * 220.0);
  float grain = 0.9 + 0.2 * noise(uv * vec2(80.0, 420.0));

  float amt = fl_regionAmount(f, c, 1.0, 0.0, 0.0, 0.0);
  float k = amt * c.lit * pillar * scan * grain;
  vec3 col = fl_tint(f.base, tint, k * 0.55);
  col = fl_dodge(col, tint * k * 0.6);
  col = fl_screen(col, tint * k * 0.3 * (1.0 - f.luma * 0.6));
  col = fl_screen(col, vec3(c.near * amt * 0.16));
  return fl_out(f, col);
}

vec3 foil_reverse(FoilIn f) {
  FlCtx c = fl_ctx(f);
  vec2 q = c.pos;
  float amt = fl_regionAmount(f, c, 0.0, 1.0, 1.0, 0.12);

  float hue = dot(q, vec2(0.8, 1.1)) * 1.1 - dot(c.g, vec2(0.75, 0.6)) * 1.25 + f.seed;
  vec3 rain = mix(fl_rainbow(hue), vec3(0.82, 0.84, 0.88), 0.38);
  float sweep = 0.5 + 0.5 * cos(TAU * (dot(q, vec2(0.6, 0.8)) * 1.3 - dot(c.g, vec2(0.6, 0.8)) * 1.1));
  float metal = 0.3 + 0.7 * pow(sweep, 1.6);
  float mspec = pow(sat(c.H.z), 36.0);
  float grain = 0.85 + 0.3 * noise(f.uv * vec2(240.0, 335.0));

  vec2 sq = f.uv * vec2(80.0, 112.0);
  float sp = fl_point(sq, f.seed, 0.32) * fl_flake(floor(sq), f.seed, c.H, 1.2, 0.95);
  sp *= step(0.4, hash12(floor(sq) + 3.1));
  vec2 sq2 = f.uv * vec2(170.0, 238.0);
  float sp2 = fl_point(sq2, f.seed + 0.5, 0.3) * fl_flake(floor(sq2), f.seed + 0.5, c.H, 1.0, 0.93);

  float k = amt * c.lit;
  vec3 col = fl_tint(f.base, mix(vec3(0.72), rain, 0.85), k * metal * 0.8);
  col = fl_dodge(col, rain * metal * grain * 0.42 * k + vec3(mspec * 0.18 * k));
  col = fl_screen(col, mix(rain, vec3(1.0), 0.5) * (sp * 0.85 + sp2 * 0.4) * k);
  return fl_out(f, col);
}

vec3 fl_cosmosLayer(vec2 uv, float scale, vec2 off, float seed, FlCtx c, float hueBase, out float cover) {
  vec2 q = uv * vec2(scale, scale * 1.397) + off;
  vec2 id = floor(q);
  vec2 fr = fract(q) - 0.5;
  vec2 h = hash22(id + seed * 13.0);
  float present = step(0.28, hash12(id + seed * 7.0 + 1.3));
  float r = mix(0.12, 0.4, h.y * h.y);
  vec2 ctr = (h - 0.5) * (0.96 - 2.0 * r);
  vec2 d = fr - ctr;
  float dist = length(d);
  float w = max(fwidth(dist) * 1.2, 1e-4);
  float disk = (1.0 - smoothstep(r - w, r + w, dist)) * present;
  float rim = smoothstep(r * 0.6, r, dist);
  vec3 nrm = normalize(vec3((hash22(id + 40.0) - 0.5) * 1.1, 1.0));
  float facet = pow(sat(dot(nrm, c.H)), 10.0);
  vec3 col = fl_rainbow(hueBase + (h.x - 0.5) * 0.3 + dist * 1.2 + facet * 0.25);
  cover = disk * (0.55 + 0.45 * max(facet, rim));
  return col * (0.3 + 0.8 * facet + 0.3 * rim);
}

vec3 foil_cosmos(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 1.0, 0.0, 0.0, 0.0);
  vec2 par = c.V.xy + c.lp * 0.25;
  float hb = f.uv.x * 0.9 + f.uv.y * 0.5 - c.g.x * 1.2 - c.g.y * 0.4 + f.seed;
  float c0, c1, c2;
  vec3 l2 = fl_cosmosLayer(f.uv, 19.0, par * 0.5 + f.seed * 7.0 + 0.71, f.seed + 0.67, c, hb + 0.66, c2);
  vec3 l1 = fl_cosmosLayer(f.uv, 11.0, par * 1.0 + f.seed * 5.0 + 0.37, f.seed + 0.31, c, hb + 0.33, c1);
  vec3 l0 = fl_cosmosLayer(f.uv, 6.5, par * 1.7 + f.seed * 3.0, f.seed, c, hb, c0);
  vec3 bub = fl_rainbow(hb + 0.5) * 0.16;
  bub = mix(bub, l2 * 0.75, c2);
  bub = mix(bub, l1, c1);
  bub = mix(bub, l0, c0);

  vec2 sq = f.uv * vec2(60.0, 84.0) + par * 18.0;
  float star = fl_point(sq, f.seed + 0.9, 0.28) * fl_flake(floor(sq), f.seed + 0.9, c.H, 1.2, 0.95);

  float k = amt * c.lit;
  vec3 col = fl_tint(f.base, mix(vec3(0.7), bub, 0.7), k * 0.35);
  col = fl_dodge(col, bub * k * 0.5);
  col = fl_screen(col, bub * 0.16 * k * (1.0 - f.luma * 0.5) + vec3(star) * 0.8 * k);
  return fl_out(f, col);
}

vec3 foil_galaxy(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 1.0, 0.9, 1.0, 0.16);
  vec2 deep = c.V.xy * 0.42 + c.lp * 0.12;
  vec2 q = c.pos * 2.6 + deep * 2.6 + f.seed * 11.0;
  float n1 = noise(q + vec2(f.t * 0.015, 0.0));
  float n2 = noise(q * 2.3 + vec2(3.1, -f.t * 0.02));
  float neb = sat(n1 * 0.7 + n2 * 0.45 - 0.2);
  vec3 nebCol = mix(vec3(0.20, 0.06, 0.45), vec3(0.85, 0.20, 0.65), smoothstep(0.25, 0.75, n1));
  nebCol = mix(nebCol, vec3(0.10, 0.55, 0.85), smoothstep(0.55, 0.9, n2) * 0.7);

  vec2 qa = f.uv * vec2(120.0, 168.0) + c.V.xy * 30.0;
  float sa = fl_point(qa, f.seed, 0.3) * fl_flake(floor(qa), f.seed, c.H, 1.3, 0.94) * step(0.35, hash12(floor(qa) + 2.0));

  vec2 qb = f.uv * vec2(38.0, 53.0) + c.V.xy * 4.0;
  vec2 ib = floor(qb);
  vec2 fb = fract(qb) - 0.5 - (hash22(ib + 8.0) - 0.5) * 0.5;
  float sb = fl_flake(ib, f.seed + 0.4, c.H, 1.0, 0.975) * step(0.55, hash12(ib + 5.0));
  float core = 1.0 - smoothstep(0.0, 0.1, length(fb));
  float flare = (1.0 - smoothstep(0.0, 0.035, abs(fb.x))) * (1.0 - smoothstep(0.0, 0.32, abs(fb.y)))
              + (1.0 - smoothstep(0.0, 0.035, abs(fb.y))) * (1.0 - smoothstep(0.0, 0.32, abs(fb.x)));
  sb *= core + flare * 0.7;
  vec3 starTint = mix(vec3(1.0), fl_rainbow(hash12(ib) + c.H.x * 2.0), 0.35);

  float k = amt * c.lit;
  vec3 col = mix(f.base, f.base * vec3(0.78, 0.74, 0.92), amt * 0.35 * (1.0 - f.panel));
  col = fl_dodge(col, nebCol * neb * 0.55 * k);
  col = fl_screen(col, nebCol * neb * 0.12 * k);
  col = fl_screen(col, (vec3(sa) * 0.8 + starTint * sb) * k);
  return fl_out(f, col);
}

vec3 foil_crackedice(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.55, 1.0, 1.0, 0.09);
  vec2 q = c.pos * 15.0;
  q = mat2(1.0, 0.45, -0.25, 1.15) * q + f.seed * 17.0;
  q += 0.18 * vec2(sin(q.y * 1.7), sin(q.x * 1.3));
  vec2 n = floor(q), fr = fract(q);
  vec2 rs[9];
  float d1 = 8.0;
  vec2 id1 = vec2(0.0), r1 = vec2(0.0);
  for (int k = 0; k < 9; k++) {
    vec2 gc = vec2(float(k % 3 - 1), float(k / 3 - 1));
    vec2 r = gc + hash22(n + gc) * 0.9 + 0.05 - fr;
    rs[k] = r;
    float d = dot(r, r);
    if (d < d1) { d1 = d; r1 = r; id1 = n + gc; }
  }
  float edgeD = 8.0;
  for (int k = 0; k < 9; k++) {
    vec2 dr = rs[k] - r1;
    float l2 = dot(dr, dr);
    if (l2 > 1e-5) edgeD = min(edgeD, dot(0.5 * (r1 + rs[k]), dr * inversesqrt(l2)));
  }
  float w = fwidth(edgeD);
  float crack = 1.0 - smoothstep(0.0, 0.022 + w * 1.2, edgeD);

  vec2 h = hash22(id1 + 31.0);
  vec2 dir = normalize(h - 0.5 + 1e-3);
  vec3 nrm = normalize(vec3((h - 0.5) * 1.0, 1.0));
  float facet = pow(sat(dot(nrm, c.H)), 14.0);
  float plane = 0.75 + 0.5 * sat(0.5 + dot(-r1, dir) * 0.9);
  float hue = dot(c.g, dir) * 2.4 + hash12(id1) * 0.9 + f.uv.y * 0.4;
  vec3 rain = fl_rainbow(hue);
  vec3 ice = mix(vec3(0.8, 0.88, 0.98), rain, 0.3 + 0.45 * facet);
  float frost = 0.88 + 0.24 * fl_lines(dot(fr, dir) * 9.0);

  float k = amt * c.lit;
  float bright = (0.2 + 0.75 * facet) * frost * plane;
  vec3 col = fl_tint(f.base, ice, k * (0.3 + 0.35 * facet));
  col = fl_dodge(col, ice * bright * 0.58 * k);
  float crackK = crack * (0.3 + 0.5 * c.lit) * k * (1.0 - 0.45 * f.art);
  col = fl_screen(col, ice * facet * 0.14 * k + mix(vec3(0.9, 0.97, 1.0), rain, 0.35) * crackK);
  return fl_out(f, col);
}

vec3 foil_rainbow(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 1.0, 1.0, 1.0, 0.25);
  float hue = f.uv.x * 0.55 + f.uv.y * 0.85 - dot(c.g, vec2(0.55, 0.8)) * 0.95 + f.seed;
  vec3 pastel = mix(fl_rainbow(hue), vec3(1.0), 0.28);

  float l = f.luma;
  vec3 recol = pastel * (0.1 + l * 0.95);
  float wash = 0.62 * (1.0 - f.panel * 0.75);
  vec3 col = mix(f.base, recol, wash * amt);

  float diag = fl_lines((c.pos.x + c.pos.y) * 110.0);
  float diag2 = fl_lines((c.pos.x - c.pos.y) * 42.0 + 0.25);
  float tex = diag * 0.7 + diag2 * 0.3;
  float spec = pow(sat(c.H.z), 22.0);
  vec2 sq = f.uv * vec2(100.0, 140.0);
  float glit = fl_point(sq, f.seed, 0.3) * fl_flake(floor(sq), f.seed, c.H, 1.1, 0.94);

  float k = amt * c.lit;
  vec3 sheen = mix(pastel, vec3(1.0), 0.2) * (0.14 + 0.32 * tex + 0.26 * spec);
  col = fl_dodge(col, sheen * k * 0.7);
  col = fl_screen(col, mix(pastel, vec3(1.0), 0.4) * glit * 0.75 * k);
  return fl_out(f, col);
}

vec3 foil_gold(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.88, 1.0, 1.0, 1.0);
  vec2 dl = vec2(dFdx(f.luma), dFdy(f.luma));
  float brush = noise(vec2(f.uv.x * 5.0, f.uv.y * 620.0) + f.seed * 40.0);
  float brush2 = noise(vec2(f.uv.x * 2.0 + 7.0, f.uv.y * 140.0));
  vec3 N = normalize(vec3(-dl * 3.0 * (1.0 - f.panel * 0.6) + vec2(0.0, (brush - 0.5) * 0.12 + (brush2 - 0.5) * 0.08), 1.0));
  float hx = c.H.x - N.x;
  float hy = c.H.y - N.y;
  float aniso = exp(-(hx * hx / 0.010 + hy * hy / 0.09));
  float diff = sat(dot(N, c.L));

  float l = mix(f.luma, smoothstep(0.0, 1.0, f.luma), 0.5);
  vec3 g = fl_gold(l * 0.92 + 0.04) * (0.62 + 0.42 * diff) * (0.9 + 0.18 * brush);
  float specAmt = (0.55 * aniso + 0.18 * c.near) * c.lit * (1.0 - 0.65 * f.panel) * mix(0.35, 1.0, l);
  g += vec3(1.0, 0.86, 0.55) * specAmt;
  g = mix(g, g * mix(vec3(1.0), f.base * 1.6 + 0.2, 0.18), f.art);

  vec3 col = mix(f.base, g, amt);
  return fl_out(f, col);
}

vec3 foil_refractor(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.7, 1.0, 1.0, 0.2);
  vec2 d = c.pos - c.lp + c.V.xy * 0.3;
  float r = length(d) + 1e-4;
  float a = atan(d.y, d.x);
  float sa = a / TAU * 54.0;
  float sid = floor(sa);
  float sf = fract(sa) - 0.5;
  float sw = mix(0.1, 0.42, hash11(sid + f.seed * 31.0));
  float ray = (1.0 - smoothstep(0.0, sw, abs(sf))) * mix(0.3, 1.0, hash11(sid * 1.7 + 4.0));
  float ray2 = 0.5 + 0.5 * cos(a * 19.0 + r * 5.0);
  float rays = ray * 0.7 + ray2 * 0.3;
  float hue = r * 2.4 - c.V.x * 1.6 - c.V.y * 0.9 + hash11(sid) * 0.1 + f.seed;
  vec3 rain = fl_rainbow(hue);
  float fall = exp(-r * 1.8) * 0.8 + 0.2;

  float l = f.luma;
  float band = 0.5 + 0.5 * cos(TAU * (c.pos.y * 0.9 - c.V.y * 1.4 + c.pos.x * 0.35 - c.V.x * 0.6));
  vec3 chrome = mix(f.base, vec3(l), 0.45) * (0.78 + 0.4 * band) + 0.06;
  vec3 col = mix(f.base, chrome, amt * (1.0 - f.art) * (1.0 - f.panel * 0.85));

  float k = amt * c.lit * rays * fall;
  col = fl_tint(col, rain, k * 0.75);
  col = fl_dodge(col, rain * k * 0.55);
  col = fl_screen(col, rain * k * 0.18 + vec3(c.near * 0.14 * amt * c.lit));
  return fl_out(f, col);
}

vec3 foil_superfractor(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.6, 1.0, 1.0, 0.75);
  vec2 d = c.pos - vec2(0.0, 0.03);
  float r = length(d) + 1e-4;
  float a = atan(d.y, d.x);
  float phase = r * 75.0 + a / TAU * 9.0;
  float grooves = fl_lines(phase);
  float swirlA = a + r * 9.0;
  vec2 T = vec2(-sin(swirlA), cos(swirlA));
  float TH = dot(T, c.H.xy) / max(length(c.H.xy), 0.08) * sat(length(c.H.xy) * 6.0);
  float kk = sqrt(max(1.0 - TH * TH, 0.0));
  float aniso = pow(kk, 60.0);
  float aniso2 = pow(kk, 8.0);
  float vortex = 0.5 + 0.5 * cos(a * 6.0 - r * 34.0);

  float l = f.luma;
  float groove = mix(0.72 + 0.3 * grooves + 0.12 * vortex, 0.92 + 0.08 * grooves, f.panel);
  vec3 g = fl_gold(mix(l, 0.6, 0.4 * (1.0 - f.panel))) * groove;
  g += vec3(1.0, 0.86, 0.56) * (aniso * 0.55 + aniso2 * 0.2) * c.lit * (1.0 - f.panel * 0.6) * mix(0.5, 1.0, l) * (0.85 + 0.3 * grooves);
  g = mix(g, mix(f.base * 1.05, g, 0.5), f.art);
  vec3 col = mix(f.base, g, amt);
  return fl_out(f, col);
}

vec3 foil_etched(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.1, 1.0, 1.0, 0.14);
  vec2 d = c.pos;
  float r = length(d) + 1e-4;
  float a = atan(d.y, d.x);
  float rose1 = r * 80.0 + 3.0 * sin(a * 12.0 + r * 18.0);
  float rose2 = r * 80.0 + 3.0 * sin(a * 12.0 - r * 18.0 + PI);
  float wave = d.y * 120.0 + 2.2 * sin(d.x * 50.0);
  float l1 = fl_lines(rose1);
  float l2 = fl_lines(rose2);
  float l3 = fl_lines(wave);
  float mesh = max(l1 * l2, l3 * 0.5);
  vec2 rad = d / r;
  vec3 n1 = normalize(vec3(rad * sin(TAU * rose1) * 1.1, 1.0));
  vec3 n3 = normalize(vec3(0.0, sin(TAU * wave) * 1.1, 1.0));
  float glint1 = pow(sat(dot(n1, c.H)), 28.0);
  float glint3 = pow(sat(dot(n3, c.H)), 28.0);
  float angle = sat(length(c.H.xy) * 2.5);
  float glint = (glint1 * (0.4 + 0.6 * l1 * l2) + glint3 * 0.35) * (0.2 + 0.8 * angle);
  float hue = dot(c.g, vec2(-rad.y, rad.x)) * 1.4 + r * 2.0 + f.seed;
  vec3 tint = mix(vec3(0.92, 0.94, 1.0), fl_rainbow(hue), 0.6);

  float k = amt * c.lit;
  vec3 col = mix(f.base, f.base * 0.8 + fl_luma(f.base) * 0.08, amt * (1.0 - f.panel));
  col = fl_tint(col, tint, mesh * angle * k * 0.5);
  col = fl_dodge(col, tint * (mesh * 0.3 * angle + glint * 0.7) * k);
  col = fl_screen(col, tint * glint * 0.3 * k);
  return fl_out(f, col);
}

vec3 foil_prism(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.5, 1.0, 1.0, 0.08);
  vec2 q = c.pos * 5.0 + f.seed * 3.0;
  vec2 s = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
  vec2 cell = floor(s);
  vec2 fr = fract(s);
  float up = step(1.0, fr.x + fr.y);
  vec3 bary = up > 0.5 ? vec3(1.0 - fr.x, 1.0 - fr.y, fr.x + fr.y - 1.0)
                       : vec3(fr.x, fr.y, 1.0 - fr.x - fr.y);
  float edgeD = min(bary.x, min(bary.y, bary.z));
  vec2 tid = cell * 2.0 + vec2(up, 0.0);
  vec2 h = hash22(tid + 5.0);
  vec3 nrm = normalize(vec3((h - 0.5) * 1.4, 1.0));
  float facet = pow(sat(dot(nrm, c.H)), 5.0);
  vec2 dir = normalize(h - 0.5 + 1e-3);
  float disp = dot(bary.xy - 0.33, dir);
  float hue = dot(c.g, dir) * 1.8 + disp * 1.1 + hash12(tid);
  vec3 rain = mix(fl_rainbow(hue), vec3(0.86, 0.88, 0.92), 0.3);
  float w = fwidth(edgeD);
  float edge = 1.0 - smoothstep(0.0, 0.012 + w * 1.2, edgeD);

  float k = amt * c.lit;
  float b = 0.12 + 0.95 * facet;
  vec3 col = fl_tint(f.base, rain, k * (0.3 + 0.5 * facet));
  col = fl_dodge(col, rain * b * k * 0.52);
  col = fl_screen(col, rain * facet * 0.16 * k + vec3(0.92, 0.96, 1.0) * edge * 0.22 * k);
  return fl_out(f, col);
}

float fl_glitterLayer(vec2 uv, vec2 dens, float seed, vec3 H, float lobe, out vec3 tint) {
  vec2 q = uv * dens;
  vec2 id = floor(q);
  vec2 fr = fract(q) - 0.5;
  vec2 j = (hash22(id + seed * 19.0) - 0.5) * 0.5;
  float flash = fl_flake(id, seed, H, 1.3, lobe);
  float present = step(0.15, hash12(id + seed * 3.0 + 7.0));
  vec2 dd = fr - j;
  float core = 1.0 - smoothstep(0.04, 0.3, length(dd));
  float flare = (1.0 - smoothstep(0.0, 0.045, abs(dd.x))) * (1.0 - smoothstep(0.1, 0.5, abs(dd.y)))
              + (1.0 - smoothstep(0.0, 0.045, abs(dd.y))) * (1.0 - smoothstep(0.1, 0.5, abs(dd.x)));
  tint = mix(vec3(1.0), fl_rainbow(hash12(id + 11.0) + H.x * 1.5), 0.55);
  return flash * present * (core + flare * flash * 0.7);
}

vec3 foil_glitter(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.75, 1.0, 1.0, 0.12);
  vec3 tA, tB;
  float a = fl_glitterLayer(f.uv, vec2(130.0, 182.0), f.seed, c.H, 0.93, tA);
  float b = fl_glitterLayer(f.uv, vec2(56.0, 78.0), f.seed + 0.5, c.H, 0.955, tB);
  float grain = noise(f.uv * vec2(300.0, 420.0));
  float spec = pow(sat(c.H.z), 30.0);

  float k = amt * c.lit;
  vec3 col = fl_dodge(f.base, vec3(0.9, 0.92, 1.0) * (0.1 + 0.22 * grain * grain + 0.14 * spec) * k);
  col = fl_screen(col, (tA * a * 0.85 + tB * b * 1.1) * k);
  return fl_out(f, col);
}

float fl_liquidH(vec2 q, float t) {
  vec2 w = q + 0.55 * vec2(sin(q.y * 1.7 + t * 0.45), sin(q.x * 1.3 - t * 0.38));
  w += 0.3 * vec2(sin(w.y * 2.9 - t * 0.3), sin(w.x * 2.3 + t * 0.27));
  return sin(w.x * 1.9) * sin(w.y * 1.6 + t * 0.2) + 0.5 * sin((w.x + w.y) * 2.7 - t * 0.35);
}

vec3 foil_liquid(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 0.35, 1.0, 1.0, 0.1);
  vec2 q = c.pos * 4.5 + f.seed * 9.0;
  float t = f.t;
  float e = 0.02;
  float h0 = fl_liquidH(q, t);
  float hx = fl_liquidH(q + vec2(e, 0.0), t);
  float hy = fl_liquidH(q + vec2(0.0, e), t);
  vec3 N = normalize(vec3(-(hx - h0) / e * 0.2, -(hy - h0) / e * 0.2, 1.0));
  vec3 R = reflect(-c.V, N);
  vec2 rl = R.xy + c.lp * 0.35;
  float sky = smoothstep(-0.7, 0.8, rl.y);
  vec3 env = mix(vec3(0.12, 0.13, 0.16), vec3(0.66, 0.69, 0.74), sky);
  float strip1 = exp(-pow((rl.y - 0.3 + rl.x * 0.2) * 8.0, 2.0));
  float strip2 = exp(-pow((rl.x + 0.36) * 7.0, 2.0)) * smoothstep(-0.3, 0.4, rl.y);
  env += vec3(0.95, 0.97, 1.0) * strip1 * 0.32 + vec3(0.7, 0.82, 1.0) * strip2 * 0.2;
  env = mix(env, vec3(0.42, 0.34, 0.3), exp(-pow(rl.y * 7.0, 2.0)) * 0.45);
  float spec = pow(sat(dot(N, c.H)), 90.0);
  env += vec3(1.0, 0.97, 0.92) * spec * 0.35 * c.lit;

  vec3 tinted = env * mix(vec3(1.0), f.base * 1.3 + 0.3, 0.4);
  tinted = mix(tinted, f.base * (0.75 + 0.5 * env), f.panel);
  vec3 col = mix(f.base, tinted, amt * (1.0 - f.art));
  col = fl_screen(col, (env * 0.3 * sky + vec3(spec * 0.35)) * f.art * amt * c.lit);
  return fl_out(f, col);
}

vec3 foil_lenticular(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float amt = fl_regionAmount(f, c, 1.0, 0.9, 1.0, 0.35);
  float lens = f.uv.x * 85.0;
  float s = fract(lens) - 0.5;
  float view = c.V.x * 8.0 + c.lp.x * 0.5;
  float wfine = fwidth(lens);
  float lineVis = 1.0 - smoothstep(0.25, 0.6, wfine);
  float wB = smoothstep(-0.16, 0.16, view + s * 0.7 * lineVis);

  float l = f.luma;
  vec3 duoA = mix(mix(vec3(0.02, 0.05, 0.22), vec3(0.1, 0.6, 0.95), smoothstep(0.0, 0.55, l)), vec3(0.85, 1.0, 0.98), smoothstep(0.55, 1.0, l));
  vec3 duoB = mix(mix(vec3(0.2, 0.02, 0.15), vec3(0.98, 0.3, 0.45), smoothstep(0.0, 0.55, l)), vec3(1.0, 0.9, 0.55), smoothstep(0.55, 1.0, l));
  vec2 q = c.pos;
  float patA = smoothstep(0.55, 0.9, fl_lines(q.y * 11.0 + 0.5 * sin(q.x * 9.0)));
  float patB = smoothstep(0.55, 0.9, fl_lines(length(q - vec2(0.0, 0.06)) * 13.0));
  float keep = 0.35 + 0.35 * f.panel;
  vec3 colA = mix(duoA, f.base, keep) + vec3(0.1, 0.45, 0.6) * patA * 0.22 * c.lit * (1.0 - f.panel);
  vec3 colB = mix(duoB, f.base, keep) + vec3(0.6, 0.25, 0.4) * patB * 0.22 * c.lit * (1.0 - f.panel);
  vec3 lensed = mix(colA, colB, wB);

  float ridge = 0.9 + 0.1 * cos(TAU * s);
  float glintPos = sat(0.5 + c.V.x * 2.5);
  float glint = exp(-pow((s + 0.5 - glintPos) * 8.0, 2.0)) * 0.16;
  lensed = lensed * mix(1.0, ridge, lineVis) + vec3(glint * lineVis * c.lit);

  vec3 col = mix(f.base, lensed, amt);
  return fl_out(f, col);
}

vec3 foil_blacklabel(FoilIn f) {
  FlCtx c = fl_ctx(f);
  float sweep = 0.5 + 0.5 * cos(TAU * (c.pos.x * 0.55 + c.pos.y * 0.8 - c.V.x * 1.1 - c.V.y * 0.7));
  float spec = pow(sat(c.H.z), 140.0);
  float specWide = pow(sat(c.H.z), 16.0);
  vec3 black = vec3(0.016, 0.017, 0.021) + vec3(0.06, 0.062, 0.07) * pow(sweep, 3.0);
  black += f.base * 0.05;
  black += vec3(0.85, 0.86, 0.9) * spec * 0.5 + vec3(0.1) * specWide * c.lit;

  vec2 m = f.uv * vec2(63.0, 88.0);
  float edgeMm = min(min(m.x, 63.0 - m.x), min(m.y, 88.0 - m.y));
  float wm = fwidth(edgeMm);
  float pin = 1.0 - smoothstep(0.18 - wm, 0.18 + wm, abs(edgeMm - 1.4));
  float rim = sat(length(vec2(dFdx(f.frame), dFdy(f.frame))) * 1.6);
  float goldMask = sat(pin + rim) * sat(f.frame + rim);

  float brush = noise(vec2(f.uv.x * 4.0, f.uv.y * 500.0) + f.seed * 20.0);
  vec3 gold = fl_gold(0.68 + 0.2 * brush + 0.12 * sweep);
  gold += vec3(1.0, 0.88, 0.6) * (spec * 0.5 + specWide * 0.25) * c.lit;

  vec3 champagne = f.base * mix(vec3(1.0), vec3(1.0, 0.94, 0.82), smoothstep(0.3, 0.8, f.luma));
  champagne += vec3(1.0, 0.9, 0.7) * specWide * 0.05 * smoothstep(0.4, 0.9, f.luma);
  vec3 artCol = f.base * 0.94 + vec3(0.9) * spec * 0.22 + vec3(0.04) * specWide;

  vec3 shell = mix(black, gold, goldMask);
  vec3 col = shell * (c.face + f.frame) + champagne * f.panel + artCol * f.art;
  float cover = c.face + f.frame + f.panel + f.art;
  col = mix(f.base, col / max(cover, 1e-3), sat(cover));
  col = mix(col, gold, rim * (1.0 - f.frame) * 0.8);
  return fl_out(f, col);
}
`;
