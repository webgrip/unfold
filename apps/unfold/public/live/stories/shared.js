import { liveModel } from '../model.js';
import { fleetInputs, scenarios } from '../fixtures.js';

/** The scenario names a story's `scenario` control offers. */
export const scenarioNames = Object.keys(scenarios);

/** The model of one fixture scenario. */
export const modelOf = scenario => liveModel(scenarios[scenario].input());

/** The models of the fleet fixture list. */
export const fleetModels = () => fleetInputs().map(liveModel);

/**
 * The parts of a Component Story Format default export every live story shares: the scenario control and a decorator
 * that gives the component the `.lv` context it styles against. `frame: 'panel'` wraps a part in a panel, as it
 * appears on a page; `frame: 'page'` renders a whole layout.
 * @param {{ title: string, render: Function, frame?: 'panel'|'page', scenario?: string, args?: object, argTypes?: object }} options
 * @returns {object}
 */
export function meta({ title, render, frame = 'panel', scenario = 'running', args = {}, argTypes = {} }) {
  return {
    title,
    render,
    args: { scenario, ...args },
    argTypes: { scenario: { control: 'select', options: scenarioNames }, ...argTypes },
    decorators: [story => frame === 'page' ? `<div class="lv-story lv-story-page">${story()}</div>` : `<div class="lv lv-story"><section class="lv-panel">${story()}</section></div>`],
    parameters: { layout: frame === 'page' ? 'fullscreen' : 'padded', frame },
  };
}
