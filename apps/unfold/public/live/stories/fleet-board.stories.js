import { airspace, fleetBoard, fleetModel, flightBoard } from '../fleet.js';
import { fleetAt, fleetScenarios } from '../fleet-fixtures.js';
import { meta } from './shared.js';

const modelOf = fleet => fleetModel({ ...fleetScenarios[fleet](), at: fleetAt });

const parts = {
  board: model => fleetBoard(model),
  airspace: model => `<div class="fb">${airspace(model)}</div>`,
  departures: model => `<div class="fb">${flightBoard(model.departures, { kind: 'departures' })}</div>`,
  arrivals: model => `<div class="fb">${flightBoard(model.arrivals, { kind: 'arrivals' })}</div>`,
};

export default meta({
  title: 'Live/Fleet board',
  frame: 'page',
  render: ({ fleet, part }) => parts[part](modelOf(fleet)),
  args: { fleet: 'today', part: 'board' },
  argTypes: { fleet: { control: 'select', options: Object.keys(fleetScenarios) }, part: { control: 'inline-radio', options: Object.keys(parts) } },
});

export const Today = {};
export const RushHour = { args: { fleet: 'rush' } };
export const ClearSkies = { args: { fleet: 'clear' } };
export const PloegHalfAnswers = { args: { fleet: 'partial' } };
export const Airspace = { args: { fleet: 'rush', part: 'airspace' } };
export const Departures = { args: { fleet: 'rush', part: 'departures' } };
export const Arrivals = { args: { fleet: 'rush', part: 'arrivals' } };
