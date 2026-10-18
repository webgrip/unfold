import { acceptanceLedger, roleRoster, decisionDock, intentBar, leaseBaton, originStamp, presenceStack, spendTape, timeline } from '../work-parts.js';
import { workViewOf } from '../work-fixtures.js';
import { meta } from './shared.js';

const parts = {
  timeline: view => timeline(view, { layout: 'chat' }),
  'timeline-log': view => timeline(view, { layout: 'log' }),
  'timeline-compact': view => timeline(view, { layout: 'compact' }),
  intent: view => intentBar(view),
  dock: view => decisionDock(view, { quiet: true }),
  roles: view => roleRoster(view),
  lease: view => leaseBaton(view),
  tape: view => spendTape(view),
  ledger: view => acceptanceLedger(view),
  people: view => `${originStamp(view)}${presenceStack(view)}${presenceStack(view, { names: true })}`,
};

export default meta({
  title: 'Live/Work kit',
  render: ({ scenario, part, origin }) => parts[part](workViewOf(scenario, { origin: origin === 'scenario' ? undefined : origin })),
  args: { part: 'timeline', origin: 'scenario' },
  argTypes: { part: { control: 'select', options: Object.keys(parts) }, origin: { control: 'inline-radio', options: ['scenario', 'unfold', 'tracker'] } },
});

export const Timeline = {};
export const TimelineLog = { args: { part: 'timeline-log' } };
export const TimelineCompact = { args: { part: 'timeline-compact', scenario: 'review' } };
export const IntentBarStartedInUnfold = { args: { part: 'intent', origin: 'unfold' } };
export const IntentBarFromTracker = { args: { part: 'intent', origin: 'tracker' } };
export const DecisionDockStopped = { args: { part: 'dock', scenario: 'needsYou' } };
export const DecisionDockReview = { args: { part: 'dock', scenario: 'review' } };
export const DecisionDockNothingWaits = { args: { part: 'dock' } };
export const RoleRoster = { args: { part: 'roles' } };
export const LeaseBaton = { args: { part: 'lease' } };
export const LeaseBatonFree = { args: { part: 'lease', scenario: 'review' } };
export const SpendTape = { args: { part: 'tape' } };
export const SpendTapeStress = { args: { part: 'tape', scenario: 'stress' } };
export const AcceptanceLedger = { args: { part: 'ledger' } };
export const AcceptanceLedgerProven = { args: { part: 'ledger', scenario: 'review' } };
export const AcceptanceLedgerNoProof = { args: { part: 'ledger', scenario: 'needsYou' } };
export const OriginAndPresence = { args: { part: 'people' } };
