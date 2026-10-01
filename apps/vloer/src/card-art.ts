import type { AppConfig, User } from './types.ts';
import { checkArtSource } from './card-assets.ts';

export type CardArtConfig = NonNullable<NonNullable<AppConfig['cardThemes']>['ai']>;

/** The most attempts one generation may make: the first answer and two retries with the compiler's log. */
export const maxArtAttempts = 3;

/**
 * The prompt Vloer sends for card art, from the Card Forge's generator guide. `{{PROMPT}}` is the subject the
 * administrator typed; the `{{#COMPILER_LOG}}` section is sent only on a retry, with the browser compiler's log.
 */
export const artPromptTemplate = `Write a GLSL ES 3.0 function \`vec3 art_custom(vec2 uv, float t)\` that paints a small, moving painting for the art window of a trading card.

Subject: {{PROMPT}}

## Inputs and output

- \`uv\` runs 0..1 across the art window, with the origin at the bottom left. The window is about 1.25:1, wider than tall. For round shapes, work in \`vec2 p = (uv - 0.5) * vec2(1.25, 1.0);\`, where x runs from -0.625 to 0.625 and y from -0.5 to 0.5.
- \`t\` is time in seconds. It starts at 0 and grows without limit.
- Return a display colour (sRGB) with every channel in 0..1. End with a clamp.

## Helpers you can call (already defined, do not redefine them)

\`\`\`glsl
const float PI; const float TAU;
float sat(float x);                  // clamp 0..1
float hash11(float p); float hash12(vec2 p); vec2 hash22(vec2 p);   // 0..1
float noise(vec2 p);                 // smooth value noise 0..1
float fbm(vec2 p);                   // 4-octave noise 0..1, costs 4 noise calls
vec3  hsv2rgb(vec3 c);               // h, s, v in 0..1
vec3  spectrum(float x);             // smooth rainbow, wraps every 1.0
vec2  voronoi(vec2 p);               // x = distance to nearest cell point, y = cell id 0..1 (static cells)
\`\`\`

## Hard rules (the code is rejected if it breaks one)

1. Output only the code, in one fenced \`\`\`glsl block, with no prose before or after it.
2. No \`#version\`, \`precision\`, \`#define\`, \`#include\`, \`uniform\`, \`in\`, \`out\`, \`sampler*\`, \`texture()\` or \`main\`. No global variables apart from \`const\` values.
3. You may write helper functions above \`art_custom\`. Prefix every helper name with \`cu_\`.
4. Strict GLSL ES 3.0: write float literals with a decimal point (\`1.0\`, not \`1\`), never mix \`int\` and \`float\` without \`float(...)\`, use \`atan(y, x)\` and \`mod()\` for floats, and no recursion.
5. Use \`for\` loops only with an \`int\` counter and constant bounds, at most 64 iterations per loop, and at most 64 iterations in total when loops are nested.
6. Guard every operation that can produce NaN or infinity: \`sqrt(max(x, 0.0))\`, \`pow(max(x, 0.0), k)\`, \`log(max(x, 1e-4))\`, divide by \`max(d, 1e-4)\`, and \`normalize\` a vector only when it cannot be zero.
7. Keep the cost of one pixel low: at most about 12 \`fbm\` calls, or 48 \`noise\` calls, in total. It runs on every pixel of a full-screen card at 60 fps on a laptop GPU.

## Motion

- Animate smoothly forever. Every value must be a continuous function of \`t\`: \`sin(t * k)\`, \`fract(t * k + offset)\` used only where the wrap is invisible, or noise sampled at \`t * k\`.
- When something recycles, such as a particle that respawns, fade it to zero before the wrap, for example \`sin(PI * fract(x))\`.
- Keep speeds gentle: multiply \`t\` by 2.0 or less, and avoid \`t * 50.0\`. The painting should breathe rather than flicker.

## Anti-aliasing (it is shown at about 640 x 512 and smaller)

- Get the pixel size once at the top of \`art_custom\`, outside any \`if\` or loop: \`float px = max(fwidth(uv.y), 1e-4);\`.
- Draw edges with a soft step at least one pixel wide: \`1.0 - smoothstep(-px, px, d)\` for a signed distance \`d\`.
- Make points and lines at least 1.5 px wide: \`max(size, px * 1.5)\`. Fade out patterns that get finer than about 3 px, such as grids at the horizon or far detail.

## Composition and colour

- One clear focal point, placed off-centre (near a third), with depth: a dark background, a midground, and a foreground.
- A limited palette: two or three hues plus one accent. Keep the edges darker, because the card frame surrounds the window: \`col *= 1.0 - 0.6 * dot(uv - 0.5, uv - 0.5);\`.
- No text, letters, logos or real people.
- Work in linear light, add glows, and finish with a soft highlight roll-off before gamma:
  \`col = 1.0 - exp(-col * 1.3); return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);\`

## Example 1

Subject: pulsing neon rings over a dark void

\`\`\`glsl
vec3 art_custom(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);
  float px = max(fwidth(uv.y), 1e-4);
  vec2 c = vec2(0.12, 0.05);
  float r = length(p - c);
  vec3 col = mix(vec3(0.004, 0.002, 0.014), vec3(0.03, 0.01, 0.06), exp(-r * 3.0));
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ph = fract(fi / 6.0 + t * 0.06);
    float rad = ph * 0.7;
    float d = abs(r - rad);
    float ring = 1.0 - smoothstep(0.0, px * 1.5, d - 0.002);
    col += spectrum(fi / 6.0 + t * 0.02) * (ring + exp(-d * 60.0) * 0.4) * sin(PI * ph) * 1.2;
  }
  col += vec3(1.0, 0.8, 1.0) * exp(-r * 25.0) * 0.8;
  col *= 1.0 - 0.6 * dot(uv - 0.5, uv - 0.5);
  col = 1.0 - exp(-col * 1.3);
  return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);
}
\`\`\`

## Example 2

Subject: paper lanterns rising over dark hills at dusk

\`\`\`glsl
vec3 art_custom(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(1.25, 1.0);
  float px = max(fwidth(uv.y), 1e-4);
  vec3 col = mix(vec3(0.55, 0.18, 0.08), vec3(0.02, 0.015, 0.07), smoothstep(-0.35, 0.45, p.y));
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h = hash11(fi * 1.37);
    float depth = 0.4 + 0.6 * hash11(fi * 4.1 + 2.0);
    float ph = fract(t * 0.02 * depth + h);
    vec2 c = vec2((h - 0.5) * 1.1 + 0.03 * sin(t * 0.5 + fi), ph * 1.3 - 0.6);
    float s = 0.032 * depth;
    float d = length((p - c) / vec2(s, s * 1.25)) - 1.0;
    float fade = sin(PI * ph);
    float body = 1.0 - smoothstep(-px / s, px / s, d);
    col += vec3(1.0, 0.45, 0.12) * exp(-length(p - c) * 16.0 / depth) * 0.25 * fade;
    col = mix(col, vec3(1.5, 0.65, 0.22) * (0.8 + 0.4 * depth), body * fade);
  }
  float hills = -0.30 + 0.06 * sin(p.x * 5.0) + 0.03 * sin(p.x * 13.0 + 1.0);
  col = mix(col, vec3(0.008, 0.005, 0.012), 1.0 - smoothstep(-px, px, p.y - hills));
  col *= 1.0 - 0.6 * dot(uv - 0.5, uv - 0.5);
  col = 1.0 - exp(-col * 1.3);
  return clamp(pow(col, vec3(0.4545)), 0.0, 1.0);
}
\`\`\`

Now write \`art_custom\` for the subject above. Output only the fenced code block.

{{#COMPILER_LOG}}
Your previous answer failed to compile with this log. Fix every error and return the complete code again, in one fenced block:

\`\`\`
{{COMPILER_LOG}}
\`\`\`
{{/COMPILER_LOG}}`;

