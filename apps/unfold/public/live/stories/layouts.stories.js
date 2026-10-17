import { cockpit, fleet, instrumentPanel } from '../layouts.js';
import { fleetModels, meta, modelOf } from './shared.js';

export default meta({ title: 'Live/Pages', frame: 'page', render: ({ scenario, layout }) => layout === 'fleet' ? fleet(fleetModels()) : layout === 'instrument' ? instrumentPanel(modelOf(scenario), { selectedCall: 'call-30' }) : cockpit(modelOf(scenario), { selectedCall: 'call-30' }), args: { layout: 'cockpit' }, argTypes: { layout: { control: 'inline-radio', options: ['cockpit', 'instrument', 'fleet'] } } });

export const Cockpit = {};
export const CockpitReadyForReview = { args: { scenario: 'review' } };
export const CockpitStress = { args: { scenario: 'stress' } };
export const Instrument = { args: { layout: 'instrument' } };
export const InstrumentStalled = { args: { layout: 'instrument', scenario: 'stalled' } };
export const Fleet = { args: { layout: 'fleet' } };
