/** The GLSL ES 3.0 helpers every forge shader starts with: hashes, value noise, fbm, hsv2rgb, spectrum and voronoi. */
export const prelude = `const float PI = 3.14159265;
const float TAU = 6.2831853;
float sat(float x) { return clamp(x, 0.0, 1.0); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v / 0.9375; }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
vec3 spectrum(float x) { return 0.5 + 0.5 * cos(TAU * (fract(x) + vec3(0.0, 0.33, 0.67))); }
vec2 voronoi(vec2 p) { vec2 n = floor(p), f = fract(p); float md = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(i, j); vec2 o = hash22(n + g); vec2 r = g + o - f; float d = dot(r, r); if (d < md) { md = d; id = hash12(n + g); } }
  return vec2(sqrt(md), id); }
`;
