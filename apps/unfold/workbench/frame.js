import { renderStory, storyFiles } from '../public/live/stories/index.js';
import { runChecks } from './checks.js';

const params = new URLSearchParams(location.search);
const key = params.get('key');
const root = document.querySelector('#root');
const violations = [];
const modules = new Map();
let fontsReady = null;
let current = 0;
let cleanup = null;
document.addEventListener('securitypolicyviolation', event => violations.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline content'}`));

const send = message => { if (parent !== window) parent.postMessage({ key, ...message }, location.origin); };
const height = () => Math.ceil(Math.max(root.getBoundingClientRect().height, root.scrollHeight));

async function load(file) {
  if (!Object.hasOwn(storyFiles, file)) throw new Error(`No story file ${file}`);
  if (!modules.has(file)) modules.set(file, storyFiles[file]());
  return modules.get(file);
}

async function render({ story = '', theme = null, args = {} }) {
  const turn = ++current;
  const [file, name] = story.split('--');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  let result;
  try {
    const rendered = renderStory(await load(file), name, args);
    if (turn !== current) return;
    document.title = rendered.title;
    root.dataset.frame = rendered.parameters.frame ?? 'panel';
    cleanup?.();
    cleanup = null;
    root.innerHTML = rendered.html;
    const played = rendered.play ? await rendered.play({ canvasElement: root, args: rendered.args }) : null;
    if (typeof played === 'function') cleanup = played;
    if (turn !== current) return;
    send({ type: 'lv-frame', story, height: height() });
    fontsReady ??= document.fonts.ready;
    await fontsReady;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (turn !== current) return;
    violations.length = 0;
    result = { story, ...runChecks(root, { cspViolations: violations }) };
  } catch (error) {
    root.textContent = `The story did not render: ${error.message}`;
    result = { story, failures: [{ rule: 'render', detail: error.message, at: '' }], warnings: [] };
  }
  window.__lvChecks = result;
  document.body.dataset.ready = 'true';
  send({ type: 'lv-frame', story, height: height(), result });
}

new ResizeObserver(() => send({ type: 'lv-frame', height: height() })).observe(root);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'lv-render') return;
  document.body.dataset.ready = 'false';
  render(event.data);
});

if (params.get('story')) render({ story: params.get('story'), theme: params.get('theme'), args: params.get('args') ? JSON.parse(params.get('args')) : {} });
else send({ type: 'lv-ready' });
