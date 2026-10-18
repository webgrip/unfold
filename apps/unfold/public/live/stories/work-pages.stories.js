import { workLayouts, workPage } from '../pages.js';
import { workViewOf } from '../work-fixtures.js';
import { meta } from './shared.js';

export default meta({
  title: 'Live/Work pages',
  frame: 'page',
  render: ({ scenario, layout, origin }) => workPage(layout, workViewOf(scenario, { origin: origin === 'scenario' ? undefined : origin })),
  args: { layout: 'unified', origin: 'scenario' },
  argTypes: { layout: { control: 'inline-radio', options: workLayouts.map(entry => entry.id) }, origin: { control: 'inline-radio', options: ['scenario', 'unfold', 'tracker'] } },
});

export const Unified = {};
export const UnifiedNeedsYou = { args: { scenario: 'needsYou' } };
export const UnifiedReadyForReview = { args: { scenario: 'review', origin: 'tracker' } };
export const UnifiedQueued = { args: { scenario: 'queued' } };
export const UnifiedLanded = { args: { scenario: 'landed' } };
export const UnifiedHijacked = { args: { scenario: 'hijacked' } };
export const UnifiedStress = { args: { scenario: 'stress' } };
export const Thread = { args: { layout: 'thread' } };
export const ThreadNeedsYou = { args: { layout: 'thread', scenario: 'needsYou' } };
export const ThreadFromTracker = { args: { layout: 'thread', scenario: 'review', origin: 'tracker' } };
export const Cockpit = { args: { layout: 'cockpit' } };
export const CockpitHijacked = { args: { layout: 'cockpit', scenario: 'hijacked' } };
export const Desk = { args: { layout: 'desk' } };
export const DeskQueued = { args: { layout: 'desk', scenario: 'queued' } };
export const Logbook = { args: { layout: 'logbook' } };
export const LogbookStress = { args: { layout: 'logbook', scenario: 'stress' } };
export const Proof = { args: { layout: 'proof' } };
export const ProofReadyForReview = { args: { layout: 'proof', scenario: 'review' } };
