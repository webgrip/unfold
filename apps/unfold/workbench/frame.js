import { renderStory, storyFiles } from '../public/live/stories/index.js';
import { runChecks } from './checks.js';

const params = new URLSearchParams(location.search);
const [file, name] = (params.get('story') ?? '').split('--');
const theme = params.get('theme');
const violations = [];
document.addEventListener('securitypolicyviolation', event => violations.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline content'}`));
if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);

function report(result) {
  window.__lvChecks = result;
  document.body.dataset.ready = 'true';
  if (parent !== window) parent.postMessage({ type: 'lv-frame', key: params.get('key'), height: document.documentElement.scrollHeight, result }, location.origin);
}

async function main() {
  const root = document.querySelector('#root');
  try {
    if (!Object.hasOwn(storyFiles, file)) throw new Error(`No story file ${file}`);
    const overrides = params.get('args') ? JSON.parse(params.get('args')) : {};
    const story = renderStory(await storyFiles[file](), name, overrides);
    document.title = story.title;
    root.innerHTML = story.html;
    root.dataset.frame = story.parameters.frame ?? 'panel';
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    report({ story: `${file}--${name}`, ...runChecks(root, { cspViolations: violations }) });
    new ResizeObserver(() => parent !== window && parent.postMessage({ type: 'lv-frame', key: params.get('key'), height: document.documentElement.scrollHeight }, location.origin)).observe(document.body);
  } catch (error) {
    root.textContent = `The story did not render: ${error.message}`;
    report({ story: `${file}--${name}`, failures: [{ rule: 'render', detail: error.message, at: '' }], warnings: [] });
  }
}

main();
