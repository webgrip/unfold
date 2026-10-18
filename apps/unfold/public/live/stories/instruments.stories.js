import { instruments } from '../instruments.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Instruments', render: ({ scenario, layout }) => instruments(modelOf(scenario), { layout }), args: { layout: 'tiles' }, argTypes: { layout: { control: 'inline-radio', options: ['tiles', 'strip', 'list'] } } });

export const Running = {};
export const Strip = { args: { layout: 'strip' } };
export const List = { args: { layout: 'list' } };
export const NearBudget = { args: { scenario: 'nearBudget' } };
export const NotReported = { args: { scenario: 'unreported' } };
export const AgentFailures = { args: { scenario: 'needsYou' } };
export const OverBudget = { args: { scenario: 'stress' } };
