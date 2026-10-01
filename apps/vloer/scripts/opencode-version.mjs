import { readFileSync } from 'node:fs';

/** The OpenCode version pinned by the agent image, which the probes expect the server to report. */
export const pinnedOpenCodeVersion = readFileSync(new URL('../ops/agent/Dockerfile', import.meta.url), 'utf8').match(/^ARG OPENCODE_VERSION=(\S+)$/m)?.[1]
  ?? (() => { throw new Error('ops/agent/Dockerfile does not pin OPENCODE_VERSION'); })();
