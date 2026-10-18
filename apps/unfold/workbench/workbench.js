import { renderStory, storyFiles, storyNames } from '../public/live/stories/index.js';
import { modelOf, scenarioNames } from '../public/live/stories/shared.js';

const nav = document.querySelector('#stories');
const stage = document.querySelector('#stage');
const controls = document.querySelector('#controls');
const summary = document.querySelector('#summary');
const scenario = document.querySelector('#scenario');
const appsNav = document.querySelector('#apps');
const files = {};
const frames = new Map();
const appFrames = new Map();
let wanted = null;
let recordings = [];

const element = (tag, attrs = {}, text = '') => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text) node.textContent = text; return node; };

for (const name of scenarioNames) scenario.append(element('option', { value: name }, name));

async function index() {
  for (const [file, load] of Object.entries(storyFiles)) {
    const module = await load();
    files[file] = module;
    const group = element('section', { class: 'wb-group' });
    group.append(element('h2', { class: 'wb-group-title' }, module.default.title.replace(/^(Live|Controls)\//, '')));
    const list = element('ul', { class: 'wb-list' });
    for (const name of storyNames(module)) {
      const item = element('li');
      item.append(element('a', { href: `#${file}--${name}`, class: 'wb-link', 'data-story': `${file}--${name}` }, name.replace(/([a-z])([A-Z])/g, '$1 $2')));
      list.append(item);
    }
    group.append(list);
    nav.append(group);
  }
}

const chosen = name => [...controls.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);

function send(frame) {
  if (!frame.ready || !wanted) return;
  frame.result = null;
  frame.caption.dataset.state = 'busy';
  frame.caption.textContent = `${frame.width} px · ${frame.theme} · rendering`;
  frame.iframe.contentWindow.postMessage({ type: 'lv-render', story: wanted.id, theme: frame.theme, args: wanted.args }, location.origin);
}

function tally() {
  const pool = wanted?.app ? appFrames : frames;
  const done = [...pool.values()].filter(frame => frame.result);
  const failing = done.reduce((sum, frame) => sum + frame.result.failures.length, 0);
  summary.textContent = done.length < pool.size ? `Checking ${done.length} of ${pool.size} frames…` : `${done.length} frames checked · ${failing ? `${failing} failures (hover a caption)` : 'no failures'}`;
}

async function indexApps() {
  recordings = await fetch('/workbench/recordings.json').then(response => response.json());
  for (const recording of recordings) {
    const group = element('section', { class: 'wb-group' });
    group.append(element('h2', { class: 'wb-group-title' }, recording.label));
    const list = element('ul', { class: 'wb-list' });
    for (const item of recording.workItems) {
      const entry = element('li');
      entry.append(element('a', { href: `#app:${recording.name}:${item.id}`, class: 'wb-link', 'data-story': `app:${recording.name}:${item.id}`, title: item.title }, `${item.id} · ${item.state.replace('_', ' ')} · ${item.title}`));
      list.append(entry);
    }
    group.append(list);
    appsNav.append(group);
  }
}

function showApp(id) {
  const [, base, item] = id.split(':');
  const flags = chosen('flag');
  const recording = flags.length ? `${base}~${flags.join(',')}` : base;
  document.querySelector('#story-title').textContent = `Real app · ${recording} · Work Item ${item}`;
  document.querySelector('#model').textContent = 'The real Work Item page, answered from the recording by the replay shim. Missing answers show as recording warnings.';
  for (const frame of frames.values()) frame.cell.remove();
  frames.clear();
  const keys = chosen('theme').flatMap(theme => chosen('width').map(width => `${theme}-${width}`));
  for (const [key, frame] of appFrames) if (!keys.includes(key) || frame.recording !== recording) { frame.cell.remove(); appFrames.delete(key); }
  for (const key of keys) {
    let frame = appFrames.get(key);
    if (!frame) {
      const [theme, width] = key.split('-');
      const cell = element('figure', { class: 'wb-cell' });
      const caption = element('figcaption', { class: 'wb-caption' }, `${width} px · ${theme} · loading`);
      const iframe = element('iframe', { src: `/app/${recording}/?${new URLSearchParams({ key, theme })}#work/${item}`, width, height: '900', title: `Unfold at ${width} px, ${theme}`, class: 'wb-iframe' });
      cell.append(caption, iframe);
      frame = { key, theme, width, cell, caption, iframe, recording, result: null };
      appFrames.set(key, frame);
    } else {
      frame.caption.dataset.state = 'busy';
      frame.result = null;
      frame.iframe.contentWindow.postMessage({ type: 'lv-route', hash: `#work/${item}` }, location.origin);
    }
    if (!frame.cell.isConnected) stage.append(frame.cell);
  }
  wanted = { id, app: true };
}

function show() {
  const hash = location.hash.slice(1);
  const app = hash === 'app' || hash.startsWith('app:');
  document.querySelector('#mode-app').setAttribute('aria-selected', String(app));
  document.querySelector('#mode-stories').setAttribute('aria-selected', String(!app));
  appsNav.hidden = !app;
  document.querySelector('#stories').hidden = app;
  document.querySelector('#scenario-field').hidden = app;
  document.querySelector('#flags-field').hidden = !app;
  for (const link of document.querySelectorAll('.wb-link')) link.toggleAttribute('aria-current', link.dataset.story === hash);
  if (app) {
    const first = recordings[0];
    const id = hash.startsWith('app:') ? hash : first?.workItems[0] ? `app:${first.name}:${first.workItems[0].id}` : null;
    if (id) showApp(id);
    return;
  }
  for (const frame of appFrames.values()) frame.cell.remove();
  appFrames.clear();
  const first = Object.keys(storyFiles)[0];
  const id = location.hash.slice(1) || `${first}--${storyNames(files[first])[0]}`;
  const [file, name] = id.split('--');
  if (!files[file]) return;
  const args = scenario.value ? { scenario: scenario.value } : {};
  const story = renderStory(files[file], name, args);
  wanted = { id, args };
  for (const link of nav.querySelectorAll('.wb-link')) link.toggleAttribute('aria-current', link.dataset.story === id);
  document.querySelector('#story-title').textContent = story.title;
  document.querySelector('#model').textContent = JSON.stringify(story.args.scenario ? modelOf(story.args.scenario) : story.args, null, 2);
  const keys = chosen('theme').flatMap(theme => chosen('width').map(width => `${theme}-${width}`));
  for (const [key, frame] of frames) if (!keys.includes(key)) { frame.cell.remove(); frames.delete(key); }
  for (const key of keys) {
    let frame = frames.get(key);
    if (!frame) {
      const [theme, width] = key.split('-');
      const cell = element('figure', { class: 'wb-cell' });
      const caption = element('figcaption', { class: 'wb-caption' }, `${width} px · ${theme} · loading`);
      const iframe = element('iframe', { src: `frame.html?${new URLSearchParams({ key, theme })}`, width, height: '160', title: `Story at ${width} px, ${theme}`, class: 'wb-iframe' });
      cell.append(caption, iframe);
      frame = { key, theme, width, cell, caption, iframe, ready: false, result: null };
      frames.set(key, frame);
    }
    if (!frame.cell.isConnected) stage.append(frame.cell);
    send(frame);
  }
  tally();
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const frame = (wanted?.app ? appFrames : frames).get(event.data?.key);
  if (!frame) return;
  if (event.data.type === 'lv-ready') { frame.ready = true; send(frame); return; }
  if (event.data.type !== 'lv-frame') return;
  if (event.data.height && !wanted?.app) frame.iframe.setAttribute('height', String(Math.max(80, event.data.height)));
  if (!event.data.result || (!wanted?.app && event.data.story !== wanted?.id)) return;
  frame.result = event.data.result;
  const { failures, warnings } = frame.result;
  frame.caption.dataset.state = failures.length ? 'fail' : warnings.length ? 'warn' : 'pass';
  frame.caption.textContent = `${frame.width} px · ${frame.theme} · ${failures.length ? `${failures.length} failing` : 'passes'}${warnings.length ? ` · ${warnings.length} warnings` : ''}`;
  frame.caption.title = [...failures, ...warnings].map(entry => `${entry.rule}: ${entry.detail} ${entry.at}`).join('\n');
  tally();
});

controls.addEventListener('change', show);
window.addEventListener('hashchange', show);
new EventSource('/events').addEventListener('change', () => location.reload());

await Promise.all([index(), indexApps()]);
show();
