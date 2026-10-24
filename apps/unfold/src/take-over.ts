import { randomUUID } from 'node:crypto';
import type { User } from './types.ts';
import { PloegError, type PloegClient, type PloegDetail, type PloegRequeued, type PloegTakeOver, type PloegTakeOverStarted } from './ploeg.ts';
import { handBackOffer, takeControlOffer, takeOverRefusal } from '../public/core/take-over.js';

/** The Ploeg calls a take-over and a hand-back need. */
export type TakeOverPloeg = Pick<PloegClient, 'detail' | 'takeOver' | 'requeue'>;

/** What a person picking a taken-over Work Item up needs: where the work is and what Ploeg's Runs last reported. */
export type TakeOverStatus = {
  workItemId: string;
  title: string;
  state: string;
  repository: { forge: string; owner: string; repo: string; baseBranch: string } | null;
  takeOver: PloegTakeOver | null;
  takeControl: { enabled: boolean; reason: string } | null;
  handBack: { enabled: boolean; reason: string } | null;
  latestRun: { id: string; role: string; round: number; summary: string } | null;
};

const commandPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const workItemPattern = /^[1-9][0-9]{0,18}$/;
const fail = (status: number, code: string, message: string): never => { throw new PloegError(status, code, message); };

function latestReport(detail: PloegDetail): TakeOverStatus['latestRun'] {
  const reported = detail.runs.filter(run => run.state === 'finished' && (run.summary || run.solution || run.problem));
  const latest = reported.sort((a, b) => String(a.finishedAt ?? '').localeCompare(String(b.finishedAt ?? ''))).at(-1);
  return latest ? { id: latest.id, role: latest.role, round: latest.round, summary: (latest.summary || latest.solution || latest.problem).slice(0, 2000) } : null;
}

/**
 * A person takes a running Run of a Work Item over and hands it back (Ploeg ADR-0142). Unfold checks what it can see
 * first, so the browser, the plugin and MCP get the same plain refusal before Ploeg is asked, then lets Ploeg decide.
 */
export class TakeOver {
  private ploeg: TakeOverPloeg;
  constructor(ploeg: TakeOverPloeg) { this.ploeg = ploeg; }

