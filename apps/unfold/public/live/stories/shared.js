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

/**
 * The running Run's health of a model as the entry Unfold's health route gives the Run row, so a story can draw the
 * Run row's badge and health section from a fixture. Null when no Run is running.
 * @param {object} model A `liveModel` result.
 * @param {{ staleMinutes?: number, judgeState?: string }} [options] `staleMinutes` marks the health as read that long ago.
 * @returns {{ data: object } | null}
 */
export function healthEntry(model, { staleMinutes = 0, judgeState = 'idle' } = {}) {
  const health = model.health;
  if (!health) return null;
  const judge = health.judge ? { ...health.judge, at: new Date(health.judge.at ?? model.now).toISOString() } : null;
  const asOf = new Date(model.now - staleMinutes * 60000).toISOString();
  return { data: { health: health.signalsHealth, combined: { health: health.health, source: health.source }, reason: health.reason, deciding: health.deciding, signals: health.signals, judge, judgeState, demo: health.demo, stale: staleMinutes > 0 || health.stale, asOf } };
}
