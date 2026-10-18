import { meaningLegend } from '../meaning.js';
import { meta } from './shared.js';

export default meta({
  title: 'Live/Meaning',
  render: ({ component }) => meaningLegend(component),
  args: { component: 'flight' },
  argTypes: { component: { control: 'select', options: ['all', 'flight', 'folds', 'dial', 'trace', 'instruments', 'answers', 'containment'] } },
});

export const Flight = {};
export const Folds = { args: { component: 'folds' } };
export const Dial = { args: { component: 'dial' } };
export const Trace = { args: { component: 'trace' } };
export const Containment = { args: { component: 'containment' } };
export const All = { args: { component: 'all' } };
