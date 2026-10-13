import { escape } from './dom.js';
import { duration, money } from './format.js';
import { failureReason } from './states.js';
import { sessionForWorkItem, sessionProgress } from './progress.js';

const ground = 196;
const cruise = 92;
const lane = 34;
const pad = 72;
const climb = 84;
const roundWidth = 150;
const holdWidth = 184;
const landWidth = 176;
const taxiWidth = 124;
const agentFailureLimit = 3;
const machineFailureLimit = 10;
const production = /^(prod|production|live)$/i;

const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const byId = (a, b) => Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const failedRun = run => run.outcome === 'failed' || run.outcome === 'stuck' || Boolean(run.failureReason);

function runSeconds(run, now) {
  const start = toMs(run.startedAt);
  if (start === null) return null;
  const end = run.state === 'running' ? now : toMs(run.finishedAt);
  return end === null ? null : Math.max(0, (end - start) / 1000);
}

function runMeta(run, now) {
  if (run.state === 'pending') return 'waiting for a worker';
  const parts = [];
  const seconds = runSeconds(run, now);
  if (seconds !== null) parts.push(`${duration(seconds) || '0 s'}${run.state === 'running' ? ' so far' : ''}`);
  if (run.costStatus === 'observed' && Number(run.usage?.costUsd) > 0) parts.push(money(run.usage.costUsd));
  return parts.join(' · ');
}

function runChip(run) {
  if (run.state !== 'finished') return null;
  if (!run.writes && run.verdict === 'approve') return { text: 'approved', tone: 'success' };
  if (!run.writes && run.verdict === 'request_changes') return { text: 'changes requested', tone: 'attention' };
  if (run.failureReason) return { text: failureReason(run.failureReason)?.infra ? 'machine failure' : 'failed', tone: 'danger' };
  if (run.outcome === 'pr_opened') return { text: 'pull request opened', tone: 'neutral' };
  if (run.outcome === 'pr_updated') return { text: 'pull request updated', tone: 'neutral' };
  if (run.outcome === 'no_change_needed') return { text: 'no change needed', tone: 'neutral' };
  if (run.outcome === 'stuck') return { text: 'stuck', tone: 'danger' };
  return null;
}

function runStatus(run) {
  if (run.state === 'running' || run.state === 'pending') return 'running';
  if (run.state === 'stopped') return 'failed';
  return failedRun(run) ? 'failed' : 'done';
}

/** One waypoint from the Runs of one Role in one Round: the newest Run decides; earlier ones are its tries. */
function waypoint(runs, now) {
  const ordered = [...runs].sort(byId);
  const last = ordered.at(-1);
  const tries = ordered.length > 1 ? ordered.map(run => run.state === 'running' || run.state === 'pending' ? 'running' : failedRun(run) ? 'failed' : 'done') : [];
  const machine = ordered.filter(failedRun).every(run => failureReason(run.failureReason)?.infra);
  return {
    id: String(last.id), runId: String(last.id), role: capital(last.role || 'agent'), kind: last.writes ? 'writer' : 'reader',
    status: runStatus(last), meta: tries.length ? `try ${ordered.length}${runMeta(last, now) ? ` · ${runMeta(last, now)}` : ''}` : runMeta(last, now),
    chip: runChip(last), tries, limit: tries.length ? (machine ? machineFailureLimit : agentFailureLimit) : 0,
  };
}

function roundLegs(runs, now) {
  const rounds = new Map();
  for (const run of runs) {
    const round = Number.isInteger(run.round) && run.round > 0 ? run.round : 0;
    if (!rounds.has(round)) rounds.set(round, []);
    rounds.get(round).push(run);
  }
  const legs = [];
  let fixes = 0;
  for (const [, members] of [...rounds.entries()].sort((a, b) => a[0] - b[0])) {
    const roles = new Map();
    for (const run of members) {
      const key = `${run.role || 'agent'}:${run.writes ? 'w' : 'r'}`;
      if (!roles.has(key)) roles.set(key, []);
      roles.get(key).push(run);
    }
    const nodes = [...roles.values()].map(group => waypoint(group, now));
    const previous = legs.at(-1);
    const fix = Boolean(previous && nodes.some(node => node.kind === 'writer') && previous.nodes.some(node => node.chip?.text === 'changes requested'));
    if (fix) fixes += 1;
    legs.push({ type: 'round', fix: fix ? `holding · fix ${fixes}` : '', nodes });
  }
  return legs;
}

