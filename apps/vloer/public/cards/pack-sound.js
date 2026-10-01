let context = null;

function audio() {
  if (context) return context;
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) return null;
  context = new Context();
  return context;
}

function noise(ac, seconds) {
  const buffer = ac.createBuffer(1, Math.max(1, Math.round(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(ac, peak, attack, release) {
  const gain = ac.createGain();
  const now = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  gain.connect(ac.destination);
  return gain;
}

/**
 * The pack ceremony's sounds, synthesised with WebAudio and silent unless the person switched sound on. Nothing is
 * downloaded. `enabled` is read on every call, so turning sound off takes effect at once.
 * @param {() => boolean} enabled
 */
export function packSounds(enabled) {
  const play = draw => { if (!enabled()) return; const ac = audio(); if (!ac) return; if (ac.state === 'suspended') void ac.resume(); try { draw(ac); } catch {} };
  return {
    tear: () => play(ac => {
      const source = noise(ac, 0.45);
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, ac.currentTime);
      filter.frequency.exponentialRampToValueAtTime(5200, ac.currentTime + 0.4);
      source.connect(filter).connect(envelope(ac, 0.22, 0.02, 0.4));
      source.start();
    }),
    deal: () => play(ac => {
      const source = noise(ac, 0.3);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      source.connect(filter).connect(envelope(ac, 0.12, 0.04, 0.25));
      source.start();
    }),
    charge: (seconds, level) => play(ac => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320 + level * 160, ac.currentTime + seconds);
      osc.connect(envelope(ac, 0.05 + level * 0.02, seconds * 0.85, 0.15));
      osc.start();
      osc.stop(ac.currentTime + seconds + 0.2);
    }),
    reveal: level => play(ac => {
      const base = 523.25;
      const partials = [1, 1.5, 2, 3].slice(0, 2 + Math.min(2, level));
      for (const [index, ratio] of partials.entries()) {
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = base * ratio;
        osc.connect(envelope(ac, 0.08 / (index + 1), 0.01, 0.9 + level * 0.3));
        osc.start(ac.currentTime + index * 0.04);
        osc.stop(ac.currentTime + 1.6 + level * 0.3);
      }
    }),
  };
}
