import type { Status } from './catalogue.ts';
import type { en } from '../i18n/en.ts';

type Notes = keyof typeof en.integrationsPage.notes;
type PortId = keyof typeof en.integrationsPage.ports;
type StandardId = keyof typeof en.integrationsPage.standards;

/** One tab on the port board: a product name, or a translated label when there is none. */
export interface Adapter {
  name?: string;
  label?: Notes;
  note?: Notes;
  status: Status;
}

export interface Port {
  id: PortId;
  kind: 'registry' | 'standard' | 'contract';
  openSocket: boolean;
  adapters: readonly Adapter[];
}

/** Every tab is checked against apps/unfold/docs/product/at-a-glance.md and Ploeg's at-a-glance. */
export const PORTS: readonly Port[] = [
  {
    id: 'trackers',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'ClickUp', note: 'handoff', status: 'available' },
      { name: 'Vikunja', note: 'handoff', status: 'available' },
      { name: 'GitHub Issues', note: 'viaPloeg', status: 'available' },
      { name: 'Jira Cloud', note: 'read', status: 'available' },
      { name: 'GitLab', note: 'read', status: 'available' },
      { name: 'Forgejo', note: 'read', status: 'available' },
      { name: 'Jira', note: 'handoff', status: 'planned' },
      { name: 'Linear', status: 'planned' },
    ],
  },
  {
    id: 'forges',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'Forgejo', status: 'available' },
      { name: 'GitHub', status: 'available' },
      { name: 'GitLab', note: 'mergeRequest', status: 'available' },
    ],
  },
  {
    id: 'links',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'GitLab', status: 'available' },
      { name: 'ClickUp', status: 'available' },
    ],
  },
  {
    id: 'agents',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'OpenHands', status: 'available' },
      { label: 'anyProgram', status: 'available' },
      { name: 'OpenCode', status: 'experimental' },
      { name: 'Qwen Code', status: 'experimental' },
      { name: 'Goose', status: 'experimental' },
      { name: 'Claude Code', status: 'experimental' },
      { name: 'Codex', status: 'experimental' },
      { name: 'Gemini CLI', status: 'experimental' },
    ],
  },
  {
    id: 'gateway',
    kind: 'contract',
    openSocket: false,
    adapters: [
      { name: 'LiteLLM', status: 'available' },
      { name: 'Envoy AI Gateway', status: 'planned' },
    ],
  },
  {
    id: 'editors',
    kind: 'standard',
    openSocket: false,
    adapters: [
      { name: 'VS Code', status: 'available' },
      { name: 'Claude Code', status: 'available' },
      { label: 'agentPlugin', status: 'available' },
      { name: 'OpenCode 1.x', status: 'available' },
      { label: 'mcpApps', status: 'available' },
      { label: 'acpEditors', status: 'experimental' },
      { name: 'Codex CLI', note: 'reporting', status: 'experimental' },
    ],
  },
  {
    id: 'notify',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { label: 'browser', status: 'available' },
      { name: 'VS Code', status: 'available' },
      { name: 'Slack', status: 'labs' },
      { name: 'Microsoft Teams', status: 'labs' },
      { name: 'ntfy', status: 'labs' },
      { name: 'Web Push', status: 'labs' },
    ],
  },
  {
    id: 'billing',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'Simplicate', status: 'labs' },
      { label: 'files', status: 'labs' },
      { label: 'focus', status: 'available' },
      { name: 'Teamleader', status: 'planned' },
      { name: 'Moneybird', status: 'planned' },
      { name: 'Exact', status: 'planned' },
    ],
  },
  {
    id: 'intake',
    kind: 'registry',
    openSocket: true,
    adapters: [
      { name: 'Marker.io', status: 'labs' },
      { name: 'BugHerd', status: 'labs' },
      { name: 'Userback', status: 'labs' },
      { name: 'Freshdesk', status: 'labs' },
      { name: 'Zendesk', status: 'labs' },
      { label: 'form', status: 'labs' },
      { label: 'email', status: 'labs' },
    ],
  },
  {
    id: 'identity',
    kind: 'standard',
    openSocket: false,
    adapters: [
      { name: 'OIDC', status: 'available' },
      { name: 'SCIM 2.0', status: 'labs' },
      { name: 'Shared Signals', status: 'labs' },
    ],
  },
  {
    id: 'telemetry',
    kind: 'standard',
    openSocket: false,
    adapters: [
      { name: 'OTLP', status: 'available' },
      { name: 'Prometheus', status: 'available' },
      { name: 'VictoriaLogs', status: 'available' },
      { name: 'Sentry protocol', status: 'available' },
      { label: 'ocsf', status: 'available' },
      { label: 'events', status: 'labs' },
    ],
  },
];

export interface Standard {
  id: StandardId;
  name: string;
  status: Status;
}

export const STANDARDS: readonly Standard[] = [
  { id: 'mcp', name: 'MCP', status: 'available' },
  { id: 'acp', name: 'ACP', status: 'available' },
  { id: 'openapi', name: 'OpenAPI 3.1', status: 'available' },
  { id: 'oidc', name: 'OIDC', status: 'available' },
  { id: 'ocsf', name: 'OCSF', status: 'available' },
  { id: 'focus', name: 'FinOps FOCUS', status: 'available' },
  { id: 'openfeature', name: 'OpenFeature · OFREP', status: 'available' },
  { id: 'otlp', name: 'OTLP', status: 'available' },
  { id: 'intoto', name: 'in-toto · Agent Trace', status: 'available' },
  { id: 'cloudevents', name: 'CloudEvents · Standard Webhooks', status: 'labs' },
  { id: 'scim', name: 'SCIM 2.0', status: 'labs' },
];

/** Coming next on the integrations page, grouped, in the owner's order. */
export const NEXT_GROUPS = [
  { id: 'trackers', features: ['nextJira', 'nextIssues', 'nextLinear', 'nextTrackers'] },
  { id: 'billing', features: ['nextPsa'] },
  { id: 'gateway', features: ['nextGateway'] },
  { id: 'delivery', features: ['nextPreview', 'nextPortal', 'nextHosted'] },
  { id: 'tests', features: ['nextTrackerSuite'] },
] as const;
