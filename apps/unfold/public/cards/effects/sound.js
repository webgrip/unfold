let context = null;

function audio() {
  if (context) return context;
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) return null;
  context = new Context();
  return context;
}

function synth(ac, pitch) {
  const noise = seconds => {
    const buffer = ac.createBuffer(1, Math.max(1, Math.round(ac.sampleRate * seconds)), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    return source;
  };
  const envelope = (peak, attack, release, at = ac.currentTime) => {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    gain.connect(ac.destination);
    return gain;
  };
  const tone = (frequency, delay, seconds, type = 'sine', peak = 0.1, glide = 0) => {
    const at = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency * pitch, at);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide * pitch, at + seconds);
    osc.connect(envelope(peak, 0.01, seconds, at));
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  };
  const filtered = (seconds, type, frequency, peak, attack, release, sweep = 0) => {
    const source = noise(seconds);
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, ac.currentTime);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, ac.currentTime + seconds * 0.9);
    source.connect(filter).connect(envelope(peak, attack, release));
    source.start();
  };
  const shimmer = (count, low, high, peak) => { for (let i = 0; i < count; i++) tone(low + Math.random() * (high - low), i * 0.05, 0.6, 'sine', peak); };
  const chord = (notes, seconds, peak, type = 'triangle') => notes.forEach((note, index) => tone(note, index * 0.03, seconds, type, peak));
  return { ac, noise, envelope, tone, filtered, shimmer, chord };
}

const packCues = Object.freeze({
  tear: s => {
    const { ac } = s;
    const source = s.noise(0.45);
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(5200, ac.currentTime + 0.4);
    source.connect(filter).connect(s.envelope(0.22, 0.02, 0.4));
    source.start();
  },
  deal: s => {
    const { ac } = s;
    const source = s.noise(0.3);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    source.connect(filter).connect(s.envelope(0.12, 0.04, 0.25));
    source.start();
  },
  charge: (s, { seconds = 0.5, level = 0 } = {}) => {
    const { ac } = s;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320 + level * 160, ac.currentTime + seconds);
    osc.connect(s.envelope(0.05 + level * 0.02, seconds * 0.85, 0.15));
    osc.start();
    osc.stop(ac.currentTime + seconds + 0.2);
  },
  reveal: (s, { level = 0, base = 523.25 } = {}) => {
    const { ac } = s;
    const partials = [1, 1.5, 2, 3].slice(0, 2 + Math.min(2, level));
    for (const [index, ratio] of partials.entries()) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = base * ratio;
      osc.connect(s.envelope(0.08 / (index + 1), 0.01, 0.9 + level * 0.3));
      osc.start(ac.currentTime + index * 0.04);
      osc.stop(ac.currentTime + 1.6 + level * 0.3);
    }
  },
});

const pitched = new Set(['seal', 'release', 'rarity', 'rise', 'crack', 'mend', 'grade', 'set', 'tick', 'whoosh']);

const banks = new Map();

/**
 * Adds a sound bank: named cues, each `(synth, params) => void`, drawn with WebAudio and nothing downloaded. A theme
 * names its bank in `soundBank`; a cue a bank lacks falls back to the default bank's.
 * @param {string} id
 * @param {{ label: string, cues: Record<string, Function> }} bank
 */
export function registerSoundBank(id, bank) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || !bank || typeof bank.cues !== 'object') throw new Error('Invalid sound bank');
  banks.set(id, Object.freeze({ id, label: String(bank.label ?? id), cues: Object.freeze({ ...bank.cues }) }));
}

/** The registered sound banks, by id. */
export function soundBankIds() { return [...banks.keys()]; }

/** The bank a theme asks for in `soundBank` when it is registered, and the default bank otherwise. */
export function soundBankFor(theme) {
  const id = typeof theme === 'string' ? theme : theme?.soundBank;
  return typeof id === 'string' && banks.has(id) ? id : 'default';
}