const sessionStatus = { done: 'done', working: 'running', asking: 'you', paused: 'running', waiting: 'ahead', failed: 'failed', cut_off: 'failed', cancelled: 'failed' };

function sessionLegs(progress) {
  return progress.steps.map(step => ({
    type: 'round', fix: '',
    nodes: [{
      id: `step-${step.id}`, runId: null, sessionId: progress.sessionId, role: capital(step.role), kind: step.mode === 'read' ? 'reader' : 'writer', status: sessionStatus[step.state] ?? 'done',
      meta: step.seconds !== null ? `${duration(step.seconds) || '0 s'}${step.state === 'working' ? ' so far' : ''}` : step.label,
      chip: step.verdict ? { text: step.verdict.key === 'approve' ? 'approved' : step.verdict.key === 'request_changes' ? 'changes requested' : step.verdict.label.toLowerCase(), tone: step.verdict.key === 'approve' ? 'success' : 'attention' } : null,
      tries: [], limit: 0,
    }],
  }));
}

function groundLegs(play, item, card) {
  const legs = [];
  const ci = play.ci?.state ?? null;
  legs.push({ type: 'taxi', id: 'checks', role: 'Checks', status: ci === 'success' ? 'done' : ci === 'failure' || ci === 'error' ? 'failed' : ci === 'pending' ? 'running' : 'ahead', meta: ci === 'success' ? 'passed' : ci === 'failure' ? 'failed' : ci === 'error' ? 'errored' : ci === 'pending' ? 'running' : 'not reported' });
  const approval = (play.reviews || []).filter(review => review.state === 'approved').at(-1);
  const merged = play.state === 'merged';
  const reviewing = item.state === 'awaiting_review' && !merged;
  legs.push({ type: 'taxi', id: 'review', role: 'Your review', status: approval || merged ? 'done' : reviewing ? 'you' : 'ahead', meta: approval ? approval.reviewer || 'approved' : reviewing ? 'waiting for you' : 'on the forge' });
  legs.push({ type: 'taxi', id: 'merge', role: 'Merge', status: merged ? 'done' : play.state === 'closed' ? 'failed' : 'ahead', meta: merged ? play.mergedBy || 'merged' : play.state === 'closed' ? 'closed without merging' : '' });
  const deployments = (Array.isArray(play.deployments) && play.deployments.length ? play.deployments : Array.isArray(card?.deployments) ? card.deployments : []).filter(entry => entry?.environment);
  const ordered = [...deployments].sort((a, b) => String(a.firstDeployedAt ?? '').localeCompare(String(b.firstDeployedAt ?? '')));
  for (const entry of ordered.filter(entry => !production.test(entry.environment))) legs.push({ type: 'taxi', id: `deploy-${entry.environment}`, role: capital(entry.environment), status: 'done', meta: entry.sha ? `deployed ${String(entry.sha).slice(0, 7)}` : 'deployed' });
  const prod = ordered.find(entry => production.test(entry.environment));
  const known = Array.isArray(card?.deployments) || Array.isArray(play.deployments);
  legs.push({ type: 'arrive', id: 'arrive', role: prod ? capital(prod.environment) : 'Production', status: prod ? 'done' : 'ahead', meta: prod ? (prod.sha ? `deployed ${String(prod.sha).slice(0, 7)}` : 'deployed') : known ? '' : 'no deploy facts' });
  return legs;
}

