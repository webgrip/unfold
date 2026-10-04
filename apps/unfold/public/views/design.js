import { state } from '../core/state.js';
import { openPage } from '../core/navigation.js';
import { $, escape, renderHtml } from '../core/dom.js';
import { icon, icons } from '../core/icons.js';
import { markdown } from '../core/markdown.js';
import { money } from '../core/format.js';
import { applyAppearance } from '../core/prefs.js';
import * as ui from '../core/ui.js';
import { shell } from '../shell.js';

const tones = ['neutral', 'live', 'attention', 'review', 'success', 'danger', 'severe'];
const toneRoles = ['bg', 'bg-hover', 'border', 'fg', 'solid', 'emphasis'];
const colorGroups = [
  ['Brand primitives', ['vlak', 'peil', 'peil-diep', 'peil-donker', 'krijt', 'hal', 'stof', 'stof-licht']],
  ['Surfaces', ['bg-canvas', 'bg-surface', 'bg-surface-subtle', 'bg-sunken', 'bg-raised', 'bg-overlay', 'bg-inverse', 'bg-hover', 'bg-active', 'bg-selected', 'bg-selected-hover', 'bg-backdrop', 'bg-skeleton', 'bg-skeleton-shine', 'bg-track']],
  ['Text', ['text', 'text-muted', 'text-subtle', 'text-disabled', 'text-inverse', 'text-inverse-muted', 'text-on-solid']],
  ['Borders and focus', ['border-subtle', 'border', 'border-strong', 'border-control', 'border-control-strong', 'focus-ring']],
  ['Accent (Peil): interaction only', ['accent-fg', 'accent-fg-strong', 'accent-solid', 'accent-solid-hover', 'accent-solid-active', 'accent-graphic', 'accent-bg', 'accent-bg-hover', 'accent-border']],
  ...tones.map(tone => [`Tone: ${tone}`, toneRoles.map(role => `${tone}-${role}`)]),
];
const typeScale = [
  ['2xs', '11 / 16', 'Overlines and key hints only', 'Needs you', 'overline'],
  ['xs', '12 / 16', 'Meta, badges, table headers', 'Updated 5 min ago · webgrip/ploeg · Round 2'],
  ['sm', '13 / 20', 'Default interface text', 'Add a Dispatched-by-Ploeg note to the README'],
  ['md', '14 / 22', 'Prose: briefs, findings, dialogs', 'The reviewer asked for changes and this Team has no fix Rounds left.'],
  ['lg', '16 / 24', 'Section and panel titles', 'Ready for your review', 'semibold'],
  ['xl', '18 / 26', 'Detail and dialog titles', 'Cancel this Work Item?', 'title'],
  ['2xl', '22 / 28', 'Page titles', 'Work', 'title'],
  ['3xl', '28 / 34', 'Stat values', 'US$ 12,40', 'semibold'],
  ['4xl', '36 / 40', 'Sign-in and first run only', 'Welcome back.', 'title'],
  ['mono', '12 / 18', 'Ids, branches, SHAs', 'unfold/work-item-101 · 7f3c2a1', 'mono'],
];
const spaces = ['space-0-5', 'space-1', 'space-1-5', 'space-2', 'space-2-5', 'space-3', 'space-4', 'space-5', 'space-6', 'space-8', 'space-10', 'space-12', 'space-16'];
const radii = ['radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full'];
const shadows = ['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl'];
const workItemStates = ['proposed', 'ingested', 'queued', 'leased', 'awaiting_review', 'needs_human', 'stale', 'withdrawn', 'done'];
const sections = [
  ['design-colour', 'Colour'], ['design-type', 'Type'], ['design-space', 'Space and shape'], ['design-icons', 'Icons'], ['design-buttons', 'Buttons'],
  ['design-status', 'Status'], ['design-surfaces', 'Surfaces'], ['design-feedback', 'Feedback'], ['design-meters', 'Meters and stats'],
  ['design-navigation', 'Navigation'], ['design-data', 'Data'], ['design-lists', 'Lists'], ['design-overlays', 'Overlays'],
  ['design-progress', 'Progress'], ['design-forms', 'Forms'], ['design-text', 'Text'], ['design-classes', 'Class reference'],
];
const classReference = [
  ['.overline', 'Uppercase 11 px label above a title', 'text style'],
  ['.meta', '12 px secondary line', 'text style'],
  ['.prose', 'Rendered Markdown: briefs and findings, 14 px, 72ch', 'wrap markdown() output'],
  ['.button', 'Button or link styled as one; .primary .secondary .ghost .danger .danger-ghost; .xs .sm .lg; .icon-only; [aria-busy]', 'button(), iconButton()'],
  ['.spinner', 'Busy indicator inside a button; keeps turning under reduced motion', 'button({ busy })'],
  ['.badge', 'Status lozenge, glyph plus label; [data-tone]; .solid .outline .plain .sm', 'badge(), stateBadge()'],
  ['.state-badge / .state-reason', 'A state badge with the reason next to it', 'stateBadge(key, { reason })'],
  ['.chip', 'Metadata tag or reason; [data-tone]; link or button when interactive', 'chip()'],
  ['.count', 'Round count; [data-tone] fills it', 'count()'],
  ['.status-dot / .live-dot', 'Tone dot; the live dot pulses when motion is allowed', 'markup'],
  ['.card (.card-header .card-heading .card-title .card-subtitle .card-actions .card-body)', 'Bordered surface; .flush; [data-tone] tints the header; .interactive', 'card()'],
  ['.section (.section-header .section-heading .section-title .section-description .section-actions .section-body)', 'Titled page section', 'section()'],
  ['.page-header (.page-header-text .page-title .page-subtitle .page-meta .page-actions)', 'Page heading block with the single h1', 'pageHeader()'],
  ['.empty-state (.empty-state-icon .empty-state-title .empty-state-body .empty-state-actions)', 'First use, all clear, no results or error; .compact; [data-tone]', 'emptyState()'],
  ['.skeleton-wrap .skeleton-group .skeleton-row .skeleton-lines .skeleton (.title .text .pill .circle .block)', 'Loading placeholders; shimmer only when motion is allowed', 'skeleton()'],
  ['.peil-line', 'Indeterminate loading line under a header', 'markup'],
  ['.callout (.callout-icon .callout-content .callout-title .callout-body .callout-actions)', 'Inline notice in a tone', 'callout()'],
  ['.meter (.meter-label .meter-text .meter-caption .meter-value .meter-of .meter-end .meter-bar .meter-track .meter-settled .meter-reserved)', 'Budget meter; [data-level=warn|over], [data-unknown], [data-demo]; .sm .lg', 'meter()'],
  ['.stat-row / .stat (.stat-label .stat-value .stat-detail)', 'Stat tiles that summarise and link', 'stat()'],
  ['.kbd-group / .kbd', 'Key caps', 'kbd()'],
  ['.avatar', 'Person (round, initials) or [data-kind=agent] (square, bot); .sm .lg .xl; .avatar-stack', 'avatar()'],
  ['.tabs / .tab', 'ARIA tablist; the selected tab has the accent underline', 'tabs()'],
  ['.segmented / .segment', 'One filter or view switch; [aria-pressed] or [aria-current]', 'segmented()'],
  ['.disclosure (.disclosure-summary .disclosure-body)', 'Native details with a chevron; .plain', 'disclosure()'],
  ['.facts / .fact', 'Definition list as a grid; .rows for label and value rows', 'dl()'],
  ['.table-wrap / .table', 'Data table; sticky header, numeric .num right-aligned, row hover, [aria-selected]; .compact; .contained; .row-actions; .table-empty; .wrap', 'table()'],
  ['.toolbar (.toolbar-group .toolbar-spacer)', 'One wrapping row of controls', 'toolbar()'],
  ['.list / .list-row (.list-row-lead .list-row-main .list-row-title .list-row-meta .list-row-trail)', 'Two-line row; [aria-current] selected; [data-unread] dot; [data-tone] colours the lead', 'listRow()'],
  ['.toast-region / .toast (.toast-message .toast-actions)', 'Toasts on the inverse surface; [data-tone=success|info|danger]', 'markup'],
  ['.dialog (.dialog-frame .dialog-header .dialog-title .dialog-body .dialog-footer)', 'Modal dialog on <dialog>; .sm .lg', 'markup'],
  ['.drawer (.drawer-header .drawer-title .drawer-body .drawer-footer)', 'Side panel on <dialog>; .start opens from the left', 'markup'],
  ['.demo-note / .demo-note-tag', 'The one demo disclaimer', 'demoNote()'],
  ['.timeline / .timeline-item (.timeline-marker .timeline-content .timeline-title .timeline-meta)', 'Vertical event list', 'markup'],
  ['.steps / .step (.step-marker .step-label)', 'Horizontal stepper; [aria-current=step]; [data-tone]', 'markup'],
  ['.round-ladder / .round-cell (.round-cell-title .round-cell-meta)', 'Roles by Rounds grid as a table; [data-empty]', 'markup'],
  ['.field (.field-label .field-hint .field-error) / .field.inline', 'Form field layout; bare inputs are styled in base', 'markup'],
  ['.stack / .cluster (.gap-xs .gap-sm .gap-md .gap-lg .gap-xl)', 'Vertical and wrapping horizontal layout', 'utility'],
  ['.sr-only .num .mono .truncate .nowrap .muted .subtle', 'Utilities', 'utility'],
  ['[data-tone]', 'neutral, live, attention, review, success, danger, severe, accent: sets --tone-bg, --tone-border, --tone-fg, --tone-solid, --tone-emphasis', 'attribute'],
  ['[data-theme] [data-density] on <html>', 'light or dark; compact', 'attribute'],
];

