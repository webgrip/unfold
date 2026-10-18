import { flightPath } from '../flight-path.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Flight path', render: ({ scenario }) => flightPath(modelOf(scenario)) });

export const Recovering = {};
export const Steady = { args: { scenario: 'firstTry' } };
export const Holding = { args: { scenario: 'stalled' } };
export const FixRound = { args: { scenario: 'fixRound' } };
export const WaitingForAWorker = { args: { scenario: 'timeoutRetry' } };
export const AtTheGate = { args: { scenario: 'queued' } };
export const ReadyForReview = { args: { scenario: 'review' } };
export const Landed = { args: { scenario: 'landed' } };
export const NeedsYouAgentFailed = { args: { scenario: 'needsYou' } };
export const NeedsYouOutOfBudget = { args: { scenario: 'overBudget' } };
export const StoppedRetrying = { args: { scenario: 'staleMachines' } };
export const Withdrawn = { args: { scenario: 'withdrawn' } };
export const Stress = { args: { scenario: 'stress' } };
export const Hijacked = { args: { scenario: 'hijacked' } };
export const JudgeWatch = { args: { scenario: 'judgeDrifting' } };
export const JudgeRaises = { args: { scenario: 'judgeRaises' } };
export const Run305Watch = { args: { scenario: 'run305Watch' } };
export const Run305OffTrack = { args: { scenario: 'run305OffTrack' } };
