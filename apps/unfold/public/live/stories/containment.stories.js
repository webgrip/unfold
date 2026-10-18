import { containmentPanel } from '../containment.js';
import { scenarios } from '../fixtures.js';
import { liveModel } from '../model.js';
import { meta, modelOf } from './shared.js';

const hidden = '<p class="lv-contain-note">No tripwire, rules change or AI judge verdict, so the containment panel stays hidden.</p>';
const driftOnly = () => liveModel({ ...scenarios.firstTry.input(), policy: {
  startedWith: { instructions: 'sha256:4be1c0d2', skills: ['docs'], tools: ['read', 'edit', 'execute'], hosts: ['forgejo.webgrip.dev'] },
  current: { instructions: 'sha256:4be1c0d2', skills: ['docs'], tools: ['read', 'edit', 'execute', 'browser'], hosts: ['forgejo.webgrip.dev', 'paste.example'] },
} });

export default meta({ title: 'Live/Containment', scenario: 'hijacked', render: ({ scenario }) => containmentPanel(modelOf(scenario)) || hidden });

export const Hijacked = {};
export const PolicyDriftOnly = { args: { scenario: 'firstTry' }, render: () => containmentPanel(driftOnly()) };
export const JudgeRaises = { args: { scenario: 'judgeRaises' } };
export const JudgeWatch = { args: { scenario: 'judgeDrifting' } };
export const Clean = { args: { scenario: 'firstTry' } };
