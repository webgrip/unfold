import type { PublicationRecord, PullRequestEvidence, PushOutcome } from './shared.ts';

/** `delivery.publisher` after validation: the forge adapter's `kind`, its API root, the server environment variable holding its token, and the forge account that opens pull requests. */
export type PublisherConfig = { kind: string; apiUrl: string; tokenEnv: string; username?: string };
/** A pull request or merge request as the forge answered; `number` is the one later calls name it by. */
export type ProposedChange = { number: number };

/** Publishes one verified canonical commit to a forge: a lease-guarded branch push and one pull request that carries the publication marker. Merge stays human. */
export interface DeliveryPublisher {
  /** The commit `branch` points at on the forge, or null when it does not exist. */
  remoteHead(gitDirectory: string, repositoryUrl: string, branch: string): Promise<string | null>;
  push(gitDirectory: string, repositoryUrl: string, canonicalSha: string, branch: string): Promise<PushOutcome>;
  /** Opens the pull request, or answers `exists` when the forge already has one for the branch. */
  createPullRequest(repositoryUrl: string, input: { head: string; base: string; title: string; body: string }): Promise<ProposedChange | 'exists'>;
  /** The open pull request this publisher opened for `record`, found by its marker, branch and author. */
  findPullRequest(record: PublicationRecord): Promise<ProposedChange | undefined>;
  closePullRequest(record: PublicationRecord, number: number): Promise<void>;
  /** The pull request's number and address when it is exactly the publication of `record` at its canonical commit. */
  verifiedPullRequest(record: PublicationRecord, number: number): Promise<PullRequestEvidence | undefined>;
}

/** One forge Unfold publishes to. */
export interface DeliveryPublisherAdapter {
  /** The `delivery.publisher.kind` that selects it. */
  readonly kind: string;
  readonly label: string;
  /** Whether `url` is an API root of this forge. */
  acceptsApiUrl(url: URL): boolean;
  /** Whether a registered repository URL is one this forge can publish to. */
  acceptsRepository(url: string): boolean;
  create(config: PublisherConfig, options?: { plainHttp?: boolean }): DeliveryPublisher;
}

const adapters = new Map<string, DeliveryPublisherAdapter>();

/** Registers a forge publisher; a second adapter of the same kind is refused. */
export function registerDeliveryPublisher(adapter: DeliveryPublisherAdapter): void {
  if (adapters.has(adapter.kind)) throw new Error(`Delivery publisher ${adapter.kind} is already registered`);
  adapters.set(adapter.kind, adapter);
}

/** The adapter of `kind`, or undefined. */
export function findDeliveryPublisher(kind: string): DeliveryPublisherAdapter | undefined { return adapters.get(kind); }

/** Every registered forge publisher, in registration order. */
export function deliveryPublishers(): DeliveryPublisherAdapter[] { return [...adapters.values()]; }

/** The publisher `config.kind` names; throws for a kind no adapter registered. */
export function createDeliveryPublisher(config: PublisherConfig, options: { plainHttp?: boolean } = {}): DeliveryPublisher {
  const adapter = adapters.get(config.kind);
  if (!adapter) throw new Error(`delivery.publisher.kind ${config.kind} is not a registered forge`);
  return adapter.create(config, options);
}
