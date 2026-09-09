export type FailureCategory = 'missing_executable' | 'workspace_setup' | 'gateway_rejected' | 'harness_rejected' | 'connectivity' | 'timeout' | 'cancelled' | 'prompt_acceptance_unknown' | 'runtime_failure' | 'review_incomplete' | 'input_unresolved';
export type FailureStage = 'credentials' | 'workspace' | 'runtime' | 'prompt' | 'execution';
export type PromptAcceptance = 'not_submitted' | 'rejected' | 'accepted' | 'unknown';
export type ExecutionFailure = { category: FailureCategory; stage: FailureStage; message: string; remediation: string; promptAcceptance: PromptAcceptance; automaticRetry: false };

const descriptions: Record<FailureCategory, { message: string; remediation: string }> = {
  missing_executable: { message: 'A required runtime or workspace executable is unavailable.', remediation: 'Ask an administrator to check the configured executable, its permissions and the workspace image before starting new work.' },
  workspace_setup: { message: 'The workspace could not be prepared.', remediation: 'Check the registered repository, clone access, workspace storage and provisioning policy. Inspect restricted infrastructure logs using the session identifier.' },
  gateway_rejected: { message: 'The model gateway rejected a request.', remediation: 'Ask an administrator to check the registered model route, scoped credential, budget and gateway policy. Reconcile prior spend before starting new work.' },
  harness_rejected: { message: 'The agent runtime rejected a request or reported a failure.', remediation: 'Check runtime authentication, model configuration and adapter compatibility. Inspect the retained evidence and reconcile spend before starting new work.' },
  connectivity: { message: 'The required service could not be reached or its response was interrupted.', remediation: 'Check service health, DNS, TLS and permitted network egress. Inspect the remote session and reconcile spend before starting new work.' },
  timeout: { message: 'The operation exceeded its configured time limit.', remediation: 'Check workspace readiness, service health and the configured timeout. Confirm the remote turn has stopped and reconcile spend before starting new work.' },
  cancelled: { message: 'The operator requested execution to stop.', remediation: 'Wait for interruption and spending reconciliation before an explicit resume. Cancellation never schedules replacement work.' },
  prompt_acceptance_unknown: { message: 'Prompt acceptance is unknown; the runtime may already have started paid work.', remediation: 'Do not resubmit the prompt. Confirm the remote turn has stopped, inspect its evidence and reconcile gateway spend before deciding whether to start new work.' },
  runtime_failure: { message: 'Execution failed without a recognized safe diagnosis.', remediation: 'Inspect the retained evidence and restricted runtime logs using the session identifier. Confirm interruption and reconcile spend before starting new work.' },
  review_incomplete: { message: 'A required reviewer did not explicitly approve the change.', remediation: 'Inspect the reviewer findings and verification evidence. A person must decide whether to revise the change or request another review.' },
  input_unresolved: { message: 'Execution returned while an operator request was unresolved.', remediation: 'Inspect the recorded permission or question and the runtime evidence. A completed response cannot substitute for the missing operator decision.' },
};

const stages = new Set<FailureStage>(['credentials', 'workspace', 'runtime', 'prompt', 'execution']);
const acceptances = new Set<PromptAcceptance>(['not_submitted', 'rejected', 'accepted', 'unknown']);

export function executionFailure(category: FailureCategory, stage: FailureStage, promptAcceptance: PromptAcceptance): ExecutionFailure {
  const safeCategory = typeof category === 'string' && Object.hasOwn(descriptions, category) ? category : 'runtime_failure';
  const safeStage = stages.has(stage) ? stage : 'execution';
  const safeAcceptance = acceptances.has(promptAcceptance) ? promptAcceptance : 'unknown';
  return { category: safeCategory, stage: safeStage, ...descriptions[safeCategory], promptAcceptance: safeAcceptance, automaticRetry: false };
}

export class RuntimeFailure extends Error {
  readonly category: FailureCategory;
  readonly stage: FailureStage;
  readonly promptAcceptance: PromptAcceptance;
  readonly httpStatus?: number;

  constructor(category: FailureCategory, stage: FailureStage, promptAcceptance: PromptAcceptance = 'not_submitted', httpStatus?: number) {
    const failure = executionFailure(category, stage, promptAcceptance);
    super(failure.message);
    this.name = 'RuntimeFailure';
    this.category = failure.category;
    this.stage = failure.stage;
    this.promptAcceptance = failure.promptAcceptance;
    this.httpStatus = httpStatus;
  }
}

export function classifyFailure(error: unknown, stage: FailureStage, promptAcceptance: PromptAcceptance = 'not_submitted'): ExecutionFailure {
  if (error instanceof RuntimeFailure) return executionFailure(error.category, error.stage, error.promptAcceptance);
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const causeCode = error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? error.cause.code : undefined;
  if (error instanceof Error && error.name === 'TimeoutError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(String(code ?? causeCode))) return executionFailure('timeout', stage, promptAcceptance);
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(code ?? causeCode))) return executionFailure('connectivity', stage, promptAcceptance);
  return executionFailure(stage === 'workspace' ? 'workspace_setup' : 'runtime_failure', stage, promptAcceptance);
}

export function transportFailure(error: unknown, stage: FailureStage): RuntimeFailure {
  const failure = classifyFailure(error, stage);
  return new RuntimeFailure(failure.category === 'runtime_failure' || failure.category === 'workspace_setup' ? 'connectivity' : failure.category, stage);
}
