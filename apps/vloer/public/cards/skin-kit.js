/**
 * The shared kit of Vloer's DOM skin packs (holo, loot, arcade, ticker, patch): pointer light and tilt, an idle budget,
 * moment detection, and pure helpers that print only facts the card carries.
 *
 * **Moment API.** Every time the runtime draws a DOM-skin card, `attachSkin` compares the new view with the last one
 * this page drew for the same Work Item (`snapshot` and `momentsBetween`, both pure and usable on any `cardView`). When
 * something changed it:
 *
 * - sets `data-moment` on the skin's `[data-skin-root]` to the space-separated moment names for `momentMs`
 *   (skipped under `prefers-reduced-motion: reduce`), which the skin's CSS animates; and
 * - dispatches `unfold-card-moment` (`momentEvent`) on the `<unfold-card>` host, `bubbles: true, composed: true`, with
 *   `detail = { moments: string[], workItemId: string, skin: string }`, also under reduced motion.
 *
 * Moment names, in play order (`moments`): `reveal` (first draw of the card on this page, or another Work Item in the
 * same element), `state` (card state changed, other than to merged), `signed` (a steward signed), `merged`, `released`
 * (first release to production), `rarity` (the rarity was revealed), `finish` (a higher step on the finish ladder),
 * `grade` (a new or changed grade),
 * `gate` (moved to a later delivery gate), `bounce` (a new bounce back), `crack`, `mend`, `set` (a set member settled
 * or merged, or the set completed). An effects director listens for the event; a skin never draws page-level effects.
 */
import { gateSteps, stableHash } from './card-model.js';

/**
 * The moments a DOM skin can play, in the order they play when one refresh brings several. The runtime redraws a card
 * whenever its facts change; `attachSkin` compares the new view with the one it saw last for the same Work Item and
 * names what changed. `reveal` is the first time a page draws a card.
 */
export const moments = Object.freeze(['reveal', 'state', 'signed', 'merged', 'released', 'rarity', 'finish', 'grade', 'gate', 'bounce', 'crack', 'mend', 'set']);
/** How long a moment's attribute stays on the card, in milliseconds, unless a skin asks for another length. */
export const momentMs = 2600;
/** At most this many skin cards on a page run their idle animation at once. */
export const idleLimit = 3;
/** The event `<unfold-card>` fires when a DOM skin plays moments: `detail = { moments, workItemId, skin }`. */
export const momentEvent = 'unfold-card-moment';

/**
 * The slab name of a grade, as graded trading cards print it. A half step adds a plus.
 * @param {number | null | undefined} overall
 */
export function gradeName(overall) {
  if (typeof overall !== 'number' || !Number.isFinite(overall)) return '';
  const whole = Math.floor(overall);
  const name = { 10: 'Gem mint', 9: 'Mint', 8: 'NM-MT', 7: 'Near mint', 6: 'EX-MT', 5: 'Excellent', 4: 'VG-EX', 3: 'Very good', 2: 'Good', 1: 'Poor' }[Math.max(1, Math.min(10, whole))];
  return overall > whole && whole < 10 ? `${name}+` : name;
}

