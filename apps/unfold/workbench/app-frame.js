import { runChecks } from './checks.js';

const params = new URLSearchParams(location.search);
const key = params.get('key');
const theme = params.get('theme');
const violations = [];
let turn = 0;
document.addEventListener('securitypolicyviolation', event => violations.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline content'}`));

function holdTheme() {
  if (theme !== 'light' && theme !== 'dark') return;
  const root = document.documentElement;
  const apply = () => { if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme); };
  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}

function quiet({ calm = 500, limit = 8000 } = {}) {
  return new Promise(done => {
    const started = Date.now();
    let last = Date.now();
    const observer = new MutationObserver(() => { last = Date.now(); });
    observer.observe(document.querySelector('#app') ?? document.body, { subtree: true, childList: true });
    const tick = () => {
      const booting = !document.querySelector('main:not(.boot)') || document.querySelector('.boot');
      const busy = booting || document.querySelector('main [aria-busy="true"]:not(.work-run-log-status), main .skeleton-wrap');
      if ((!busy && Date.now() - last >= calm) || Date.now() - started > limit) { observer.disconnect(); done(); return; }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function check() {
  const mine = ++turn;
  document.body.dataset.ready = 'false';
  await globalThis.__unfoldReplay?.ready;
  await document.fonts.ready;
  await quiet();
  if (mine !== turn) return;
  const root = document.querySelector('main') ?? document.body;
  const result = { story: location.hash, ...runChecks(root, { cspViolations: violations }) };
  for (const missing of new Set(globalThis.__unfoldReplay?.unmatched ?? [])) result.warnings.push({ rule: 'recording', detail: `no recorded answer for ${missing}`, at: '' });
  window.__lvChecks = result;
  document.body.dataset.ready = 'true';
  if (parent !== window) parent.postMessage({ type: 'lv-frame', key, story: location.hash, result }, location.origin);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'lv-route') return;
  if (location.hash === event.data.hash) check();
  else location.hash = event.data.hash;
});
window.addEventListener('hashchange', () => check());
holdTheme();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => check(), { once: true });
else check();
