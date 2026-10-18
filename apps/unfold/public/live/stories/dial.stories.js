import { shiftDial } from '../dial.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Shift dial', render: ({ scenario }) => shiftDial(modelOf(scenario)) });

export const Running = {};
export const Steady = { args: { scenario: 'firstTry' } };
export const Stalled = { args: { scenario: 'stalled' } };
export const NearBudget = { args: { scenario: 'nearBudget' } };
export const Landed = { args: { scenario: 'landed' } };
export const Stress = { args: { scenario: 'stress' } };