/**
 * A Work Item as a flight, from Ploeg's detail, its Run card and the session that drives it. The legs, in order: the
 * gate (waiting for a worker), take-off (the first Run claimed), one `round` leg per Round whose waypoints are the
 * Runs of each Role (retries become tries on one waypoint; a writer Round after "changes requested" is a fix round),
 * a `hold` while a session's change waits for a person, the landing (the pull request), a go-around when a later
 * Shift starts after it, `taxi` legs for checks, review, merge and every non-production deploy, and the arrival in
 * production. A Work Item that stopped diverts instead. Each waypoint's `status` is `done`, `running`, `failed`,
 * `you` or `ahead`, and exactly one leg or waypoint carries `current: true` unless nothing has happened yet.
 * @returns {{ phase: string, legs: object[] }}
 */
export function flightPlan({ detail, card = null, sessions = [], now = Date.now(), publisher = false } = {}) {
  const item = detail?.item;
  if (!item) return { phase: 'gate', legs: [] };
  const shifts = [...(detail.shifts || [])].sort((a, b) => (toMs(a.openedAt) ?? 0) - (toMs(b.openedAt) ?? 0));
  const runs = detail.runs || [];
  const plays = Array.isArray(card?.plays) ? card.plays : [];
  const session = sessionForWorkItem(sessions, item.id);
  const progress = session ? sessionProgress(session, { ploeg: detail, now }) : null;
  const legs = [{ type: 'gate', id: 'gate', role: 'Ask', status: shifts.length ? 'done' : 'running', meta: item.externalId ? `#${item.externalId}` : '' }];
  const stopped = ['needs_human', 'stale', 'withdrawn'].includes(item.state);
  const settled = stopped || item.state === 'done';
  let landed = false;
  let lastPlay = null;
  shifts.forEach((shift, index) => {
    const own = runs.filter(run => String(run.shiftId ?? '') === String(shift.id));
    const started = own.some(run => run.startedAt) || Boolean(progress?.steps.length);
    if (index === 0) legs.push({ type: 'takeoff', id: `takeoff-${shift.id}`, status: started ? 'done' : settled ? 'ahead' : 'running' });
    else legs.push({ type: 'goaround', id: `goaround-${shift.id}`, label: landed && lastPlay?.ci && ['failure', 'error'].includes(lastPlay.ci.state) ? 'go-around · checks failed' : landed ? 'go-around' : `attempt ${index + 1}`, from: landed ? 'ground' : 'air' });
    landed = false;
    const steps = index === shifts.length - 1 && progress?.steps.length && own.every(run => run.role === 'operator') ? sessionLegs(progress) : roundLegs(own, now);
    legs.push(...steps);
    const play = plays.find(entry => String(entry.shiftId ?? '') === String(shift.id)) ?? (index === shifts.length - 1 ? plays.find(entry => !entry.shiftId) ?? null : null);
    if (play && index < shifts.length - 1) {
      legs.push({ type: 'land', id: `land-${play.number}`, role: `PR #${play.number}`, status: 'done', meta: 'landed' });
      const ci = play.ci?.state;
      legs.push({ type: 'taxi', id: `checks-${play.number}`, role: 'Checks', status: ci === 'failure' || ci === 'error' ? 'failed' : ci === 'success' ? 'done' : 'ahead', meta: ci === 'failure' ? 'failed' : ci === 'error' ? 'errored' : ci === 'success' ? 'passed' : '' });
      landed = true;
      lastPlay = play;
    }
  });
  const play = plays.at(-1) ?? null;
  const waiting = progress && ['review', 'changes_requested'].includes(progress.phase) && !play;
  if (waiting) legs.push({ type: 'hold', id: 'hold', role: 'You', status: 'you', meta: progress.phase === 'review' ? 'clear it to land' : 'changes requested', sessionId: progress.sessionId });
  if (play) {
    legs.push({ type: 'land', id: `land-${play.number}`, role: `PR #${play.number}`, status: 'done', meta: play.changedFiles ? `${play.changedFiles} ${play.changedFiles === 1 ? 'file' : 'files'}${Number.isFinite(play.additions) ? ` · +${play.additions} −${play.deletions ?? 0}` : ''}` : 'ready for review', url: play.url || null });
    legs.push(...groundLegs(play, item, card));
  } else if (item.pullRequest?.url && item.state === 'awaiting_review') {
    legs.push({ type: 'land', id: 'land', role: item.pullRequest.number ? `PR #${item.pullRequest.number}` : 'Pull request', status: 'done', meta: 'ready for review', url: item.pullRequest.url });
    legs.push({ type: 'taxi', id: 'review', role: 'Your review', status: 'you', meta: 'waiting for you' }, { type: 'taxi', id: 'merge', role: 'Merge', status: 'ahead', meta: '' }, { type: 'arrive', id: 'arrive', role: 'Production', status: 'ahead', meta: '' });
  } else if (stopped) {
    legs.push({ type: 'divert', id: 'divert', role: item.state === 'withdrawn' ? 'Withdrawn' : 'Needs you', status: item.state === 'withdrawn' ? 'failed' : 'you', meta: item.state === 'stale' ? 'stopped retrying' : item.state === 'withdrawn' ? 'flight cancelled' : 'stopped' });
  } else if (item.state === 'done' && !waiting) {
    legs.push({ type: 'arrive', id: 'arrive', role: 'Done', status: 'done', meta: progress?.phase === 'rejected' ? 'change rejected' : 'no change to deliver' });
  } else {
    legs.push({ type: 'land', id: 'land', role: 'Pull request', status: 'ahead', meta: waiting && publisher ? 'opened by the Unfold bot' : '' }, { type: 'taxi', id: 'review', role: 'Your review', status: 'ahead', meta: '' }, { type: 'taxi', id: 'merge', role: 'Merge', status: 'ahead', meta: '' }, { type: 'arrive', id: 'arrive', role: 'Production', status: 'ahead', meta: '' });
  }
  if (play && stopped) legs.splice(legs.length - 1, 1, { type: 'divert', id: 'divert', role: item.state === 'withdrawn' ? 'Withdrawn' : 'Needs you', status: item.state === 'withdrawn' ? 'failed' : 'you', meta: 'stopped' });
  const marks = legs.flatMap(leg => leg.type === 'round' ? leg.nodes : [leg]);
  const last = legs.at(-1);
  const current = stopped ? last : [...marks].reverse().find(mark => mark.status === 'you' || mark.status === 'running') ?? (last?.type === 'arrive' && last.status === 'done' ? last : null);
  if (current) current.current = true;
  return { phase: flightPhase(legs, current), legs };
}

