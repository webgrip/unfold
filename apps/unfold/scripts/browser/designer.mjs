import { brokenShader, workingShader } from './fake-art-model.mjs';

const symbol = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 L22 22 L2 22 Z" fill="#f2c35b" stroke="#3d2a08" stroke-width="1.5"/></svg>';
const hostileSymbol = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><circle cx="12" cy="12" r="10"/></svg>';

/**
 * The card designer: in the demo, a new theme changes the live forge preview (frame, foil pattern, art preset, frame
 * colour, set symbol, a pasted shader), a hostile SVG and a broken shader are refused with a reason, the theme saves,
 * versions and reloads, and a real Work Item's card previews with the draft. In live mode with a fake OpenAI-compatible
 * model, generated art retries once with the browser compiler's log and ends on the GPU as the card's art.
 */
export async function run({ page, app, live, password, artModel, assert, screenshot }) {
  const host = () => page.locator('unfold-card.designer-card');
  const forge = () => page.evaluate(() => { const article = document.querySelector('unfold-card.designer-card')?.shadowRoot?.querySelector('.forge'); return article ? { ...article.dataset } : null; });
  const drawn = async (expected, message) => {
    try { await page.waitForFunction(want => { const article = document.querySelector('unfold-card.designer-card')?.shadowRoot?.querySelector('.forge'); return Boolean(article) && ['still', 'live'].includes(article.dataset.forgeState) && Object.entries(want).every(([key, value]) => (value === null ? !(key in article.dataset) : article.dataset[key] === value)); }, expected, { timeout: 30000 }); }
    catch (error) { error.message = `${message}: ${JSON.stringify(await forge())}`; throw error; }
  };
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/#settings/preferences`);
  await page.getByRole('link', { name: 'Card designer', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Card designer' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#settings/card-designer');
  await drawn({ frame: 'classic' }, 'the sample card draws in the forge');
  assert.equal(await host().getAttribute('data-skin'), 'forge');
  assert.match(await page.locator('.designer-preview').innerText(), /illustrative, no model calls/, 'the sample says it is one');
  assert.match(await host().locator('[data-slot="cost"]').getAttribute('aria-label'), /Demo · no model calls/, 'the sample card invents no spend');
  await screenshot('designer-new');

  await page.getByLabel('Name', { exact: true }).fill('Acme 2026');
  await page.getByLabel('Theme id', { exact: true }).fill('acme');
  await page.getByRole('radio', { name: 'Full art' }).check();
  await drawn({ frame: 'fullart' }, 'Full art redraws the preview');
  await page.getByLabel('Foil pattern').selectOption('gold');
  await drawn({ pattern: 'gold', patternSource: 'theme' }, 'the theme’s foil pattern reaches the card');
  await page.getByLabel('Art', { exact: true }).selectOption('preset');
  await page.getByLabel('Art preset').selectOption('warp');
  await drawn({ art: 'warp', artSource: 'theme' }, 'the theme’s art preset reaches the card');
  await page.locator('#designer-token-forge-frame').fill('#c0392b');
  await page.waitForFunction(() => document.querySelector('unfold-card.designer-card')?.style.getPropertyValue('--forge-frame') === '#c0392b');
  await page.locator('#designer-token-gc-radius').fill('20');
  await page.waitForFunction(() => document.querySelector('unfold-card.designer-card')?.style.getPropertyValue('--gc-radius') === '20px');
  assert.equal(await page.evaluate(() => document.querySelector('unfold-card.designer-card').hasAttribute('style') && !/[;:]\s*(?:url|expression)/.test(document.querySelector('unfold-card.designer-card').getAttribute('style'))), true, 'tokens reach the card only through the CSSOM, as plain values');

  await page.locator('#designer-file-symbol').setInputFiles({ name: 'hostile.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(hostileSymbol) });
  await page.locator('.designer-message', { hasText: 'event handler' }).waitFor();
  await page.locator('#designer-file-symbol').setInputFiles({ name: 'acme.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(symbol) });
  await page.locator('.designer-message', { hasText: 'acme.svg uploaded' }).waitFor();
  assert.match(await page.locator('.designer-file img.designer-thumb').getAttribute('src'), /^\/api\/card-assets\/[a-f0-9]{64}$/);

  await page.getByLabel('Shader code').fill(brokenShader);
  await page.getByRole('button', { name: 'Compile and use' }).click();
  await page.locator('.designer-message', { hasText: 'did not compile' }).waitFor();
  assert.match(await page.locator('.designer-log').innerText(), /Attempt 1\s+did not compile[\s\S]*ERROR: 0:2:/, 'the compiler log is shown');
  await drawn({ art: 'warp' }, 'a shader that does not compile leaves the art as it was');
  await page.getByLabel('Shader code').fill(workingShader);
  await page.getByRole('button', { name: 'Compile and use' }).click();
  await page.locator('.designer-message', { hasText: 'paints the art window' }).waitFor();
  await drawn({ art: 'custom', artFallback: null }, 'the compiled shader paints the art window');
  await screenshot('designer-themed');

  await page.getByRole('button', { name: 'Save theme' }).click();
  await page.locator('.designer-message', { hasText: 'Saved version 1 of Acme 2026' }).waitFor();
  await page.getByText('Version 1 · saved by Demo operator', { exact: false }).first().waitFor();
  assert.match(await page.locator('.designer-code').first().innerText(), /cardStyle:\s+skin: forge\s+theme: acme/, 'the Ploeg config snippet names the theme');

  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Card designer' }).waitFor();
  await page.getByLabel('Theme to edit').selectOption('acme');
  await page.getByText('Version 1 · saved by Demo operator', { exact: false }).first().waitFor();
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Acme 2026');
  assert.equal(await page.getByRole('radio', { name: 'Full art' }).isChecked(), true);
  await drawn({ art: 'custom', frame: 'fullart', pattern: 'gold', theme: 'acme' }, 'the saved theme draws again after a reload');
  await page.getByLabel('Name', { exact: true }).fill('Acme 2027');
  await page.getByRole('button', { name: 'Save new version' }).click();
  await page.locator('.designer-message', { hasText: 'Saved version 2 of Acme 2027' }).waitFor();
  assert.equal(await page.locator('.designer-versions li').count(), 2, 'both versions are kept');

  await page.getByLabel('Preview a Work Item’s card').fill('117');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await page.locator('.designer-preview', { hasText: 'Work Item #117' }).waitFor();
  await page.waitForFunction(() => document.querySelector('unfold-card.designer-card')?.shadowRoot?.querySelector('[data-slot="title"]')?.textContent === 'Show the order number in the confirmation email subject');
  await drawn({ theme: 'acme', frame: 'fullart' }, 'a real Work Item’s card previews with the theme');
  await screenshot('designer-real-card');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the designer overflows at 390px');
  await screenshot('designer-390');
  await page.setViewportSize({ width: 1440, height: 1040 });

  const liveBase = `http://127.0.0.1:${live.server.address().port}`;
  await page.goto(`${liveBase}/#settings/card-designer`);
  await page.getByRole('textbox', { name: 'Account name' }).fill('browser-operator');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Card designer' }).waitFor();
  await drawn({ frame: 'classic' }, 'the live designer draws its sample');
  await page.getByLabel('Describe the picture').fill('A molten gold river at night');
  await page.getByRole('button', { name: 'Generate art' }).click();
  await page.locator('.designer-message', { hasText: 'New art in 2 attempts' }).waitFor({ timeout: 30000 });
  assert.match(await page.locator('.designer-log').innerText(), /Attempt 1\s+did not compile[\s\S]*Attempt 2\s+compiled/);
  await drawn({ art: 'custom', artFallback: null }, 'generated art paints the art window');
  assert.equal(artModel.requests.length, 2, 'one retry, no more');
  assert.equal(artModel.requests[0].authorization, `Bearer ${process.env.UNFOLD_BROWSER_ART_KEY}`, 'Unfold sends its own key');
  assert.match(artModel.requests[0].content, /Subject: A molten gold river at night/);
  assert.doesNotMatch(artModel.requests[0].content, /failed to compile/, 'the first attempt carries no log');
  assert.match(artModel.requests[1].content, /failed to compile with this log[\s\S]*ERROR/, 'the retry carries the browser compiler log');
  assert.equal(await page.getByLabel('Shader code').inputValue(), workingShader);
  await screenshot('designer-generated');
  await page.context().clearCookies();
}