/** Up to two initials of a name, for an avatar or a monogram. */
export function initials(name) {
  return String(name ?? '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

/** A seeded pseudo-random generator (mulberry32) returning numbers in [0, 1), so a card draws the same marks every time. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crack paths for a card's condition, in a 100 by 150 box: fissures that run from an impact point, with branches.
 * `ortho` snaps every segment to right angles for pixel skins. Each path names the root it belongs to, so a skin can
 * stagger them. The same seed draws the same crack on every page.
 * @param {number} seed
 * @param {{ x?: number, y?: number, roots?: number, reach?: number, ortho?: boolean }} [options]
 * @returns {{ d: string, root: number, branch: boolean }[]}
 */
export function crackPaths(seed, { x: cx = 62, y: cy = 46, roots, reach = 1, ortho = false } = {}) {
  const random = seeded(seed || 1);
  const count = roots ?? 5 + Math.floor(random() * 3);
  const out = [];
  const point = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  for (let root = 0; root < count; root++) {
    let angle = (root / count) * Math.PI * 2 + random() * 0.8;
    let x = cx;
    let y = cy;
    let d = `M${point(x, y)}`;
    const segments = 3 + Math.floor(random() * 4);
    for (let index = 0; index < segments; index++) {
      angle += (random() - 0.5) * 0.9;
      const length = (6 + random() * 12) * reach;
      if (ortho) {
        const dx = Math.cos(angle) * length;
        const dy = Math.sin(angle) * length;
        x += dx; d += `L${point(x, y)}`;
        y += dy; d += `L${point(x, y)}`;
      } else {
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length;
        d += `L${point(x, y)}`;
      }
      if (index > 0 && random() < 0.35) {
        let bx = x;
        let by = y;
        let bangle = angle + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.6);
        let branch = `M${point(bx, by)}`;
        for (let step = 0; step < 2; step++) {
          bangle += (random() - 0.5) * 0.6;
          const blength = (3 + random() * 7) * reach;
          if (ortho) { bx += Math.cos(bangle) * blength; branch += `L${point(bx, by)}`; by += Math.sin(bangle) * blength; branch += `L${point(bx, by)}`; }
          else { bx += Math.cos(bangle) * blength; by += Math.sin(bangle) * blength; branch += `L${point(bx, by)}`; }
        }
        out.push({ d: branch, root, branch: true });
      }
    }
    out.push({ d, root, branch: false });
  }
  return out;
}

/**
 * The cost split for a coin or a price tag: a small top line, the main figure and a caption. A demo card reads "Demo"
 * over "no model calls" and never an amount; an unknown cost reads "—" over "not reported", never zero.
 * @param {object} view The `cardView` model.
 * @returns {{ top: string, main: string, caption: string, status: string }}
 */
export function coin(view) {
  const cost = view.cost;
  if (cost.status === 'demo') return { top: 'Cost', main: 'Demo', caption: 'no model calls', status: 'demo' };
  if (cost.status === 'not_reported') return { top: 'Cost', main: '—', caption: 'not reported', status: cost.status };
  const space = cost.value.search(/[\s ]/);
  const [top, main] = space > 0 ? [cost.value.slice(0, space), cost.value.slice(space + 1).trim()] : ['Cost', cost.value];
  return { top, main, caption: cost.caption || '', status: cost.status };
}

/**
 * The few figures a skin front prints beside the art, each with a label, a value and whether it is known. Unknown
 * values keep the view model's words ("Not reported", "No Runs yet"), never zero.
 * @param {object} view The `cardView` model.
 */
export function figures(view) {
  const release = view.release;
  return {
    time: { label: 'Run time', value: view.runTime.value, known: view.runTime.known },
    tokens: { label: 'Tokens', value: view.tokens.value, known: view.tokens.known },
    diff: { label: 'Diff', value: view.diff.known ? `${view.diff.addText} ${view.diff.delText}` : view.diff.value, known: view.diff.known, add: view.diff.addText ?? '', del: view.diff.delText ?? '', files: view.diff.filesText ?? '' },
    pr: { label: 'Pull request', value: view.pr ? `${view.pr.text} ${view.pr.state.label}` : 'No pull request yet', known: Boolean(view.pr), ci: view.pr?.ciText ?? '' },
    live: { label: 'Live', value: release?.released ? release.dayText : release?.reported === false ? 'Not reported' : 'Not live yet', known: Boolean(release?.released) },
    plays: { label: 'Plays', value: view.plays.text, known: view.plays.count > 0 },
  };
}

/** The seed a card's marks are drawn from: its condition's seed when it has one, otherwise a hash of its Work Item. */
export function markSeed(view) {
  return view?.condition?.seed ?? stableHash(String(view?.id ?? ''));
}

/**
 * The rarity mark every skin prints (Ploeg ADR-0056, proposed; Vloer ADR 0034): the set symbol, a gem in the tier's
 * colour (black, silver, gold, mythic orange, iridescent), and the tier's word. A rarity still predicted reads
 * "Predicted" before the word and draws the gem ghosted with a glow. The runtime's stylesheet (`unfold-card.css`) styles
 * it, and the full sentence is read out to screen readers. Empty when the card has no rarity.
 * @param {object} view The `cardView` model.
 * @param {{ escape: Function }} h
 * @param {{ compact?: boolean }} [options] `compact` prints the gem alone and keeps the word for screen readers.
 */
export function rarityMark(view, h, { compact = false } = {}) {
  const rarity = view?.rarity;
  if (!rarity) return '';
  const e = h.escape;
  const word = `${rarity.state === 'predicted' ? '<small>Predicted</small> ' : ''}${e(rarity.label)}`;
  return `<span class="uc-rarity" data-rarity="${e(rarity.key)}" data-state="${e(rarity.state)}"${compact ? ' data-compact' : ''} title="${e(rarity.description)}"><span class="uc-rarity-gem" aria-hidden="true"><i></i></span><span class="uc-rarity-word" aria-hidden="true">${word}</span><span class="sr-only">${e(rarity.description)}</span></span>`;
}

/**
 * The frame ring of a card's rarity: an element a skin places as the first child of its card, which the runtime's
 * stylesheet draws as a thin ring in the tier's metal (steel, bronze, silver, gold, prismatic) once revealed, and as a
 * ghosted, pulsing outline in the tier's colour while predicted. Empty when the card has no rarity.
 * @param {object} view The `cardView` model.
 */
export function rarityFrame(view) {
  const rarity = view?.rarity;
  if (!rarity) return '';
  return `<i class="uc-frame" data-rarity="${rarity.key}" data-state="${rarity.state}" aria-hidden="true"></i>`;
}

/**
 * A duration as markup that follows the viewer's clock choice (Vloer ADR 0035): with a working-hours twin it prints
 * both, as `data-clock-value="calendar"` and `"working"`, and the runtime's stylesheet shows the one the card's
 * `data-clock` names; without one it prints the value alone. Every value is escaped.
 * @param {string} value The calendar text.
 * @param {string} working The working-hours text, or ''.
 * @param {{ escape: Function }} h
 */
export function clockText(value, working, h) {
  const e = h.escape;
  if (!working) return e(value);
  return `<span data-clock-value="calendar">${e(value)}</span><span data-clock-value="working">${e(working)}<span class="sr-only"> in working hours</span></span>`;
}

/**
 * The headline KPI strip a skin prints on its front (Vloer ADR 0035): up to four figures from `view.kpis.headline`,
 * each a label (with a short form a cramped skin may show instead), a value that follows the clock choice, an optional
 * note and its plain-language meaning as the tooltip.
 * A tone of `attention` or `success` marks the few figures whose meaning is unambiguous (reruns, green first time,
 * blocked time); nothing names or ranks a person. Empty when the card has no KPI figures, so an older Ploeg's card is
 * unchanged. The runtime's stylesheet draws it; a skin restyles it through `--uc-kpi-*` tokens or its own rules.
 * @param {object} view The `cardView` model.
 * @param {{ escape: Function }} h
 * @param {{ max?: number, label?: string }} [options]
 */
export function kpiStrip(view, h, { max = 4, label = 'Key figures' } = {}) {
  const items = (view?.kpis?.headline ?? []).slice(0, max);
  if (!items.length) return '';
  const e = h.escape;
  return `<ul class="uc-kpis" aria-label="${e(label)}" data-count="${items.length}">${items.map(item => `<li class="uc-kpi" data-kpi="${e(item.key)}" data-tone="${e(item.tone)}"${item.live ? ' data-live' : ''} title="${e(item.meaning)}"><span class="uc-kpi-label"><span class="uc-kpi-long">${e(item.label)}</span><span class="uc-kpi-short" aria-hidden="true">${e(item.short ?? item.label)}</span></span><b class="uc-kpi-value">${clockText(item.value, item.working, h)}</b>${item.detail ? `<span class="uc-kpi-note">${e(item.detail)}</span>` : ''}</li>`).join('')}</ul>`;
}

/**
 * Honest honours for a card's front: short tags drawn only from facts the card carries, never from rarity, which has
 * its own mark (`rarityMark`). Each has a key, a label and a tone (`gold`, `success`, `attention`, `danger` or `neutral`).
 * @param {object} view The `cardView` model.
 */
export function honours(view) {
  const out = [];
  const add = (key, label, tone = 'neutral') => out.push({ key, label, tone });
  if (view.grade?.labelKey === 'black') add('black-label', 'Black label', 'gold');
  else if (view.grade?.labelKey === 'gold') add('gold-label', 'Gold label', 'gold');
  if (view.release?.released) add('live', view.release.finish.level ? `${view.release.finish.label} finish` : 'Live', view.release.finish.level >= 4 ? 'gold' : 'success');
  if (view.pr?.ci?.key === 'success') add('green-ci', 'Green CI', 'success');
  if (view.rounds === 1 && view.pr) add('first-pass', 'First pass', 'success');
  if (view.gates?.rightFirstTime === true || view.gates?.rightFirstTime?.state === 'yes') add('right-first-time', 'Right first time', 'success');
  if (view.condition?.state === 'mended') add('mended', 'Mended', 'gold');
  if (view.condition?.state === 'cracked') add('cracked', 'Cracked', 'danger');
  for (const entry of view.grade?.qualifiers ?? []) add(`q-${entry.code.toLowerCase()}`, entry.text, 'attention');
  if (view.steward?.signed) add('signed', 'Signed', 'neutral');
  return out;
}

/**
 * What a moment compares: the facts that, when they change between two draws of the same card, deserve a reaction.
 * @param {object} view The `cardView` model.
 */
export function snapshot(view) {
  const set = view?.set;
  const children = Array.isArray(set?.children) ? set.children : [];
  return {
    id: String(view?.id ?? ''),
    state: view?.state?.key ?? '',
    signed: Boolean(view?.steward?.signed),
    released: Boolean(view?.release?.released),
    rarity: view?.rarity?.state === 'revealed' ? view.rarity.key : '',
    finish: view?.finish?.level ?? 0,
    grade: view?.grade ? `${view.grade.overall}|${view.grade.labelKey}|${view.grade.provisional}` : '',
    gate: view?.gates ? gateSteps.findIndex(step => step.key === view.gates.current?.key) : -1,
    bounces: view?.gates?.bounces?.length ?? 0,
    condition: view?.condition?.state ?? '',
    set: set ? `${children.filter(child => child.settled).length}|${children.filter(child => child.state?.key === 'merged').length}|${set.complete === true}` : '',
  };
}

/**
 * The view a DOM skin draws: the `cardView` model with `gates` and `set` reshaped into the compact form the skins
 * print. `gates` becomes `{ current, label, rank, steps: [{ key, label, short, index, reached, current, bounces }],
 * history, bounces: [{ …, counted }], counted, rightFirstTime: boolean, text }`; `set` becomes `{ ref, title, size,
 * number, setCard, members: [{ number, ref, title, state: 'open' | 'merged' | 'settled', stateText, self }], merged,
 * settled, complete, text, progress }`, where `number` is the card's place in the set and null on the epic's own card.
 * Every other field is the view model's. The back and the moments use the view model itself.
 * @param {object} view The `cardView` model.
 */
export function skinView(view) {
  return { ...view, gates: skinGates(view?.gates), set: skinSet(view?.set, view) };
}

function skinGates(gates) {
  if (!gates?.current) return null;
  const rank = gateSteps.findIndex(step => step.key === gates.current.key);
  const bounces = (gates.bounces ?? []).map(entry => ({ ...entry, counted: entry.counts === true }));
  const counted = bounces.filter(entry => entry.counted).length;
  const label = gates.current.label;
  return {
    current: gates.current.key, label, rank,
    steps: gates.steps.map((step, index) => ({ key: step.key, label: step.label, short: step.short, index, reached: step.state !== 'ahead', current: step.state === 'current', bounces: step.bounces.length })),
    history: gates.history ?? [], bounces, counted,
    rightFirstTime: gates.rightFirstTime?.state === 'yes',
    text: `${label}${bounces.length ? ` · ${bounces.length} ${bounces.length === 1 ? 'bounce' : 'bounces'}${counted < bounces.length ? `, ${counted} counted` : ''}` : ' · no bounces'}`,
  };
}

const memberStates = { open: 'Open', merged: 'Merged', settled: 'Settled' };

function skinSet(set, view) {
  if (!set?.role) return null;
  const number = set.role === 'child' ? set.position : null;
  const members = (set.children ?? []).map((child, index) => {
    const state = child.settled ? 'settled' : child.state?.key === 'merged' ? 'merged' : 'open';
    return { number: index + 1, ref: child.workItemId ? `#${child.workItemId}` : '', title: child.title, state, stateText: memberStates[state], self: child.workItemId === view?.id };
  });
  const merged = members.filter(member => member.state !== 'open').length;
  const settled = members.filter(member => member.state === 'settled').length;
  const title = set.epic?.title || 'Epic';
  return {
    ref: set.epic?.ref ?? '', title, size: set.size, number, setCard: set.role === 'epic', members, merged, settled, complete: set.complete === true,
    text: set.role === 'epic' ? `Set Card · ${set.size} Work Items · ${title}` : number !== null ? `${number}/${set.size} · ${title}` : `Set of ${set.size} · ${title}`,
    progress: `${settled}/${set.size} settled`,
  };
}

/**
 * The moments between two snapshots of one card, in play order. A first draw (no `before`) is a `reveal`; a card that
 * changed into a different Work Item is a `reveal` too.
 * @param {ReturnType<typeof snapshot> | null | undefined} before
 * @param {ReturnType<typeof snapshot>} after
 */
export function momentsBetween(before, after) {
  if (!before || before.id !== after.id) return ['reveal'];
  const found = new Set();
  if (before.state !== after.state) found.add(after.state === 'merged' ? 'merged' : 'state');
  if (!before.signed && after.signed) found.add('signed');
  if (!before.released && after.released) found.add('released');
  if (after.rarity && before.rarity !== after.rarity) found.add('rarity');
  if (after.finish > before.finish) found.add('finish');
  if (after.grade && before.grade !== after.grade) found.add('grade');
  if (after.gate > before.gate) found.add('gate');
  if (after.bounces > before.bounces) found.add('bounce');
  if (after.condition === 'cracked' && before.condition !== 'cracked') found.add('crack');
  if (after.condition === 'mended' && before.condition !== 'mended') found.add('mend');
  if (after.set && before.set !== after.set) found.add('set');
  return moments.filter(name => found.has(name));
}

const lightProperties = [['--sk-dx', 'number', '0.72'], ['--sk-dy', 'number', '0.18'], ['--sk-spin', 'angle', '0deg'], ['--sk-sweep', 'number', '0']];
function register() {
  if (typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return false;
  for (const [name, syntax, initialValue] of lightProperties) {
    try { CSS.registerProperty({ name, syntax: `<${syntax}>`, inherits: true, initialValue }); }
    catch (error) { if (error?.name !== 'InvalidModificationError') return false; }
  }
  return true;
}
const registered = register();
const seen = new Map();
const idling = new Set();
const queued = new Set();

function claim(card) {
  if (idling.has(card)) return;
  if (idling.size >= idleLimit) { queued.add(card); return; }
  idling.add(card);
  card.dataset.idle = '';
}

function release(card) {
  queued.delete(card);
  if (!idling.delete(card)) return;
  delete card.dataset.idle;
  const next = queued.values().next().value;
  if (next) { queued.delete(next); claim(next); }
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

/**
 * Brings a DOM skin's drawn front to life and returns the function that stops it. It does four things, all within the
 * strict CSP (custom properties through `style.setProperty`, attributes, no inline styles):
 *
 * - **Light.** The pointer over the `.sk-card` element writes `--px`, `--py` (0 to 1) and `--po` (0 to 1 while the
 *   pointer is over it), eased one frame at a time; with `tilt` it also writes `--rx` and `--ry` in degrees. Reduced
 *   motion writes nothing, so the card keeps its resting light.
 * - **Idle.** While the card is on screen, facing front and the tab is visible, the root gets `data-idle`, for at most
 *   `idleLimit` skin cards on a page. The skin's stylesheet animates only under `[data-idle]` and never under reduced motion.
 * - **Moments.** The view is compared with the last one this page drew for the same Work Item. What changed is written
 *   as `data-moment` (a space-separated list) on the root for `momentMs`, and the host element fires
 *   `unfold-card-moment` with `{ moments, workItemId, skin }`. Reduced motion skips the attribute and keeps the event.
 * - **Cleanup** of all of it.
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @param {{ tilt?: number, duration?: number, onMoment?: (names: string[], root: Element) => void }} [options]
 * @returns {() => void}
 */
export function attachSkin(face, view, { tilt = 0, duration = momentMs, onMoment } = {}) {
  const root = face?.querySelector?.('[data-skin-root]');
  const card = root?.querySelector('.sk-card');
  if (!root || !card || !view) return () => {};
  const stops = [];
  const host = face.getRootNode?.()?.host ?? null;

  const light = { x: 0.5, y: 0.5, o: 0, tx: 0.5, ty: 0.5, to: 0, frame: 0 };
  const clamp = value => Math.min(1, Math.max(0, value));
  const step = () => {
    light.frame = 0;
    let settled = true;
    for (const [key, target] of [['x', 'tx'], ['y', 'ty'], ['o', 'to']]) {
      const gap = light[target] - light[key];
      if (Math.abs(gap) < 0.002) light[key] = light[target];
      else { light[key] += gap * 0.18; settled = false; }
    }
    card.style.setProperty('--px', light.x.toFixed(4));
    card.style.setProperty('--py', light.y.toFixed(4));
    card.style.setProperty('--po', light.o.toFixed(4));
    if (tilt) {
      card.style.setProperty('--rx', ((light.x - 0.5) * tilt * light.o).toFixed(3));
      card.style.setProperty('--ry', ((0.5 - light.y) * tilt * light.o).toFixed(3));
    }
    if (!settled) light.frame = requestAnimationFrame(step);
  };
  const kick = () => { if (!light.frame) light.frame = requestAnimationFrame(step); };
  const move = event => {
    if (reducedMotion()) return;
    const box = card.getBoundingClientRect();
    if (!box.width || !box.height) return;
    light.tx = clamp((event.clientX - box.left) / box.width);
    light.ty = clamp((event.clientY - box.top) / box.height);
    light.to = 1;
    kick();
  };
  const leave = () => { light.tx = 0.5; light.ty = 0.5; light.to = 0; kick(); };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  stops.push(() => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave); if (light.frame) cancelAnimationFrame(light.frame); });

  if (registered && typeof IntersectionObserver === 'function') {
    const state = { visible: false, front: face.inert !== true, shown: document.visibilityState !== 'hidden' };
    const sync = () => { if (state.visible && state.front && state.shown) claim(root); else release(root); };
    const observer = new IntersectionObserver(entries => { for (const entry of entries) state.visible = entry.isIntersecting; sync(); });
    observer.observe(card);
    const turned = new MutationObserver(() => { state.front = face.inert !== true; sync(); });
    turned.observe(face, { attributes: true, attributeFilter: ['inert'] });
    const visibility = () => { state.shown = document.visibilityState !== 'hidden'; sync(); };
    document.addEventListener('visibilitychange', visibility);
    stops.push(() => { observer.disconnect(); turned.disconnect(); document.removeEventListener('visibilitychange', visibility); release(root); });
  }

  emitMoments(host, view, names => {
    if (reducedMotion()) return;
    root.dataset.moment = names.join(' ');
    const timer = setTimeout(() => { delete root.dataset.moment; }, duration);
    stops.push(() => { clearTimeout(timer); delete root.dataset.moment; });
    try { onMoment?.(names, root); } catch { delete root.dataset.moment; }
  });

  return () => { for (const stop of stops.splice(0)) { try { stop(); } catch { continue; } } };
}

/**
 * The moment half of `attachSkin`, for skins that draw without it (Vloer Native, the forge): compares `view` with the
 * last view this page drew for the same Work Item and, when something changed, runs `before` and then dispatches
 * `unfold-card-moment` on `host`. Every skin goes through this one function, so the effects director has one source.
 * Returns the moment names.
 * @param {Element | null} host The `<unfold-card>` element.
 * @param {object} view The `cardView` model.
 * @param {(names: string[]) => void} [before] Runs with the names before the event, as `attachSkin` uses it to set `data-moment`.
 * @returns {string[]}
 */
export function emitMoments(host, view, before) {
  const after = snapshot(view);
  const names = momentsBetween(seen.get(after.id), after);
  seen.set(after.id, after);
  if (!names.length) return names;
  try { before?.(names); } catch {}
  host?.dispatchEvent?.(new CustomEvent(momentEvent, { bubbles: true, composed: true, detail: { moments: names, workItemId: after.id, skin: host.dataset?.skin ?? '' } }));
  return names;
}

/** Forgets which cards this page drew, so the next draw of each is a reveal. For tests. */
export function forgetMoments() { seen.clear(); }
