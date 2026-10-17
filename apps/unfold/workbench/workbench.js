import { renderStory, storyFiles, storyNames } from '../public/live/stories/index.js';
import { modelOf, scenarioNames } from '../public/live/stories/shared.js';

const nav = document.querySelector('#stories');
const stage = document.querySelector('#stage');
const controls = document.querySelector('#controls');
const summary = document.querySelector('#summary');
const scenario = document.querySelector('#scenario');
const results = new Map();
const files = {};
let current = null;

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
      const link = element('a', { href: `#${file}--${name}`, class: 'wb-link', 'data-story': `${file}--${name}` }, name.replace(/([a-z])([A-Z])/g, '$1 $2'));
      item.append(link);
      list.append(item);
    }
    group.append(list);
    nav.append(group);
  }
}

function chosen(name) { return [...controls.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value); }

function show() {
  const id = location.hash.slice(1) || `${Object.keys(storyFiles)[0]}--${storyNames(files[Object.keys(storyFiles)[0]])[0]}`;
  const [file, name] = id.split('--');
  if (!files[file]) return;
  current = id;
  for (const link of nav.querySelectorAll('.wb-link')) link.toggleAttribute('aria-current', link.dataset.story === id);
  const args = scenario.value ? { scenario: scenario.value } : {};
  const story = renderStory(files[file], name, args);
  document.querySelector('#story-title').textContent = story.title;
  document.querySelector('#model').textContent = JSON.stringify(modelOf(story.args.scenario), null, 2);
  stage.replaceChildren();
  results.clear();
  for (const theme of chosen('theme')) {
    for (const width of chosen('width')) {
      const key = `${theme}-${width}`;
      const cell = element('figure', { class: 'wb-cell' });
      const caption = element('figcaption', { class: 'wb-caption' }, `${width} px · ${theme}`);
      const query = new URLSearchParams({ story: id, theme, key, ...(scenario.value ? { args: JSON.stringify(args) } : {}) });
      const frame = element('iframe', { src: `frame.html?${query}`, width: String(width), height: '320', title: `${story.title} at ${width} px, ${theme}`, 'data-key': key, class: 'wb-iframe' });
      cell.append(caption, frame);
      stage.append(cell);
    }
  }
  summary.textContent = 'Checking…';
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'lv-frame') return;
  const frame = stage.querySelector(`iframe[data-key="${CSS.escape(event.data.key)}"]`);
  if (!frame) return;
  frame.setAttribute('height', String(Math.max(120, event.data.height)));
  if (!event.data.result) return;
  results.set(event.data.key, event.data.result);
  const caption = frame.previousElementSibling;
  const { failures, warnings } = event.data.result;
  caption.dataset.state = failures.length ? 'fail' : warnings.length ? 'warn' : 'pass';
  caption.textContent = `${event.data.key.replace('-', ' · ')} px · ${failures.length ? `${failures.length} failing` : 'passes'}${warnings.length ? ` · ${warnings.length} warnings` : ''}`;
  caption.title = [...failures, ...warnings].map(entry => `${entry.rule}: ${entry.detail} ${entry.at}`).join('\n');
  const all = [...results.values()];
  const failing = all.reduce((sum, result) => sum + result.failures.length, 0);
  summary.textContent = `${all.length} frames checked · ${failing ? `${failing} failures (hover a caption)` : 'no failures'}`;
});

controls.addEventListener('change', show);
window.addEventListener('hashchange', show);
const events = new EventSource('/events');
events.addEventListener('change', () => location.reload());

await index();
show();