function flightPhase(legs, current) {
  if (current?.type === 'divert' && current.role === 'Withdrawn') return 'withdrawn';
  if (!current) return 'air';
  const leg = legs.find(entry => entry === current || entry.nodes?.includes(current));
  if (!leg) return 'air';
  return { gate: 'gate', takeoff: 'air', round: 'air', goaround: 'air', hold: 'holding', land: 'landed', taxi: 'taxi', arrive: 'arrived', divert: 'diverted' }[leg.type] ?? 'air';
}

/** What each flight phase says on the page. */
export const phaseWords = Object.freeze({
  gate: ['At the gate', 'Waiting for a worker to pick it up.'],
  air: ['In flight', 'Agents are working on it.'],
  holding: ['Holding for you', 'The agents finished; clear the landing to deliver the change.'],
  landed: ['Landed', 'The pull request is ready for people.'],
  taxi: ['Taxiing', 'On the forge: checks, review and merge.'],
  arrived: ['Arrived', 'Running in production, or finished without a change.'],
  diverted: ['Diverted', 'It stopped and needs a person.'],
  withdrawn: ['Withdrawn', 'The flight was cancelled; nothing more runs.'],
});

const svgNum = value => Math.round(value * 10) / 10;

function nodeMarkup(node, cx, cy, above) {
  const labelY = above ? cy - 32 : cy + 26;
  const parts = [`<g class="flight-node" data-status="${escape(node.status)}"${node.current ? ' data-current' : ''}>`];
  if (node.current) parts.push(`<circle class="flight-halo" cx="${svgNum(cx)}" cy="${svgNum(cy)}" r="16"/><use href="#flight-mark" x="${svgNum(cx - 15)}" y="${svgNum(cy - 15)}" width="30" height="30"/>`);
  else parts.push(`<circle class="flight-dot" cx="${svgNum(cx)}" cy="${svgNum(cy)}" r="7"/>`);
  if (!node.current && node.status === 'done') parts.push(`<path class="flight-tick" d="M${svgNum(cx - 3.5)} ${svgNum(cy)} l2.5 2.5 l4.5 -5"/>`);
  if (!node.current && node.status === 'failed') parts.push(`<path class="flight-cross" d="M${svgNum(cx - 3)} ${svgNum(cy - 3)} l6 6 M${svgNum(cx + 3)} ${svgNum(cy - 3)} l-6 6"/>`);
  parts.push(`<text class="flight-role" x="${svgNum(cx)}" y="${svgNum(labelY)}" text-anchor="middle">${escape(node.role)}</text>`);
  if (node.meta) parts.push(`<text class="flight-meta" x="${svgNum(cx)}" y="${svgNum(labelY + 13)}" text-anchor="middle">${escape(node.meta)}</text>`);
  if (node.chip) parts.push(`<text class="flight-chip" data-tone="${escape(node.chip.tone)}" x="${svgNum(cx)}" y="${svgNum(labelY + 26)}" text-anchor="middle">${escape(node.chip.text)}</text>`);
  if (node.tries?.length) {
    const total = Math.max(node.tries.length, node.limit);
    const start = cx - (total * 7) / 2;
    for (let index = 0; index < total; index++) parts.push(`<rect class="flight-try" data-try="${escape(node.tries[index] ?? 'left')}" x="${svgNum(start + index * 7)}" y="${svgNum(cy + 17)}" width="5" height="9" rx="1"/>`);
  }
  parts.push('</g>');
  return parts.join('');
}

