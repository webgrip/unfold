import { answers } from '../answers.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Standing answers', render: ({ scenario, layout, ask }) => answers(modelOf(scenario), { layout, ask }), args: { layout: 'list', ask: true }, argTypes: { layout: { control: 'inline-radio', options: ['list', 'chips'] }, ask: { control: 'boolean' } } });

export const Running = {};
export const Chips = { args: { layout: 'chips', ask: false } };
export const WithEstimate = { args: { scenario: 'stress' } };
export const ReadyForReview = { args: { scenario: 'review' } };
export const NoAllowanceKnown = { args: { scenario: 'unreported' } };