const block = (id, title, description, body) => ui.section({ id, title, description, body: `<div class="section-body-inner stack gap-lg">${body}</div>` }).replace('class="section"', 'class="section design-block"');
const group = (title, body, note = '') => `<div class="design-group"><h3>${escape(title)}</h3>${body}${note ? `<p class="design-note">${escape(note)}</p>` : ''}</div>`;
const surface = (body, sunken = false) => `<div class="design-surface${sunken ? ' sunken' : ''}">${body}</div>`;
const row = (...items) => `<div class="design-row">${items.join('')}</div>`;
const listFrame = rows => `<div class="design-list" role="list">${rows.map(item => `<div role="listitem">${item}</div>`).join('')}</div>`;

let previewing = false;

function restoreOnLeave() {
  if (previewing) return;
  previewing = true;
  globalThis.addEventListener('hashchange', function restore() {
    if (location.hash === '#design') return;
    globalThis.removeEventListener('hashchange', restore);
    previewing = false;
    applyAppearance();
  });
}

function currentTheme() { return document.documentElement.dataset.theme || 'system'; }
function currentDensity() { return document.documentElement.dataset.density || 'comfortable'; }
function resolvedTheme() { return currentTheme() === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : currentTheme(); }

function controls() {
  const theme = currentTheme();
  const density = currentDensity();
  const pressed = on => `aria-pressed="${on ? 'true' : 'false'}"`;
  const themes = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([choice, label]) => `<button type="button" class="segment" data-action="design-theme" data-choice="${choice}" ${pressed(theme === choice)}>${label}</button>`).join('');
  const densities = [['comfortable', 'Comfortable'], ['compact', 'Compact']].map(([choice, label]) => `<button type="button" class="segment" data-action="design-density" data-choice="${choice}" ${pressed(density === choice)}>${label}</button>`).join('');
  return `<div class="cluster gap-md"><div class="segmented" role="group" aria-label="Preview theme">${themes}</div><div class="segmented" role="group" aria-label="Preview density">${densities}</div><span class="meta">Showing ${escape(resolvedTheme())} · ${escape(density)}. Preview only: nothing is saved, and leaving this page restores your own preference.</span></div>`;
}

function jumpNav() {
  return `<nav class="design-nav" aria-label="Style guide sections">${sections.map(([id, label]) => `<button type="button" class="chip" data-action="design-jump" data-target="${id}">${escape(label)}</button>`).join('')}</nav>`;
}

function colourBlock() {
  const swatch = token => `<li class="swatch"><span class="swatch-chip" data-demo-var="${token}"></span><span class="swatch-text"><span class="swatch-name">--${escape(token)}</span><span class="swatch-value" data-resolve="${token}"></span></span></li>`;
  const groups = colorGroups.map(([title, tokens]) => group(title, `<ul class="swatches">${tokens.map(swatch).join('')}</ul>`)).join('');
  const scheme = `<div class="design-scheme">${['light', 'dark'].map(scheme => `<div class="scheme-${scheme}"><span class="overline">color-scheme: ${scheme}</span><p class="meta">The same tokens resolve per element. The sidebar opts into dark this way.</p>${row(ui.badge({ tone: 'attention', glyph: 'alert', label: 'Needs you' }), ui.badge({ tone: 'review', glyph: 'pull-request', label: 'Ready for review' }), ui.button({ label: 'Primary', variant: 'primary', size: 'sm' }), ui.button({ label: 'Secondary', size: 'sm' }))}</div>`).join('')}</div>`;
  return block('design-colour', 'Colour', 'Every colour role is one light-dark() pair; the theme is chosen by color-scheme. Values below are resolved in the current theme.', `${groups}${group('Scoped schemes', scheme)}`);
}