function hitMarkup(node, cx, cy) {
  const spoken = [node.role, node.meta, node.chip?.text, node.tries?.length ? `${node.tries.filter(entry => entry === 'failed').length} failed tries of at most ${node.limit}` : ''].filter(Boolean).join(', ');
  const status = { done: 'done', running: 'in flight', failed: 'failed', you: 'waiting for you', ahead: 'not yet' }[node.status] ?? node.status;
  const label = `${spoken}: ${status}`;
  const box = `x="${svgNum(cx - 16)}" y="${svgNum(cy - 16)}" width="32" height="32"`;
  if (node.runId) return `<foreignObject ${box}><button type="button" class="flight-hit" data-action="work-run" data-id="${escape(node.runId)}" aria-label="${escape(label)}" title="${escape(label)}"></button></foreignObject>`;
  if (node.url) return `<foreignObject ${box}><a class="flight-hit" href="${escape(node.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label)}" title="${escape(label)}"></a></foreignObject>`;
  if (node.sessionId) return `<foreignObject ${box}><a class="flight-hit" href="#session/${escape(encodeURIComponent(node.sessionId))}" aria-label="${escape(label)}" title="${escape(label)}"></a></foreignObject>`;
  return `<title>${escape(label)}</title>`;
}

const segment = status => ({ done: 'done', running: 'live', failed: 'failed', you: 'you', ahead: 'ahead' }[status] ?? 'ahead');

/**
 * The flight profile as SVG: a sky with the agents' altitude and the ground, the route drawn leg by leg, waypoints
 * that open their Run (or pull request, or session), and the Unfold mark at the current position in its drawn,
 * climbing orientation. Colours and type come from CSS classes only; the page's CSP allows no inline styles.
 * @returns {{ svg: string, width: number, height: number }}
 */
