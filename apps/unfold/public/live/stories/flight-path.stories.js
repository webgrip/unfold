import { flightPath } from '../flight-path.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Flight path', render: ({ scenario, selectedAttempt }) => flightPath(modelOf(scenario), { selectedAttempt: selectedAttempt ?? null }), argTypes: { selectedAttempt: { control: 'number' } } });

export const Running = {};
export const FirstTry = { args: { scenario: 'firstTry' } };
export const Queued = { args: { scenario: 'queued' } };
export const ReadyForReview = { args: { scenario: 'review' } };
export const NeedsYou = { args: { scenario: 'needsYou' } };
export const Landed = { args: { scenario: 'landed' } };
export const EarlierAttemptSelected = { args: { selectedAttempt: 1 } };
export const Stress = { args: { scenario: 'stress' } };
