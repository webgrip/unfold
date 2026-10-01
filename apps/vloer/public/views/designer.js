import { state } from '../core/state.js';
import { api, unauthorized } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { dateTime, plural } from '../core/format.js';
import { button, callout, segmented, skeleton } from '../core/ui.js';
import { render } from '../core/navigation.js';
import { finishLadder } from '../cards/card-model.js';
import { assetUrl, forgetThemes, frameLabels, tokenLabels, tokenTypes } from '../cards/themes.js';
import { generateArt, maxRetries } from '../cards/art-generator.js';
import { artPresets, foilPatterns } from '../cards/skins/forge/forge-model.js';
import { worldKinds } from '../cards/skins/forge/world/rules.js';
import { shell } from '../shell.js';
import '../cards/unfold-card.js';

const blankTheme = () => ({ schemaVersion: 1, id: '', name: '', extends: 'forge', tokens: {}, frame: 'classic', foilPattern: null, art: null, world: null, setSymbol: null, cardBack: null, soundBank: null });
const tokenDefaults = { '--gc-accent': '#5b8cff', '--gc-surface': '#141a1e', '--gc-radius': '12px', '--forge-frame': '#3b4a63', '--forge-accent': '#cfd8da', '--forge-back': '#2f6fd0' };
const maxVideoSeconds = 15;
const designer = {
  catalog: null, loading: false, error: '', pick: '', base: null, draft: blankTheme(), assets: {}, shaderCode: '', prompt: '', finish: 'foil',
  card: null, cardId: '', cardError: '', busy: '', versions: [], log: [], message: '', artKind: undefined,
};
let previewTimer = 0;
const sampleCards = new Map();

const isAdmin = () => state.bootstrap?.user?.role === 'admin';
const skins = () => designer.catalog?.skins ?? [];
const skinRules = id => skins().find(skin => skin.id === id) ?? null;
const editable = () => Boolean(designer.catalog?.canEdit) && designer.base?.source !== 'directory';
const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const disabledAttr = () => (editable() ? '' : ' disabled');

/** A deterministic sample card for the preview: a demo card, so it shows no spend and no model calls, released long enough ago to reach `finish`. */
export function sampleCard(finish, now = Date.now()) {
  const key = `${finish}`;
  if (sampleCards.has(key)) return sampleCards.get(key);
  const step = finishLadder.find(entry => entry.key === finish) ?? finishLadder[0];
  const days = step.days + 2;
  const at = new Date(now - days * 86_400_000).toISOString();
  const merged = new Date(now - (days + 1) * 86_400_000).toISOString();
  const card = {
    workItemId: 'sample', title: 'Show the delivery window on the order summary', externalRef: 'SAMPLE-1', url: '', team: 'delivery',
    target: { forge: 'forgejo', owner: 'acme', repo: 'webshop' }, style: { skin: 'forge', theme: null }, state: 'merged', rarity: null, finish: 'matte', grade: null, condition: null,
    steward: { name: 'Sam K.', source: 'merged_by' }, roster: [{ name: 'Sam K.', roles: ['merger'] }], crew: [{ role: 'builder', writes: true, runs: 2 }, { role: 'reviewer', writes: false, runs: 1 }],
    plays: [{ number: 12, url: '', state: 'merged', shiftId: null, branch: '', headSha: '', mergeCommitSha: '', mergedAt: merged, mergedBy: 'Sam K.', closedAt: null, additions: 42, deletions: 7, changedFiles: 3, ci: null, reviews: [], deployments: [{ environment: 'production', firstDeployedAt: at, sha: '', url: '' }] }],
    totals: { costStatus: 'not_reported', usageComplete: null, runs: 3, failedRuns: 0, rounds: 1, shifts: 1 },
    events: [], deployments: [], release: { at, source: 'deploy', environment: 'production' }, demo: true,
  };
  sampleCards.set(key, card);
  return card;
}

/** The theme document the designer would save: format v1 keys only, with fields the chosen skin does not draw left out. */
export function themeDocument(draft, rules) {
  const tokens = Object.fromEntries(Object.entries(draft.tokens ?? {}).filter(([name]) => rules?.themeTokens?.includes(name)));
  const theme = rules?.theme ?? rules ?? {};
  return {
    schemaVersion: 1, id: draft.id, name: draft.name, extends: draft.extends, tokens,
    frame: theme.frames?.length ? draft.frame ?? null : null,
    foilPattern: theme.foilPatterns?.length ? draft.foilPattern ?? null : null,
    art: theme.art?.length ? draft.art ?? null : null,
    world: theme.worlds?.length ? draft.world ?? null : null,
    setSymbol: theme.setSymbol ? draft.setSymbol ?? null : null,
    cardBack: theme.cardBack ? draft.cardBack ?? null : null,
    soundBank: null,
  };
}