function typeBlock() {
  const rows = typeScale.map(([size, metric, use, sample, style = '']) => `<li class="type-row"><div><div class="swatch-name">--text-${escape(size)}</div><div class="meta">${escape(metric)} · ${escape(use)}</div></div><div class="type-sample" data-demo-size="${size}"${style === 'overline' ? ' data-overline' : style === 'mono' ? ' data-mono' : style ? ` data-weight="${style}"` : ''}>${escape(sample)}</div></li>`).join('');
  return block('design-type', 'Type', 'Archivo at width 110. 13 px interface text, 14 px prose, nothing under 12 px except overlines and key hints. Numbers are tabular.', `<ul class="type-scale">${rows}</ul>`);
}

function spaceBlock() {
  const spaceRows = spaces.map(token => `<li class="scale-item"><span class="swatch-name">--${token}</span><span class="space-bar" data-demo-var="${token}"></span></li>`).join('');
  const radiusRows = radii.map(token => `<div class="shape-sample radius"><span data-demo-var="${token}"></span><span class="swatch-name">--${token}</span></div>`).join('');
  const shadowRows = shadows.map(token => `<div class="shape-sample shadow"><span data-demo-var="${token}"></span><span class="swatch-name">--${token}</span></div>`).join('');
  return block('design-space', 'Space and shape', 'A 4 px spacing base, five radii and four elevations. Density changes row height and padding through the --density-* tokens.', `${group('Space', `<ul class="scale-list">${spaceRows}</ul>`)}${group('Radius', `<div class="shape-samples">${radiusRows}</div>`)}${group('Elevation', surface(`<div class="shape-samples">${shadowRows}</div>`, true))}`);
}

function iconBlock() {
  const cells = Object.keys(icons).map(name => `<li class="icon-cell">${icon(name)}<span>${escape(name)}</span></li>`).join('');
  return block('design-icons', 'Icons', 'In-house glyphs on a 24 grid with a 1.75 stroke. They inherit the text colour. Use icon(name, cls) from core/icons.js.', `<ul class="icon-grid">${cells}</ul>`);
}

function buttonBlock() {
  const variants = row(ui.button({ label: 'Approve', variant: 'primary', icon: 'check' }), ui.button({ label: 'Refresh', icon: 'refresh' }), ui.button({ label: 'Cancel', variant: 'ghost' }), ui.button({ label: 'Cancel Work Item', variant: 'danger' }), ui.button({ label: 'Withdraw', variant: 'danger-ghost' }));
  const sizesRow = row(ui.button({ label: 'Extra small', size: 'xs' }), ui.button({ label: 'Small', size: 'sm' }), ui.button({ label: 'Medium' }), ui.button({ label: 'Large', size: 'lg', variant: 'primary' }));
  const iconOnly = row(ui.iconButton({ icon: 'x', label: 'Close' }), ui.iconButton({ icon: 'more', label: 'More actions', variant: 'secondary' }), ui.iconButton({ icon: 'copy', label: 'Copy link', variant: 'secondary', size: 'sm' }), ui.iconButton({ icon: 'refresh', label: 'Refresh', variant: 'primary' }));
  const states = row(ui.button({ label: 'Disabled', disabled: true }), ui.button({ label: 'Disabled primary', variant: 'primary', disabled: true }), ui.button({ label: 'Refreshing', busy: true }), ui.button({ label: 'Saving', variant: 'primary', busy: true }), ui.button({ label: 'New session', variant: 'primary', icon: 'plus', kbd: 'N' }), ui.button({ label: 'Search', icon: 'search', kbd: ['Ctrl', 'K'] }));
  const links = row(ui.button({ label: 'Open Work Item', href: '#design', icon: 'arrow' }), ui.button({ label: 'Open pull request', href: 'https://example.org/webgrip/ploeg/pulls/42', external: true, variant: 'primary', icon: 'pull-request' }), ui.button({ label: 'Unsafe link', href: 'javascript:alert(1)' }));
  return block('design-buttons', 'Buttons', 'One primary per region, last in a dialog footer. Destructive confirms use danger with focus on the safe button. A link with an unsafe URL renders disabled.', `${group('Variants', surface(variants))}${group('Sizes', surface(sizesRow))}${group('Icon only', surface(iconOnly), 'The label becomes the accessible name and tooltip.')}${group('States and hints', surface(states), 'Busy buttons are disabled and set aria-busy. Key hints are hidden from the accessible name.')}${group('Links', surface(links), 'External links open a new tab with rel="noopener noreferrer".')}`);
}

