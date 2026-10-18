import { moveList, traceLanes } from '../trace.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Trace', render: ({ scenario, scope, selectedCall }) => `${traceLanes(modelOf(scenario), { scope, selectedCall })}${moveList(modelOf(scenario), { selectedCall })}`, args: { scope: 'shift', selectedCall: 'call-30' }, argTypes: { scope: { control: 'inline-radio', options: ['shift', 'run'] }, selectedCall: { control: 'text' } } });

export const WholeShift = {};
export const FollowedRunOnly = { args: { scope: 'run' } };
export const Steady = { args: { scenario: 'firstTry', selectedCall: null } };
export const NoRunYet = { args: { scenario: 'queued' } };
export const Stress = { args: { scenario: 'stress', selectedCall: null } };
