-- Forensics taxonomy: classifies the root cause of a failed or stuck run
-- (VIK-597). NULL = no failure (successful outcome). Set by the worker on
-- outcome report or by the sweeper on lease expiry.
ALTER TABLE agent_runs ADD COLUMN failure_reason TEXT;