export function flightSvg(plan) {
  let x = pad;
  let altitude = 'ground';
  const back = [];
  const route = [];
  const fore = [];
  const hits = [];
  let runwayFrom = null;
  let runwayTo = null;
  const y = level => level === 'ground' ? ground : cruise;
  const place = (node, cx, cy, above) => { fore.push(nodeMarkup(node, cx, cy, above)); hits.push(hitMarkup(node, cx, cy)); };
  for (const leg of plan.legs) {
    if (leg.type === 'gate') {
      const cx = x + 4;
      fore.push(`<g class="flight-airport" data-status="${escape(leg.status)}"${leg.current ? ' data-current' : ''}><rect x="${svgNum(cx - 16)}" y="${ground - 16}" width="32" height="18" rx="3"/><text class="flight-airport-name" x="${svgNum(cx)}" y="${ground + 22}" text-anchor="middle">${escape(leg.role)}</text>${leg.meta ? `<text class="flight-meta" x="${svgNum(cx)}" y="${ground + 35}" text-anchor="middle">${escape(leg.meta)}</text>` : ''}</g>`);
      if (leg.current) fore.push(`<use href="#flight-mark" x="${svgNum(cx - 15)}" y="${ground - 52}" width="30" height="30"/>`);
      x += 44;
    } else if (leg.type === 'takeoff' || leg.type === 'goaround') {
      if (leg.type === 'goaround' && leg.from === 'air') {
        route.push(`<path class="flight-path" data-segment="ahead" d="M${svgNum(x)} ${cruise} H${svgNum(x + 40)}"/>`);
        fore.push(`<line class="flight-attempt" x1="${svgNum(x + 20)}" x2="${svgNum(x + 20)}" y1="${cruise - 34}" y2="${cruise + 34}"/><text class="flight-note" x="${svgNum(x + 20)}" y="${cruise - 40}" text-anchor="middle">${escape(leg.label)}</text>`);
        x += 40;
      } else {
        route.push(`<path class="flight-path" data-segment="${leg.type === 'goaround' ? 'failed' : segment(leg.status)}" d="M${svgNum(x)} ${ground} L${svgNum(x + 14)} ${ground} L${svgNum(x + climb)} ${cruise}"/>`);
        fore.push(`<text class="flight-note${leg.type === 'goaround' ? '" data-tone="danger' : ''}" x="${svgNum(x + 52)}" y="${ground - 34}">${escape(leg.type === 'goaround' ? leg.label : 'take-off')}</text>`);
        x += climb;
      }
      altitude = 'air';
    } else if (leg.type === 'round') {
      const count = leg.nodes.length;
      const status = leg.nodes.some(node => node.status === 'running') ? 'running' : leg.nodes.every(node => node.status === 'done') ? 'done' : leg.nodes.some(node => node.status === 'failed') ? 'failed' : leg.nodes.some(node => node.status === 'you') ? 'you' : 'ahead';
      if (leg.fix) {
        const left = x - roundWidth / 2;
        const right = x + roundWidth / 2;
        route.push(`<path class="flight-loop" d="M${svgNum(right)} ${cruise + 12} C${svgNum(right)} ${cruise + 64} ${svgNum(left)} ${cruise + 64} ${svgNum(left)} ${cruise + 12}"/><path class="flight-loop" d="M${svgNum(left - 5)} ${cruise + 20} L${svgNum(left)} ${cruise + 12} L${svgNum(left + 5)} ${cruise + 20}"/>`);
        fore.push(`<text class="flight-note" data-tone="attention" x="${svgNum(x)}" y="${cruise + 62}" text-anchor="middle">${escape(leg.fix)}</text>`);
      }
      if (count === 1) {
        route.push(`<path class="flight-path" data-segment="${segment(status)}" d="M${svgNum(x)} ${cruise} H${svgNum(x + roundWidth)}"/>`);
        place(leg.nodes[0], x + roundWidth / 2, cruise, true);
      } else {
        leg.nodes.forEach((node, index) => {
          const cy = cruise + (index - (count - 1) / 2) * lane * 2;
          const cx = x + roundWidth / 2;
          route.push(`<path class="flight-path" data-segment="${segment(node.status)}" d="M${svgNum(x)} ${cruise} C${svgNum(x + 40)} ${cruise} ${svgNum(x + 40)} ${svgNum(cy)} ${svgNum(cx)} ${svgNum(cy)} C${svgNum(x + roundWidth - 40)} ${svgNum(cy)} ${svgNum(x + roundWidth - 40)} ${cruise} ${svgNum(x + roundWidth)} ${cruise}"/>`);
          place(node, cx, cy, index < count / 2);
        });
      }
      x += roundWidth;
    } else if (leg.type === 'hold') {
      const cx = x + holdWidth / 2;
      route.push(`<path class="flight-path" data-segment="you" d="M${svgNum(x)} ${cruise} H${svgNum(x + holdWidth)}"/><path class="flight-holding" d="M${svgNum(cx - 38)} ${cruise} C${svgNum(cx - 66)} ${cruise} ${svgNum(cx - 66)} ${cruise - 44} ${svgNum(cx - 38)} ${cruise - 44} H${svgNum(cx + 38)} C${svgNum(cx + 66)} ${cruise - 44} ${svgNum(cx + 66)} ${cruise} ${svgNum(cx + 38)} ${cruise}"/>`);
      fore.push(`<text class="flight-note" data-tone="you" x="${svgNum(cx)}" y="${cruise - 52}" text-anchor="middle">holding · waiting for your clearance</text>`);
      place(leg, cx, cruise, false);
      x += holdWidth;
    } else if (leg.type === 'land') {
      const touch = x + landWidth;
      const from = altitude === 'air' ? cruise : ground;
      route.push(`<path class="flight-path" data-segment="${leg.status === 'done' ? 'done' : 'ahead'}" d="M${svgNum(x)} ${from} C${svgNum(x + 60)} ${from} ${svgNum(x + 110)} ${ground - 14} ${svgNum(touch - 10)} ${ground} L${svgNum(touch)} ${ground}"/>`);
      for (let index = 0; index < 4; index++) back.push(`<rect class="flight-light"${leg.status === 'done' ? ' data-lit' : ''} x="${svgNum(touch - 70 + index * 11)}" y="${ground + 6}" width="8" height="5" rx="1"/>`);
      if (runwayFrom === null) runwayFrom = touch - 20;
      place(leg, touch + 6, ground, true);
      x = touch + 30;
      runwayTo = x;
      altitude = 'ground';
    } else if (leg.type === 'taxi') {
      route.push(`<path class="flight-path" data-segment="${segment(leg.status)}" d="M${svgNum(x)} ${ground} H${svgNum(x + taxiWidth)}"/>`);
      place(leg, x + taxiWidth / 2, ground, true);
      x += taxiWidth;
      runwayTo = x;
    } else if (leg.type === 'arrive' || leg.type === 'divert') {
      if (leg.type === 'divert' && altitude === 'air') {
        route.push(`<path class="flight-path" data-segment="failed" d="M${svgNum(x)} ${cruise} C${svgNum(x + 70)} ${cruise} ${svgNum(x + 80)} ${ground} ${svgNum(x + 150)} ${ground}"/>`);
        fore.push(`<text class="flight-note" data-tone="danger" x="${svgNum(x + 46)}" y="${cruise + 56}">diverted</text>`);
        x += 150;
      }
      const cx = x + 40;
      fore.push(`<g class="flight-airport" data-status="${escape(leg.status)}" data-type="${leg.type}"${leg.current ? ' data-current' : ''}><rect x="${svgNum(cx - 16)}" y="${ground - 16}" width="32" height="18" rx="3"/><text class="flight-airport-name" x="${svgNum(cx)}" y="${ground + 22}" text-anchor="middle">${escape(leg.role)}</text>${leg.meta ? `<text class="flight-meta" x="${svgNum(cx)}" y="${ground + 35}" text-anchor="middle">${escape(leg.meta)}</text>` : ''}</g>`);
      if (leg.current) fore.push(`<use href="#flight-mark" x="${svgNum(cx - 15)}" y="${ground - 52}" width="30" height="30"/>`);
      hits.push(hitMarkup(leg, cx, ground - 7));
      x = cx + 40;
      altitude = 'ground';
    }
  }
  const width = Math.ceil(x + pad / 2);
  const height = ground + 48;
  const runway = runwayFrom === null ? '' : `<line class="flight-runway" x1="${svgNum(runwayFrom)}" x2="${svgNum(runwayTo ?? runwayFrom + 120)}" y1="${ground}" y2="${ground}"/><line class="flight-runway-centre" x1="${svgNum(runwayFrom + 6)}" x2="${svgNum((runwayTo ?? runwayFrom + 120) - 6)}" y1="${ground}" y2="${ground}"/>`;
  const sky = `<line class="flight-level" x1="0" x2="${width}" y1="${cruise}" y2="${cruise}"/><text class="flight-axis" x="6" y="${cruise - 6}">agents</text><line class="flight-ground" x1="0" x2="${width}" y1="${ground}" y2="${ground}"/><text class="flight-axis" x="6" y="${ground - 6}">ground</text>`;
  const mark = '<defs><symbol id="flight-mark" viewBox="0 0 64 64"><path class="flight-mark-sheet" d="M52.625 9.758L11.079 27.437A1.8 1.8 0 0 0 10.949 30.688L28.354 39.805A1.5 1.5 0 0 0 30.199 39.44L53.782 11.321A1 1 0 0 0 52.625 9.758Z"/><path class="flight-mark-fold" d="M53.371 19.067L43.778 53.011A1.8 1.8 0 0 1 40.773 53.795L31.398 44.42A1.5 1.5 0 0 1 31.309 42.395L51.642 18.152A1 1 0 0 1 53.371 19.067Z"/></symbol></defs>';
  return { svg: `<svg class="flight-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Flight profile">${mark}${sky}${runway}${back.join('')}${route.join('')}${fore.join('')}${hits.join('')}</svg>`, width, height };
}

