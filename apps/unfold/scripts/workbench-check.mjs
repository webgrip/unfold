import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startWorkbench } from './workbench.mjs';

const widths = (process.env.UNFOLD_WORKBENCH_WIDTHS ?? '390,768,1280').split(',').map(Number).filter(Boolean);
const themes = ['light', 'dark'];
const only = process.env.UNFOLD_WORKBENCH_STORIES ? new RegExp(process.env.UNFOLD_WORKBENCH_STORIES) : null;
const screenshots = process.env.UNFOLD_SCREENSHOTS ? resolve(process.env.UNFOLD_SCREENSHOTS) : null;
const report = process.env.UNFOLD_WORKBENCH_REPORT ? resolve(process.env.UNFOLD_WORKBENCH_REPORT) : null;

const workbench = await startWorkbench({ port: 0, watchFiles: false });
const browser = await chromium.launch({ headless: true, ...(process.env.UNFOLD_CHROMIUM_BIN ? { executablePath: process.env.UNFOLD_CHROMIUM_BIN, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
const runs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${workbench.url}/workbench/frame.html`);
  const ids = await page.evaluate(async () => {
    const { storyFiles, storyNames } = await import('../public/live/stories/index.js');
    const list = [];
    for (const [file, load] of Object.entries(storyFiles)) for (const name of storyNames(await load())) list.push(`${file}--${name}`);
    return list;
  });
  const stories = ids.filter(id => !only || only.test(id));
  const recordings = process.env.UNFOLD_WORKBENCH_APP === '0' ? [] : await (await fetch(`${workbench.url}/workbench/recordings.json`)).json();
  const pages = recordings.flatMap(recording => {
    const picked = recording.name === 'demo' ? recording.workItems.filter((item, index, all) => all.findIndex(other => other.state === item.state) === index) : recording.workItems;
    return picked.flatMap(item => ['', '~work.live-view', '~work.unified'].map(flags => ({ id: `app:${recording.name}${flags}:${item.id}`, url: `/app/${recording.name}${flags}/`, hash: `#work/${item.id}` }))).filter(entry => !only || only.test(entry.id));
  });
  const passes = [
    ...stories.flatMap(id => widths.flatMap(width => themes.map(theme => ({ id, width, theme, motion: 'no-preference' })))),
    ...stories.map(id => ({ id, width: widths.at(-1), theme: 'dark', motion: 'reduce' })),
    ...pages.flatMap(entry => widths.flatMap(width => themes.map(theme => ({ ...entry, width, theme, motion: 'no-preference' })))),
    ...pages.map(entry => ({ ...entry, width: widths.at(-1), theme: 'dark', motion: 'reduce' })),
  ];
  for (const pass of passes) {
    errors.length = 0;
    await page.emulateMedia({ reducedMotion: pass.motion });
    await page.setViewportSize({ width: pass.width, height: 900 });
    await page.goto(pass.url ? `${workbench.url}${pass.url}?${new URLSearchParams({ theme: pass.theme })}${pass.hash}` : `${workbench.url}/workbench/frame.html?${new URLSearchParams({ story: pass.id, theme: pass.theme })}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const result = await page.evaluate(() => window.__lvChecks);
    for (const error of errors) result.failures.push({ rule: 'console', detail: error, at: '' });
    runs.push({ ...pass, ...result });
    if (screenshots && pass.motion === 'no-preference') {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${pass.id.replaceAll(':', '-')}.${pass.width}.${pass.theme}.png`), fullPage: true });
    }
  }
} finally {
  await browser.close();
  await workbench.close();
}

const failing = runs.filter(run => run.failures.length);
const warnings = runs.reduce((sum, run) => sum + run.warnings.length, 0);
for (const run of failing) {
  process.stdout.write(`FAIL ${run.id} at ${run.width}px ${run.theme}${run.motion === 'reduce' ? ' reduced motion' : ''}\n`);
  for (const failure of run.failures) process.stdout.write(`  ${failure.rule}: ${failure.detail}${failure.at ? ` (${failure.at})` : ''}\n`);
}
if (report) await writeFile(report, JSON.stringify(runs, null, 2));
const stories = new Set(runs.filter(run => !run.url).map(run => run.id)).size;
const appPages = new Set(runs.filter(run => run.url).map(run => run.id)).size;
process.stdout.write(`${failing.length ? 'FAIL' : 'PASS'}: ${stories} stories and ${appPages} real app pages × ${widths.length} widths × ${themes.length} themes, plus reduced motion: ${runs.length} frames, ${failing.length} failing, ${warnings} warnings.\n`);
process.exitCode = failing.length ? 1 : 0;
