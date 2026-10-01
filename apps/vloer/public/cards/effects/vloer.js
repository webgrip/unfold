import { prefs } from '../../core/prefs.js';
import { api } from '../../core/api.js';
import { announce } from '../../core/dom.js';
import { isTyping } from '../../core/keys.js';
import { cardAsOf, momentText } from '../collection-model.js';
import { momentEvent } from '../skin-kit.js';
import { createDirector, directorRules, resolveMotion } from './director.js';
import { createDomStage } from './stage.js';
import { EffectsOverlay } from './overlay.js';
import { CinematicTitle } from './title.js';
import { createSoundPlayer, soundBankFor } from './sound.js';
import { createTimeScale } from './time.js';
import { cardBefore } from './moments.js';
import { createSeenGate } from './seen.js';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
let lastKey = -Infinity;
let bank = 'default';

/**
 * The card motion this browser plays: the `cardMotion` preference, where `auto` (the default) is `full`, or `calm`
 * while the device asks for reduced motion.
 * @returns {'full' | 'calm' | 'off'}
 */
export function cardMotion() {
  return resolveMotion(prefs.get('cardMotion'), reducedMotion());
}

/** Whether the person is typing: focus in a text field, or a key pressed in one within the last two seconds. */
export function typingNow() {
  return isTyping(globalThis.document?.activeElement) || performance.now() - lastKey < directorRules.typingQuietMs;
}

/** The page's clock for hit-stop and slow motion, which the forge's live loop follows during a ceremony. */
export const effectsTime = createTimeScale();

/** The page's ceremony sounds: off unless the `cardSound` preference is on, drawn from the bank `useSoundBank` chose. */
export const cardSounds = createSoundPlayer({ enabled: () => prefs.get('cardSound') === true, bank: () => bank });

/** Picks the sound bank for the page's next sounds: a theme's `soundBank` when it names a registered bank, otherwise the default. */
export function useSoundBank(theme) { bank = soundBankFor(theme); return bank; }

const overlay = new EffectsOverlay({ scale: () => effectsTime.scale() });
const title = new CinematicTitle();

let director = null;
const stage = createDomStage({ overlay, title, sound: cardSounds, time: effectsTime, flash: (opacity, tone) => director.flash(opacity, tone) });

/** The page's effects director, wired to Vloer's preferences, the page's visibility and the person's typing. */
export const effects = director = createDirector({
  stage,
  motion: cardMotion,
  typing: typingNow,
  hidden: () => globalThis.document?.visibilityState === 'hidden',
});

if (globalThis.document) {
  document.addEventListener('keydown', event => { if (isTyping(event.target)) lastKey = performance.now(); if (effects.playing && !event.repeat && !['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key)) effects.skip(); }, true);
  document.addEventListener('pointerdown', () => { if (effects.playing) effects.skip(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') effects.resume(); });
}

const whenVisible = () => new Promise(resolve => {
  if (document.visibilityState !== 'hidden') return resolve();
  const wake = () => { if (document.visibilityState === 'hidden') return; document.removeEventListener('visibilitychange', wake); resolve(); };
  document.addEventListener('visibilitychange', wake);
});

/** Plays a card's news on its `<unfold-card>`: one request per moment, and one announcement for all of them. */
export function playNews(news, card, host) {
  for (const moment of news) effects.request(moment, { key: String(card.workItemId), host, card, before: cardBefore(card, moment, cardAsOf) });
  announce(`${card.title}: ${news.map(momentText).join(', ')}`);
}

const gate = createSeenGate({
  load: id => api(`/api/cards/${encodeURIComponent(id)}/seen`),
  save: (id, snapshot) => api(`/api/cards/${encodeURIComponent(id)}/seen`, { method: 'POST', body: JSON.stringify({ snapshot }) }),
  play: (news, card, host) => playNews(news, card, host),
  hidden: () => document.visibilityState === 'hidden',
  whenVisible,
});

/** The seen gate the Work Item page uses, for tests and the binder's own hand-off. */
export const seenGate = gate;

let watching = null;

/**
 * Listens for `unfold-card-moment` from every `<unfold-card>` matching `selector` and plays each card's news since
 * the person last saw it, once. The event is the trigger; the card's facts and the person's seen mark decide what is
 * news, so a moment fired twice, or by two sources, still plays once. Returns the function that stops listening.
 * @param {string} selector
 */
export function watchCardMoments(selector) {
  watching?.();
  const listener = event => {
    const host = event.target;
    if (!(host instanceof Element) || !host.matches(selector) || !host.card) return;
    void gate.check(host.card, host);
  };
  document.addEventListener(momentEvent, listener);
  watching = () => { document.removeEventListener(momentEvent, listener); watching = null; };
  return watching;
}

/** Ends what the page is playing and drops what waits, as when the person navigates away. */
export function clearEffects() {
  effects.clear();
  overlay.clear();
  title.hide();
  effectsTime.reset();
}
