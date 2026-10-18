import { foldStrip } from '../fold-strip.js';
import { meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Fold strip', render: ({ scenario, size }) => foldStrip(modelOf(scenario), { size }), args: { size: 'full' }, argTypes: { size: { control: 'inline-radio', options: ['full', 'mini'] } } });

export const Building = {};
export const Queued = { args: { scenario: 'queued' } };
export const ReadyForReview = { args: { scenario: 'review' } };
export const NeedsYou = { args: { scenario: 'needsYou' } };
export const Landed = { args: { scenario: 'landed' } };
export const Mini = { args: { size: 'mini' } };