function statusBlock() {
  const toneBadges = row(...[['neutral', 'circle-dashed', 'Queued'], ['live', 'circle-half', 'Running'], ['attention', 'alert', 'Needs you'], ['review', 'pull-request', 'Ready for review'], ['success', 'check-circle', 'Done'], ['danger', 'x-circle', 'Failed'], ['severe', 'clock', 'Stopped retrying'], ['accent', 'info', 'Accent']].map(([tone, glyph, label]) => ui.badge({ tone, glyph, label })));
  const styles = row(ui.badge({ tone: 'attention', glyph: 'alert', label: 'Needs you', style: 'solid' }), ui.badge({ tone: 'danger', glyph: 'x-circle', label: 'Failed', style: 'solid' }), ui.badge({ tone: 'live', glyph: 'circle-half', label: 'Outline', style: 'outline' }), ui.badge({ tone: 'success', glyph: 'check-circle', label: 'Plain', style: 'plain' }), ui.badge({ tone: 'review', glyph: 'pull-request', label: 'Small', size: 'sm' }), ui.badge({ label: 'Text only' }));
  const states = row(...workItemStates.map(key => ui.stateBadge(key)));
  const reasons = `<div class="stack gap-sm">${ui.stateBadge('needs_human', { reason: 'Budget ran out' })}${ui.stateBadge('needs_human', { reason: 'Reviewer still wants changes' })}${ui.stateBadge('stale', { reason: 'Cluster kept stopping the writer (not the Work Item’s fault)' })}</div>`;
  const chips = row(ui.chip({ label: 'webgrip/ploeg', icon: 'branch' }), ui.chip({ label: 'delivery' }), ui.chip({ label: 'vikunja · 624', icon: 'hash' }), ui.chip({ label: 'Reviewer still wants changes', tone: 'attention' }), ui.chip({ label: 'Not routed', tone: 'severe', icon: 'alert', title: 'Ploeg could not resolve the repository' }), ui.chip({ label: 'Round 2', tone: 'review' }), ui.chip({ label: 'Open in tracker', href: 'https://example.org/tasks/624', external: true, icon: 'external' }));
  const counts = row(ui.count(3), ui.count(12), ui.count(128), ui.count(5, { tone: 'attention', label: '5 waiting on you' }), ui.count(2, { tone: 'review' }), ui.count(1, { tone: 'danger' }), `<span class="meta">count(null) renders nothing: unknown is not zero.</span>`);
  const dots = row(...tones.map(tone => `<span class="cluster gap-xs"><span class="status-dot" data-tone="${tone}"></span><span class="meta">${tone}</span></span>`), `<span class="cluster gap-xs"><span class="live-dot"></span><span class="meta">live dot</span></span>`);
  return block('design-status', 'Status', 'Seven tones, each with a glyph and a word: status is never colour alone. Accent blue is for interaction only.', `${group('Badges by tone', surface(toneBadges))}${group('Badge styles', surface(styles))}${group('Work Item states', surface(states), 'stateBadge(key) reads the shared vocabulary. Running shows the live dot, which pulses only when motion is allowed.')}${group('State with reason', surface(reasons))}${group('Chips', surface(chips))}${group('Counts', surface(counts))}${group('Dots', surface(dots))}`);
}

function surfaceBlock() {
  const cardPlain = ui.card({ id: 'design-card-plain', title: 'Shift 11', subtitle: 'Round 2 of the delivery plan', actions: ui.iconButton({ icon: 'more', label: 'Shift actions', size: 'sm' }), body: '<p class="muted">A card groups one thing. The body is HTML built from the other builders.</p>', level: 3 });
  const cardTone = ui.card({ id: 'design-card-tone', title: 'Why this needs you', icon: 'alert', tone: 'attention', body: `<div class="stack gap-sm"><p>Every planned Round ran, but no writer reported a pull request.</p><div class="cluster">${ui.button({ label: 'Open in tracker', variant: 'primary', size: 'sm', icon: 'external' })}${ui.button({ label: 'Copy link', size: 'sm', icon: 'copy' })}</div></div>`, level: 3 });
  const cardFlush = ui.card({ id: 'design-card-flush', title: 'Recently finished', subtitle: 'flush: no body padding', body: [ui.listRow({ title: 'Update the pricing page copy', lead: icon('check-circle'), tone: 'success', trail: '12 min ago', meta: ui.chip({ label: 'webgrip/site' }) }), ui.listRow({ title: 'Remove the legacy importer', lead: icon('x-circle'), tone: 'danger', trail: '1 h ago', meta: 'Failed' })], flush: true, level: 3 });
  const sectionSample = ui.section({ id: 'design-section-sample', title: 'Ready for your review', count: 2, description: 'Pull requests the agents finished. Review them in the forge.', actions: ui.button({ label: 'Open all', size: 'sm' }), body: '<p class="meta">section() body</p>', level: 3 });
  const header = ui.pageHeader({ overline: 'Ploeg · delivery', title: 'Work', subtitle: 'Work Items of a Team, one lane at a time.', actions: `${ui.button({ label: 'Refresh', icon: 'refresh' })}${ui.button({ label: 'New Work Item', variant: 'primary', icon: 'plus' })}`, meta: `${ui.stateBadge('needs_human')}<span>Updated 12 s ago</span>` }).replace('<h1 class="page-title" tabindex="-1">', '<p class="page-title">').replace('</h1>', '</p>');
  return block('design-surfaces', 'Surfaces', 'Cards, sections and the page header. pageHeader() renders the page’s only h1; the sample below shows it as text.', `${group('Page header', surface(header, true))}${group('Section', surface(sectionSample))}${group('Cards', `<div class="design-grid">${cardPlain}${cardTone}${cardFlush}</div>`)}`);
}

function feedbackBlock() {
  const empties = `<div class="design-grid">${ui.card({ body: ui.emptyState({ icon: 'inbox', title: 'No Work Items yet', body: 'Assign a task to a Team in your tracker. It appears here when Ploeg picks it up.', compact: true }) })}${ui.card({ body: ui.emptyState({ icon: 'check-circle', tone: 'success', title: 'Nothing needs you', body: 'Ploeg is working. Decisions show up here first.', compact: true }) })}${ui.card({ body: ui.emptyState({ icon: 'search', title: 'No Work Items match', body: 'Try another lane or Team.', actions: ui.button({ label: 'Clear filters', size: 'sm' }), compact: true }) })}${ui.card({ body: ui.emptyState({ icon: 'x-circle', tone: 'danger', title: 'Could not load Runs', body: 'Ploeg did not answer within 10 s.', actions: ui.button({ label: 'Try again', size: 'sm', icon: 'refresh' }), compact: true }) })}</div>`;
  const skeletons = `<div class="design-grid">${['list', 'text', 'table', 'cards'].map(variant => ui.card({ title: `skeleton({ variant: '${variant}' })`, level: 3, body: ui.skeleton({ rows: 3, variant }) })).join('')}</div>`;
  const callouts = `<div class="stack gap-sm">${[['neutral', 'Ploeg is the engine', 'Unfold shows what it does and asks you when it stops.'], ['accent', 'New: keyboard shortcuts', 'Press ? to see them.'], ['live', 'Running now', 'Two Runs are working on this Work Item.'], ['attention', 'Budget ran out', 'Raise the Team budget or split the ticket, then assign the task to the Team again.'], ['review', 'Agent review is not human review', 'Read the pull request yourself before you merge.'], ['success', 'Approved', 'The proposal is queued for its Team.'], ['severe', 'Stopped retrying', 'The cluster kept stopping the writer. Check the nodes, not the ticket.'], ['danger', 'Cancel failed', 'Ploeg refused: a session owns this Work Item.']].map(([tone, title, body]) => ui.callout({ tone, title, body: `<p>${escape(body)}</p>` })).join('')}${ui.callout({ tone: 'attention', title: 'With actions', body: '<p>Actions sit on the right and wrap under the text on phones.</p>', actions: `${ui.button({ label: 'Open in tracker', size: 'sm' })}${ui.button({ label: 'Dismiss', size: 'sm', variant: 'ghost' })}` })}${ui.callout({ tone: 'neutral', icon: null, body: '<p>A callout without a glyph.</p>' })}</div>`;
  const loading = `<div class="stack gap-sm"><div class="peil-line" role="presentation"></div><p class="design-note">peil-line: the floor line as an indeterminate progress bar; static under reduced motion.</p></div>`;
  const toasts = `<div class="design-toasts"><div class="toast" data-tone="success" role="status">${icon('check-circle')}<span class="toast-message">Work Item approved. It is queued for delivery.</span></div><div class="toast" data-tone="info" role="status">${icon('info')}<span class="toast-message">Live updates paused.</span></div><div class="toast" data-tone="danger" role="status">${icon('x-circle')}<span class="toast-message">Refresh failed. Ploeg did not answer.</span><div class="toast-actions">${ui.button({ label: 'Retry', size: 'sm', variant: 'ghost' })}</div></div></div>`;
  return block('design-feedback', 'Feedback', 'Empty states say what to do next. Skeletons appear after a short delay with aria-busy on their region. Toasts use the inverse surface; errors persist.', `${group('Empty states', empties)}${group('Skeletons', skeletons)}${group('Callouts', callouts)}${group('Toasts', surface(toasts, true), 'Samples are static; the live region is #toast.')}${group('Loading line', surface(loading))}`);
}

