import { navigate } from './navigate.mjs';

const pageTwo = {
  id: '999', team: 'delivery', state: 'needs_human', title: 'Loaded from the second page', provider: 'demo', externalId: 'DEMO-99', url: '', description: '', descriptionMarkdown: '',
  revision: 'p2', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, lease: null,
  target: { forge: 'demo', owner: 'example', repo: 'order-service', baseBranch: 'main' },
  createdAt: '2026-09-30T08:00:00Z', updatedAt: '2026-09-30T08:30:00Z',
  latestShift: { id: '99', workItemId: '999', team: 'delivery', branch: 'agent/demo-99', round: 2, budgetUsd: 3, spentUsd: 0, reservedUsd: 0, openedAt: '2026-09-30T08:01:00Z', closedAt: '2026-09-30T08:30:00Z', closeReason: 'fix_round_cap_reached' },
};

/**
 * Work: lanes, the review decision and its phone action bar, master-detail at desktop width with the reason groups,
 * keys, the demo cancel dialog, re-opening a Work Item, the remembered Team changed from the keyboard, Load more
 * surviving a refresh, and the focus after a live cancel.
 */
export async function run({ page, app, assert, screenshot }) {
  const overviewReads = [];
  const sessionReads = [];
  const detailReads = [];
  const onRequest = request => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/ploeg') overviewReads.push(request.url());
    if (path === '/api/sessions') sessionReads.push(request.url());
    if (path.startsWith('/api/ploeg/work-items/')) detailReads.push(path);
  };
  page.on('request', onRequest);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate(page, 'Work');
    const lanes = page.getByRole('group', { name: 'Lane' });
    await lanes.getByRole('button', { name: /^Ready for review/ }).click();
    assert.equal(await page.evaluate(() => location.hash), '#work?lane=awaiting_review');
    await page.getByText('PR #5 · No agent verdict', { exact: true }).waitFor();
    const listReads = overviewReads.length;
    await page.locator('[data-work-row][data-id="105"]').click();
    await page.getByRole('heading', { name: 'Ready for your review', exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert.equal(await page.locator('#ploeg-item-title').textContent(), 'Round half-cent totals consistently');
    const sticky = page.locator('.work-sticky-actions');
    assert.equal(await sticky.getByRole('link', { name: /Open pull request #5/ }).getAttribute('href'), 'https://forge.example.invalid/example/order-service/pulls/5');
    await page.waitForFunction(() => { const bar = document.querySelector('.work-sticky-actions'); return bar && getComputedStyle(bar).visibility === 'visible'; });
    const cardAction = page.locator('#work-card .work-card-actions .button.primary');
    await cardAction.waitFor();
    assert.equal(await page.locator('#work-decision .button.primary').count(), 0, 'with the Run card at the head, the review box leaves the primary action to the card');
    await cardAction.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.work-sticky-actions')).visibility === 'hidden');
    assert.equal(await page.locator('#work-card .work-card-actions').getByRole('link', { name: /Open pull request #5/ }).isVisible(), true, 'phones show the primary action once: on the Run card while it is on screen');
    assert.equal(await page.locator('#work-card-headline').textContent(), 'Ready for your review · No verdict PR #5 after 2 Rounds', 'the card headline states what happened');
    assert.match(await page.locator('#work-decision .work-checklist-note').textContent(), /not reported: .*\bCI\b/, 'the neutral checks, CI among them, fold into one muted line');
    assert.equal(await page.locator('#work-decision details#work-forge-105').evaluate(node => node.open), false, 'the forge outcomes are a closed disclosure');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the Work Item page overflows horizontally at 390 px');
    assert.equal(await page.evaluate(() => document.getElementById('page-title').getBoundingClientRect().width <= 1), true, 'the page heading steps aside, for screen readers only, on a phone Work Item page');
    await screenshot('ploeg-review-mobile');
    assert.equal(await page.locator('.app-topbar .app-back').textContent(), 'Ready for review', 'the phone back link names the list it returns to');
    await page.locator('.app-topbar .app-back').click();
    await page.locator('[data-work-row][data-id="105"]').waitFor();
    assert.equal(overviewReads.length, listReads, 'opening and closing a Work Item does not reload the lists');
    await page.waitForFunction(() => document.activeElement?.dataset?.id === '105');
    await lanes.getByRole('button', { name: /^Needs you/ }).click();
    await page.locator('[data-work-row][data-id="101"]').waitFor();
    assert.equal(await page.locator('[data-work-row][data-id="109"]').getByText('Reviewer still wants changes', { exact: true }).count(), 1, 'a reason no other Work Item shares stays a chip on its row');
    assert.equal(await page.locator('.reason-band').count(), 0, 'Needs you groups only reasons that two or more Work Items share');
    assert.equal(await page.evaluate(() => { const bar = document.querySelector('.work-lanes'); return [...bar.children].every(segment => { const box = segment.getBoundingClientRect(); const frame = bar.getBoundingClientRect(); return box.left >= frame.left - 1 && box.right <= frame.right + 1; }); }), true, 'every lane is visible at 390 px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the Work list overflows horizontally at 390 px');

    await page.setViewportSize({ width: 1440, height: 1040 });
    await page.locator('[data-work-row][data-id="109"]').click();
    await page.getByRole('heading', { name: 'Why this needs you' }).waitFor();
    assert.equal(await page.locator('.work-list-pane').isVisible(), true, 'the list stays beside the Work Item on wide screens');
    assert.equal(await page.locator('[data-work-row][data-id="109"]').getAttribute('aria-current'), 'true');
    assert.equal(await page.locator('.work-sticky-actions').isVisible(), false);
    assert.equal(await page.locator('#work-decision').getByRole('link', { name: /Open pull request #7/ }).isVisible(), true, 'the decision box carries the action to take');
    await page.locator('#work-decision [data-action="work-run"][data-id="44"]').first().click();
    assert.equal(await page.locator('#work-run-44').evaluate(element => element.open), true, 'the evidence link opens its Run');
    assert.equal(await page.getByRole('button', { name: 'Cancel Work Item' }).count(), 0, 'a stopped Work Item with a closed Shift offers no Cancel that would do nothing');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => location.hash === '#work?lane=needs_human');
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    const reads = detailReads.length;
    await page.locator('[data-work-row][data-id="109"]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert(detailReads.slice(reads).includes('/api/ploeg/work-items/109'), 'opening a Work Item again reads it again');
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    await page.locator('[data-work-row][data-id="109"]').focus();
    await page.keyboard.press('j');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.id), '110', 'j moves to the next row');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert.equal(await page.locator('#ploeg-item-title').textContent(), 'Summarise payment-provider fees for the pricing brief');
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/#work/102?lane=leased`);
    await page.getByRole('button', { name: 'Cancel Work Item' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this Work Item?' });
    await dialog.waitFor();
    assert.equal(await dialog.getByText('Withdraws the Work Item and closes its open Shift.', { exact: true }).isVisible(), true, 'the dialog leads with the main consequence');
    assert.equal(await dialog.getByText('Not available in the demo').isVisible(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Cancel Work Item' }).isDisabled(), true, 'the demo cannot cancel anything');
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/#work/115?lane=all`);
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert.equal(await page.evaluate(() => { const row = document.querySelector('[data-work-row][aria-current="true"]'); const pane = row.closest('.work-list').getBoundingClientRect(); const box = row.getBoundingClientRect(); return box.top >= pane.top && box.bottom <= pane.bottom; }), true, 'a deep link scrolls its row into the list pane');
    assert.equal(await page.evaluate(() => document.querySelector('.work-list-pane').getBoundingClientRect().bottom <= innerHeight + 1), true, 'the list pane ends inside the window');
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/#work/109`);
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    await page.waitForFunction(() => location.hash === '#work/109?lane=needs_human');
    assert.equal(await page.locator('[data-work-row][data-id="109"]').getAttribute('aria-current'), 'true', 'a link without a lane opens beside the lane the Work Item is in');
    assert.match(await page.title(), /DEMO-9 Reject negative quantities in the cart API · Work · De Vloer$/, 'the tab names the open Work Item');
    const card = page.locator('unfold-card.work-run-card');
    await card.locator('.gc:not([hidden])').waitFor();
    assert(await page.evaluate(() => { const card = document.getElementById('work-card'); const rounds = document.getElementById('work-rounds'); return card && rounds && (card.compareDocumentPosition(rounds) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'the Run card sits above Rounds, which stay');
    assert(await page.evaluate(() => { const card = document.getElementById('work-card'); const title = document.getElementById('ploeg-item-title'); const box = document.getElementById('work-decision'); return card && title && box && (title.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) && (card.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'the Run card heads the detail, above the review box');
    assert.equal(await page.locator('#work-card-headline').textContent(), 'Needs you · Reviewer still wants changes', 'the card headline states what happened');
    const cardBox = await card.boundingBox();
    const detailBox = await page.locator('.work-detail').boundingBox();
    assert(Math.abs(cardBox.width - detailBox.width) < 4, 'the card spans the content width');
    assert.equal(await card.locator('[data-slot="title"]').textContent(), 'Reject negative quantities in the cart API');
    assert.equal(await card.locator('[data-slot="state"]').textContent(), 'In review');
    assert.match(await card.locator('[data-slot="cost"]').getAttribute('aria-label'), /Demo · no model calls/, 'the demo card invents no spend');
    assert.equal(await card.locator('[data-slot="steward"] .sr-only').textContent(), 'Unsigned');
    const more = card.getByRole('button', { name: 'More info' });
    await more.click();
    await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.activeElement?.matches('[data-card-focus]'));
    assert.equal(await card.locator('.gc-front [data-card-action="flip"]').getAttribute('aria-expanded'), 'true');
    await card.getByRole('tab', { name: 'Economics' }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await card.getByRole('tab', { name: 'Agent' }).getAttribute('aria-selected'), 'true', 'arrow keys move between the tabs');
    assert.equal(await card.getByRole('tabpanel', { name: 'Agent' }).isVisible(), true);
    await card.getByRole('tab', { name: 'Life' }).click();
    assert.match(await card.getByRole('tabpanel', { name: 'Life' }).innerText(), /Days live\s+Not released/, 'an unmerged card is not released');
    assert.equal(await card.locator('.gc-front .day').count(), 0, 'an unreleased card has no day chip');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.getAttribute('face') === 'front');
    assert.equal(await page.evaluate(() => location.hash), '#work/109?lane=needs_human', 'Escape on the back turns the card over and keeps the Work Item open');
    await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.activeElement?.dataset?.cardAction === 'flip');
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    assert(sessionReads.length <= 1, `Work reads the sessions at most once, read ${sessionReads.length} times`);

    const openCard = async (id, title) => {
      await page.goto(`http://127.0.0.1:${app.server.address().port}/#work/${id}?lane=all`);
      await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
      await page.waitForFunction(text => { const root = document.querySelector('unfold-card.work-run-card')?.shadowRoot; return root?.querySelector('.gc:not([hidden]) [data-slot="title"]')?.textContent === text; }, title);
      return page.locator('unfold-card.work-run-card');
    };
    const holo = await openCard('118', 'Validate postcodes on the shipping address form');
    assert.equal(await holo.locator('.gc-front .day b').textContent(), 'Day 41', 'a released card shows its day');
    assert.equal(await holo.locator('.gc-front .day .fin').textContent(), 'Holo', 'and its finish name');
    assert.equal(await holo.locator('.gc-front .card').getAttribute('data-finish'), 'holo');
    assert.equal(await holo.locator('.gc-front .fx').count(), 2, 'holo draws the lit hairline and the spotlight');
    await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc-front .card')?.hasAttribute('data-gc-animate'));
    const face = await holo.locator('.gc-front .card').boundingBox();
    await page.mouse.move(face.x + 30, face.y + 40);
    await page.mouse.move(face.x + 40, face.y + 60);
    await page.waitForFunction(() => { const node = document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc-front .card'); return Number(node?.style.getPropertyValue('--gc-po')) > 0.5 && Number(node.style.getPropertyValue('--gc-px')) < 0.5; });
    await page.mouse.move(face.x + face.width + 200, face.y);
    await screenshot('work-card-holo');
    await holo.getByRole('button', { name: 'More info' }).click();
    await holo.getByRole('tab', { name: 'Life' }).click();
    const life = await holo.getByRole('tabpanel', { name: 'Life' }).innerText();
    assert.match(life, /Days live\s+41 days/);
    assert.match(life, /Release source\s+First deploy to production/);
    assert.match(life, /Finish\s+Holo/);
    assert.match(life, /Next finish\s+Prism in 49 days/);
    assert.match(life, /Deployments · 3 environments\s+test\s+(?:\(opens in a new tab\)\s+)?first deployed [\d-]+ [\d:]+ · [0-9a-f]{7}\s+acceptance\s+(?:\(opens in a new tab\)\s+)?first deployed [\d-]+ [\d:]+ · [0-9a-f]{7}\s+production/i, 'deployments per environment in pipeline order with a short sha');
    assert.match(await holo.getByRole('tabpanel', { name: 'Life' }).getByRole('link', { name: /production/ }).getAttribute('href'), /^https:\/\/forge\.example\.invalid\/.+production$/, 'each deployment links to its pipeline');
    await page.keyboard.press('Escape');
    const merged = await openCard('114', 'Show the delivery window on the order summary');
    assert.equal(await merged.locator('.gc-front .day').getAttribute('data-source'), 'merge');
    assert.equal(await merged.locator('.gc-front .day b').textContent(), 'Day 1');
    assert.equal(await merged.locator('.gc-front .fx').count(), 0, 'a matte card draws no finish layer');
    await merged.getByRole('button', { name: 'More info' }).click();
    await merged.getByRole('tab', { name: 'Life' }).click();
    assert.match(await merged.getByRole('tabpanel', { name: 'Life' }).innerText(), /counted from merge · no deploy signal/, 'a release counted from the merge says so');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const infinity = await openCard('121', 'Return 404 instead of 500 for unknown order ids');
    assert.equal(await infinity.locator('.gc-front .day .fin').textContent(), 'Infinity');
    const box = await infinity.locator('.gc-front .card').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.move(box.x + 30, box.y + 30);
    assert.equal(await infinity.locator('.gc-front .card').evaluate(node => [node.style.getPropertyValue('--gc-po'), getComputedStyle(node).animationName]).then(([po, name]) => `${po || 'unset'} ${name}`), 'unset none', 'reduced motion keeps the still version');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });

    await page.locator('#ploeg-team').selectOption('research');
    await page.locator('[data-work-row][data-id="110"]').waitFor();
    assert.equal(await page.locator('[data-work-row][data-id="109"]').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vloer.prefs')).team), 'research', 'the Team choice is remembered');
    await page.locator('#ploeg-team').selectOption('');
    await page.locator('[data-work-row][data-id="109"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vloer.prefs')).team), null);
    await page.locator('#ploeg-team').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('#ploeg-team')?.value === 'delivery' && !document.querySelector('.work-list-loading'));
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'ploeg-team', 'changing the Team from the keyboard keeps focus on the select');
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('#ploeg-team')?.value === '' && !document.querySelector('.work-list-loading'));
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'ploeg-team');
    await page.getByRole('button', { name: 'Refresh', exact: true }).focus();
    const before = overviewReads.length;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.work-refresh[aria-busy="true"]'));
    assert(overviewReads.length > before, 'Refresh reads the lists again');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'ploeg-refresh', 'Refresh keeps the keyboard focus');

    await page.route('**/api/ploeg?*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      if (new URL(route.request().url()).searchParams.get('team') === 'delivery' && data.lanes) data.lanes.needs_human.nextCursor = 'page-2';
      await route.fulfill({ response, json: data });
    });
    await page.route('**/api/ploeg/work-items?*', route => route.fulfill({ json: { items: [pageTwo], nextCursor: null } }));
    await lanes.getByRole('button', { name: /^Needs you/ }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Load more' }).click();
    await page.locator('[data-work-row][data-id="999"]').waitFor();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.work-refresh[aria-busy="true"]'));
    assert.equal(await page.locator('[data-work-row][data-id="999"]').count(), 1, 'a refresh keeps the Work Items that Load more added');
    assert.equal(await page.getByRole('button', { name: 'Load more' }).count(), 0, 'and remembers that the second page was the last');
    await page.unroute('**/api/ploeg?*');
    await page.unroute('**/api/ploeg/work-items?*');

    await page.route('**/api/bootstrap', async route => { const response = await route.fetch(); const data = await response.json(); data.mode = 'live'; await route.fulfill({ response, json: data }); });
    await page.route('**/api/ploeg/work-items/102', async route => { const response = await route.fetch(); const data = await response.json(); data.demo = false; await route.fulfill({ response, json: data }); });
    await page.route('**/api/ploeg/work-items/102/cancel', route => route.fulfill({ json: { workItemId: '102', team: 'delivery', state: 'withdrawn', demo: false, withdrawn: true, shiftId: '20', cancelledRuns: 0, stoppedRuns: 1, keysBlocked: false, message: '' } }));
    await page.goto(`http://127.0.0.1:${app.server.address().port}/#work/102?lane=leased`);
    await page.reload();
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    await page.getByRole('button', { name: 'Cancel Work Item' }).click();
    const live = page.getByRole('dialog', { name: 'Cancel this Work Item?' });
    await live.getByRole('button', { name: 'Cancel Work Item' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'work-cancel-result');
    assert.equal(await page.locator('#work-cancel-result').getAttribute('role'), 'status');
    assert.equal(await page.locator('#work-cancel-result .callout').getAttribute('data-tone'), 'attention', 'model keys that are not yet blocked are not a green result');
    await page.unroute('**/api/bootstrap');
    await page.unroute('**/api/ploeg/work-items/102');
    await page.unroute('**/api/ploeg/work-items/102/cancel');
  } finally {
    page.off('request', onRequest);
  }
}
