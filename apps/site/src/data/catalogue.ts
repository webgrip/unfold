export const STATUSES = ['available', 'labs', 'experimental', 'planned'] as const;
export type Status = (typeof STATUSES)[number];

export const AUDIENCES = ['agencies', 'teams', 'developers', 'platform'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const CATEGORIES = [
  'integrations',
  'control',
  'security',
  'cost',
  'visibility',
  'where',
  'open',
  'new',
  'next',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Component = 'unfold' | 'ploeg';

export interface Feature {
  id: string;
  category: Category;
  status: Status;
  audiences: readonly Audience[];
  from: Component;
}

const AUDIENCE_CODES: Record<string, Audience> = {
  a: 'agencies',
  t: 'teams',
  d: 'developers',
  p: 'platform',
};

function f<const I extends string>(
  id: I,
  category: Category,
  status: Status,
  audiences: string,
  from: Component,
): Feature & { id: I } {
  return {
    id,
    category,
    status,
    audiences: [...audiences].map((code) => {
      const audience = AUDIENCE_CODES[code];
      if (!audience) throw new Error(`Unknown audience code ${code} on ${id}`);
      return audience;
    }),
    from,
  };
}

export const FEATURES = [
  // Integrations
  f('intHandoff', 'integrations', 'available', 'atd', 'unfold'),
  f('intGithubIssues', 'integrations', 'available', 'dp', 'ploeg'),
  f('intTrackerReads', 'integrations', 'available', 'td', 'unfold'),
  f('intForges', 'integrations', 'available', 'atdp', 'unfold'),
  f('intModels', 'integrations', 'available', 'atdp', 'unfold'),
  f('intAgentPlugins', 'integrations', 'available', 'd', 'unfold'),
  f('intCodex', 'integrations', 'experimental', 'd', 'unfold'),
  f('intHarness', 'integrations', 'available', 'pd', 'ploeg'),
  f('intHarnessOthers', 'integrations', 'experimental', 'p', 'ploeg'),
  f('intChat', 'integrations', 'labs', 'td', 'unfold'),
  f('intFocus', 'integrations', 'available', 'atp', 'unfold'),
  f('intBilling', 'integrations', 'labs', 'a', 'unfold'),
  f('intIdentity', 'integrations', 'available', 'tp', 'unfold'),
  f('intScim', 'integrations', 'labs', 'tp', 'unfold'),
  f('intIntake', 'integrations', 'labs', 'a', 'unfold'),
  f('intObservability', 'integrations', 'available', 'p', 'unfold'),

  // Control
  f('ctlBudget', 'control', 'available', 'atdp', 'ploeg'),
  f('ctlTeamCaps', 'control', 'available', 'tpa', 'ploeg'),
  f('ctlNoRespend', 'control', 'available', 'ta', 'unfold'),
  f('ctlConfirm', 'control', 'available', 'td', 'unfold'),
  f('ctlStop', 'control', 'available', 'ta', 'unfold'),
  f('ctlTakeOver', 'control', 'available', 'dt', 'unfold'),
  f('ctlSteer', 'control', 'available', 'dt', 'unfold'),
  f('ctlPermissions', 'control', 'available', 'd', 'unfold'),
  f('ctlProposed', 'control', 'available', 't', 'unfold'),
  f('ctlBriefCheck', 'control', 'available', 'ta', 'unfold'),
  f('ctlRouting', 'control', 'available', 'p', 'ploeg'),
  f('ctlMerge', 'control', 'available', 'atdp', 'unfold'),
  f('ctlRoles', 'control', 'available', 'tp', 'unfold'),
  f('ctlSignOff', 'control', 'labs', 'a', 'unfold'),

  // Security and isolation
  f('secSandbox', 'security', 'available', 'pt', 'unfold'),
  f('secScopedKey', 'security', 'available', 'pt', 'unfold'),
  f('secProxies', 'security', 'available', 'p', 'ploeg'),
  f('secOwnBranch', 'security', 'available', 'pd', 'ploeg'),
  f('secCanary', 'security', 'available', 'p', 'ploeg'),
  f('secWorkerPods', 'security', 'available', 'p', 'ploeg'),
  f('secNetworkPolicy', 'security', 'available', 'p', 'ploeg'),
  f('secKata', 'security', 'available', 'p', 'ploeg'),
  f('secVerifyOutside', 'security', 'available', 'tp', 'unfold'),
  f('secSigned', 'security', 'available', 'tp', 'unfold'),
  f('secSecretScan', 'security', 'available', 'd', 'unfold'),
  f('secPersonProof', 'security', 'available', 'p', 'unfold'),
  f('secTenants', 'security', 'available', 'ap', 'unfold'),
  f('secUntrusted', 'security', 'available', 'tp', 'unfold'),
  f('secRepository', 'security', 'available', 'p', 'ploeg'),
  f('secReleases', 'security', 'available', 'p', 'ploeg'),
  f('secThreatModel', 'security', 'available', 'p', 'ploeg'),
  f('secHardened', 'security', 'available', 'p', 'unfold'),
  f('secLeavers', 'security', 'labs', 'tp', 'unfold'),

  // Cost
  f('costRun', 'cost', 'available', 'td', 'unfold'),
  f('costSettled', 'cost', 'available', 'pt', 'ploeg'),
  f('costMerged', 'cost', 'available', 'ta', 'unfold'),
  f('costLedger', 'cost', 'available', 'at', 'unfold'),
  f('costClient', 'cost', 'available', 'a', 'unfold'),
  f('costAlerts', 'cost', 'available', 'd', 'unfold'),
  f('costAskFree', 'cost', 'available', 'd', 'unfold'),
  f('costOwnAgents', 'cost', 'available', 'dt', 'unfold'),
  f('costBill', 'cost', 'labs', 'a', 'unfold'),

  // Visibility and evidence
  f('visNeedsYou', 'visibility', 'available', 'tda', 'unfold'),
  f('visTranscript', 'visibility', 'available', 'dt', 'unfold'),
  f('visEvidence', 'visibility', 'available', 'ta', 'unfold'),
  f('visFindings', 'visibility', 'available', 'td', 'unfold'),
  f('visProduction', 'visibility', 'available', 't', 'unfold'),
  f('visAudit', 'visibility', 'available', 'tpa', 'unfold'),
  f('visAiMarked', 'visibility', 'available', 'tda', 'unfold'),
  f('visHealth', 'visibility', 'available', 't', 'unfold'),
  f('visJudge', 'visibility', 'labs', 't', 'unfold'),
  f('visStatus', 'visibility', 'available', 'p', 'unfold'),
  f('visOwnSessions', 'visibility', 'available', 'dt', 'unfold'),
  f('visBrief', 'visibility', 'available', 'd', 'unfold'),
  f('visCards', 'visibility', 'available', 't', 'unfold'),
  f('visMetrics', 'visibility', 'available', 'p', 'ploeg'),
  f('visSiem', 'visibility', 'labs', 'p', 'unfold'),
  f('visEvents', 'visibility', 'labs', 'p', 'unfold'),

  // Where you work
  f('whereBrowser', 'where', 'available', 'atdp', 'unfold'),
  f('whereVsCode', 'where', 'available', 'd', 'unfold'),
  f('whereClaudeCode', 'where', 'available', 'd', 'unfold'),
  f('whereMcp', 'where', 'available', 'dt', 'unfold'),
  f('whereChat', 'where', 'available', 'd', 'unfold'),
  f('whereMessages', 'where', 'available', 'd', 'unfold'),
  f('whereAcp', 'where', 'experimental', 'd', 'unfold'),
  f('whereMcpTask', 'where', 'labs', 'd', 'unfold'),
  f('whereMcpEvents', 'where', 'labs', 'd', 'unfold'),

  // Open, self-hosted, no lock-in
  f('openSource', 'open', 'available', 'atdp', 'unfold'),
  f('openHelm', 'open', 'available', 'pt', 'unfold'),
  f('openModels', 'open', 'available', 'pta', 'unfold'),
  f('openDemo', 'open', 'available', 'atdp', 'unfold'),
  f('openSupport', 'open', 'available', 'p', 'ploeg'),
  f('openQuickstart', 'open', 'available', 'p', 'ploeg'),
  f('openScaleToZero', 'open', 'available', 'p', 'ploeg'),
  f('openDrills', 'open', 'available', 'p', 'ploeg'),
  f('openContracts', 'open', 'available', 'p', 'ploeg'),
  f('openUpgrade', 'open', 'experimental', 'p', 'ploeg'),
  f('openExport', 'open', 'labs', 'ap', 'unfold'),

  // What's new here
  f('newBudget', 'new', 'available', 'atp', 'ploeg'),
  f('newRunKey', 'new', 'available', 'p', 'ploeg'),
  f('newVerified', 'new', 'available', 'tp', 'unfold'),
  f('newForgejo', 'new', 'available', 'pd', 'unfold'),
  f('newInHouse', 'new', 'available', 'pt', 'unfold'),
  f('newTakeOver', 'new', 'available', 'd', 'unfold'),
  f('newOwnSessions', 'new', 'available', 'dt', 'unfold'),
  f('newClientApproves', 'new', 'labs', 'a', 'unfold'),
  f('newBillPerItem', 'new', 'labs', 'a', 'unfold'),
  f('newMcpTask', 'new', 'labs', 'd', 'unfold'),

  // Coming next: the owner's order, no dates
  f('nextJira', 'next', 'planned', 'atd', 'unfold'),
  f('nextIssues', 'next', 'planned', 'td', 'unfold'),
  f('nextLinear', 'next', 'planned', 'td', 'unfold'),
  f('nextTrackers', 'next', 'planned', 'at', 'unfold'),
  f('nextPsa', 'next', 'planned', 'a', 'unfold'),
  f('nextGateway', 'next', 'planned', 'p', 'ploeg'),
  f('nextPreview', 'next', 'planned', 'atd', 'unfold'),
  f('nextPortal', 'next', 'planned', 'a', 'unfold'),
  f('nextHosted', 'next', 'planned', 'a', 'unfold'),
  f('nextQuotes', 'next', 'planned', 'a', 'unfold'),
  f('nextKnowledge', 'next', 'planned', 'at', 'unfold'),
  f('nextHarnessPick', 'next', 'planned', 'dp', 'unfold'),
  f('nextSharedAccounts', 'next', 'planned', 'a', 'unfold'),
  f('nextTrackerSuite', 'next', 'planned', 'p', 'unfold'),
  f('nextTls', 'next', 'planned', 'p', 'ploeg'),
  f('nextIsolationFloor', 'next', 'planned', 'p', 'ploeg'),
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];

/** The six to eight features that matter most to each audience, in reading order. */
export const AUDIENCE_KEY: Record<Audience, readonly FeatureId[]> = {
  agencies: [
    'ctlBudget',
    'costClient',
    'costBill',
    'ctlSignOff',
    'secTenants',
    'intIntake',
    'visEvidence',
    'openExport',
  ],
  teams: [
    'ctlBudget',
    'ctlTeamCaps',
    'visNeedsYou',
    'ctlStop',
    'ctlProposed',
    'visFindings',
    'ctlRoles',
    'secVerifyOutside',
  ],
  developers: [
    'intHandoff',
    'ctlTakeOver',
    'ctlSteer',
    'visTranscript',
    'ctlPermissions',
    'costAlerts',
    'secSecretScan',
    'visOwnSessions',
  ],
  platform: [
    'openHelm',
    'secProxies',
    'secOwnBranch',
    'secNetworkPolicy',
    'secKata',
    'secReleases',
    'visMetrics',
    'openScaleToZero',
  ],
};

/** Where one Run's cost goes, on the agencies page. */
export const AGENCY_COST_FLOW: readonly FeatureId[] = [
  'ctlBudget',
  'costSettled',
  'costClient',
  'costBill',
];

/** The places a developer works from, on the developers page. */
export const DEVELOPER_SURFACES: readonly FeatureId[] = [
  'whereBrowser',
  'whereVsCode',
  'whereClaudeCode',
  'whereMcp',
  'whereAcp',
];

export function featureById(id: FeatureId): Feature {
  const feature = FEATURES.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Unknown feature ${id}`);
  return feature;
}

export function featuresFor(options: {
  audience?: Audience;
  category?: Category;
  exclude?: readonly Category[];
}): Feature[] {
  return FEATURES.filter(
    (feature) =>
      (!options.audience || feature.audiences.includes(options.audience)) &&
      (!options.category || feature.category === options.category) &&
      !(options.exclude ?? []).includes(feature.category),
  );
}