function meterBlock() {
  const meters = [
    ['Settled and reserved', { settled: 1.2, reserved: 0.5, authorized: 3 }],
    ['Near the budget', { settled: 2.7, reserved: 0, authorized: 3 }],
    ['Reservations near the budget', { settled: 0.4, reserved: 2.2, authorized: 3 }],
    ['Over budget', { settled: 3.4, reserved: 0, authorized: 3 }],
    ['Nothing spent yet', { settled: 0, reserved: 0, authorized: 2.5 }],
    ['Spend not reported', { settled: null, authorized: 3 }],
    ['No budget reported', { settled: 1.2, authorized: null }],
    ['Demo', { demo: true, authorized: 2.5 }],
  ].map(([title, options]) => `<div class="design-surface"><span class="overline">${escape(title)}</span>${ui.meter(options)}</div>`).join('');
  const sizes = `<div class="stack">${ui.meter({ settled: 1.2, reserved: 0.5, authorized: 3, size: 'sm', label: '' })}${ui.meter({ settled: 1.2, reserved: 0.5, authorized: 3 })}${ui.meter({ settled: 1.2, reserved: 0.5, authorized: 3, size: 'lg', label: 'Shift budget' })}</div>`;
  const stats = `<div class="stat-row">${ui.stat({ label: 'Waiting on you', value: 5, detail: '2 ready for review · 3 need you', href: '#design', tone: 'attention', icon: 'alert' })}${ui.stat({ label: 'Running', value: 2, detail: 'Across 2 Teams', tone: 'live', icon: 'runs' })}${ui.stat({ label: 'Queued', value: 7, detail: 'Oldest created 2 d ago', icon: 'circle-dashed' })}${ui.stat({ label: 'Spend in 24 h', value: money(12.4), detail: 'Settled; 2 Runs not reported', icon: 'coins' })}</div>`;
  return block('design-meters', 'Meters and stats', 'Budget meters draw settled spend solid and reserved spend lighter against the authorization, from SVG attributes. Unknown spend is hatched and says so; it is never zero.', `${group('Meter states', `<div class="design-grid">${meters}</div>`)}${group('Meter sizes', surface(sizes))}${group('Stat tiles', stats, 'Stat tiles summarise and link. They are never a second navigation.')}`);
}

function navigationBlock() {
  const items = [{ id: 'stream', label: 'Stream', icon: 'terminal', selected: true }, { id: 'diff', label: 'Changes', icon: 'code', count: 3 }, { id: 'test', label: 'Checks', icon: 'check-circle', count: 1 }, { id: 'gateway', label: 'Gateway', icon: 'globe' }];
  const panels = items.map(item => `<div role="tabpanel" id="design-tabs-panel-${item.id}" aria-labelledby="design-tabs-tab-${item.id}" class="design-note"${item.selected ? '' : ' hidden'}>Panel for ${escape(item.label)}.</div>`).join('');
  const tabsSample = `${ui.tabs({ id: 'design-tabs', label: 'Session evidence', items })}${panels}`;
  const lanes = ui.segmented({ label: 'Lane', items: [{ id: 'needs_human', label: 'Needs you', count: 3, selected: true }, { id: 'awaiting_review', label: 'Ready for review', count: 2 }, { id: 'leased', label: 'Running', count: 1 }, { id: 'queued', label: 'Queued', count: 4 }, { id: 'all', label: 'All', count: 10 }] });
  const windows = ui.segmented({ label: 'Window', items: [{ id: '24h', label: '24 h', href: '#design', selected: true }, { id: '7d', label: '7 d', href: '#design' }, { id: '30d', label: '30 d', href: '#design' }] });
  const bar = ui.toolbar([`<label class="field inline"><span class="field-label">Team</span><select aria-label="Team"><option>delivery</option><option>platform</option></select></label>`, lanes, '<span class="toolbar-spacer"></span>', ui.iconButton({ icon: 'refresh', label: 'Refresh', variant: 'secondary', size: 'sm' })]);
  const disclosures = `<div class="stack gap-sm">${ui.disclosure({ summary: 'Technical details', body: ui.dl([['Work Item', '<span class="mono">101</span>'], ['Lease', 'none'], ['Next eligible', ui.timeAt('2026-09-30T21:30:00Z')]]) })}${ui.disclosure({ summary: 'Raw event', body: '<pre class="mono">{ "action": "work_item.needs_human" }</pre>', open: true })}${ui.disclosure({ summary: 'Show the agent prompt', body: '<p class="meta">A plain disclosure for inline "show more".</p>', plain: true })}</div>`;
  return block('design-navigation', 'Navigation', 'Tabs switch panels inside a view (ARIA tablist; the view handles arrow keys). A segmented control holds one filter. Each page has at most one row of filters.', `${group('Tabs', surface(tabsSample))}${group('Segmented control', surface(`<div class="stack">${lanes}${windows}</div>`))}${group('Toolbar', surface(bar))}${group('Disclosure', disclosures)}`);
}

