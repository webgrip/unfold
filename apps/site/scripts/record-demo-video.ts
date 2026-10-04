import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { startDemo } from './demo-timeline.ts';

const site = fileURLToPath(new URL('..', import.meta.url));
const media = join(site, 'public/media');
const manifestPath = join(site, 'src/data/demo-video.json');
const SIZE = { width: 1280, height: 720 };
const BASENAME = 'unfold-demo';
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

function findChromium(): string {
  const configured = process.env['CHROME_PATH'];
  if (configured) return configured;
  const cache = join(homedir(), '.cache/ms-playwright');
  const builds = existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort()
        .reverse()
    : [];
  for (const build of builds) {
    for (const folder of ['chrome-linux64', 'chrome-linux']) {
      const binary = join(cache, build, folder, 'chrome');
      if (existsSync(binary)) return binary;
    }
  }
  throw new Error('No Chromium found. Set CHROME_PATH or install one with playwright.');
}

function findFfmpeg(): string | undefined {
  const configured = process.env['FFMPEG'];
  if (configured) return configured;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  const viaUv = spawnSync(
    'uvx',
    [
      '--from',
      'imageio-ffmpeg',
      'python',
      '-c',
      'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())',
    ],
    { encoding: 'utf8' },
  );
  return viaUv.status === 0 ? viaUv.stdout.trim() || undefined : undefined;
}

const ffmpeg = (binary: string, args: string[]) =>
  execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

async function record(work: string): Promise<{ raw: string; from: number; to: number }> {
  const root = await mkdtemp(join(tmpdir(), 'unfold-site-video-'));
  const { app, base } = await startDemo(root);
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({
      viewport: SIZE,
      recordVideo: { dir: work, size: SIZE },
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const started = Date.now();
    await page.goto(base);
    await page.getByRole('link', { name: 'Sessions', exact: true }).click();
    await page.getByRole('heading', { name: 'Sessions', exact: true }).first().waitFor();
    await delay(600);
    const from = (Date.now() - started) / 1000;
    await page.getByRole('button', { name: 'Run the demonstration' }).click();
    await page.getByText('Your review is next', { exact: true }).waitFor();
    await delay(2800);
    const glide = async (selector: string) => {
      await page.evaluate((target) => {
        const element = document.querySelector(target);
        if (element)
          window.scrollTo({
            top: element.getBoundingClientRect().top + window.scrollY - 96,
            behavior: 'smooth',
          });
      }, selector);
      await delay(900);
    };
    await glide('[role="tablist"]');
    await page.getByRole('tab', { name: /Changes/ }).click();
    await page
      .getByText('+  return Math.round((amount + Number.EPSILON) * 100);', { exact: true })
      .waitFor();
    await delay(3200);
    await page.getByRole('tab', { name: /Checks/ }).click();
    await page.getByRole('heading', { name: 'Independent review checks', exact: true }).waitFor();
    await delay(1200);
    await glide('[role="tabpanel"]:not([hidden]) h3:last-of-type');
    await delay(3200);
    const to = (Date.now() - started) / 1000;
    await page.screenshot({ path: join(work, 'poster.png') });
    const video = page.video();
    await context.close();
    const raw = await video?.path();
    if (!raw) throw new Error('Playwright recorded no video');
    return { raw, from, to };
  } finally {
    await browser.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'unfold-site-video-out-'));
  try {
    const { raw, from, to } = await record(work);
    const binary = findFfmpeg();
    const sources: { src: string; type: string }[] = [];
    const window = ['-ss', from.toFixed(2), '-to', to.toFixed(2), '-i', raw, '-an'];
    let poster: string;
    if (binary) {
      ffmpeg(binary, [
        ...window,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '42',
        '-row-mt',
        '1',
        '-deadline',
        'good',
        '-cpu-used',
        '2',
        join(media, `${BASENAME}.webm`),
      ]);
      sources.push({ src: `/media/${BASENAME}.webm`, type: 'video/webm' });
      ffmpeg(binary, [
        ...window,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '30',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        join(media, `${BASENAME}.mp4`),
      ]);
      sources.push({ src: `/media/${BASENAME}.mp4`, type: 'video/mp4' });
      ffmpeg(binary, [
        '-i',
        join(work, 'poster.png'),
        '-vf',
        'scale=960:-2',
        '-c:v',
        'libwebp',
        '-quality',
        '70',
        join(media, `${BASENAME}-poster.webp`),
      ]);
      poster = `/media/${BASENAME}-poster.webp`;
    } else {
      process.stdout.write('No ffmpeg: keeping the untrimmed Playwright webm and a PNG poster.\n');
      await writeFile(join(media, `${BASENAME}.webm`), await readFile(raw));
      sources.push({ src: `/media/${BASENAME}.webm`, type: 'video/webm' });
      await writeFile(
        join(media, `${BASENAME}-poster.png`),
        await readFile(join(work, 'poster.png')),
      );
      poster = `/media/${BASENAME}-poster.png`;
    }
    const files = [...sources.map((source) => source.src), poster];
    let total = 0;
    for (const file of files) total += (await stat(join(site, 'public', file))).size;
    const unfold = JSON.parse(
      await readFile(new URL('../../unfold/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const manifest = {
      unfoldVersion: unfold.version,
      recordedAt: new Date().toISOString().slice(0, 10),
      seconds: Math.round((to - from) * 10) / 10,
      width: SIZE.width,
      height: SIZE.height,
      poster,
      sources,
      bytes: total,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(
      `Recorded ${manifest.seconds}s of the deterministic demo with Unfold ${unfold.version}: ${files.join(', ')} (${(total / 1024).toFixed(0)} KiB).\n`,
    );
    if (total > MAX_TOTAL_BYTES)
      throw new Error(`The recording is ${total} bytes; keep it under ${MAX_TOTAL_BYTES}.`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await main();