function rulesOf(id) {
  const skin = skinRules(id);
  return skin ? { themeTokens: skin.themeTokens, theme: { frames: skin.frames, foilPatterns: skin.foilPatterns, artPresets: skin.artPresets, art: skin.art, worlds: skin.worlds ?? [], setSymbol: skin.setSymbol, cardBack: skin.cardBack } } : null;
}

function previewTheme() {
  const theme = themeDocument(designer.draft, rulesOf(designer.draft.extends));
  const art = theme.art?.shader && designer.shaderCode ? { shader: theme.art.shader, code: designer.shaderCode } : theme.art;
  return { ...theme, id: theme.id || 'draft', name: theme.name || 'Draft', art, assets: designer.assets };
}

function currentCard() { return designer.card ?? sampleCard(designer.finish); }

function preview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const element = document.querySelector('unfold-card.designer-card');
    if (!element) return;
    element.theme = previewTheme();
    if (element.card !== currentCard()) element.card = currentCard();
  }, 60);
}

async function uploadAsset(purpose, file) {
  const response = await fetch(`/api/card-assets?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-Vloer-Request': '1' }, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) unauthorized();
    throw new Error(data.error?.message || 'The file could not be uploaded.');
  }
  designer.assets[data.id] = { purpose: data.purpose, mediaType: data.mediaType, bytes: data.bytes };
  return data;
}

function videoSeconds(file) {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = value => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => done(video.duration), { once: true });
    video.addEventListener('error', () => done(null), { once: true });
    video.src = url;
  });
}

async function loadCatalog() {
  designer.loading = true;
  try {
    designer.catalog = await api('/api/card-themes');
    designer.error = '';
  } catch (error) {
    designer.error = error.message;
  } finally {
    designer.loading = false;
  }
}

async function loadDesigner() {
  await loadCatalog();
  if (state.view === 'designer') render();
}

async function openTheme(id) {
  if (!id) {
    designer.pick = '';
    designer.base = null;
    designer.draft = blankTheme();
    designer.artKind = undefined;
    designer.assets = {};
    designer.shaderCode = '';
    designer.versions = [];
    designer.message = '';
    render();
    preview();
    return;
  }
  const theme = await api(`/api/card-themes/${encodeURIComponent(id)}`);
  await useTheme(theme);
  designer.versions = theme.source === 'store' ? (await api(`/api/card-themes/${encodeURIComponent(id)}/versions`)).versions : [];
  render();
  preview();
}

async function useTheme(theme) {
  designer.pick = theme.id;
  designer.base = theme;
  designer.assets = { ...(theme.assets ?? {}) };
  designer.draft = { ...blankTheme(), ...themeDocument(theme, rulesOf(theme.extends)), frame: theme.frame ?? 'classic' };
  designer.artKind = undefined;
  designer.shaderCode = theme.art?.shader ? await fetch(assetUrl(theme.art.shader), { credentials: 'same-origin' }).then(response => (response.ok ? response.text() : ''), () => '') : '';
  designer.message = '';
}

function themePicker() {
  const themes = designer.catalog?.themes ?? [];
  const options = [`<option value=""${designer.pick ? '' : ' selected'}>New theme</option>`, ...themes.map(theme => `<option value="${escape(theme.id)}"${designer.pick === theme.id ? ' selected' : ''}>${escape(theme.name)} · ${escape(theme.id)}${theme.source === 'directory' ? ' (folder)' : ''}</option>`)].join('');
  return `<div class="field"><label class="field-label" for="designer-pick">Theme to edit</label><select id="designer-pick" data-designer-pick>${options}</select><span class="field-hint">${escape(themes.length ? `${plural(themes.length, 'theme')} on this workbench.` : 'No themes yet. Design the first one.')}</span></div>`;
}

function status() {
  const base = designer.base;
  if (!base) return '<p class="designer-status meta">Not saved yet.</p>';
  if (base.source === 'directory') return '<p class="designer-status meta">From the mounted themes folder. Change its file to change it; you can still preview it here.</p>';
  return `<p class="designer-status meta">Version ${escape(base.version)} · saved by ${escape(base.updatedBy)} · ${escape(dateTime(base.updatedAt))}</p>`;
}

function radio(name, value, label, checked) {
  const id = `designer-${name}-${value}`;
  return `<label class="designer-choice" for="${id}"><input type="radio" id="${id}" name="designer-${name}" value="${escape(value)}" data-designer-field="${name}"${checked ? ' checked' : ''}${disabledAttr()}> <span>${escape(label)}</span></label>`;
}

function select(field, label, options, value, hint = '') {
  const id = `designer-${field}`;
  return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label><select id="${id}" data-designer-field="${field}"${disabledAttr()}>${options.map(([key, text]) => `<option value="${escape(key)}"${key === (value ?? '') ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select>${hint ? `<span class="field-hint">${escape(hint)}</span>` : ''}</div>`;
}

function identity() {
  const draft = designer.draft;
  const fixed = Boolean(designer.base);
  return `<div class="designer-grid">
    <div class="field"><label class="field-label" for="designer-name">Name</label><input id="designer-name" type="text" maxlength="80" value="${escape(draft.name)}" placeholder="Acme 2026" data-designer-field="name"${disabledAttr()}></div>
    <div class="field"><label class="field-label" for="designer-id">Theme id</label><input id="designer-id" type="text" maxlength="64" value="${escape(draft.id)}" placeholder="acme" pattern="[a-z0-9][a-z0-9-]*" data-designer-field="id"${fixed || !editable() ? ' disabled' : ''} aria-describedby="designer-id-hint"><span class="field-hint" id="designer-id-hint">What a Work Target names as cardStyle.theme. Lowercase letters, digits and dashes.</span></div>
  </div>
  <fieldset class="field"><legend class="field-label">Skin</legend><div class="designer-choices">${skins().map(skin => radio('extends', skin.id, skin.name, draft.extends === skin.id)).join('')}</div></fieldset>`;
}

function forgeControls(rules) {
  const draft = designer.draft;
  if (!rules?.frames?.length) return `<p class="meta">${escape(skinRules(draft.extends)?.name ?? 'This skin')} draws with markup and the tokens below. Frames, foil and art belong to the forge skin.</p>`;
  const frames = `<fieldset class="field"><legend class="field-label">Frame</legend><div class="designer-choices">${rules.frames.map(frame => radio('frame', frame, frameLabels[frame] ?? frame, (draft.frame ?? 'classic') === frame)).join('')}</div></fieldset>`;
  const patterns = select('foilPattern', 'Foil pattern', [['', 'Per card, picked from the Work Item'], ...foilPatterns.filter(pattern => rules.foilPatterns.includes(pattern.key)).map(pattern => [pattern.key, pattern.label])], draft.foilPattern, 'A pack pull still overrides it. The finish a card earns decides how much of it the foil covers.');
  const kind = designer.artKind ?? (draft.art?.preset ? 'preset' : draft.art?.shader ? 'shader' : draft.art?.media ? 'media' : '');
  const kinds = [['', 'Per card, picked from the Work Item'], ['preset', 'A preset'], ...(rules.art.includes('media') ? [['media', 'An uploaded image or video']] : []), ...(rules.art.includes('shader') ? [['shader', 'A shader (generated or pasted below)']] : [])];
  const artKind = select('artKind', 'Art', kinds, kind);
  const preset = kind === 'preset' ? select('artPreset', 'Art preset', artPresets.filter(entry => rules.artPresets.includes(entry.key)).map(entry => [entry.key, entry.label]), draft.art.preset) : '';
  const media = kind === 'media' ? fileField('art', 'Image or video', 'image/png,image/jpeg,image/webp,video/mp4,video/webm', draft.art?.media, `PNG, JPEG or WebP up to 2 MiB and 4096 px, or an MP4 or WebM clip up to 8 MiB and ${maxVideoSeconds} seconds. It plays muted, on a loop.`) : '';
  const shader = kind === 'shader' ? `<p class="meta">${draft.art?.shader ? 'A compiled shader paints the art window.' : 'Generate or paste a shader in Shader art below.'}</p>` : '';
  const world = rules.worlds?.length ? select('world', 'Inner world', [['', 'Off · the art above'], ...worldKinds.filter(entry => rules.worlds.includes(entry.key)).map(entry => [entry.key, entry.label])], draft.world, 'A small 3D place in the art window that the card’s tilt moves. Its light and what it holds follow the card’s days live and condition. When it is on, it shows instead of the art on the live card; people who hold a copy can decorate their own.') : '';
  return `${frames}${patterns}${artKind}${preset}${media}${shader}${world}`;
}

function fileField(slot, label, accept, current, hint) {
  const id = `designer-file-${slot}`;
  const picture = current && designer.assets[current]?.mediaType?.startsWith('image/') ? `<img class="designer-thumb" src="${escape(assetUrl(current))}" alt="">` : current ? `<span class="meta">${escape(designer.assets[current]?.mediaType ?? 'Uploaded')}</span>` : '';
  const remove = current && editable() ? act(`data-slot="${slot}"`, { label: 'Remove', size: 'sm', variant: 'ghost', action: 'designer-remove' }) : '';
  return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label><div class="designer-file">${picture}<input id="${id}" type="file" accept="${escape(accept)}" data-designer-file="${slot}"${disabledAttr()}>${remove}</div><span class="field-hint">${escape(hint)}</span></div>`;
}

function tokenControls(skin) {
  if (!skin?.themeTokens?.length) return '';
  const rows = skin.themeTokens.map(name => {
    const id = `designer-token-${name.slice(2)}`;
    const value = designer.draft.tokens[name];
    const set = typeof value === 'string';
    const control = tokenTypes[name] === 'length'
      ? `<input id="${id}" type="range" min="0" max="32" step="1" value="${escape(parseInt(value ?? tokenDefaults[name], 10))}" data-designer-token="${escape(name)}"${disabledAttr()}><output class="meta num" for="${id}">${escape(set ? value : 'Skin default')}</output>`
      : `<input id="${id}" type="color" value="${escape(set ? longHex(value) : tokenDefaults[name])}" data-designer-token="${escape(name)}"${disabledAttr()}><span class="meta num">${escape(set ? value : 'Skin default')}</span>`;
    const reset = set && editable() ? act(`data-token="${escape(name)}"`, { label: 'Reset', size: 'xs', variant: 'ghost', action: 'designer-token-reset' }) : '';
    return `<div class="designer-token"><label class="field-label" for="${id}">${escape(tokenLabels[name] ?? name)}</label><div class="designer-token-control">${control}${reset}</div></div>`;
  }).join('');
  return `<fieldset class="field"><legend class="field-label">Colours and shape</legend><div class="designer-tokens">${rows}</div><span class="field-hint">Only the tokens this skin reads. Values are hex colours or whole pixels; nothing else reaches the card.</span></fieldset>`;
}

function longHex(value) {
  return /^#[0-9a-fA-F]{3}$/.test(value) ? `#${[...value.slice(1)].map(digit => digit + digit).join('')}` : value;
}

function pictures(skin) {
  const parts = [];
  if (skin?.setSymbol) parts.push(fileField('symbol', 'Set symbol', '.svg,image/svg+xml', designer.draft.setSymbol, 'An SVG of shapes and paths, up to 32 KiB. Vloer refuses scripts, styles, links and text.'));
  if (skin?.cardBack) parts.push(fileField('back', 'Card back', 'image/png,image/jpeg,image/webp', designer.draft.cardBack, 'PNG, JPEG or WebP, up to 2 MiB. Portrait 63:88 fills the back best.'));
  return parts.join('');
}

function actions() {
  if (!designer.catalog?.canEdit) return '';
  const saving = designer.busy === 'save';
  const save = editable() ? button({ label: designer.base ? 'Save new version' : 'Save theme', variant: 'primary', action: 'designer-save', busy: saving, icon: 'check' }) : '';
  const remove = designer.base?.source === 'store' ? button({ label: 'Delete theme', variant: 'danger-ghost', action: 'designer-delete', disabled: Boolean(designer.busy) }) : '';
  return `<div class="designer-actions">${save}${remove}</div>`;
}

function snippet() {
  const id = designer.draft.id || '<theme id>';
  return `config:\n  targets:\n    <target key>:\n      repo: <owner>/<repository>\n      cardStyle:\n        skin: ${designer.draft.extends}\n        theme: ${id}`;
}

function useCard() {
  const json = JSON.stringify(themeDocument(designer.draft, rulesOf(designer.draft.extends)), null, 2);
  return `<section class="card settings-card" aria-labelledby="designer-use-title"><header class="card-header"><h2 class="card-title" id="designer-use-title">Use it for a project</h2></header><div class="card-body designer-body">
    <p>Ploeg decides which Work Target gets which look. Add <code>cardStyle</code> to the target in Ploeg’s configuration (Vloer does not change Ploeg’s config) and its Run cards draw with this theme.</p>
    <pre class="designer-code" tabindex="0" aria-label="Ploeg configuration"><code>${escape(snippet())}</code></pre>
    <details class="designer-json"><summary>Theme JSON (format v1)</summary><pre class="designer-code" tabindex="0"><code>${escape(json)}</code></pre>${act('', { label: 'Copy theme JSON', size: 'sm', action: 'designer-copy', icon: 'copy' })}</details>
    <p class="meta">A theme saved here lives in Vloer’s store. To manage themes as files instead, put this JSON in the mounted themes folder (cardThemes.directory).</p>
  </div></section>`;
}

function artCard() {
  const rules = skinRules(designer.draft.extends);
  if (!rules?.art?.includes('shader')) return '';
  const art = designer.catalog?.art ?? {};
  const generating = designer.busy === 'generate';
  let generator;
  if (art.configured && editable()) {
    generator = `<div class="field"><label class="field-label" for="designer-prompt">Describe the picture</label><textarea id="designer-prompt" rows="3" maxlength="500" placeholder="A koi pond at night, lanterns reflecting, slow ripples" data-designer-field="prompt">${escape(designer.prompt)}</textarea><span class="field-hint">${escape(`${art.model ? `${art.model} writes` : 'The model writes'} a GPU shader; this browser compiles it and sends compiler errors back, at most ${maxRetries} times. The code only runs on the GPU.`)}</span></div>
      <div class="designer-actions">${button({ label: generating ? 'Generating…' : 'Generate art', variant: 'primary', action: 'designer-generate', busy: generating, icon: 'spark', disabled: Boolean(designer.busy) && !generating })}</div>`;
  } else if (art.demo) {
    generator = callout({ tone: 'neutral', icon: 'info', title: 'Art generation is off in the demo', body: 'The demo never calls a model. Paste a shader below to try the forge with your own art.' });
  } else if (!art.configured) {
    generator = callout({ tone: 'neutral', icon: 'info', title: 'Art generation is not set up', body: `<p>An administrator can let Vloer ask a model for art through an OpenAI-compatible endpoint, such as the LiteLLM gateway with a low-budget virtual key made for Vloer (never the master key). Add this to Vloer’s configuration and set the key in <code>VLOER_CARD_ART_KEY</code>:</p><pre class="designer-code"><code>${escape('"cardThemes": {\n  "ai": {\n    "baseUrl": "https://litellm.example/v1",\n    "model": "claude-sonnet",\n    "keyEnv": "VLOER_CARD_ART_KEY"\n  }\n}')}</code></pre><p>Until then, paste a shader below.</p>` });
  } else generator = '';
  const log = designer.log.length ? `<ol class="designer-log" aria-label="Attempts">${designer.log.map(step => `<li data-ok="${step.ok}"><span><b>Attempt ${escape(step.attempt)}</b> ${escape(step.ok ? 'compiled' : 'did not compile')}</span>${step.log ? `<pre>${escape(step.log.slice(0, 1200))}</pre>` : ''}</li>`).join('')}</ol>` : '';
  const paste = `<div class="field"><label class="field-label" for="designer-shader">Shader code</label><textarea id="designer-shader" class="designer-shader" rows="10" spellcheck="false" data-designer-field="shaderCode"${disabledAttr()} placeholder="vec3 art_custom(vec2 uv, float t) { … }">${escape(designer.shaderCode)}</textarea><span class="field-hint">GLSL ES 3.0 that defines vec3 art_custom(vec2 uv, float t), with no uniforms, textures, directives or main. Up to 16 KiB.</span></div>
    ${editable() ? `<div class="designer-actions">${button({ label: 'Compile and use', action: 'designer-compile', icon: 'check', busy: designer.busy === 'compile', disabled: Boolean(designer.busy) && designer.busy !== 'compile' })}</div>` : ''}`;
  return `<section class="card settings-card" aria-labelledby="designer-art-title"><header class="card-header"><h2 class="card-title" id="designer-art-title">Shader art</h2></header><div class="card-body designer-body">${generator}${log}${paste}</div></section>`;
}

function versionsCard() {
  if (!designer.versions.length) return '';
  const rows = designer.versions.map(entry => `<li><span>Version ${escape(entry.version)} · ${escape(entry.savedBy)} · ${escape(dateTime(entry.savedAt))}</span>${act(`data-version="${escape(entry.version)}"`, { label: 'Open', size: 'xs', variant: 'ghost', action: 'designer-version' })}</li>`).join('');
  return `<section class="card settings-card" aria-labelledby="designer-versions-title"><header class="card-header"><h2 class="card-title" id="designer-versions-title">Versions</h2></header><div class="card-body designer-body"><ul class="designer-versions">${rows}</ul><p class="meta">Opening a version loads it into the designer; save it to make it the current one.</p></div></section>`;
}

function previewCard() {
  const real = Boolean(designer.card);
  const finishes = segmented({ label: 'Preview finish', action: 'designer-finish', items: finishLadder.map(step => ({ id: step.key, label: step.label, selected: !real && designer.finish === step.key })) });
  return `<section class="card designer-preview" aria-labelledby="designer-preview-title"><header class="card-header"><h2 class="card-title" id="designer-preview-title">Preview</h2><span class="meta">${escape(real ? `Work Item #${designer.card.workItemId}` : 'Sample card · illustrative, no model calls')}</span></header>
    <div class="designer-stage"><unfold-card class="designer-card"></unfold-card></div>
    <div class="card-body designer-body">${real ? '' : finishes}
      <form class="designer-card-form" data-form="designer-card"><div class="field"><label class="field-label" for="designer-card-id">Preview a Work Item’s card</label><div class="designer-inline"><input id="designer-card-id" name="id" type="text" inputmode="numeric" value="${escape(designer.cardId)}" placeholder="117">${button({ label: 'Show', type: 'submit', size: 'sm' })}${real ? act('', { label: 'Back to the sample', size: 'sm', variant: 'ghost', action: 'designer-sample' }) : ''}</div>${designer.cardError ? `<span class="field-error">${escape(designer.cardError)}</span>` : ''}</div></form>
    </div></section>`;
}

function markup() {
  if (!designer.catalog) {
    if (designer.error) return callout({ tone: 'danger', icon: 'x-circle', title: 'The card designer could not load', body: escape(designer.error), actions: button({ label: 'Try again', action: 'designer-reload', size: 'sm' }) });
    return skeleton({ rows: 4 });
  }
  const skin = skinRules(designer.draft.extends);
  const rules = skin ? { frames: skin.frames, foilPatterns: skin.foilPatterns, artPresets: skin.artPresets, art: skin.art, worlds: skin.worlds ?? [] } : null;
  const readOnly = designer.catalog.canEdit ? '' : callout({ tone: 'neutral', icon: 'info', title: 'Preview only', body: 'Only administrators can create or change card themes. You can preview every theme here.' });
  const problems = designer.catalog.directory?.problems?.length ? callout({ tone: 'attention', icon: 'alert', title: 'Some files in the themes folder were refused', body: `<ul>${designer.catalog.directory.problems.map(problem => `<li><code>${escape(problem.file)}</code>: ${escape(problem.message)}</li>`).join('')}</ul>` }) : '';
  const message = designer.message ? `<p class="designer-message" role="status">${escape(designer.message)}</p>` : '<p class="designer-message" role="status"></p>';
  const theme = `<section class="card settings-card" aria-labelledby="designer-theme-title"><header class="card-header"><h2 class="card-title" id="designer-theme-title">Theme</h2></header><div class="card-body designer-body">
    ${themePicker()}${status()}${identity()}${forgeControls(rules)}${tokenControls(skin)}${pictures(skin)}${actions()}${message}
  </div></section>`;
  return `<div class="designer">${readOnly}${problems}<div class="designer-layout"><div class="designer-left">${previewCard()}</div><div class="designer-right">${theme}${artCard()}${useCard()}${versionsCard()}</div></div></div>`;
}

function hydrate(previous) {
  const slot = document.querySelector('unfold-card.designer-card');
  if (!slot) return;
  let element = slot;
  if (previous && previous !== slot) { slot.replaceWith(previous); element = previous; }
  element.theme = previewTheme();
  if (element.card !== currentCard()) element.card = currentCard();
}

function renderDesigner() {
  const previous = document.querySelector('unfold-card.designer-card');
  renderHtml(shell(markup(), { title: 'Card designer', subtitle: 'Design Run card themes for projects and clients. Ploeg’s config gives each Work Target its theme.', wide: true }));
  hydrate(previous);
}

function setArt(kind) {
  const draft = designer.draft;
  if (!kind) draft.art = null;
  else if (kind === 'preset') draft.art = { preset: draft.art?.preset ?? artPresets[0].key };
  else if (kind === 'media') draft.art = draft.art?.media ? draft.art : null;
  else if (kind === 'shader') draft.art = draft.art?.shader ? draft.art : null;
  designer.artKind = kind;
}

function field(element) {
  const name = element.dataset.designerField;
  const draft = designer.draft;
  const value = element.value;
  if (name === 'name') draft.name = value;
  else if (name === 'id') draft.id = value.trim().toLowerCase();
  else if (name === 'prompt') { designer.prompt = value; return; }
  else if (name === 'shaderCode') { designer.shaderCode = value; return; }
  else if (name === 'extends') { draft.extends = value; render(); }
  else if (name === 'frame') draft.frame = value;
  else if (name === 'foilPattern') draft.foilPattern = value || null;
  else if (name === 'artKind') { setArt(value); render(); }
  else if (name === 'artPreset') draft.art = { preset: value };
  else if (name === 'world') draft.world = value || null;
  preview();
}

function token(element) {
  const name = element.dataset.designerToken;
  designer.draft.tokens[name] = tokenTypes[name] === 'length' ? `${Math.max(0, Math.min(32, Math.round(Number(element.value))))}px` : element.value.toLowerCase();
  const echo = element.parentElement?.querySelector('output, .meta');
  if (echo) echo.textContent = designer.draft.tokens[name];
  preview();
}

async function file(element) {
  const slot = element.dataset.designerFile;
  const chosen = element.files?.[0];
  if (!chosen) return;
  const limits = designer.catalog?.limits?.assets ?? {};
  try {
    if (slot === 'art' && chosen.type.startsWith('video/')) {
      const seconds = await videoSeconds(chosen);
      if (seconds === null) throw new Error('This browser cannot read the video. Use an MP4 (H.264) or WebM clip.');
      if (seconds > maxVideoSeconds) throw new Error(`The clip is ${Math.round(seconds)} seconds long. Use a loop of at most ${maxVideoSeconds} seconds.`);
    }
    const limit = limits[chosen.type];
    if (limit && chosen.size > limit) throw new Error(`The file is larger than ${Math.round(limit / 1024 / 1024 * 10) / 10} MiB.`);
    designer.busy = 'upload';
    const asset = await uploadAsset(slot, chosen);
    if (slot === 'art') designer.draft.art = { media: asset.id };
    else if (slot === 'symbol') designer.draft.setSymbol = asset.id;
    else designer.draft.cardBack = asset.id;
    designer.message = `${chosen.name} uploaded. Save the theme to keep it.`;
  } catch (error) {
    designer.message = error.message;
    notify(error.message, true);
  } finally {
    designer.busy = '';
  }
  render();
  preview();
}

async function save() {
  const theme = themeDocument(designer.draft, rulesOf(designer.draft.extends));
  if (!theme.id) throw new Error('Give the theme an id first: lowercase letters, digits and dashes.');
  if (!theme.name.trim()) throw new Error('Give the theme a name first.');
  designer.busy = 'save';
  render();
  try {
    const saved = await api(`/api/card-themes/${encodeURIComponent(theme.id)}`, { method: 'PUT', body: JSON.stringify({ theme, baseVersion: designer.base?.version ?? 0 }) });
    forgetThemes();
    await useTheme(saved);
    designer.catalog = await api('/api/card-themes');
    designer.versions = (await api(`/api/card-themes/${encodeURIComponent(saved.id)}/versions`)).versions;
    designer.message = `Saved version ${saved.version} of ${saved.name}.`;
    announce(designer.message);
  } catch (error) {
    designer.message = error.message;
    throw error;
  } finally {
    designer.busy = '';
    render();
    preview();
  }
}

async function compileAndUse(code) {
  const { compileArt } = await import('../cards/skins/forge/art-compiler.js');
  const result = compileArt(code);
  if (!result.ok) return result;
  const asset = await uploadAsset('shader', new Blob([code], { type: 'application/octet-stream' }));
  designer.shaderCode = code;
  designer.draft.art = { shader: asset.id };
  designer.artKind = 'shader';
  return result;
}

async function compile() {
  designer.busy = 'compile';
  render();
  try {
    const result = await compileAndUse(designer.shaderCode);
    designer.log = [{ attempt: 1, ok: result.ok, log: result.ok ? '' : result.log }];
    designer.message = result.ok ? 'The shader compiled and paints the art window. Save the theme to keep it.' : 'The shader did not compile. The log is above the code.';
  } catch (error) {
    designer.message = error.message;
    notify(error.message, true);
  } finally {
    designer.busy = '';
    render();
    preview();
  }
}

async function generate() {
  const prompt = designer.prompt.trim();
  if (prompt.length < 3) throw new Error('Describe the picture first.');
  designer.busy = 'generate';
  designer.log = [];
  designer.message = 'Asking the model for a shader…';
  render();
  try {
    const { compileArt } = await import('../cards/skins/forge/art-compiler.js');
    const result = await generateArt({
      prompt,
      request: input => api('/api/card-art/generate', { method: 'POST', body: JSON.stringify(input) }),
      compile: compileArt,
      onAttempt: step => { designer.log.push(step); render(); },
    });
    designer.shaderCode = result.code;
    if (result.ok) {
      await compileAndUse(result.code);
      designer.message = `New art in ${plural(result.attempts, 'attempt')}. Save the theme to keep it.`;
    } else designer.message = `The model’s shader still did not compile after ${plural(result.attempts, 'attempt')}. The card keeps its previous art; the last code is in the editor to fix by hand.`;
    announce(designer.message);
  } catch (error) {
    designer.message = error.message;
    notify(error.message, true);
  } finally {
    designer.busy = '';
    render();
    preview();
  }
}

/** The card designer (`#settings/card-designer`): a live forge preview of a theme on a sample or real card, its frame, foil, art, tokens, set symbol and card back, uploads, generated or pasted shader art, saved versions, and the Ploeg config that assigns it. Administrators edit; everyone else previews. */
export default {
  id: 'designer',
  match: hash => (hash === 'settings/card-designer' ? {} : null),
  load: loadDesigner,
  render: renderDesigner,
  actions: {
    'designer-reload': () => loadDesigner(),
    'designer-save': () => save(),
    'designer-delete': async () => {
      const id = designer.base?.id;
      if (!id || !globalThis.confirm?.(`Delete the theme ${id}? Cards that name it draw their skin without a theme.`)) return;
      await api(`/api/card-themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      forgetThemes();
      designer.catalog = await api('/api/card-themes');
      await openTheme('');
      designer.message = `Deleted ${id}.`;
      render();
    },
    'designer-finish': element => { designer.finish = element.dataset.id; render(); preview(); },
    'designer-sample': () => { designer.card = null; designer.cardError = ''; render(); preview(); },
    'designer-token-reset': element => { delete designer.draft.tokens[element.dataset.token]; render(); preview(); },
    'designer-remove': element => {
      const slot = element.dataset.slot;
      if (slot === 'art') { designer.draft.art = null; designer.artKind = 'media'; }
      else if (slot === 'symbol') designer.draft.setSymbol = null;
      else designer.draft.cardBack = null;
      render();
      preview();
    },
    'designer-version': async element => {
      const theme = await api(`/api/card-themes/${encodeURIComponent(designer.base.id)}/versions/${encodeURIComponent(element.dataset.version)}`);
      const current = designer.base;
      await useTheme({ ...theme, version: current.version, updatedAt: current.updatedAt, updatedBy: current.updatedBy });
      designer.message = `Version ${theme.version} is loaded. Save to make it the current version.`;
      render();
      preview();
    },
    'designer-copy': async () => {
      const text = JSON.stringify(themeDocument(designer.draft, rulesOf(designer.draft.extends)), null, 2);
      try { await navigator.clipboard.writeText(text); notify('Theme JSON copied.'); } catch { notify('The browser did not allow copying. Select the JSON above instead.', true); }
    },
    'designer-generate': () => generate(),
    'designer-compile': () => compile(),
  },
  forms: {
    'designer-card': async data => {
      const id = String(data.id ?? '').trim();
      designer.cardId = id;
      if (!/^[1-9][0-9]{0,19}$/.test(id)) { designer.cardError = 'Enter a Work Item number.'; render(); return; }
      try {
        const card = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/card`);
        designer.card = card.card ?? card;
        designer.cardError = '';
      } catch (error) {
        designer.cardError = error.status === 404 ? 'Ploeg has no card for that Work Item.' : error.message;
      }
      render();
      preview();
    },
  },
  inputs: { '[data-designer-field]': field, '[data-designer-token]': token },
  changes: { '[data-designer-pick]': element => { void openTheme(element.value).catch(error => notify(error.message, true)); }, '[data-designer-file]': element => { void file(element); } },
};