function dataBlock() {
  const facts = ui.dl([['Team', 'delivery'], ['Repository', ui.chip({ label: 'webgrip/ploeg', icon: 'branch' })], ['Attempts', '2 of 3'], ['Updated', ui.timeAgo(new Date(Date.now() - 5 * 60000).toISOString())], ['Spend', `<span class="num">${escape(money(1.2))}</span>`], ['Pull request', null]]);
  const factRows = ui.dl([['Branch', '<span class="mono">unfold/work-item-101</span>'], ['Lease', 'Held by worker-3 until 21:40'], ['Created', ui.timeAt('2026-09-28T08:12:00Z')]], { rows: true });
  const columns = [{ key: 'run', label: 'Run' }, { key: 'role', label: 'Role' }, { key: 'state', label: 'State' }, { key: 'spend', label: 'Spend', numeric: true }, { key: 'duration', label: 'Duration', numeric: true }];
  const runs = [
    { run: '<span class="mono">run-41</span>', role: 'writer', state: ui.stateBadge('run:running'), spend: escape(money(0.42)), duration: '4 min' },
    { run: '<span class="mono">run-40</span>', role: 'reviewer', state: ui.badge({ tone: 'attention', glyph: 'alert', label: 'Changes requested' }), spend: escape(money(1.07)), duration: '12 min' },
    { run: '<span class="mono">run-39</span>', role: 'writer', state: ui.badge({ tone: 'success', glyph: 'pull-request', label: 'Opened a pull request' }), spend: escape(money(0.88)), duration: '9 min' },
    { run: '<span class="mono">run-38</span>', role: 'writer', state: ui.badge({ tone: 'danger', glyph: 'x-circle', label: 'Failed' }), spend: '<span class="subtle">Not reported</span>', duration: '45 s' },
  ];
  const runsTable = ui.table({ caption: 'Runs of Work Item 101', columns, rows: runs });
  const compactTable = ui.table({ caption: 'Compact Runs table', columns, rows: runs.slice(0, 2), compact: true });
  const emptyTable = ui.table({ caption: 'Runs with no rows', columns, rows: [], empty: ui.emptyState({ icon: 'runs', title: 'No Runs in this window', compact: true }) });
  const ladder = `<div class="table-wrap" role="region" tabindex="0" aria-label="Round ladder"><table class="round-ladder"><caption class="sr-only">Roles by Rounds</caption><thead><tr><td></td><th scope="col">Round 1</th><th scope="col">Round 2</th><th scope="col">Round 3</th></tr></thead><tbody>
    <tr><th scope="row">writer</th><td><div class="round-cell" data-tone="success"><span class="round-cell-title">${icon('pull-request')}Opened a pull request</span><span class="round-cell-meta">${escape(money(0.88))} · 9 min</span></div></td><td><div class="round-cell" data-tone="success"><span class="round-cell-title">${icon('pull-request')}Updated the pull request</span><span class="round-cell-meta">${escape(money(0.42))} · 4 min</span></div></td><td><div class="round-cell" data-empty><span class="round-cell-meta">Not run</span></div></td></tr>
    <tr><th scope="row">reviewer</th><td><div class="round-cell" data-tone="attention"><span class="round-cell-title">${icon('alert')}Changes requested</span><span class="round-cell-meta">${escape(money(1.07))} · 12 min</span></div></td><td><div class="round-cell" data-tone="live"><span class="round-cell-title"><span class="live-dot"></span>Running</span><span class="round-cell-meta">Not reported · 3 min</span></div></td><td><div class="round-cell" data-empty><span class="round-cell-meta">Not run</span></div></td></tr>
  </tbody></table></div>`;
  return block('design-data', 'Data', 'Facts as definition lists; tables with a sticky header, right-aligned tabular numbers and no zebra striping; the Round ladder as a table of Roles by Rounds.', `${group('Definition list', surface(facts), 'A missing value shows a dash, never an invented zero.')}${group('Definition rows', surface(factRows))}${group('Table', `<div class="card flush">${runsTable}</div>`)}${group('Compact and empty tables', `<div class="design-grid wide"><div class="card flush">${compactTable}</div><div class="card flush">${emptyTable}</div></div>`)}${group('Round ladder', surface(ladder))}`);
}

function listBlock() {
  const ago = minutes => ui.timeAgo(new Date(Date.now() - minutes * 60000).toISOString());
  const rows = [
    ui.listRow({ href: '#design', selected: true, tone: 'attention', lead: icon('alert'), title: 'Add a Dispatched-by-Ploeg note to the README', meta: `${ui.chip({ label: 'Budget ran out', tone: 'attention' })}${ui.chip({ label: 'webgrip/erfbeeld', icon: 'branch' })}<span>Round 2</span>`, trail: ago(130) }),
    ui.listRow({ href: '#design', tone: 'attention', lead: icon('alert'), title: 'README: document how a ticket reaches this repository', meta: `${ui.chip({ label: 'Every Round ran, no result', tone: 'attention' })}${ui.chip({ label: 'Not routed', tone: 'attention', icon: 'alert' })}`, trail: ago(2900), data: { unread: true } }),
    ui.listRow({ href: '#design', tone: 'live', lead: '<span class="live-dot"></span>', title: 'Implement fair-share claiming in the lease broker', meta: `${ui.chip({ label: 'webgrip/ploeg', icon: 'branch' })}<span>writer · Round 2</span>`, trail: ago(4) }),
    ui.listRow({ href: '#design', tone: 'review', lead: icon('pull-request'), title: 'E2E: document the forge id on a routing rule', meta: `${ui.chip({ label: 'PR #42', icon: 'pull-request' })}<span>Agent review: approve</span>`, trail: ago(61) }),
    ui.listRow({ title: 'A plain row without a link or action', meta: '<span>listRow() renders a div when there is nothing to open</span>' }),
  ];
  return block('design-lists', 'Lists', 'Two-line rows: glyph, title, one meta line and a trailing time. The selected row has the tint and the Peil bar; focus is drawn inside the row so it is never clipped.', `${group('List rows', listFrame(rows), 'The second row carries data-unread.')}`);
}

