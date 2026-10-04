/** The forge art presets (GLSL ES 3.0): one `vec3 art_<preset>(vec2 uv, float t)` per preset over the art window, animated forever. Call them in uniform control flow: they anti-alias with screen-space derivatives. */
export const art = `vec2 ar_ctr(vec2 uv) { return (uv - 0.5) * vec2(1.25, 1.0); }

mat2 ar_rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float ar_px(vec2 uv) {
  vec2 d = fwidth(uv);
  return clamp(max(d.x * 1.25, d.y), 1.0 / 4096.0, 1.0 / 96.0);
}

vec3 ar_aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 ar_out(vec3 c) {
  c = pow(ar_aces(max(c, 0.0)), vec3(1.0 / 2.2));
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  return clamp(c, 0.0, 1.0);
}

float ar_line(float d, float halfw, float px) {
  return 1.0 - smoothstep(halfw - px * 0.75, halfw + px * 0.75, abs(d));
}

float ar_vign(vec2 uv, float k) { vec2 c = uv - 0.5; return 1.0 - k * dot(c, c); }

vec3 ar_stars(vec2 p, float cells, float px, float keep, float t) {
  vec2 g = p * cells;
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec2 o = 0.25 + 0.5 * hash22(id);
  float h = hash12(id + 17.31);
  float on = step(1.0 - keep, h);
  float sig = max(px * cells * 0.7, 0.012);
  vec2 d = f - o;
  float s = exp(-dot(d, d) / (2.0 * sig * sig));
  float m = 0.03 + 0.97 * pow(hash12(id + 5.7), 7.0);
  float tw = 0.65 + 0.35 * sin(t * (0.5 + 1.6 * h) + h * 91.0);
  vec3 tint = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.78, 0.55), hash12(id + 2.3));
  float res = pow(sat(0.0018 / px), 1.5);
  return tint * (s * m * tw * on * 3.0 * res);
}

float ar_cross(vec2 d, float px, float len) {
  float w = max(px * 0.8, 1e-4);
  return exp(-abs(d.y) / w) * exp(-abs(d.x) * len) + exp(-abs(d.x) / w) * exp(-abs(d.y) * len);
}

vec3 ar_vor(vec2 p, float t, float jitter) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 best = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(n + g);
      vec2 o = 0.5 + jitter * 0.5 * sin(t + TAU * h);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; best = n + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, hash12(best));
}

vec3 art_nebula(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  vec2 focus = vec2(0.12, 0.04);
  float T = t * 0.015;
  vec2 q = ar_rot(T * 0.5) * (p - focus);

  vec2 w1 = vec2(fbm(q * 1.8 + vec2(0.0, T)), fbm(q * 1.8 + vec2(5.2, 1.3 - T)));
  vec2 w2 = vec2(fbm(q * 2.4 + 1.9 * w1 + vec2(1.7, 9.2) + T * 0.7),
                 fbm(q * 2.4 + 1.9 * w1 + vec2(8.3, 2.8) - T * 0.5));
  float n = fbm(q * 2.0 + 1.7 * w2);
  float fine = fbm(q * 6.5 + 2.0 * w2 + vec2(T, -T));
  float r = length((p - focus) * vec2(0.8, 1.0));
  float shape = exp(-r * r * 4.0);

  float dens = pow(smoothstep(0.28, 0.85, n), 1.7) * (0.05 + 1.5 * shape);
  dens *= 0.55 + 0.8 * fine;
  vec3 col = mix(vec3(0.02, 0.16, 0.38), vec3(0.55, 0.04, 0.30), smoothstep(0.25, 0.75, shape + (w2.x - 0.5) * 0.8));
  col = mix(col, vec3(0.16, 0.06, 0.45), smoothstep(0.55, 0.8, w1.y) * 0.5);
  col = mix(col, vec3(1.10, 0.42, 0.14), smoothstep(0.55, 1.05, shape * (0.55 + 0.9 * n)));
  vec3 neb = col * dens * 1.2;

  float dust = smoothstep(0.50, 0.74, fbm(q * 3.4 - w1 * 1.6 + vec2(11.0, 3.0)));
  dust *= smoothstep(0.0, 0.5, shape + 0.15);
  neb *= 1.0 - 0.88 * dust;

  vec3 bg = mix(vec3(0.001, 0.001, 0.006), vec3(0.012, 0.006, 0.030), shape);

  vec2 drift = vec2(t * 0.0025, t * 0.0012);
  vec3 stars = ar_stars(p + drift * 0.4, 110.0, px, 0.28, t) * 0.45
             + ar_stars(p + drift * 0.8 + 3.7, 46.0, px, 0.25, t) * 0.8
             + ar_stars(p + drift * 1.4 + 9.1, 19.0, px, 0.20, t) * 1.3;
  stars *= 1.0 - 0.85 * dust;

  vec2 sp = p - (focus + vec2(0.02, -0.015));
  float rs = length(sp);
  float pulse = 0.88 + 0.12 * sin(t * 0.7);
  float wpx = max(px, 1e-4);
  vec3 star = vec3(1.0, 0.9, 0.8) * (exp(-rs * rs / (8.0 * wpx * wpx)) * 5.0 + ar_cross(sp, px, 26.0) * 0.9 + exp(-rs * 40.0) * 0.5) * pulse;

  vec3 glow = vec3(0.9, 0.4, 0.3) * exp(-r * 7.0) * 0.18;
  vec3 c = (bg + neb + stars + glow + star) * ar_vign(uv, 0.6);
  return ar_out(c);
}

vec3 ar_au_curtains(vec2 p, float t) {
  vec3 au = vec3(0.0);
  float x = p.x;
  float focusEnv = 0.25 + 1.0 * exp(-(x - 0.74) * (x - 0.74) * 2.0);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float depth = fk / 3.0;
    float dr = t * (0.010 + 0.004 * fk);
    float fq = 2.8 + 0.9 * fk;
    float ph = x * fq + fk * 1.9 + dr * 3.0 + 0.7 * sin(x * 1.3 + dr + fk);
    float amp = 0.11 * (1.0 - 0.35 * depth);
    float base = 0.62 - 0.075 * fk + amp * sin(ph) + 0.05 * (noise(vec2(x * 2.4 + dr * 5.0, fk * 7.0)) - 0.5);
    float slope = abs(amp * fq * cos(ph));
    float foldB = 0.45 + 1.1 * smoothstep(0.08, 0.30, slope);
    float fold = x * (38.0 + 12.0 * fk) + 2.5 * sin(x * 3.1 + t * 0.06 + fk * 2.0);
    float rn = noise(vec2(fold, t * 0.22 + fk * 3.0));
    base += 0.018 * (rn - 0.5) + 0.06 * sin(x * 1.1 + fk * 4.0 + dr * 2.0);
    float rel = p.y - base;
    float hn = noise(vec2(x * 2.3 - dr * 3.0, fk * 5.0 + 2.0));
    float H = 0.12 * (1.0 - 0.4 * depth) * (0.35 + 1.5 * hn * hn);
    float vert = exp(-max(rel, 0.0) / H) * exp(min(rel, 0.0) / 0.03);
    float rays = 0.25 + 0.75 * pow(rn, 1.7);
    float env = smoothstep(0.35, 0.80, noise(vec2(x * 1.6 - dr * 2.0, fk * 3.3 + 1.0)));
    vec3 green = vec3(0.08, 1.00, 0.40);
    vec3 violet = vec3(0.40, 0.06, 0.75);
    vec3 c = mix(green, violet, smoothstep(0.05, 0.26, rel));

    au += c * vert * rays * env * foldB * (1.0 - 0.5 * depth);
  }
  return au * focusEnv;
}

vec3 ar_au_scene(vec2 p, float px, float t, float starAmt) {
  vec3 au = ar_au_curtains(p, t);
  vec3 sky = mix(vec3(0.006, 0.024, 0.034), vec3(0.001, 0.002, 0.010), sat((p.y - 0.25) / 0.7));
  vec3 stars = ar_stars(p + vec2(t * 0.002, 0.0), 80.0, px, 0.28, t) * 0.5
             + ar_stars(p + vec2(t * 0.002, 0.0) + 3.1, 30.0, px, 0.22, t) * 1.0;
  stars *= (1.0 - sat(dot(au, vec3(0.6)) * 2.0)) * starAmt;
  vec3 col = sky + stars + au * 1.1;

  float x = p.x;
  float rdg = 1.0 - abs(2.0 * noise(vec2(x * 3.2 + 1.0, 0.5)) - 1.0);
  rdg = rdg * rdg * 0.7 + 0.3 * (1.0 - abs(2.0 * noise(vec2(x * 7.5 + 4.0, 1.5)) - 1.0));
  float farY = 0.235 + 0.20 * rdg * (0.30 + 0.70 * smoothstep(0.15, 0.6, abs(x - 0.70)));
  float farM = smoothstep(px, -px, p.y - farY);
  vec3 rock = vec3(0.002, 0.004, 0.007) + au * 0.02 + vec3(0.03, 0.08, 0.07) * smoothstep(farY - 0.012, farY, p.y) * 0.5;
  col = mix(col, rock, farM);

  float cell = 0.016;
  float cx = x / cell;
  float ci = floor(cx);
  float th = 0.028 + 0.05 * hash11(ci * 1.37 + 4.0);
  float shore = 0.232 + 0.010 * noise(vec2(x * 7.0, 2.0));
  float top = shore + th;
  float yy = top - p.y;
  float tier = fract(yy / 0.011);
  float halfw = yy * 0.20 * (0.75 + 0.25 * tier) / cell;
  float tri = halfw - abs(fract(cx) - 0.5 + (hash11(ci + 3.0) - 0.5) * 0.3);
  float tree = smoothstep(-px / cell, px / cell, tri) * step(0.0, yy) * step(0.3, hash11(ci + 9.1));
  float hill = smoothstep(px, -px, p.y - shore);
  float nearM = max(tree, hill);
  col = mix(col, vec3(0.001, 0.002, 0.004), nearM);
  return col;
}

vec3 art_aurora(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = vec2(uv.x * 1.25, uv.y);
  float lake = 0.22;
  vec3 col;
  if (p.y >= lake) {
    col = ar_au_scene(p, px, t, 1.0);
  } else {
    float dpt = (lake - p.y) / lake;
    vec2 rp = vec2(p.x, 2.0 * lake - p.y);
    float rip = noise(vec2(p.x * 7.0, p.y * 55.0 / (0.25 + dpt) + t * 0.5)) - 0.5;
    rp.x += rip * 0.010 * (0.3 + dpt);
    rp.y += rip * 0.005 * dpt;
    col = ar_au_scene(rp, px * 2.0, t, 0.25) * vec3(0.50, 0.58, 0.68);
    float streak = smoothstep(0.82, 1.0, noise(vec2(p.x * 2.5 - t * 0.02, p.y * 120.0)));
    col += vec3(0.01, 0.03, 0.03) * streak * (1.0 - dpt);
    col *= 0.8 + 0.2 * (1.0 - dpt);
  }
  return ar_out(col * ar_vign(uv, 0.5));
}

vec3 ar_lq_env(vec3 r, float t) {
  r.xy = ar_rot(t * 0.06) * r.xy;
  float y = r.y;
  vec3 c = vec3(0.010, 0.008, 0.020);
  c += mix(vec3(0.04, 0.02, 0.10), vec3(0.30, 0.16, 0.60), sat(y * 1.4)) * smoothstep(-0.05, 0.1, y);
  c += vec3(1.00, 0.42, 0.22) * exp(-abs(y + 0.02) * 10.0) * 0.7;
  c += vec3(0.02, 0.09, 0.13) * sat(-y * 2.5);
  c += vec3(4.0, 3.8, 3.6) * smoothstep(0.945, 0.985, dot(r, normalize(vec3(-0.50, 0.62, 0.60))));
  c += vec3(0.5, 1.4, 2.2) * smoothstep(0.90, 0.97, dot(r, normalize(vec3(0.70, -0.15, 0.70))));
  c += vec3(2.0, 0.6, 1.4) * smoothstep(0.93, 0.98, dot(r, normalize(vec3(0.25, 0.75, 0.62))));
  return c;
}

vec3 art_liquid(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  float T = t * 0.5;
  float f = 0.0, fs = 0.0;
  vec2 g = vec2(0.0);
  vec2 sh = vec2(0.03, -0.045);
  vec2 hero = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(0.34 * sin(T * (0.23 + 0.041 * fi) + fi * 1.7),
                  0.23 * sin(T * (0.19 + 0.033 * fi) + fi * 2.9 + 1.0)) + vec2(0.05, 0.02);
    float rr = i == 0 ? 0.17 : 0.075 + 0.06 * hash11(fi * 7.31 + 0.5);
    if (i == 0) { c = vec2(0.10, 0.03) + 0.06 * vec2(sin(T * 0.31), cos(T * 0.27)); hero = c; }
    float ir = 1.0 / (rr * rr);
    vec2 d = p - c;
    float e = exp(-dot(d, d) * ir);
    f += e;
    g += -2.0 * d * ir * e;
    vec2 ds = p - sh - c;
    fs += exp(-dot(ds, ds) * ir * 0.6);
  }
  float th = 0.45;
  float s = f - th;
  float gl = max(length(g), 1e-3);
  float cover = smoothstep(-1.0, 1.0, s / (gl * px * 1.2));
  vec3 n = normalize(vec3(-g * (0.5 / sqrt(max(s, 0.0) + 0.004)) * 0.07, 1.0));
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 env = ar_lq_env(r, t);
  float ndv = n.z;
  vec3 film = spectrum(ndv * 1.3 + 0.35 + t * 0.012);
  vec3 metal = env * mix(vec3(0.95), film * 1.35, 0.38);
  metal += vec3(0.9, 0.55, 1.0) * pow(1.0 - ndv, 3.0) * 0.25;

  vec3 bg = mix(vec3(0.003, 0.002, 0.008), vec3(0.016, 0.007, 0.030), uv.y);
  bg += vec3(0.25, 0.08, 0.32) * 0.22 * exp(-dot(p - hero, p - hero) * 4.0);
  bg += vec3(0.30, 0.10, 0.06) * 0.10 * exp(-abs(p.y + 0.30) * 12.0);
  bg *= 1.0 - 0.7 * smoothstep(0.15, 0.9, fs);
  bg += vec3(0.30, 0.12, 0.40) * 0.18 * smoothstep(0.1, 0.45, f) * (1.0 - cover);

  vec3 col = mix(bg, metal, cover);
  return ar_out(col * ar_vign(uv, 0.5));
}

vec4 ar_cr_spire(vec2 p, vec2 base, float ang, float w, float len, float px, vec3 L, float t, float seed) {
  vec2 q = ar_rot(-ang) * (p - base);
  float tip = w * 2.0;
  float body = len - tip;
  float hw = w * sat((len - q.y) / tip);
  float d = max(abs(q.x) - hw, -q.y);
  float a = smoothstep(px, -px, d) * step(-0.001, len - q.y);
  float u = q.x / max(hw, 1e-4);
  float pu = px / max(hw, 1e-4);
  float inTip = smoothstep(body - px, body + px, q.y);
  float sL = smoothstep(-0.36 - pu, -0.36 + pu, u);
  float sR = smoothstep(0.36 - pu, 0.36 + pu, u);
  vec3 n = mix(mix(vec3(-0.80, 0.0, 0.60), vec3(0.0, 0.0, 1.0), sL), vec3(0.80, 0.0, 0.60), sR);
  n.y += 0.7 * inTip;
  n.xy = ar_rot(ang) * n.xy;
  n = normalize(n);
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
  float hgt = sat(q.y / len);
  vec3 deep = mix(vec3(0.07, 0.015, 0.20), vec3(0.02, 0.10, 0.22), seed);
  vec3 glowc = mix(vec3(0.70, 0.22, 1.10), vec3(0.20, 0.80, 1.20), seed);
  vec3 c = deep * (0.15 + 1.6 * dif * dif);
  c += glowc * 0.40 * pow(1.0 - hgt, 1.5) * (1.0 - abs(u) * 0.5);
  c += glowc * 0.30 * pow(1.0 - abs(u), 8.0) * (0.6 + 0.4 * sin(q.y * 16.0 - t * 0.7 + seed * 9.0));
  c += vec3(1.1, 1.0, 1.3) * spec * 0.9;
  float e1 = ar_line(u + 0.36, 0.0, pu * 1.1) + ar_line(u - 0.36, 0.0, pu * 1.1);
  float e2 = ar_line(q.y - body, 0.0, px * 1.1) * step(abs(u), 1.0);
  float rim = smoothstep(-px * 2.5, -px * 0.5, d);
  c += glowc * (e1 * 0.26 + e2 * 0.20) + mix(glowc, vec3(1.0), 0.25) * rim * 0.32;
  c *= 0.85 + 0.3 * noise(q * vec2(30.0, 8.0) + seed * 20.0);
  return vec4(c, a);
}

vec3 art_crystal(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  vec3 L = normalize(vec3(0.6 * cos(t * 0.21), 0.35 + 0.35 * sin(t * 0.16), 0.75));
  vec2 cc = vec2(0.03, -0.30);
  float rc = length((p - cc) * vec2(0.75, 1.0));

  float cells = 8.0;
  vec2 wq = p * cells + 0.6 * vec2(noise(p * 3.0), noise(p * 3.0 + 5.0));
  vec3 v = ar_vor(wq, t * 0.04, 0.3);
  vec2 cid = vec2(v.z * 91.7, v.z * 37.3);
  vec3 cn = normalize(vec3((hash22(cid) - 0.5) * 1.6, 1.0));
  float dif = max(dot(cn, L), 0.0);
  float glint = pow(max(dot(reflect(-L, cn), vec3(0.0, 0.0, 1.0)), 0.0), 50.0);
  float edgeL = 1.0 - smoothstep(0.0, px * cells * 1.4, v.y);
  float light = exp(-rc * 2.4);
  vec3 wall = vec3(0.016, 0.006, 0.036) * (0.25 + dif) * (0.2 + 1.5 * light);
  wall *= 0.8 + 0.4 * noise(wq * 2.0 + v.z * 10.0);
  wall += vec3(0.40, 0.26, 0.85) * glint * (0.05 + 0.35 * light) * smoothstep(0.0, 0.3, v.y) * sat(1.1 - v.x * 1.4);
  wall += vec3(0.30, 0.14, 0.60) * edgeL * (0.015 + 0.16 * light) * (0.3 + glint * 3.0);
  vec3 col = wall + vec3(0.30, 0.10, 0.55) * exp(-rc * 3.5) * 0.28;

  float gy = -0.37 + 0.012 * noise(vec2(p.x * 9.0, 1.0));
  float ground = smoothstep(px, -px, p.y - gy);
  vec3 gcol = vec3(0.006, 0.003, 0.012) + vec3(0.35, 0.14, 0.60) * exp(-length((p - vec2(cc.x, gy)) * vec2(0.55, 3.5)) * 3.0) * 0.30;
  gcol += ar_stars(p * vec2(1.0, 2.5), 50.0, px * 2.5, 0.12, t) * exp(-rc * 3.0) * 0.6;
  col = mix(col, gcol, ground);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float hs = hash11(fi * 3.7 + 11.0);
    float side = mod(fi, 2.0) * 2.0 - 1.0;
    vec2 b = vec2(side * (0.36 + 0.16 * hs), -0.40);
    float ang = -side * (0.10 + 0.30 * hs);
    vec4 s = ar_cr_spire(p, b, ang, 0.018 + 0.010 * hs, 0.16 + 0.14 * hs, px, L, t, hs);
    col = mix(col, s.rgb * 0.40 + vec3(0.015, 0.008, 0.035), s.a);
  }
  vec3 glints = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float hs = hash11(fi * 5.13 + 2.0);
    float a0 = hash11(fi * 2.71 + 0.4) * 2.0 - 1.0;
    a0 *= fi < 1.5 ? 0.25 : 1.0;
    float len = (0.80 - 0.058 * fi) * (0.9 + 0.15 * hs);
    vec2 b = vec2(cc.x + a0 * 0.13, -0.45);
    float ang = a0 * 0.72 + (hs - 0.5) * 0.1;
    float w = 0.042 + 0.012 * hs - 0.0016 * fi;
    float seed = step(0.62, hs) * 0.9 + 0.05;
    vec4 s = ar_cr_spire(p, b, ang, w, len, px, L, t, seed);
    col = mix(col, s.rgb, s.a);
    glints *= 1.0 - s.a;
    vec2 tipP = b + ar_rot(ang) * vec2(0.0, len);
    float life = pow(max(sin(t * 0.55 + fi * 2.39), 0.0), 18.0);
    vec2 d = p - tipP;
    glints += vec3(0.9, 0.85, 1.25) * (ar_cross(d, px, 30.0) * 0.8 + exp(-dot(d, d) * 4000.0) * 0.9) * life;
  }
  col += glints;
  return ar_out(col * 1.1 * ar_vign(uv, 0.5));
}

vec3 art_flow(vec2 uv, float t) {
  vec2 p = ar_ctr(uv);
  float T = t * 0.03;
  vec2 c = vec2(0.13, 0.02) + 0.03 * vec2(sin(T * 2.1), cos(T * 1.7));
  vec2 dc = p - c;
  float r = length(dc);
  float psi = 0.95 * p.y
            + 0.075 * sin(p.x * 2.6 + T * 2.0 + 0.8 * sin(p.y * 3.0 - T))
            + 0.10 * (fbm(p * vec2(1.1, 1.6) + vec2(T * 1.3, -T * 0.4)) - 0.5)
            + 0.025 * (fbm(p * 3.2 - vec2(T * 1.7, T)) - 0.5);
  vec2 c2 = vec2(-0.30, -0.22) + 0.03 * vec2(cos(T * 1.3), sin(T * 1.7));
  psi += 0.075 * log(r + 0.012) - 0.03 * log(length(p - c2) + 0.02);

  float N = 58.0;
  float v = psi * N;
  float fw = max(fwidth(v), 1e-4);
  float d = abs(fract(v + 0.5) - 0.5);
  float idx = floor(v + 0.5);
  float hi = hash11(idx * 1.31 + 7.0);
  float thick = 0.45 + 0.9 * hi * hi;
  float line = 1.0 - smoothstep(thick * 0.5 * fw, (thick * 0.5 + 1.0) * fw, d);
  line *= 1.0 - smoothstep(0.30, 0.6, fw);
  float halo = exp(-d / (fw * 3.0 + 0.03));

  float near = exp(-r * 5.0);
  float ang = atan(dc.y, dc.x);
  float along = mix(p.x * 9.0, ang * 3.0, smoothstep(0.25, 0.08, r));
  float pk = sin(along - t * (0.6 + 0.6 * hi) + hi * TAU * 3.0);
  float packet = 0.25 + 0.75 * smoothstep(0.2, 1.0, pk);
  float dye = smoothstep(0.25, 0.85, fbm(vec2(p.x * 1.6 - t * 0.04, psi * 5.0)));
  float bright = (0.18 + 0.82 * hi * hi) * packet * (0.35 + 0.65 * dye);

  float band = psi * 2.4 + 0.2;
  vec3 pal = 0.5 + 0.5 * cos(TAU * (band + vec3(0.50, 0.60, 0.72)));
  vec3 ink = mix(pal * vec3(0.45, 0.85, 1.15), vec3(1.30, 0.65, 0.28), near * 0.9);

  vec3 bg = mix(vec3(0.003, 0.006, 0.016), vec3(0.010, 0.018, 0.040), uv.y);
  bg += ink * 0.035 * dye;
  vec3 col = bg + ink * (line * 1.5 + halo * 0.12) * bright;
  col += vec3(1.2, 0.6, 0.25) * exp(-r * 14.0) * 0.35 + vec3(1.3, 1.0, 0.8) * exp(-r * r * 3000.0) * 0.5;
  return ar_out(col * ar_vign(uv, 0.6));
}

float ar_sy_ridge(float x, float seed) {
  float i = floor(x), f = fract(x);
  return mix(hash11(i + seed), hash11(i + 1.0 + seed), f);
}

vec3 art_synth(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  float hz = -0.10;
  float dy = hz - p.y;
  float z = 0.12 / max(dy, 0.0015);
  vec2 gc = vec2(p.x * z * 5.0, z * 2.5 + t * 1.2);
  vec2 fw = max(fwidth(gc), vec2(1e-4));
  float above = p.y - hz;

  vec3 sky = mix(vec3(0.42, 0.04, 0.30), vec3(0.015, 0.006, 0.06), smoothstep(0.0, 0.5, above));
  sky = mix(sky, vec3(0.90, 0.20, 0.12), exp(-max(above, 0.0) * 16.0) * 0.7);
  sky += ar_stars(p, 64.0, px, 0.28, t) * smoothstep(0.12, 0.45, above) * 0.8;

  vec2 sc = vec2(0.0, 0.07);
  float R = 0.24;
  vec2 sd = p - sc;
  float sr = length(sd);
  float sy = sd.y / R;
  vec3 sunc = mix(vec3(0.95, 0.03, 0.32), vec3(1.10, 0.62, 0.04), smoothstep(-0.9, 0.75, sy));
  float stripes = 7.0;
  float stripeY = sy * stripes + t * 0.35;
  float gapW = sat((0.2 - sy) * 0.5);
  float sg = abs(fract(stripeY) - 0.5) * (R / stripes);
  float hwg = gapW * 0.5 * R / stripes;
  float gap = mix(1.0, smoothstep(hwg - px * 0.7, hwg + px * 0.7, sg), step(0.002, gapW));
  float disc = smoothstep(R + px, R - px, sr) * gap;
  sky += vec3(0.9, 0.15, 0.35) * exp(-max(sr - R, 0.0) * 8.0) * 0.30;
  sky = mix(sky, sunc, disc);

  float mx = p.x * 6.0;
  float env = smoothstep(0.12, 0.50, abs(p.x));
  float mh = hz + env * (0.04 + 0.22 * ar_sy_ridge(mx, 3.0) * ar_sy_ridge(mx * 0.5, 9.0) + 0.035 * ar_sy_ridge(mx * 3.0, 1.0));
  float md = p.y - mh;
  float mount = smoothstep(px, -px, md);
  vec3 mcol = mix(vec3(0.015, 0.004, 0.035), vec3(0.06, 0.012, 0.10), sat(above / 0.2));
  mcol += vec3(0.9, 0.15, 0.85) * ar_line(md, 0.0, px * 1.2) * 1.3;
  sky = mix(sky, mcol, mount);
  sky += vec3(1.0, 0.2, 0.9) * exp(-abs(md) / (px * 3.0)) * 0.15 * env;

  vec2 gd = abs(fract(gc) - 0.5);
  vec2 lpx = gd / fw;
  float lx = (1.0 - smoothstep(0.5, 1.5, lpx.x)) * (1.0 - smoothstep(0.15, 0.5, fw.x));
  float lz = (1.0 - smoothstep(0.5, 1.5, lpx.y)) * (1.0 - smoothstep(0.15, 0.5, fw.y));
  float glow = exp(-lpx.x * 0.4) * (1.0 - smoothstep(0.1, 0.4, fw.x)) + exp(-lpx.y * 0.4) * (1.0 - smoothstep(0.1, 0.4, fw.y));
  float grid = max(lx, lz);
  vec3 fl = mix(vec3(0.006, 0.002, 0.018), vec3(0.12, 0.015, 0.14), exp(-max(dy, 0.0) * 7.0));
  fl += vec3(0.9, 0.2, 0.4) * exp(-abs(p.x) * 6.0) * exp(-max(dy, 0.0) * 10.0) * 0.5;
  vec3 gridc = mix(vec3(1.1, 0.12, 0.85), vec3(0.20, 0.75, 1.2), sat(dy * 2.2));
  float hazeGrid = mix(1.0, 0.5, exp(-max(dy, 0.0) * 10.0));
  fl += gridc * (grid * 1.3 + glow * 0.16) * hazeGrid;
  fl += sunc * exp(-abs(p.x) * 14.0) * exp(-max(dy, 0.0) * 14.0) * 0.25;

  vec3 col = mix(fl, sky, smoothstep(-px, px, above));
  col += vec3(1.2, 0.35, 0.75) * ar_line(above, 0.0, px * 1.4) * 0.8 + vec3(1.0, 0.25, 0.6) * exp(-abs(above) * 45.0) * 0.18;
  return ar_out(col * ar_vign(uv, 0.5));
}

float ar_rn_glyph(vec2 g, float seed) {
  if (hash11(seed * 3.3) > 0.5) g.x = 2.0 - g.x;
  float d = 1e3;
  float jr = floor(g.y + 0.5);
  float ix = floor(g.x);
  if (ix >= 0.0 && ix <= 1.0 && jr >= 0.0 && jr <= 3.0) {
    float on = step(0.45, hash12(vec2(seed, ix * 7.0 + jr * 13.0 + 1.0)));
    d = min(d, mix(1e3, abs(g.y - jr), on));
  }
  float iy = floor(g.y);
  float jc = floor(g.x + 0.5);
  if (iy >= 0.0 && iy <= 2.0 && jc >= 0.0 && jc <= 2.0) {
    float on = step(0.5, hash12(vec2(seed + 5.0, jc * 11.0 + iy * 3.0 + 2.0)));
    d = min(d, mix(1e3, abs(g.x - jc), on));
  }
  vec2 cl = clamp(g, vec2(0.0), vec2(2.0, 3.0));
  return max(d, length(g - cl));
}

vec3 art_rain(vec2 uv, float t) {
  float px = ar_px(uv);
  vec3 col = vec3(0.0);
  float aspect = 1.25;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float cols = 22.0 + fl * 14.0;
    float cw = aspect / cols;
    float ch = cw * 1.35;
    vec2 q = vec2(uv.x * aspect + fl * 0.37 * cw, 1.0 - uv.y);
    float ci = floor(q.x / cw);
    float hc = hash11(ci * 1.71 + fl * 17.0);
    float speed = (3.0 + 4.0 * hc) * (1.0 - 0.25 * fl);
    float rows = 1.0 / ch;
    float trail = 6.0 + 12.0 * hash11(ci * 3.1 + fl);
    float period = rows + trail + rows * (0.4 + 1.6 * hash11(ci + fl * 5.0));
    float ry = q.y / ch;
    float ri = floor(ry);
    float k = mod(t * speed + hc * 97.0, period) - ry;
    float b = step(0.0, k) * exp(-k / (trail * 0.4)) * step(k, trail);
    float headGlow = exp(-k * k * 0.6) * smoothstep(-1.2, 0.0, k);
    vec2 cid = vec2(ci, ri);
    float rate = 0.3 + 2.0 * hash12(cid + fl * 3.0);
    float seed = hash12(cid * 1.3 + floor(t * rate + hash12(cid) * 10.0) + fl * 7.0) * 1000.0;
    vec2 f = vec2(fract(q.x / cw), fract(ry));
    vec2 g = (f - vec2(0.18, 0.12)) / vec2(0.64, 0.76) * vec2(2.0, 3.0);
    float pxg = px / (cw * 0.64) * 2.0;
    float stroke = 0.16 + 0.04 * fl;
    float d = ar_rn_glyph(g, seed);
    float blur = pxg * (0.9 + fl * 0.7);
    float m = 1.0 - smoothstep(stroke - blur, stroke + blur, d);
    float depthDim = 1.0 - 0.42 * fl;
    vec3 green = mix(vec3(0.10, 1.0, 0.35), vec3(0.06, 0.55, 0.70), fl * 0.45);
    float colGlow = exp(-pow((f.x - 0.5) * 2.2, 2.0));
    vec3 c = green * b * m * depthDim;
    c += vec3(0.75, 1.0, 0.88) * headGlow * m * 1.4 * depthDim;
    c += green * (b * 0.04 + headGlow * 0.08) * colGlow * depthDim;
    col += c;
  }
  vec2 p = ar_ctr(uv);
  col += vec3(0.004, 0.025, 0.014) * exp(-dot(p, p) * 4.0);
  return ar_out(col * ar_vign(uv, 0.6));
}

vec3 ar_pl_pal(float k) {
  k = fract(k) * 5.0;
  float i = floor(k);
  float f = fract(k);
  f = f * f * (3.0 - 2.0 * f);
  vec3 c0 = vec3(0.020, 0.008, 0.10);
  vec3 c1 = vec3(0.50, 0.015, 0.36);
  vec3 c2 = vec3(1.00, 0.28, 0.05);
  vec3 c3 = vec3(1.00, 0.74, 0.28);
  vec3 c4 = vec3(0.03, 0.38, 0.50);
  vec3 a = i < 1.0 ? c0 : i < 2.0 ? c1 : i < 3.0 ? c2 : i < 4.0 ? c3 : c4;
  vec3 b = i < 1.0 ? c1 : i < 2.0 ? c2 : i < 3.0 ? c3 : i < 4.0 ? c4 : c0;
  return mix(a, b, f);
}

float ar_pl_h(vec2 p, float t) {
  vec2 q = p + 0.30 * vec2(sin(p.y * 3.1 + t * 0.21), cos(p.x * 2.7 - t * 0.17));
  vec2 m = vec2(0.30 * sin(t * 0.13), 0.22 * cos(t * 0.11));
  float v = sin(q.x * 5.1 + t * 0.31)
          + sin(q.y * 4.6 - t * 0.23 + sin(q.x * 2.3 + t * 0.19) * 1.8)
          + sin((q.x + q.y) * 3.7 + t * 0.15)
          + sin(sqrt(dot(q - m, q - m) + 0.04) * 11.0 - t * 0.45);
  return v * 0.25;
}

vec3 art_plasma(vec2 uv, float t) {
  vec2 p = ar_ctr(uv) * 1.2;
  float e = 0.003;
  float h = ar_pl_h(p, t);
  float hx = ar_pl_h(p + vec2(e, 0.0), t);
  float hy = ar_pl_h(p + vec2(0.0, e), t);
  vec2 gr = vec2(hx - h, hy - h) / e;
  vec3 n = normalize(vec3(-gr * 0.22, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.70));
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 70.0);
  float sheen = pow(1.0 - n.z, 1.5);

  float k = h * 0.75 + 0.35 + t * 0.01;
  vec3 pal = ar_pl_pal(k);
  vec3 col = pal * (0.18 + 1.0 * dif * dif) + vec3(1.0, 0.85, 0.80) * spec * 0.5 + ar_pl_pal(k + 0.4) * sheen * 0.45;
  float hv = h * 4.0;
  float crest = exp(-abs(fract(hv + 0.5) - 0.5) / (fwidth(hv) * 1.2 + 0.015));
  col += ar_pl_pal(k + 0.6) * crest * 0.05;
  float r = length(ar_ctr(uv) - vec2(0.08, 0.05));
  col *= 0.55 + 0.6 * exp(-r * r * 3.5);
  return ar_out(col * ar_vign(uv, 0.6));
}

vec3 ar_oc_sky(vec3 rd, vec3 sun, float clouds, float t) {
  float el = rd.y;
  vec3 c = mix(vec3(0.85, 0.26, 0.05), vec3(0.30, 0.05, 0.13), smoothstep(0.0, 0.12, el));
  c = mix(c, vec3(0.012, 0.010, 0.05), smoothstep(0.08, 0.42, el));
  float sd = max(dot(rd, sun), 0.0);
  c += vec3(1.2, 0.55, 0.18) * pow(sd, 90.0) * 0.8 + vec3(0.8, 0.30, 0.10) * pow(sd, 12.0) * 0.12;
  if (clouds > 0.5) {
    vec2 cq = vec2(rd.x / max(rd.y, 0.02) * 0.35 + t * 0.004, log(max(el, 0.005)) * 1.6);
    float cn = fbm(cq * vec2(2.0, 1.4) + vec2(0.0, fbm(cq * 1.3) * 0.8));
    float band = smoothstep(0.025, 0.08, el) * smoothstep(0.50, 0.20, el);
    float cl = smoothstep(0.48, 0.75, cn) * band;
    float litUnder = smoothstep(0.75, 0.48, cn);
    vec3 ccol = mix(vec3(0.05, 0.015, 0.05), vec3(1.30, 0.45, 0.15), litUnder * (0.25 + 0.75 * pow(sd, 3.0)));
    c = mix(c, ccol, cl * 0.9);
  }
  return c;
}

vec3 art_ocean(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  float hz = 0.05;
  vec3 sun = normalize(vec3(0.16, 0.035, 1.0));
  vec3 rd = normalize(vec3(p.x, p.y - hz, 1.0));
  vec3 col;
  if (p.y > hz) {
    col = ar_oc_sky(rd, sun, 1.0, t);
    vec2 sp = rd.xy / rd.z - sun.xy / sun.z;
    float sr = length(sp);
    col = mix(col, mix(vec3(1.3, 0.42, 0.08), vec3(1.6, 0.85, 0.30), smoothstep(-0.05, 0.04, sp.y)), smoothstep(0.048 + px, 0.048 - px, sr));
    float isl = hz + 0.032 * smoothstep(0.30, 0.42, p.x) * smoothstep(0.62, 0.47, p.x) * (0.75 + 0.25 * noise(vec2(p.x * 30.0, 0.0)));
    isl = max(isl, hz + 0.016 * smoothstep(-0.62, -0.46, p.x) * smoothstep(-0.30, -0.42, p.x));
    col = mix(col, vec3(0.05, 0.015, 0.04), smoothstep(px, -px, p.y - isl));
  } else {
    float dy = hz - p.y;
    float z = 1.0 / dy;
    vec2 P = vec2(p.x * z, z);
    float foot = z * z * px;
    vec2 dh = vec2(0.0);
    float ht = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float a = fi * 2.39 + 0.3;
      vec2 dir = normalize(vec2(cos(a) * 0.7, 1.0 + 0.3 * sin(a)));
      float fr = 2.2 * pow(1.5, fi);
      float am = 0.045 / pow(1.62, fi);
      float lod = exp(-fr * foot * 1.5);
      float ph = dot(dir, P) * fr - t * sqrt(fr) * 1.1 + fi * 1.7;
      float s = sin(ph);
      ht += am * s * lod;
      dh += am * fr * cos(ph) * dir * lod;
    }
    vec3 n = normalize(vec3(-dh.x, 1.0, -dh.y));
    vec3 rr = reflect(rd, n);
    rr.y = abs(rr.y);
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 refl = ar_oc_sky(rr, sun, 0.0, t);
    vec3 water = vec3(0.012, 0.012, 0.035) + vec3(0.05, 0.015, 0.03) * sat(ht * 10.0 + 0.4);
    col = mix(water, refl, sat(fres));
    float rough = sat(foot * 0.6);
    float ex = mix(1400.0, 90.0, rough);
    float gl = pow(max(dot(rr, sun), 0.0), ex) * mix(14.0, 1.4, rough);
    col += vec3(1.8, 1.05, 0.45) * gl;
    float path = exp(-abs(p.x - sun.x / sun.z) * 7.0 / (0.25 + dy * 2.5));
    col += vec3(0.9, 0.35, 0.10) * path * 0.07 * (1.0 - dy * 1.2);
    col = mix(col, ar_oc_sky(normalize(vec3(rd.x, 0.002, 1.0)), sun, 0.0, t) * 0.7, exp(-dy * 70.0) * 0.7);
  }
  return ar_out(col * ar_vign(uv, 0.45));
}

vec3 art_fire(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  vec2 q = p - vec2(0.0, -0.33);
  float h = q.y;

  float n1 = fbm(vec2(q.x * 3.4, h * 2.4 - t * 1.15));
  float n2 = fbm(vec2(q.x * 8.0 + 3.0, h * 6.0 - t * 2.4));
  float n = n1 * 0.6 + n2 * 0.4;
  float sway = (n1 - 0.5) * 0.18 * sat(h * 2.0) + 0.025 * sin(t * 0.9 + h * 5.0) * sat(h * 2.0);
  float hn = sat(h / 0.70);
  float tongues = noise(vec2(q.x * 9.0, h * 2.5 - t * 1.9));
  float w = 0.25 * pow(1.0 - hn, 0.7) * smoothstep(-0.07, 0.04, h) + 0.002;
  float shape = 1.0 - abs(q.x + sway) / w;
  float I = sat(shape * 0.95 + (n - 0.5) * 3.1 + (tongues - 0.5) * 0.9 * hn - hn * 0.75);
  I *= smoothstep(-0.07, 0.0, h) * (1.0 - smoothstep(0.58, 0.78, h)) * smoothstep(0.004, 0.03, w);
  vec3 flame = vec3(0.90, 0.16, 0.025) * smoothstep(0.0, 0.35, I) * 1.2
             + vec3(1.00, 0.42, 0.07) * smoothstep(0.25, 0.85, I) * 1.1
             + vec3(1.00, 0.85, 0.55) * smoothstep(0.82, 1.0, I) * 1.0;
  flame += vec3(0.10, 0.20, 0.8) * smoothstep(0.02, -0.03, h) * smoothstep(0.4, 1.0, I) * 0.6;

  float flick = 0.88 + 0.12 * sin(t * 6.3 + sin(t * 2.9) * 2.0);
  float gr = length((p - vec2(0.0, -0.25)) * vec2(0.75, 1.0));
  vec3 bg = vec3(0.004, 0.002, 0.002) + vec3(0.40, 0.10, 0.02) * exp(-gr * 4.0) * 0.30 * flick;
  float smoke = smoothstep(0.50, 0.85, fbm(vec2(p.x * 2.4 + sin(t * 0.1), p.y * 1.8 - t * 0.16))) * smoothstep(0.0, 0.45, p.y);
  bg += vec3(0.020, 0.012, 0.012) * smoke;

  float groundY = -0.37 + 0.012 * noise(vec2(p.x * 9.0, 0.0));
  float ground = smoothstep(px, -px, p.y - groundY);
  vec3 gcol = vec3(0.006, 0.003, 0.002) + vec3(0.45, 0.12, 0.02) * exp(-abs(p.x) * 4.0) * exp(-(groundY - p.y) * 10.0) * 0.45 * flick;
  float coals = pow(noise(vec2(p.x * 28.0, p.y * 60.0 + t * 0.3)), 4.0) * exp(-abs(p.x) * 7.0) * smoothstep(-0.47, -0.38, p.y);
  gcol += vec3(1.3, 0.35, 0.05) * coals * (0.6 + 0.4 * sin(t * 2.0 + p.x * 30.0)) * 1.2;
  bg = mix(bg, gcol, ground);

  vec2 l1 = ar_rot(0.20) * (p - vec2(-0.04, -0.375));
  vec2 l2 = ar_rot(-0.24) * (p - vec2(0.05, -0.37));
  float lg1 = length(vec2(max(abs(l1.x) - 0.16, 0.0), l1.y)) - 0.026;
  float lg2 = length(vec2(max(abs(l2.x) - 0.15, 0.0), l2.y)) - 0.024;
  float lg = min(lg1, lg2);
  float logs = smoothstep(px, -px, lg);
  float ly = lg1 < lg2 ? l1.y : l2.y;
  float top = smoothstep(-0.01, 0.025, ly);
  float crack = smoothstep(0.62, 0.8, noise(vec2((lg1 < lg2 ? l1.x : l2.x) * 45.0, ly * 20.0)));
  vec3 logc = vec3(0.010, 0.005, 0.003) + vec3(0.12, 0.04, 0.015) * top;
  logc += vec3(1.2, 0.30, 0.04) * crack * top * (0.5 + 0.5 * sin(t * 1.7 + l1.x * 20.0)) * 0.7;
  bg = mix(bg, logc, logs);

  vec3 col = bg + flame * (1.0 - logs * 0.8);

  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 11.0 + fl * 8.0;
    vec2 e = p * sc;
    e.y -= t * (0.9 + 0.35 * fl);
    e.x += 0.45 * sin(e.y * 0.6 + t * 0.4 + fl * 2.0);
    vec2 id = floor(e);
    vec2 f = fract(e) - 0.5;
    float hh = hash12(id + fl * 31.0);
    vec2 o = (hash22(id + fl * 7.0) - 0.5) * 0.6;
    float d = length(f - o);
    float sz = max(px * sc * 0.8, 0.025 + 0.025 * hash11(hh * 9.0));
    float g = exp(-d * d / (sz * sz));
    float tw = 0.5 + 0.5 * sin(t * (3.0 + 4.0 * hh) + hh * 50.0);
    float spread = 0.06 + 0.35 * sat(p.y + 0.3);
    float column = exp(-p.x * p.x / (spread * spread)) * smoothstep(-0.30, -0.12, p.y) * smoothstep(0.55, 0.05, p.y);
    float on = step(0.62, hh);
    col += mix(vec3(1.4, 0.35, 0.05), vec3(1.5, 0.8, 0.3), hh) * g * tw * column * on * (1.3 - 0.35 * fl);
  }
  return ar_out(col * ar_vign(uv, 0.6));
}

vec3 art_warp(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  vec2 c = vec2(0.05 + 0.03 * sin(t * 0.13), 0.02 + 0.025 * cos(t * 0.11));
  vec2 d = p - c;
  float r = length(d);
  float a = atan(d.y, d.x);
  float an = a / TAU + 0.5;

  float z = 0.10 / max(r, 0.015) + t * 0.55;
  vec2 cs = vec2(cos(a), sin(a));
  float neb = fbm(cs * 2.2 + vec2(z * 0.30, -z * 0.18));
  float streak = noise(cs * 9.0 + vec2(z * 0.05, 0.0));
  float neb2 = fbm(cs * 3.6 - vec2(z * 0.5, z * 0.35) + 5.0);
  vec3 tint = mix(vec3(0.08, 0.03, 0.30), vec3(0.02, 0.16, 0.38), neb2);
  tint = mix(tint, vec3(0.35, 0.04, 0.32), smoothstep(0.55, 0.8, fbm(cs * 1.4 + vec2(z * 0.08, 3.0))));
  vec3 walls = tint * pow(neb, 3.0) * (0.5 + 0.9 * streak) * 1.3;
  walls *= smoothstep(0.03, 0.40, r);
  vec3 col = vec3(0.002, 0.001, 0.008) + walls;

  for (int l = 0; l < 4; l++) {
    float fl = float(l);
    float N = 70.0 + 45.0 * fl;
    float sec = floor(an * N);
    float fa = fract(an * N);
    float h = hash12(vec2(sec, fl * 13.0 + 1.0));
    float h2 = hash12(vec2(sec * 1.7, fl + 3.0));
    float speed = 0.18 + 0.22 * h2;
    float zz = fract(h * 17.0 + t * speed);
    float rs = 0.028 / (1.03 - zz);
    float len = rs * (0.12 + 0.35 * zz) * (0.7 + 0.6 * h2);
    float along = smoothstep(rs - len, rs, r) * smoothstep(rs + px * 2.0, rs - px * 0.5, r);
    float off = 0.5 + (h2 - 0.5) * 0.5;
    float across = abs(fa - off) * TAU / N * r;
    float wdt = max(px * 0.75, rs * 0.004);
    float s = exp(-across * across / (wdt * wdt));
    float vis = sat(TAU / N * r / (px * 3.0) - 0.4) * smoothstep(0.0, 0.25, zz);
    vec3 sc = mix(vec3(0.6, 0.75, 1.3), vec3(1.2, 0.6, 1.1), hash11(h * 31.0)) * (0.8 + 2.0 * zz);
    col += sc * s * along * vis * (0.8 + 0.2 * fl) * step(0.25, h);
  }

  col += vec3(0.55, 0.65, 1.3) * exp(-r * 10.0) * 0.5 + vec3(1.4, 1.3, 1.5) * exp(-r * r * 1100.0) * 1.6;
  col += vec3(0.5, 0.2, 0.9) * exp(-abs(r - 0.085 - 0.01 * sin(t)) * 70.0) * 0.06;
  return ar_out(col * ar_vign(uv, 0.4));
}

float ar_tp_h(vec2 p, float t) {
  float T = t * 0.012;
  float h = 0.60 * fbm(p * 1.5 + vec2(T, -T * 0.7)) + 0.22 * fbm(p * 3.1 - vec2(T * 0.8, T * 1.1) + 4.0);
  vec2 rq = p * 4.2 + vec2(-T, T * 0.6) + 2.0;
  h += 0.07 * (1.0 - abs(2.0 * noise(rq) - 1.0));
  h += 0.32 * exp(-dot(p - vec2(0.14, 0.04), p - vec2(0.14, 0.04)) * 6.0);
  return h;
}

vec3 art_topo(vec2 uv, float t) {
  float px = ar_px(uv);
  vec2 p = ar_ctr(uv);
  float e = 0.004;
  float h = ar_tp_h(p, t);
  vec2 gr = vec2(ar_tp_h(p + vec2(e, 0.0), t) - h, ar_tp_h(p + vec2(0.0, e), t) - h) / e;

  vec2 lp = vec2(0.36 * sin(t * 0.09), 0.24 * sin(t * 0.067 + 1.3));
  vec3 Ld = normalize(vec3(lp - p, 0.30));
  vec3 n = normalize(vec3(-gr * 0.45, 1.0));
  float shade = max(dot(n, Ld), 0.0);
  float rl = length(p - lp);
  float pool = exp(-rl * rl * 5.5);

  vec3 low = vec3(0.004, 0.012, 0.025);
  vec3 mid = vec3(0.012, 0.040, 0.050);
  vec3 high = vec3(0.075, 0.050, 0.035);
  vec3 base = mix(low, mid, smoothstep(0.30, 0.55, h));
  base = mix(base, high, smoothstep(0.62, 0.92, h));
  vec3 col = base * (0.25 + 1.3 * shade) * (0.45 + 1.4 * pool);

  float N = 24.0;
  float v = h * N;
  float fw = max(length(gr) * N * px, 1e-4);
  float d = abs(fract(v + 0.5) - 0.5);
  float idx = floor(v + 0.5);
  float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
  float wpx = mix(0.5, 1.0, major);
  float line = 1.0 - smoothstep(wpx - 0.7, wpx + 0.7, d / fw);
  line *= 1.0 - smoothstep(0.22, 0.5, fw);
  vec3 lc = mix(vec3(0.35, 0.55, 0.58), vec3(1.25, 0.72, 0.36), major);
  float lit = 0.06 + 1.9 * pool * pool + 0.6 * pool + 0.2 * shade;
  col += lc * line * lit * mix(0.45, 1.0, major);

  vec2 gq = p * 6.0;
  vec2 gd = abs(fract(gq + 0.5) - 0.5) / (px * 6.0);
  float grid = 1.0 - smoothstep(0.3, 1.0, min(gd.x, gd.y));
  col += vec3(0.08, 0.16, 0.20) * grid * 0.15 * (0.3 + pool);

  col += vec3(1.0, 0.72, 0.42) * exp(-rl * rl * 1500.0) * 0.9 + vec3(1.0, 0.6, 0.3) * exp(-rl * 12.0) * 0.06;
  float ring = ar_line(rl - 0.03 - 0.008 * sin(t * 1.3), 0.0, px * 1.1);
  col += vec3(1.0, 0.72, 0.42) * ring * 0.30;
  return ar_out(col * ar_vign(uv, 0.5));
}

mat2 cu_koi_rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec4 cu_koi_fish(vec2 p, vec2 pos, float ang, float sc, float t, float seed, float px) {
  vec2 q = cu_koi_rot(-ang) * (p - pos) / sc;
  float L = 0.065;
  q.y += sin(q.x * 38.0 - t * 7.0 + seed * 6.0) * 0.010 * smoothstep(0.03, -0.08, q.x);
  float body = (length(vec2(q.x, q.y * 2.9)) - L) / 2.2;
  float tx = -q.x - L * 0.8;
  float tail = max(abs(q.y) - (0.004 + max(tx, 0.0) * 0.8), max(-tx, tx - 0.045));
  vec2 fq = vec2(q.x - 0.012, abs(q.y) - 0.020);
  float fin = length(fq * vec2(1.6, 2.6)) - 0.018;
  float d = min(min(body, tail), fin);
  float pxs = px / sc;
  float a = smoothstep(pxs, -pxs, d) * mix(0.7, 1.0, smoothstep(pxs, -pxs, body));
  float patch_ = smoothstep(0.45, 0.58, noise(q * 26.0 + seed * 13.0));
  vec3 white = vec3(0.95, 0.90, 0.84);
  vec3 orange = seed > 0.66 ? vec3(1.0, 0.62, 0.12) : vec3(1.0, 0.30, 0.04);
  vec3 c = mix(white, orange, max(patch_, smoothstep(0.035, 0.06, q.x)));
  c *= 0.55 + 0.45 * exp(-q.y * q.y * 1800.0);
  return vec4(c, a);
}

vec3 art_gen_koi(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);
  float px = max(fwidth(uv.y), 1e-4);

  vec2 n = 0.020 * vec2(cos(p.x * 23.0 + t * 1.1), cos(p.y * 19.0 - t * 0.9))
         + 0.012 * vec2(cos((p.x + p.y) * 37.0 - t * 1.7), cos((p.x - p.y) * 31.0 + t * 1.3));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cyc = t * 0.18 + hash11(fi * 7.1);
    vec2 ci = (hash22(vec2(fi, floor(cyc))) - 0.5) * vec2(1.0, 0.8);
    float ph = fract(cyc);
    float d = length(p - ci);
    float r = ph * 0.35;
    float ring = sin((d - r) * 90.0) * exp(-pow((d - r) / 0.03, 2.0)) * sin(PI * ph);
    n += (p - ci) / max(d, 1e-3) * ring * 0.03;
  }

  vec2 v = voronoi(p * 13.0 + n * 3.0);
  vec3 col = vec3(0.006, 0.020, 0.026) + vec3(0.006, 0.018, 0.018) * smoothstep(0.55, 0.15, v.x) * (0.3 + 0.7 * v.y);
  col *= 0.7 + 0.6 * smoothstep(0.7, 0.0, length(p - vec2(0.15, 0.1)));

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float seed = hash11(fi * 3.3 + 1.0);
    float R = 0.16 + 0.09 * fi;
    float w = (0.22 + 0.10 * seed) * (mod(fi, 2.0) * 2.0 - 1.0);
    float a = t * w + fi * 1.7;
    vec2 pos = vec2(0.08, 0.02) + vec2(cos(a), sin(a) * 0.75) * R;
    vec2 tang = vec2(-sin(a), cos(a) * 0.75) * sign(w);
    float ang = atan(tang.y, tang.x);
    float sc = 0.85 + 0.35 * seed;
    vec4 sh = cu_koi_fish(p + n * 0.6 - vec2(0.018, -0.022), pos, ang, sc, t, seed, 0.012);
    col *= 1.0 - 0.6 * sh.a;
    vec4 f = cu_koi_fish(p + n * 0.6, pos, ang, sc, t, seed, px);
    col = mix(col, f.rgb * vec3(0.55, 0.62, 0.62), f.a);
  }

  vec2 moon = vec2(-0.30, 0.22);
  vec2 pm = p + n * 1.6 - moon;
  col += vec3(0.70, 0.80, 1.00) * exp(-dot(pm, pm) * 900.0) * 1.4;
  col += vec3(0.30, 0.40, 0.60) * pow(max(1.0 - length(pm) * 3.0, 0.0), 3.0) * 0.12;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(-0.40 + 0.38 * fi, -0.30 + 0.25 * sin(fi * 2.1)) + 0.015 * vec2(sin(t * 0.11 + fi), cos(t * 0.09 + fi));
    float rad = 0.075 + 0.025 * hash11(fi + 4.0);
    vec2 q = cu_koi_rot(fi * 2.0 + 0.05 * sin(t * 0.2 + fi)) * (p - c);
    float an = atan(q.y, q.x);
    float d = length(q) - rad;
    float notch = abs(an) - 0.18;
    float pad = smoothstep(px, -px, max(d, -notch * length(q)));
    vec3 pc = vec3(0.020, 0.075, 0.030) * (0.7 + 0.3 * abs(sin(an * 9.0)));
    pc += vec3(0.05, 0.12, 0.08) * smoothstep(-0.012, 0.0, d);
    pc += vec3(0.25, 0.30, 0.40) * 0.25 * smoothstep(0.0, 0.5, dot(normalize(q + 1e-4), normalize(moon - c)));
    col = mix(col * (1.0 - 0.5 * smoothstep(0.03, 0.0, d)), pc, pad);
    if (i == 1) {
      vec2 lq = q - vec2(-0.02, 0.0);
      float la = atan(lq.y, lq.x);
      float petal = length(lq) - 0.032 * (0.55 + 0.45 * abs(cos(la * 3.0 + 0.3)));
      float lotus = smoothstep(px, -px, petal);
      vec3 lc = mix(vec3(1.0, 0.85, 0.90), vec3(0.95, 0.35, 0.55), smoothstep(0.0, 0.03, length(lq)));
      col = mix(col, lc, lotus);
      col += vec3(1.0, 0.4, 0.6) * exp(-length(lq) * 30.0) * 0.18;
    }
  }

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 fp = vec2(0.5 * sin(t * 0.13 + fi * 2.3), 0.38 * sin(t * 0.17 + fi * 1.3));
    float blink = 0.5 + 0.5 * sin(t * (1.3 + 0.4 * fi) + fi * 4.0);
    float d = length(p - fp);
    col += vec3(0.85, 1.0, 0.45) * (exp(-d * d / max(px * px * 3.0, 1e-7)) * 1.5 + exp(-d * 40.0) * 0.25) * blink * blink;
  }

  vec2 c2 = uv - 0.5;
  col *= 1.0 - 0.6 * dot(c2, c2);
  col = 1.0 - exp(-col * 1.3);
  return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);
}

vec3 cu_gold_vor(vec2 p, float t) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(n + g);
      vec2 r = g + 0.5 + 0.4 * sin(t + TAU * h) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(n + g); } else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}

vec3 art_gen_gold(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);
  float px = max(fwidth(uv.y), 1e-4);
  float hz = 0.16;

  float sy = p.y - hz;
  vec3 sky = mix(vec3(0.22, 0.05, 0.012), vec3(0.006, 0.003, 0.005), smoothstep(0.0, 0.30, sy));
  float smoke = fbm(vec2(p.x * 2.2 + t * 0.03, p.y * 3.0 - t * 0.06));
  sky *= 0.55 + 0.7 * smoke;

  float cliffL = hz + 0.30 * smoothstep(-0.10, -0.62, p.x) + 0.06 * fbm(vec2(p.y * 6.0, 1.0)) - 0.03;
  float cliffR = hz + 0.24 * smoothstep(0.12, 0.62, p.x) + 0.05 * fbm(vec2(p.y * 6.0, 4.0)) - 0.03;
  float cliff = max(smoothstep(px, -px, p.y - cliffL) * step(p.x, 0.0), smoothstep(px, -px, p.y - cliffR) * step(0.0, p.x));
  vec3 col = mix(sky, vec3(0.012, 0.006, 0.005) + vec3(0.25, 0.07, 0.01) * smoothstep(0.25, -0.05, p.y - hz) * 0.25, cliff * step(hz, p.y));

  float dy = max(hz - p.y, 0.002);
  float z = 0.13 / dy;
  float xw = p.x * z;
  float mean = 0.28 * sin(z * 0.8 + 0.6) + 0.10 * sin(z * 2.0 + 1.0);
  float dx = xw - mean;
  float fw = max(fwidth(dx), 1e-4);
  float rw = 0.30;
  float river = smoothstep(rw + fw, rw - fw, abs(dx));
  float lod = exp(-z * 0.18);

  vec2 fc = vec2(dx * 2.2, z * 1.2 + t * 0.45);
  float warp = fbm(fc * 1.3 + vec2(0.0, -t * 0.1));
  float fl = fbm(fc * vec2(2.4, 1.1) + vec2(warp * 1.2, 0.0));
  vec3 v = cu_gold_vor(fc * vec2(2.6, 1.8) + warp * 0.6, t * 0.3);
  float plates = smoothstep(0.52, 0.70, fbm(fc * 0.7 + 9.0)) * smoothstep(0.05, 0.25, v.y + 0.02) * lod;
  float crack = 1.0 - smoothstep(0.0, 0.10, v.y);

  float edge = smoothstep(rw * 0.2, rw, abs(dx));
  vec3 hot = vec3(1.5, 0.48, 0.05);
  vec3 gold = vec3(0.80, 0.28, 0.02);
  vec3 liquid = mix(hot, gold, edge * 0.8 + 0.2) * (0.55 + 0.8 * fl);
  float sheen = pow(sat(fl * 1.6 - 0.45), 3.0) * lod;
  liquid += vec3(1.6, 1.0, 0.35) * sheen * 0.8;
  liquid *= 0.75 + 0.5 * smoothstep(0.35, 0.75, fl);
  vec3 crust = vec3(0.05, 0.022, 0.012) * (0.6 + 0.6 * v.z) + hot * crack * 0.35;
  vec3 rcol = mix(liquid, crust, plates);
  rcol *= 0.85 + 0.15 * sin(t * 2.3 + z * 3.0);

  vec3 bank = vec3(0.008, 0.005, 0.004) * (0.5 + 0.9 * fbm(vec2(xw * 3.0, z * 2.0)));
  bank += vec3(0.9, 0.25, 0.03) * exp(-max(abs(dx) - rw, 0.0) * 40.0) * 0.30;
  vec3 ground = mix(bank, rcol, river);
  ground = mix(ground, vec3(0.16, 0.05, 0.012), 1.0 - exp(-z * 0.10));
  col = mix(col, ground, step(p.y, hz));
  col += vec3(1.0, 0.40, 0.08) * exp(-abs(p.y - hz) * 30.0) * 0.25;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 14.0 + fi * 9.0;
    vec2 e = p * sc;
    e.y -= t * (1.2 + 0.4 * fi);
    e.x += 0.4 * sin(e.y * 0.7 + fi * 2.0 + t * 0.5);
    vec2 id = floor(e);
    vec2 f = fract(e) - 0.5 - (hash22(id + fi * 9.0) - 0.5) * 0.6;
    float on = step(0.80, hash12(id + fi * 5.0));
    float sz = max(px * sc * 0.8, 0.03);
    float near = exp(-pow(p.x - 0.05 * sin(t * 0.2), 2.0) * 6.0) * smoothstep(-0.5, 0.0, p.y) * smoothstep(0.5, 0.1, p.y);
    col += vec3(1.6, 0.7, 0.15) * exp(-dot(f, f) / (sz * sz)) * on * near * (0.6 + 0.4 * sin(t * 5.0 + id.x));
  }

  vec2 c2 = uv - 0.5;
  col *= 1.0 - 0.6 * dot(c2, c2);
  col = 1.0 - exp(-col * 1.1);
  return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);
}

vec3 art_gen_jelly(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);
  float px = max(fwidth(uv.y), 1e-4);

  vec3 col = mix(vec3(0.002, 0.006, 0.020), vec3(0.010, 0.040, 0.080), smoothstep(-0.5, 0.5, p.y));
  float shafts = pow(noise(vec2(p.x * 5.0 + p.y * 1.6, t * 0.08)), 3.0) * smoothstep(-0.3, 0.5, p.y);
  col += vec3(0.05, 0.14, 0.20) * shafts * 0.6;

  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = (p + vec2(t * 0.004, t * (0.010 + 0.006 * fi))) * (40.0 + 30.0 * fi);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.3 - 0.4 * hash22(id);
    float on = step(0.82, hash12(id + fi * 3.0));
    float sz = max(px * (40.0 + 30.0 * fi) * 0.7, 0.04);
    col += vec3(0.25, 0.40, 0.45) * exp(-dot(f, f) / (sz * sz)) * on * (0.5 - 0.2 * fi);
  }

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float R = 0.12 - 0.03 * fi;
    vec2 pos = vec2(0.20 - 0.29 * fi + 0.05 * sin(t * 0.17 + fi * 2.0),
                    0.12 - 0.08 * fi + 0.05 * sin(t * 0.21 + fi * 1.3));
    float pulse = sin(t * 1.3 + fi * 2.1);
    float sway = 0.15 * sin(t * 0.3 + fi);
    vec2 q = (p - pos);
    q = vec2(cos(sway) * q.x + sin(sway) * q.y, -sin(sway) * q.x + cos(sway) * q.y);
    float w = R * (1.0 + 0.10 * pulse);
    float h = R * 0.72 * (1.0 - 0.08 * pulse);
    vec3 hue = fi == 1.0 ? vec3(0.95, 0.30, 0.85) : vec3(0.25, 0.85, 1.00);

    float e = length(q / vec2(w, h));
    float frill = -0.12 * h + 0.018 * R * sin(q.x / w * 22.0 + t * 3.0);
    float inside = smoothstep(1.0 + px / h, 1.0 - px / h, e) * smoothstep(frill - px, frill + px, q.y);
    float rim = smoothstep(0.55, 1.0, e);
    float lobes = pow(abs(cos(atan(q.x, q.y + 0.2 * h) * 2.0)), 6.0) * smoothstep(0.75, 0.2, e);
    vec3 bell = hue * (0.10 + 0.9 * rim * rim + 0.5 * lobes);
    bell += vec3(0.9, 0.95, 1.0) * pow(sat(1.0 - length((q - vec2(-0.3 * w, 0.45 * h)) / vec2(w, h) * 2.5)), 3.0) * 0.5;
    col = mix(col, col * 0.4 + bell, inside * 0.85);
    col += hue * exp(-abs(e - 1.0) * 14.0) * 0.12 * step(frill, q.y);

    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float x0 = (fk / 6.0 - 0.5) * w * 1.7;
      float down = -(q.y - frill);
      float len = R * (2.2 + 1.2 * hash11(fk + fi * 7.0));
      float s = clamp(down / len, 0.0, 1.0);
      float x = x0 * (1.0 - 0.3 * s) + 0.025 * sin(down * 22.0 - t * 2.2 + fk * 1.7) * s * 1.5;
      float wd = mix(0.0035, 0.0008, s) + px * 0.5;
      float line = smoothstep(wd + px, wd - px * 0.5, abs(q.x - x)) * step(0.0, down) * (1.0 - s);
      col += hue * line * (0.55 + 0.45 * sin(down * 40.0 - t * 4.0 + fk)) * 0.8;
    }
    float arm = abs(q.x - 0.012 * sin(q.y * 30.0 + t * 1.5)) - 0.012 * R / 0.12 * smoothstep(-1.4 * R, 0.0, q.y - frill);
    float armM = smoothstep(px, -px, arm) * step(q.y, frill + 0.01) * smoothstep(-1.5 * R, -0.2 * R, q.y - frill);
    col = mix(col, hue * 0.55 + vec3(0.15), armM * 0.6);
    col += hue * exp(-length(q / vec2(w, h)) * 2.5) * 0.10;
  }

  vec2 c2 = uv - 0.5;
  col *= 1.0 - 0.6 * dot(c2, c2);
  col = 1.0 - exp(-col * 1.3);
  return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);
}
`;