registerSoundBank('default', {
  label: 'Warm',
  cues: {
    ...packCues,
    seal: (s, { level = 1 } = {}) => { s.tone(140, 0, 0.5, 'sine', 0.22, 40); s.filtered(0.25, 'lowpass', 1500, 0.12, 0.005, 0.24); [523.25, 659.25, 783.99].forEach((note, i) => s.tone(note, 0.09 + i * 0.06, 1.1 + level * 0.2, 'triangle', 0.05)); },
    release: (s, { level = 1 } = {}) => { [392, 523.25, 659.25, 783.99].forEach((note, i) => s.tone(note, i * 0.07, 0.9 + level * 0.2, 'sine', 0.05)); },
    rise: (s, { level = 2 } = {}) => { s.shimmer(8 + level * 2, 1200, 3600, 0.02); s.chord([261.63, 329.63, 392, 523.25], 1.4 + level * 0.3, 0.04); },
    crack: s => { s.tone(92, 0, 0.35, 'sine', 0.26, 46); s.filtered(0.28, 'lowpass', 700, 0.1, 0.004, 0.26); },
    mend: (s, { level = 2 } = {}) => { s.shimmer(12, 1100, 3000, 0.022); s.chord([293.66, 369.99, 440, 587.33], 1.8 + level * 0.2, 0.045); },
    grade: s => { s.tone(659.25, 0, 0.8, 'sine', 0.06); s.tone(987.77, 0.09, 1, 'sine', 0.05); },
    rarity: (s, { level = 0 } = {}) => { [392, 493.88, 587.33, 783.99, 987.77].slice(0, 2 + Math.min(3, level)).forEach((note, i) => s.tone(note, i * 0.08, 0.7 + level * 0.25, 'triangle', 0.05)); if (level >= 3) s.shimmer(6 + level * 3, 1400, 3800, 0.02); if (level >= 4) s.tone(98, 0, 0.9, 'sine', 0.16, 49); },
    set: (s, { level = 3 } = {}) => { s.tone(130, 0, 0.6, 'sine', 0.2, 40); s.shimmer(14, 1200, 3600, 0.022); s.chord([261.63, 329.63, 392, 523.25, 659.25], 2 + level * 0.3, 0.04); },
    tick: s => s.tone(1800, 0, 0.05, 'square', 0.02),
    whoosh: s => s.filtered(0.6, 'bandpass', 300, 0.12, 0.35, 0.25, 3600),
    chime: (s, { notes = [1046.5, 1318.51] } = {}) => notes.slice(0, 6).forEach((note, i) => s.tone(note, i * 0.06, 0.9, 'sine', 0.045)),
  },
});

registerSoundBank('bright', {
  label: 'Bright',
  cues: {
    reveal: (s, { level = 0 } = {}) => packCues.reveal(s, { level, base: 1046.5 }),
    seal: (s, { level = 1 } = {}) => { s.tone(220, 0, 0.25, 'sine', 0.14, 110); [1046.5, 1318.51, 1567.98].forEach((note, i) => s.tone(note, 0.05 + i * 0.05, 0.7 + level * 0.15, 'sine', 0.045)); },
    release: (s, { level = 1 } = {}) => { [783.99, 1046.5, 1318.51, 1567.98].forEach((note, i) => s.tone(note, i * 0.06, 0.6 + level * 0.15, 'sine', 0.04)); },
    rise: (s, { level = 2 } = {}) => { s.shimmer(10 + level * 2, 2000, 5200, 0.018); s.chord([523.25, 659.25, 783.99, 1046.5], 1 + level * 0.25, 0.035, 'sine'); },
    crack: s => { s.tone(140, 0, 0.25, 'sine', 0.18, 70); s.filtered(0.2, 'bandpass', 1400, 0.06, 0.003, 0.18); },
    mend: (s, { level = 2 } = {}) => { s.shimmer(14, 1800, 4800, 0.02); s.chord([587.33, 739.99, 880, 1174.66], 1.4 + level * 0.2, 0.035, 'sine'); },
    grade: s => { s.tone(1318.51, 0, 0.6, 'sine', 0.05); s.tone(1975.53, 0.08, 0.8, 'sine', 0.04); },
    rarity: (s, { level = 0 } = {}) => { [783.99, 987.77, 1174.66, 1567.98, 1975.53].slice(0, 2 + Math.min(3, level)).forEach((note, i) => s.tone(note, i * 0.07, 0.5 + level * 0.2, 'sine', 0.04)); if (level >= 3) s.shimmer(8 + level * 3, 2200, 5200, 0.018); },
    set: (s, { level = 3 } = {}) => { s.shimmer(16, 2000, 5200, 0.02); s.chord([523.25, 659.25, 783.99, 1046.5, 1318.51], 1.6 + level * 0.3, 0.035, 'sine'); },
    tick: s => s.tone(2600, 0, 0.04, 'sine', 0.02),
  },
});

/**
 * A sound player for ceremonies, silent unless `enabled()` answers true; it reads that on every cue, so turning sound
 * off takes effect at once. `bank()` names the bank to draw from. Cues other than the pack's own get ±4 % random pitch,
 * so a repeated cue does not grate. Nothing is downloaded.
 * @param {{ enabled: () => boolean, bank?: () => string, random?: () => number }} options
 */
export function createSoundPlayer({ enabled, bank = () => 'default', random = Math.random }) {
  const play = (cue, params = {}) => {
    if (!enabled()) return false;
    const chosen = banks.get(bank()) ?? banks.get('default');
    const draw = chosen.cues[cue] ?? banks.get('default').cues[cue];
    if (!draw) return false;
    const ac = audio();
    if (!ac) return false;
    if (ac.state === 'suspended') void ac.resume();
    try { draw(synth(ac, pitched.has(cue) ? 1 + (random() - 0.5) * 0.08 : 1), params); } catch { return false; }
    return true;
  };
  return {
    play,
    tear: () => play('tear'),
    deal: () => play('deal'),
    charge: (seconds, level) => play('charge', { seconds, level }),
    reveal: level => play('reveal', { level }),
  };
}