function overlayBlock() {
  const sample = `<div class="dialog sm design-dialog-sample"><div class="dialog-frame"><header class="dialog-header"><p class="dialog-title">Stop this Run?</p>${ui.iconButton({ icon: 'x', label: 'Close', size: 'sm' })}</header><div class="dialog-body"><p>The agent stops after its current tool call. Spend so far stays recorded.</p></div><footer class="dialog-footer">${ui.button({ label: 'Keep running' })}${ui.button({ label: 'Stop Run', variant: 'danger' })}</footer></div></div>`;
  const openers = `<div class="cluster"><button type="button" class="button secondary" data-action="design-dialog">${icon('panel')}<span class="button-label">Open a dialog</span></button><button type="button" class="button secondary" data-action="design-drawer">${icon('panel')}<span class="button-label">Open a drawer</span></button></div>`;
  const dialog = `<dialog id="design-dialog" class="dialog" aria-labelledby="design-dialog-title"><form method="dialog"><header class="dialog-header"><h2 id="design-dialog-title">Cancel this Work Item?</h2><button type="submit" class="button ghost icon-only sm" value="close" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"><p>Cancelling stops its running Runs, blocks their model keys, revokes the forge tokens and comments on the tracker item.</p>${ui.dl([['Spend so far', ui.meter({ settled: 0.84, reserved: 0.3, authorized: 1.5 })], ['Not yet reported', ui.meter({ settled: null, authorized: 1.5, size: 'sm' })]], { rows: true })}${ui.callout({ tone: 'attention', title: 'This cannot be undone', body: '<p>Assign the task to the Team again to retry.</p>' })}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="keep" autofocus>Keep it</button><button type="submit" class="button danger" value="cancel">Cancel Work Item</button></footer></form></dialog>`;
  const drawer = `<dialog id="design-drawer" class="drawer" aria-labelledby="design-drawer-title"><header class="drawer-header"><h2 id="design-drawer-title">Run 41</h2><form method="dialog"><button type="submit" class="button ghost icon-only sm" aria-label="Close" title="Close">${icon('x')}</button></form></header><div class="drawer-body stack">${ui.dl([['State', ui.stateBadge('queued')], ['Role', 'writer'], ['Round', '2'], ['Model', 'demo'], ['Spend', ui.meter({ settled: 0.42, reserved: 0.3, authorized: 1.5, size: 'sm' })], ['Checks', '<progress value="3" max="5" aria-label="Checks finished">3 of 5</progress>']], { rows: true })}<div aria-busy="true">${ui.skeleton({ rows: 2, variant: 'text' })}</div>${ui.disclosure({ summary: 'Findings', body: markdown('The reviewer asked for **one** change:\n- add a test for `nl-NL` rounding') , open: true })}</div><footer class="drawer-footer"><form method="dialog" class="cluster">${ui.button({ label: 'Retry', disabled: true, title: 'Disabled in the demo' })}<button type="submit" class="button primary">Done</button></form></footer></dialog>`;
  return block('design-overlays', 'Overlays', 'Dialogs and drawers are native <dialog> elements opened with showModal(): top layer, inert page, Esc closes, focus returns to the opener.', `${group('Dialog anatomy', surface(sample, true))}${group('Live overlays', surface(openers))}${dialog}${drawer}`);
}

function progressBlock() {
  const timeline = `<ol class="timeline">${[
    ['success', 'check-circle', 'Writer opened a pull request', '2026-09-30T08:42:00Z'],
    ['attention', 'alert', 'Reviewer asked for changes', '2026-09-30T09:05:00Z'],
    ['live', '', 'Writer is fixing Round 2', '2026-09-30T09:20:00Z'],
    ['neutral', '', 'Waiting for the reviewer', ''],
  ].map(([tone, glyph, title, at]) => `<li class="timeline-item" data-tone="${tone}"><span class="timeline-marker">${glyph ? icon(glyph) : ''}</span><div class="timeline-content"><span class="timeline-title">${escape(title)}</span><span class="timeline-meta">${at ? ui.timeAt(at) : 'Not yet'}</span></div></li>`).join('')}</ol>`;
  const steps = `<ol class="steps" aria-label="Crew progress">${[
    ['success', 'check', 'Implement', false],
    ['success', 'check', 'Review', false],
    ['', '', 'Fix', true],
    ['', '', 'Review again', false],
    ['', '', 'Deliver', false],
  ].map(([tone, glyph, label, current]) => `<li class="step"${tone ? ` data-tone="${tone}"` : ''}${current ? ' aria-current="step"' : ''}><span class="step-marker" aria-hidden="true">${glyph ? icon(glyph) : ''}</span><span class="step-label">${escape(label)}</span></li>`).join('')}</ol>`;
  const natives = `<div class="stack gap-sm"><label class="stack gap-xs"><span class="meta">Checks finished, 3 of 5</span><progress value="3" max="5">3 of 5</progress></label><label class="stack gap-xs"><span class="meta">Context window, 82 %</span><meter value="0.82" low="0.7" high="0.9" optimum="0">82 %</meter></label></div>`;
  return block('design-progress', 'Progress', 'A vertical timeline for events and a stepper for crew progress. Both are plain lists with CSS. Native progress and meter share the translucent track that stays visible on every surface.', `${group('Timeline', surface(timeline))}${group('Steps', surface(steps), 'Stacks vertically under 640 px.')}${group('Native progress and meter', surface(natives))}`);
}

function formBlock() {
  const fields = `<div class="design-form">
    <div class="field"><label class="field-label" for="design-title">Title</label><input id="design-title" type="text" value="Review the rounding acceptance criteria"><span class="field-hint">What the crew should achieve.</span></div>
    <div class="field"><label class="field-label" for="design-budget">Budget · USD</label><input id="design-budget" type="number" min="0" step="0.25" value="2.50"><span class="field-hint">Authorized per Shift.</span></div>
    <div class="field"><label class="field-label" for="design-search">Search</label><input id="design-search" type="search" placeholder="Search Work Items"></div>
    <div class="field"><label class="field-label" for="design-team">Team</label><select id="design-team"><option>delivery</option><option>platform</option></select></div>
    <div class="field"><label class="field-label" for="design-invalid">Account name</label><input id="design-invalid" type="text" value="ryan" aria-invalid="true" aria-describedby="design-invalid-error"><span class="field-error" id="design-invalid-error">Sign-in failed. Check the name and password.</span></div>
    <div class="field"><label class="field-label" for="design-disabled">Repository</label><input id="design-disabled" type="text" value="webgrip/ploeg" disabled><span class="field-hint">Fixed by the Team.</span></div>
    <div class="field"><label class="field-label" for="design-notes">Reason</label><textarea id="design-notes" rows="3" placeholder="Tell the proposer why"></textarea></div>
    <fieldset class="field"><legend class="field-label">Theme</legend><div class="design-choices"><label><input type="radio" name="design-radio" checked> System</label><label><input type="radio" name="design-radio"> Light</label><label><input type="radio" name="design-radio" disabled> Dark (disabled)</label></div></fieldset>
    <fieldset class="field"><legend class="field-label">Notify me about</legend><div class="design-choices"><label><input type="checkbox" checked> Ready for review</label><label><input type="checkbox"> Needs you</label><label><input type="checkbox" disabled checked> Proposed (disabled)</label></div></fieldset>
    <fieldset class="field"><legend class="field-label">Preferences</legend><div class="design-choices"><label><input type="checkbox" role="switch" checked> Live updates</label><label><input type="checkbox" role="switch"> Single-key shortcuts</label><label><input type="checkbox" role="switch" disabled> Desktop notifications (disabled)</label></div></fieldset>
  </div>`;
  return block('design-forms', 'Forms', 'Bare inputs, selects, textareas, checkboxes, radios and role="switch" checkboxes are styled in base.css; .field lays out a label, control, hint and error.', surface(fields));
}

