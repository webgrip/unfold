import { renderStory, storyFiles, storyNames } from '../public/live/stories/index.js';
import { modelOf, scenarioNames } from '../public/live/stories/shared.js';

const nav = document.querySelector('#stories');
const stage = document.querySelector('#stage');
const controls = document.querySelector('#controls');
const summary = document.querySelector('#summary');
const scenario = document.querySelector('#scenario');
const files = {};
const frames = new Map();
let wanted = null;

const element = (tag, attrs = {}, text = '') => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text) node.textContent = text; return node; };

for (const name of scenarioNames) scenario.append(element('option', { value: name }, name));

async function index() {
  for (const [file, load] of Object.entries(storyFiles)) {
    const module = await load();
    files[file] = module;
    const group = element('section', { class: 'wb-group' });
    group.append(element('h2', { class: 'wb-group-title' }, module.default.title.replace(/^Live\//, '')));
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
  const done = [...frames.values()].filter(frame => frame.result);
  const failing = done.reduce((sum, frame) => sum + frame.result.failures.length, 0);
  summary.textContent = done.length < frames.size ? `Checking ${done.length} of ${frames.size} frames…` : `${done.length} frames checked · ${failing ? `${failing} failures (hover a caption)` : 'no failures'}`;
}

function show() {
  const first = Object.keys(storyFiles)[0];
  const id = location.hash.slice(1) || `${first}--${storyNames(files[first])[0]}`;
  const [file, name] = id.split('--');
  if (!files[file]) return;
  const args = scenario.value ? { scenario: scenario.value } : {};
  const story = renderStory(files[file], name, args);
  wanted = { id, args };
  for (const link of nav.querySelectorAll('.wb-link')) link.toggleAttribute('aria-current', link.dataset.story === id);
  document.querySelector('#story-title').textContent = story.title;
  document.querySelector('#model').textContent = JSON.stringify(modelOf(story.args.scenario), null, 2);
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
  const frame = frames.get(event.data?.key);
  if (!frame) return;
  if (event.data.type === 'lv-ready') { frame.ready = true; send(frame); return; }
  if (event.data.type !== 'lv-frame') return;
  if (event.data.height) frame.iframe.setAttribute('height', String(Math.max(80, event.data.height)));
  if (!event.data.result || event.data.story !== wanted?.id) return;
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

await index();
show();
