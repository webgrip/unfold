import { workPage } from '../pages.js';
import { workViewOf } from '../work-fixtures.js';
import { meta } from './shared.js';

const runBody = id => `<p class="work-run-summary">What Run ${id} did, its transcript and its pod logs open here in the app.</p>`;
const session = { decision: '', actions: '<button type="button" class="button secondary sm">Pause</button>', evidence: '<section class="card flush session-evidence"><p class="card-body">Activity, gateway calls, changes, checks and the hand-off of the session.</p></section>', evidenceLabel: 'Evidence', side: '<section class="card"><p class="card-body">Budget, repository hand-off, tool approval and details of the session.</p></section>' };

export default meta({
  title: 'Live/Work Item page',
  frame: 'page',
  render: ({ scenario, origin, tab }) => workPage(workViewOf(scenario, { origin: origin === 'scenario' ? undefined : origin }), { runDetail: runBody, ...(origin === 'unfold' ? { session } : {}), ...(tab === 'default' ? {} : { tab }) }),
  args: { origin: 'scenario', tab: 'default' },
  argTypes: { origin: { control: 'inline-radio', options: ['scenario', 'unfold', 'tracker'] }, tab: { control: 'inline-radio', options: ['default', 'log', 'brief', 'trace', 'evidence'] } },
});

export const Running = {};
export const NeedsYou = { args: { scenario: 'needsYou' } };
export const ReadyForReview = { args: { scenario: 'review', origin: 'tracker' } };
export const Queued = { args: { scenario: 'queued' } };
export const Landed = { args: { scenario: 'landed' } };
export const Hijacked = { args: { scenario: 'hijacked' } };
export const Stress = { args: { scenario: 'stress' } };
export const OffTrackThenBack = { args: { scenario: 'driftRecovered' } };
export const Rogue = { args: { scenario: 'rogue' } };
export const ContextUnblocks = { args: { scenario: 'contextUnblocks' } };
export const ReviewLoop = { args: { scenario: 'reviewLoop' } };
export const AgentReviewQueued = { args: { scenario: 'agentReview', origin: 'tracker' } };
export const StartedInUnfold = { args: { origin: 'unfold', tab: 'evidence' } };