function textBlock() {
  const prose = markdown('### Brief\nAdd a short note to the README that says this repository is **dispatched by Ploeg**.\n\n- Mention the Team that owns it\n- Link the [routing guide](https://example.org/docs/routing)\n- Keep it under 80 words\n\n```sh\nmise run docs-check\n```\nUse `nl-NL` formatting for amounts.');
  const styles = `<div class="stack gap-sm"><p class="overline">Overline</p><p class="meta">Meta line · 12 px · subtle</p><p class="muted">Muted text for secondary copy.</p><p class="subtle">Subtle text for tertiary copy.</p><p><span class="mono">mono · run-41 · 7f3c2a1</span></p><p>Numbers use <span class="num">tabular 1.234,50</span>; links in text <a href="https://example.org">look like this</a>; <kbd class="kbd">?</kbd> ${ui.kbd('g n')} ${ui.kbd(['Ctrl', 'K'])} ${ui.kbd('⌘ K')}</p><p class="truncate">A truncated line keeps its layout at any width by cutting the text off with an ellipsis instead of wrapping onto a second line.</p></div>`;
  const avatars = row(ui.avatar({ name: 'Ryan Grippeling' }), ui.avatar({ name: 'Marit Vos', size: 'lg' }), ui.avatar({ name: 'browser-operator', size: 'sm' }), ui.avatar({ name: 'writer', kind: 'agent' }), ui.avatar({ name: 'reviewer', kind: 'agent', size: 'lg' }), ui.avatar({ name: 'devops', kind: 'agent', size: 'xl' }), `<span class="avatar-stack">${ui.avatar({ name: 'Ryan Grippeling' })}${ui.avatar({ name: 'Joost de Vries' })}${ui.avatar({ name: 'Sanne Bakker' })}</span>`);
  return block('design-text', 'Text', 'Prose for rendered Markdown, text utilities, key caps, avatars (people round, agents square) and the demo note.', `${group('Prose', surface(`<div class="prose">${prose}</div>`))}${group('Text styles and utilities', surface(styles))}${group('Avatars', surface(avatars))}${group('Demo note', surface(`${ui.demoNote()}${ui.demoNote('Spend is illustrative. Demo · no model calls.')}`))}`);
}

function classBlock() {
  const rows = classReference.map(([name, purpose, builder]) => ({ name: escape(name), purpose: escape(purpose), builder: `<span class="mono">${escape(builder)}</span>` }));
  const markup = ui.table({ caption: 'Component classes', columns: [{ key: 'name', label: 'Class' }, { key: 'purpose', label: 'What it is' }, { key: 'builder', label: 'Built by' }], rows }).replace('<table class="table"', '<table class="table design-class-table"').replaceAll('<td>', '<td class="wrap">');
  return block('design-classes', 'Class reference', 'Every class the component layer defines. Views compose these; view-specific styles live in styles/<view>.css.', `<div class="card flush">${markup}</div>`);
}

let followingScheme = false;

function renderDesign() {
  if (!followingScheme) {
    followingScheme = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.view === 'design') renderDesign(); });
  }
  const intro = `<div class="design-intro"><p>The living style guide for Unfold: tokens, type and every component the views build with, in the current theme. Use it to check a change in light and dark before it ships.</p>${controls()}${jumpNav()}</div>`;
  const content = `<div class="design-page">${intro}${colourBlock()}${typeBlock()}${spaceBlock()}${iconBlock()}${buttonBlock()}${statusBlock()}${surfaceBlock()}${feedbackBlock()}${meterBlock()}${navigationBlock()}${dataBlock()}${listBlock()}${overlayBlock()}${progressBlock()}${formBlock()}${textBlock()}${classBlock()}</div>`;
  renderHtml(shell(content, { title: 'Design system', subtitle: 'Tokens and components, in the current theme.' }));
  applyDemoValues();
}

function applyDemoValues() {
  for (const element of document.querySelectorAll('[data-demo-var]')) element.style.setProperty('--demo', `var(--${element.dataset.demoVar})`);
  for (const element of document.querySelectorAll('[data-demo-size]')) {
    element.style.setProperty('--demo-size', `var(--text-${element.dataset.demoSize})`);
    element.style.setProperty('--demo-leading', `var(--leading-${element.dataset.demoSize})`);
  }
  for (const element of document.querySelectorAll('[data-resolve]')) {
    const chip = element.closest('.swatch')?.querySelector('.swatch-chip');
    if (chip) { element.textContent = getComputedStyle(chip).backgroundColor; element.title = element.textContent; }
  }
}

/** The hidden living style guide at #design: every token and component in the current theme, with a theme and density preview. */
export default {
  id: 'design',
  match: hash => hash === 'design' ? {} : null,
  enter: () => openPage('design'),
  render: renderDesign,
  actions: {
    'design-theme': element => {
      restoreOnLeave();
      const choice = element.dataset.choice;
      if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
      else delete document.documentElement.dataset.theme;
      renderDesign();
    },
    'design-density': element => {
      restoreOnLeave();
      if (element.dataset.choice === 'compact') document.documentElement.dataset.density = 'compact';
      else delete document.documentElement.dataset.density;
      renderDesign();
    },
    'design-jump': element => document.getElementById(element.dataset.target)?.scrollIntoView({ block: 'start' }),
    'design-dialog': () => $('#design-dialog')?.showModal(),
    'design-drawer': () => $('#design-drawer')?.showModal(),
  },
};
