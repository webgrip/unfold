-- Run forensics (VIK-597):
-- 1. Failure reason taxonomy for agent_runs: infra_node / infra_llm /
--    agent_error / budget / lease_lost. Set by the worker (resolveOutcome)
--    or the sweeper (ExpireLeases). NULL = not a failure or unclassified.
-- 2. Node + pod identity on checkpoints so forensics survive pod cleanup.
ALTER TABLE agent_runs ADD COLUMN failure_reason TEXT;
ALTER TABLE checkpoints ADD COLUMN node_name TEXT NOT NULL DEFAULT '';
ALTER TABLE checkpoints ADD COLUMN pod_uid TEXT NOT NULL DEFAULT '';