/**
 * Where the time went, to scale: the waits and work `stats` from the value stream (`streamStats`) as one bar of SVG
 * rectangles with percentage widths, and a legend. Empty without any figure.
 */
export function timeRibbon(stats) {
  const parts = [
    ['gate', 'Before the first Run', stats?.beforeFirstRun],
    ['agents', 'Agents', stats?.agents],
    ['ci', 'CI', stats?.ci],
    ['review', 'In review', stats?.review],
    ['deploy', 'Merge to deploy', stats?.deploy],
  ].filter(([, , seconds]) => Number.isFinite(seconds) && seconds > 0);
  const total = parts.reduce((sum, [, , seconds]) => sum + seconds, 0);
  if (!total) return '';
  let offset = 0;
  const rects = parts.map(([id, label, seconds]) => {
    const share = (seconds / total) * 100;
    const rect = `<rect class="flight-ribbon-part" data-part="${id}" x="${offset.toFixed(3)}%" y="0" width="${Math.max(share, 0.4).toFixed(3)}%" height="100%"><title>${escape(`${label}: ${duration(seconds)}`)}</title></rect>`;
    offset += share;
    return rect;
  }).join('');
  const legend = parts.map(([id, label, seconds]) => `<li><span class="flight-ribbon-swatch" data-part="${id}" aria-hidden="true"></span>${escape(label)} <span class="num">${escape(duration(seconds))}</span></li>`).join('');
  return `<div class="flight-ribbon"><p class="flight-ribbon-title overline">Where the time went · to scale</p><svg class="flight-ribbon-bar" width="100%" height="12" role="img" aria-label="${escape(parts.map(([, label, seconds]) => `${label} ${duration(seconds)}`).join(', '))}">${rects}</svg><ul class="flight-ribbon-legend">${legend}</ul></div>`;
}

/** The flight profile figure for a Work Item page: the phase in words, the profile and the time ribbon. */
export function flightMarkup(plan, { stats = null } = {}) {
  if (!plan.legs.length) return '';
  const [title, sentence] = phaseWords[plan.phase] ?? phaseWords.air;
  const { svg } = flightSvg(plan);
  return `<figure class="flight" data-phase="${escape(plan.phase)}" aria-labelledby="flight-title"><figcaption class="flight-caption"><span class="flight-phase" id="flight-title">${escape(title)}</span><span class="flight-sentence">${escape(sentence)}</span></figcaption><div class="flight-sky">${svg}</div>${timeRibbon(stats)}</figure>`;
}