  /** Where a Work Item's take-over stands, whether the caller may take control or hand it back now, and the latest Run report. */
  async status(user: User, id: string): Promise<TakeOverStatus> {
    if (!workItemPattern.test(id)) fail(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const detail = await this.ploeg.detail(user, id, true);
    const viewer = { id: user.id, role: user.role };
    const offer = takeControlOffer(detail, viewer);
    const back = handBackOffer(detail, viewer);
    const target = detail.item.target;
    return {
      workItemId: id, title: detail.item.title, state: detail.item.state,
      repository: target ? { forge: target.forge, owner: target.owner, repo: target.repo, baseBranch: target.baseBranch } : null,
      takeOver: detail.takeOver ?? null,
      takeControl: offer ? { enabled: offer.enabled, reason: offer.reason } : null,
      handBack: back ? { enabled: back.enabled, reason: back.reason } : null,
      latestRun: latestReport(detail),
    };
  }

  /** Asks the Work Item's running Runs to stop at their next safe point for the caller, or for `actFor` when an administrator acts for them. */
  async takeControl(user: User, id: string, input: Record<string, unknown>): Promise<PloegTakeOverStarted> {
    if (user.role === 'viewer') fail(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    if (!workItemPattern.test(id)) fail(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const commandId = input.commandId === undefined ? `unfold-take-over-${randomUUID()}` : String(input.commandId);
    if (!commandPattern.test(commandId)) fail(400, 'ploeg_command', 'A take-over needs a command id of 1 to 128 identifier characters.');
    const named = typeof input.actFor === 'string' && input.actFor.trim() ? input.actFor.trim() : undefined;
    if (named && named !== user.id && user.role !== 'admin') fail(403, 'forbidden', 'Only an administrator can take a Work Item over for another person.');
    const detail = await this.ploeg.detail(user, id, true);
    const offer = takeControlOffer(detail, { id: user.id, role: user.role });
    if (!offer) {
      const held = detail.takeOver && (detail.takeOver.state === 'yielding' || detail.takeOver.state === 'taken_over');
      return fail(409, held ? 'take_over_pending' : 'nothing_running', takeOverRefusal(held ? 'take_over_pending' : 'nothing_running'));
    }
    if (!offer.enabled && offer.code !== 'demo') fail(offer.code === 'person_forbidden' ? 403 : 409, offer.code, offer.reason);
    const actFor = named ?? offer.actFor ?? undefined;
    const expectedShiftId = input.expectedShiftId === undefined || input.expectedShiftId === null ? offer.shiftId ?? undefined : String(input.expectedShiftId);
    return this.ploeg.takeOver(user, id, { commandId, ...(expectedShiftId ? { expectedShiftId } : {}), ...(actFor && actFor !== user.id ? { actFor } : {}) });
  }

  /**
   * Hands a taken-over Work Item back to Ploeg: a resume of the Round that yielded, on the same branch, with the
   * person's optional `note` for the next Run. Only the person who took it over, or an administrator acting for them.
   */
  async handBack(user: User, id: string, input: Record<string, unknown>): Promise<PloegRequeued> {
    if (user.role === 'viewer') fail(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    if (!workItemPattern.test(id)) fail(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const commandId = input.commandId === undefined ? `unfold-hand-back-${randomUUID()}` : String(input.commandId);
    if (!commandPattern.test(commandId)) fail(400, 'ploeg_command', 'A hand-back needs a command id of 1 to 128 identifier characters.');
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 4096) fail(400, 'ploeg_requeue', 'A note is at most 4096 characters.');
    const detail = await this.ploeg.detail(user, id, true);
    const current = detail.takeOver;
    if (!current || current.state !== 'taken_over') fail(409, 'nothing_to_hand_back', current?.state === 'yielding' ? 'The Run has not stopped yet. Wait until the Work Item is parked for you, then hand it back.' : 'Nobody holds this Work Item, so there is nothing to hand back.');
    if (current!.by !== user.id && user.role !== 'admin') fail(409, 'taken_over_by_another', takeOverRefusal('taken_over_by_another'));
    return this.ploeg.requeue(user, id, { commandId, expectedState: detail.item.state, resume: true, ...(note ? { note } : {}), ...(current!.by !== user.id ? { actFor: current!.by } : {}) });
  }
}

/** One request to the take-over routes, as `http.ts` hands it over. */
export type TakeOverRequest = { method: string; path: string; user: User; body: () => Promise<Record<string, unknown>> };

const route = /^\/api\/ploeg\/work-items\/([1-9][0-9]{0,18})\/(take-over|hand-back)$/;

/** Whether `path` is a take-over route, so `http.ts` sends it here before its other Ploeg routes. */
export function isTakeOverRoute(path: string): boolean { return route.test(path); }

/** Serves `GET|POST /api/ploeg/work-items/:id/take-over` and `POST .../hand-back`; refusals throw {@link PloegError}. */
export async function takeOverRoute(service: TakeOver, request: TakeOverRequest): Promise<{ status: number; body: unknown }> {
  const [, id, part] = route.exec(request.path) ?? [];
  if (!id) return fail(404, 'not_found', 'API route not found.');
  if (part === 'take-over' && request.method === 'GET') return { status: 200, body: await service.status(request.user, id) };
  if (request.method !== 'POST') return fail(405, 'method', part === 'take-over' ? 'Take control with POST; read where it stands with GET.' : 'Hand a Work Item back with POST.');
  if (part === 'take-over') return { status: 202, body: { takeOver: await service.takeControl(request.user, id, await request.body()) } };
  return { status: 200, body: await service.handBack(request.user, id, await request.body()) };
}
