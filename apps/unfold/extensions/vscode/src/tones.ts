import type { Tone } from './core.js';

/** The theme colour each tone draws with. The extension contributes these ids, so a theme can restyle every tone at once; `neutral` keeps the theme's own icon colour. */
export const toneColors: Record<Tone, string | undefined> = {
  neutral: undefined,
  live: 'unfold.live',
  attention: 'unfold.attention',
  review: 'unfold.review',
  success: 'unfold.success',
  danger: 'unfold.danger',
  severe: 'unfold.severe',
};

const codicons: Record<string, string> = {
  proposed: 'lightbulb', inbox: 'inbox', 'circle-dashed': 'circle-large-outline', 'circle-half': 'pulse', activity: 'pulse',
  'pull-request': 'git-pull-request', alert: 'bell-dot', clock: 'watch', 'circle-slash': 'circle-slash', 'check-circle': 'pass',
  check: 'check', plus: 'add', tag: 'tag', 'x-circle': 'error', x: 'close', branch: 'git-branch', eye: 'eye', circle: 'circle-outline',
  'pause-circle': 'debug-pause', zap: 'zap', stop: 'debug-stop', coins: 'credit-card', 'help-circle': 'question', sessions: 'comment-discussion',
};

/** The codicon for a glyph name from the shared vocabulary; an unknown glyph falls back to a plain circle. */
export function codicon(glyph: string, live = false): string {
  if (live) return 'sync~spin';
  return codicons[glyph] ?? 'circle-outline';
}
