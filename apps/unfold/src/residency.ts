import type { AppConfig, GatewayRequest, Session } from './types.ts';

export type ResidencyState = 'ok' | 'degraded' | 'idle' | 'unchecked' | 'unknown' | 'not_used';
export type GatewayPolicy = NonNullable<AppConfig['gatewayPolicy']>;
/** How many requests in a window one provider or region answered, and whether the policy allows it; `allowed` is null without a rule for it. */
export type ResidencyCount = { name: string; requests: number; allowed: boolean | null };
export type ResidencyWindow = { id: '24h' | '7d'; since: string; requests: number; providers: ResidencyCount[]; regions: ResidencyCount[]; unreported: { provider: number; region: number }; outside: number };
/** One request outside the policy. `session`, `run` and `workItemId` are present only when the reader may open that session. */
export type ResidencyBreach = { at: string; model: string; provider: string | null; region: string | null; reason: string; session?: { id: string; title: string }; run?: { id: string; roleName: string }; workItemId?: string };
/** Where one part of the system runs, as far as its configuration says; `region` is null whenever nothing Unfold reads names one. */
export type ResidencyPlace = { id: 'unfold' | 'ploeg' | 'workspaces'; title: string; where: string; region: string | null; detail?: string };
/** The "Where your data goes" line on the Status page (Unfold docs, Status design record). */
export type Residency = {
  state: ResidencyState;
  summary: string;
  policy: { providers: string[] | null; regions: string[] | null; enforcedBy: 'unfold' | 'gateway' | 'none' };
  source: 'gateway_ledger' | 'none';
  windows: ResidencyWindow[];
  outside: ResidencyBreach[];
  outsideHidden: number;
  places: ResidencyPlace[];
};
export type ResidencyInput = { config: AppConfig; sessions: Session[]; now: Date; admin: boolean; visible(sessionId: string): boolean };

const hour = 3_600_000;
export const residencyWindows = [{ id: '24h', ms: 24 * hour }, { id: '7d', ms: 7 * 24 * hour }] as const;
export const breachesShown = 20;

/** Why a gateway request falls outside the policy, such as `provider openai, region us`, or '' when it does not. A request that reports no provider or region is not judged on it. */
export function outsidePolicy(policy: GatewayPolicy | undefined, request: Pick<GatewayRequest, 'provider' | 'geo'>): string {
  if (!policy) return '';
  const reasons: string[] = [];
  if (policy.providers && request.provider && !policy.providers.includes(request.provider)) reasons.push(`provider ${request.provider}`);
  if (policy.regions && request.geo && !policy.regions.includes(request.geo)) reasons.push(`region ${request.geo}`);
  return reasons.join(', ');
}

/** Whether this workbench reads each request from the gateway's ledger; managed execution leaves spend and routing to Ploeg and the gateway. */
export function readsGatewayLedger(config: AppConfig): boolean {
  return config.mode === 'live' && Boolean(config.litellm?.masterKey) && !config.execution;
}