export class CardArtError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}

/** Fills the template with the subject and, on a retry, the compiler's log; without a log the retry section is left out. */
export function artPrompt(subject: string, compilerLog?: string): string {
  const withLog = artPromptTemplate.replace(/\{\{#COMPILER_LOG\}\}([\s\S]*?)\{\{\/COMPILER_LOG\}\}/, (_, section: string) => compilerLog ? section.replace('{{COMPILER_LOG}}', () => compilerLog) : '');
  return withLog.replace('{{PROMPT}}', () => subject).trimEnd();
}

/** Takes the first ```glsl block out of a reply, or the first fenced block, or the reply itself. */
export function extractGlsl(reply: string): string {
  const fenced = /```glsl[^\n]*\n([\s\S]*?)```/i.exec(reply) ?? /```[a-z]*\n([\s\S]*?)```/i.exec(reply);
  return (fenced ? fenced[1] : reply).trim();
}

const plain = (value: string, max: number) => value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim().slice(0, max);

/**
 * Generates card art shaders through an OpenAI-compatible chat completions endpoint (for example the LiteLLM gateway
 * with a low-budget virtual key for Vloer). The key is read from the environment variable `keyEnv` at each request and
 * never leaves the server. Each administrator may make `requestsPerHour` requests. The answer is only text: Vloer
 * extracts the GLSL and checks its rules, and the browser compiles it; nothing here runs it.
 */
export class CardArtGenerator {
  private readonly config: CardArtConfig | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly recent = new Map<string, number[]>();

  constructor(config: AppConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config.mode === 'live' ? config.cardThemes?.ai : undefined;
    this.fetchImpl = fetchImpl;
  }

  /** Whether generation is configured on this workbench; the demo never calls a model. */
  configured(): boolean { return Boolean(this.config); }

  /** The model generation uses, for the designer to name. */
  model(): string | null { return this.config?.model ?? null; }

  /** Asks the model for one shader. `attempt` 2 and 3 carry the compiler's log from the previous attempt. */
  async generate(user: User, input: { prompt?: unknown; compilerLog?: unknown; attempt?: unknown }): Promise<{ code: string; problems: string[]; attempt: number; model: string }> {
    const config = this.config;
    if (!config) throw new CardArtError('Art generation is not configured on this workbench. Set cardThemes.ai in the server configuration.', 409, 'art_unconfigured');
    const prompt = typeof input.prompt === 'string' ? plain(input.prompt, 500) : '';
    if (prompt.length < 3) throw new CardArtError('Describe the picture in at least three characters.', 400, 'invalid_input');
    const attempt = input.attempt === undefined ? 1 : Number(input.attempt);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > maxArtAttempts) throw new CardArtError(`A generation makes at most ${maxArtAttempts} attempts.`, 400, 'invalid_input');
    const compilerLog = typeof input.compilerLog === 'string' ? plain(input.compilerLog.replace(/\r/g, ''), 4000) : '';
    if (attempt > 1 && !compilerLog) throw new CardArtError('A retry needs the compiler log of the previous attempt.', 400, 'invalid_input');
    const now = Date.now();
    const window = (this.recent.get(user.id) ?? []).filter(at => now - at < 3_600_000);
    if (window.length >= config.requestsPerHour) throw new CardArtError(`You made ${config.requestsPerHour} art requests in the last hour. Try again later.`, 429, 'rate_limited');
    window.push(now);
    this.recent.set(user.id, window);
    const key = process.env[config.keyEnv];
    if (!key) throw new CardArtError(`The art generation key ${config.keyEnv} is not set on the server.`, 503, 'art_unconfigured');
    if (process.env.LITELLM_MASTER_KEY && key === process.env.LITELLM_MASTER_KEY) throw new CardArtError('The art generation key is the gateway master key. Give Vloer its own low-budget virtual key.', 503, 'art_master_key');
    let response: Response;
    try {
      response = await this.fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: config.model, max_tokens: config.maxTokens, messages: [{ role: 'user', content: artPrompt(prompt, attempt > 1 ? compilerLog : undefined) }], user: `vloer-card-art:${user.id}` }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error: any) {
      throw new CardArtError(error?.name === 'TimeoutError' ? 'The art model did not answer in time.' : 'The art model could not be reached.', 502, 'art_gateway');
    }
    if (!response.ok) throw new CardArtError(`The art model answered HTTP ${response.status}.${response.status === 400 || response.status === 429 ? ' Its budget or rate limit may be used up.' : ''}`, 502, 'art_gateway');
    let reply = '';
    try {
      const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      reply = typeof content === 'string' ? content : '';
    } catch { throw new CardArtError('The art model sent an answer Vloer could not read.', 502, 'art_gateway'); }
    const code = extractGlsl(reply).slice(0, 20000);
    return { code, problems: checkArtSource(code), attempt, model: config.model };
  }
}
