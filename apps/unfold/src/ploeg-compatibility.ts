import { readFileSync } from 'node:fs';

export type PloegContractRequirement = { contract: string; version: number };
export type PloegServedContract = { name: string; versions: number[] };
/** What a Ploeg says it serves at `GET /api/v1/operator/version`; `legacy` marks a Ploeg that predates that route. */
export type PloegServed = { ploeg: string | null; contracts: PloegServedContract[]; legacy: boolean };
export type PloegCompatibility =
  | { state: 'unchecked' }
  | { state: 'compatible'; ploeg: string | null; checkedAt: string }
  | { state: 'incompatible'; ploeg: string | null; missing: PloegContractRequirement[]; checkedAt: string; message: string };
type LogLine = { level: 'info' | 'warn' | 'error'; event: string; message: string } & Record<string, unknown>;

/** The expectation set Unfold records for Ploeg's CI; Ploeg keeps it at `docs/contracts/consumers/unfold/<line>.json` (system ADR-0044). */
export const ploegExpectationsUrl = new URL('./ploeg-expectations.json', import.meta.url);
const expectations = JSON.parse(readFileSync(ploegExpectationsUrl, 'utf8')) as { line: string; requires: PloegContractRequirement[] };

/** The contract majors this Unfold requires of the Ploeg it talks to. */
export const ploegRequirements: readonly PloegContractRequirement[] = Object.freeze(expectations.requires.map(requirement => Object.freeze({ ...requirement })));

/** What a Ploeg without the version route serves: major 1 of every contract, because it predates every major 2 (Ploeg ADR-0146). */
export function legacyServed(required: readonly PloegContractRequirement[] = ploegRequirements): PloegServed {
  return { ploeg: null, legacy: true, contracts: required.map(requirement => ({ name: requirement.contract, versions: [1] })) };
}

/** The required contract majors the Ploeg does not serve. */
export function missingContracts(served: PloegServed, required: readonly PloegContractRequirement[] = ploegRequirements): PloegContractRequirement[] {
  return required.filter(requirement => !served.contracts.some(contract => contract.name === requirement.contract && contract.versions.includes(requirement.version)));
}

const named = (contract: string, versions: number[]) => versions.map(version => `${contract} v${version}`).join(', ');

/** The sentence an operator reads when the Ploeg does not serve what this Unfold requires. */
export function incompatibleMessage(unfoldVersion: string, served: PloegServed, missing: PloegContractRequirement[]): string {
  const offered = missing.map(requirement => { const contract = served.contracts.find(each => each.name === requirement.contract); return contract ? named(contract.name, contract.versions) : `no ${requirement.contract}`; }).join('; ');
  return `Unfold ${unfoldVersion} requires Ploeg contract ${missing.map(requirement => named(requirement.contract, [requirement.version])).join(', ')}, but this Ploeg (${served.ploeg ?? 'a release without the version route'}) serves ${offered}. Run the Ploeg this Unfold release carries or the minor before it, or upgrade Unfold.`;
}

const writeLog = (line: LogLine) => (line.level === 'info' ? console.log : console.error)(JSON.stringify(line));

/**
 * Asks Ploeg which contract majors it serves, at start and then on an interval, and keeps the answer.
 * A Ploeg that does not serve a required major makes Unfold not ready; a Ploeg that cannot be reached keeps the last answer,
 * because an outage is not an incompatibility.
 */
export class PloegCompatibilityMonitor {
  private current: PloegCompatibility = { state: 'unchecked' };
  private timer: NodeJS.Timeout | undefined;
  private unreadable = false;
  private readonly probe: () => Promise<PloegServed>;
  private readonly unfoldVersion: string;
  private readonly log: (line: LogLine) => void;
  constructor(probe: () => Promise<PloegServed>, unfoldVersion: string, log: (line: LogLine) => void = writeLog) { this.probe = probe; this.unfoldVersion = unfoldVersion; this.log = log; }
  get status(): PloegCompatibility { return this.current; }
  get ready(): boolean { return this.current.state !== 'incompatible'; }
  async check(): Promise<PloegCompatibility> {
    let served: PloegServed;
    try { served = await this.probe(); }
    catch (error) {
      if (!this.unreadable) this.log({ level: 'warn', event: 'ploeg.version_unreadable', message: `Unfold could not read which contracts Ploeg serves; it keeps its last answer (${this.current.state}). ${String((error as Error)?.message ?? error).slice(0, 200)}` });
      this.unreadable = true;
      return this.current;
    }
    this.unreadable = false;
    const missing = missingContracts(served);
    const checkedAt = new Date().toISOString();
    const next: PloegCompatibility = missing.length ? { state: 'incompatible', ploeg: served.ploeg, missing, checkedAt, message: incompatibleMessage(this.unfoldVersion, served, missing) } : { state: 'compatible', ploeg: served.ploeg, checkedAt };
    if (next.state === 'incompatible' && (this.current.state !== 'incompatible' || this.current.message !== next.message)) this.log({ level: 'error', event: 'ploeg.contract_incompatible', ploeg: served.ploeg, unfold: this.unfoldVersion, required: ploegRequirements, served: served.contracts, message: next.message });
    if (next.state === 'compatible' && this.current.state !== 'compatible') this.log({ level: 'info', event: 'ploeg.contract_compatible', ploeg: served.ploeg, unfold: this.unfoldVersion, legacy: served.legacy, message: served.legacy ? 'Ploeg predates the version route; it serves major 1 of every contract, which this Unfold requires.' : 'Ploeg serves every contract major this Unfold requires.' });
    this.current = next;
    return next;
  }
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => { void this.check(); }, intervalMs).unref();
  }
  stop(): void { clearInterval(this.timer); this.timer = undefined; }
}