function counts(names: (string | undefined)[], rule: string[] | undefined): ResidencyCount[] {
  const tally = new Map<string, number>();
  for (const name of names) if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  return [...tally].map(([name, requests]) => ({ name, requests, allowed: rule ? rule.includes(name) : null })).sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

function runFor(session: Session, request: GatewayRequest): { id: string; roleName: string } | undefined {
  const at = Date.parse(request.at);
  const run = session.runs.filter(item => item.roleId === request.roleId && (!item.startedAt || Date.parse(item.startedAt) <= at + 2000)).at(-1);
  return run ? { id: run.id, roleName: run.roleName } : undefined;
}

function host(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

/** Where Unfold, Ploeg and the agent workspaces run. Unfold reads no region for any of them, so each says so instead of guessing. */
export function residencyPlaces(config: AppConfig, admin: boolean): ResidencyPlace[] {
  const unknown = 'Unfold’s configuration names no region and Unfold reads no node labels, so the region is unknown.';
  const places: ResidencyPlace[] = [{ id: 'unfold', title: 'Unfold', where: config.mode === 'demo' ? 'This machine, as a demo' : 'The machine or cluster that runs this workbench', region: null, detail: unknown }];
  if (!config.ploeg) places.push({ id: 'ploeg', title: 'Ploeg', where: 'Not connected', region: null });
  else if (config.ploeg.demo) places.push({ id: 'ploeg', title: 'Ploeg', where: 'Illustrative demo data inside Unfold', region: null });
  else places.push({ id: 'ploeg', title: 'Ploeg', where: admin ? `The Ploeg API at ${host(config.ploeg.url)}` : 'The connected Ploeg API', region: null, detail: unknown });
  const backend = config.mode === 'demo' ? 'demo' : config.runtime.backend;
  const runtimeClass = config.kubernetes?.provisioner === 'sandbox' ? config.kubernetes.sandbox?.runtimeClassName : config.kubernetes?.runtimeClassName;
  const where = backend === 'demo' ? 'A local repository fixture on this machine'
    : backend === 'kubernetes' ? (admin && config.kubernetes ? `Kubernetes pods in namespace ${config.kubernetes.namespace}${runtimeClass ? ` under RuntimeClass ${runtimeClass}` : ''}` : 'Kubernetes pods')
    : backend === 'docker' ? 'Containers on this workbench’s Docker host'
    : backend === 'local' ? 'Working directories on the machine that runs Unfold'
    : admin && config.runtime.endpoint ? `An external runtime at ${host(config.runtime.endpoint)}` : 'An external runtime';
  places.push({ id: 'workspaces', title: 'Agent workspaces', where, region: null, ...(backend === 'demo' ? {} : { detail: unknown }) });
  return places;
}

/** The configured provider and region policy, what the gateway's ledger shows in the last 24 hours and 7 days, the requests outside the policy and where each part runs. */
export function residencyReport(input: ResidencyInput): Residency {
  const { config, sessions, now, admin, visible } = input;
  const policy = config.gatewayPolicy;
  const enforcedBy = policy ? 'unfold' : config.execution ? 'gateway' : 'none';
  const base = { policy: { providers: policy?.providers ?? null, regions: policy?.regions ?? null, enforcedBy } as Residency['policy'], places: residencyPlaces(config, admin) };
  if (config.mode === 'demo') return { ...base, state: 'not_used', summary: 'This is a demo. It makes no model calls, so no request leaves this machine and none is shown.', source: 'none', windows: [], outside: [], outsideHidden: 0 };
  const oldest = now.getTime() - residencyWindows.at(-1)!.ms;
  const rows = sessions.flatMap(session => (session.requests ?? []).filter(request => Date.parse(request.at) >= oldest && Date.parse(request.at) <= now.getTime()).map(request => ({ session, request, reason: request.violation || outsidePolicy(policy, request) })));
  const reading = readsGatewayLedger(config);
  const source: Residency['source'] = reading || rows.length ? 'gateway_ledger' : 'none';
  const windows: ResidencyWindow[] = residencyWindows.map(window => {
    const since = now.getTime() - window.ms;
    const inside = rows.filter(row => Date.parse(row.request.at) >= since);
    return {
      id: window.id, since: new Date(since).toISOString(), requests: inside.length,
      providers: counts(inside.map(row => row.request.provider), policy?.providers), regions: counts(inside.map(row => row.request.geo), policy?.regions),
      unreported: { provider: inside.filter(row => !row.request.provider).length, region: inside.filter(row => !row.request.geo).length },
      outside: inside.filter(row => row.reason).length,
    };
  });
  const breaches = rows.filter(row => row.reason).sort((a, b) => b.request.at.localeCompare(a.request.at));
  const shown = breaches.slice(0, breachesShown).map(({ session, request, reason }): ResidencyBreach => {
    const open = visible(session.id);
    const run = open ? runFor(session, request) : undefined;
    const workItemId = open && session.execution?.workItemId && /^[1-9][0-9]{0,19}$/.test(session.execution.workItemId) ? session.execution.workItemId : undefined;
    return { at: request.at, model: request.model, provider: request.provider ?? null, region: request.geo ?? null, reason, ...(open ? { session: { id: session.id, title: session.title } } : {}), ...(run ? { run } : {}), ...(workItemId ? { workItemId } : {}) };
  });
  const week = windows.at(-1)!;
  const result = { ...base, source, windows, outside: shown, outsideHidden: breaches.length - shown.length };
  if (breaches.length) return { ...result, state: 'degraded', summary: `${breaches.length === 1 ? 'One request' : `${breaches.length} requests`} in the last 7 days went to a provider or region outside the policy.` };
  if (source === 'none') return { ...result, state: 'unknown', summary: config.execution ? 'Unfold does not read the gateway’s request log here: Ploeg budgets every Run, and the gateway’s own policy decides where requests go. Which providers and regions answered is unknown to Unfold.' : 'Unfold does not read the gateway’s request log here, so which providers and regions answered is unknown.' };
  if (!policy) return { ...result, state: 'unchecked', summary: week.requests ? `No provider or region policy is set, so nothing counts as outside it. ${week.requests === 1 ? 'One request' : `${week.requests} requests`} reached the gateway in the last 7 days.` : 'No provider or region policy is set, and no request reached the gateway in the last 7 days.' };
  if (!week.requests) return { ...result, state: 'idle', summary: 'No request reached the gateway in the last 7 days, so there is nothing to check against the policy.' };
  return { ...result, state: 'ok', summary: `Every request in the last 7 days stayed within the policy (${week.requests === 1 ? 'one request' : `${week.requests} requests`}).` };
}
