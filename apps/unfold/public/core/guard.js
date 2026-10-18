/**
 * The tripwires Unfold checks every tool call against. They match patterns in what the transcript already holds: a
 * call's title, its command or path, and its output. A match is a reason to look, not proof; a quiet transcript is
 * not proof of safety either. `severity` is `high` for attempts on secrets, escapes, remote code and spreading
 * injected text, `medium` for the rest.
 * @type {ReadonlyArray<{ id: string, severity: 'high'|'medium', label: string, where: 'input'|'output'|'edit', pattern: RegExp }>}
 */
export const guardRules = Object.freeze([
  Object.freeze({ id: 'injection', severity: 'high', label: 'Read text that gives agents orders', where: 'output', pattern: /\b(ignore|disregard|forget) (all |any )?(of )?(your |the |previous |prior |earlier )+(instructions|rules|guidelines)\b|\bnew instructions for (ai|the) agents?\b|\b(ai|llm) agents? reading this\b|<\/?system>|\byou are now (in )?\w+ mode\b/i }),
  Object.freeze({ id: 'spread', severity: 'high', label: 'Wrote orders for agents into the repository', where: 'edit', pattern: /\b(ignore|disregard) (all |any )?(previous |prior |your )?instructions\b|\b(ai|llm) agents? reading this\b|\bnew instructions for (ai|the) agents?\b/i }),
  Object.freeze({ id: 'remote-code', severity: 'high', label: 'Tried to run code fetched from the network', where: 'input', pattern: /\b(curl|wget)\b[^|;&]*\|\s*(ba|z)?sh\b|\bbase64\s+(-d|--decode)\b[^|;&]*\|\s*(ba|z)?sh\b|\beval\s+"?\$\((curl|wget)\b/i }),
  Object.freeze({ id: 'secrets', severity: 'high', label: 'Went after credentials', where: 'input', pattern: /(~|\$HOME|\/root|\/home\/[\w.-]+)\/\.(ssh|aws|kube|docker|netrc|config\/gh|git-credentials)\b|\bid_(rsa|ed25519)\b|\/proc\/self\/environ\b|\b(printenv|env)\b[^|]*\|\s*grep\s+(-\w+\s+)*['"]?\w*(key|token|secret|pass)/i }),
  Object.freeze({ id: 'escape', severity: 'high', label: 'Probed the sandbox walls', where: 'input', pattern: /\/var\/run\/docker\.sock|\/run\/containerd|\bnsenter\b|\bchroot\b|\/proc\/1\/(root|ns)|\/var\/run\/secrets\/kubernetes\.io|\bkubectl\b|\bsudo\b|\bsetcap\b|\bmount\s+-/i }),
  Object.freeze({ id: 'egress', severity: 'medium', label: 'Reached for a host outside its brief', where: 'input', pattern: /\b(curl|wget|nc|ncat|ssh|scp|rsync|ftp)\b[^\n]*?\b(https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i }),
  Object.freeze({ id: 'self-rules', severity: 'medium', label: 'Changed its own instructions', where: 'edit', pattern: /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)\.claude\/|(^|\/)\.cursor\/rules|(^|\/)\.github\/copilot-instructions\.md$|(^|\/)\.mcp\.json$|(^|\/)skills\/[^/]+\/SKILL\.md$/im }),
]);

const editKinds = new Set(['edit', 'delete', 'move']);

function hostOf(text) {
  const match = text.match(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
  return match ? match[1].toLowerCase() : null;
}

const toMs = value => { const at = typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : Number.NaN; return Number.isFinite(at) ? at : null; };

/**
 * The tool calls in raw transcript entries, as `guardSignals` reads them: one per `toolCallId`, in seq order, with its
 * first entry's time in milliseconds, the latest title, kind, status, input and paths of its `tool_call` entries, and
 * the text of its `tool_output` entries.
 * @param {object[]} entries Raw transcript entries, as Unfold's transcript route returns them.
 * @returns {{ id: string, seq: number, at: number|null, title: string, kind: string, status: string|null, input: string, output: string, paths: string[] }[]}
 */
export function transcriptCalls(entries = []) {
  const calls = new Map();
  for (const entry of [...(entries ?? [])].sort((a, b) => (a?.seq ?? 0) - (b?.seq ?? 0))) {
    if ((entry?.kind !== 'tool_call' && entry?.kind !== 'tool_output') || !entry.toolCallId) continue;
    let call = calls.get(entry.toolCallId);
    if (!call) { call = { id: entry.toolCallId, seq: entry.seq, at: toMs(entry.at), title: '', kind: 'other', status: null, input: '', outputs: [], paths: [] }; calls.set(entry.toolCallId, call); }
    if (entry.kind === 'tool_call') {
      if (entry.title) call.title = entry.title;
      if (entry.toolKind) call.kind = entry.toolKind;
      if (entry.status) call.status = entry.status;
      if (entry.input) call.input = entry.input;
      if (entry.paths?.length) call.paths = entry.paths;
    } else if (entry.text) call.outputs.push(entry.text);
  }
  return [...calls.values()].map(({ outputs, ...call }) => ({ ...call, title: call.title || 'Tool call', output: outputs.join('\n').slice(0, 8000) }));
}

/**
 * Every tripwire a followed Run's calls crossed, oldest first. Egress is checked only when `allowedHosts` is a list:
 * without one nobody knows which hosts the brief allows, so reaching a host is not a signal. Egress to a listed host is not a signal;
 * a host the call's output shows as refused is marked `blocked`. Each signal keeps the call it came from.
 * @param {object[]} calls The calls of `liveModel().moves` or of `transcriptCalls`, in order.
 * @param {{ allowedHosts?: string[] }} [options]
 * @returns {{ id: string, rule: string, severity: string, label: string, at: number|null, callId: string, title: string, evidence: string, blocked: boolean }[]}
 */
export function guardSignals(calls, { allowedHosts = null } = {}) {
  const allowed = Array.isArray(allowedHosts) ? allowedHosts.map(host => host.toLowerCase()) : null;
  const signals = [];
  for (const call of calls) {
    const target = [call.input, ...call.paths].join('\n');
    for (const rule of guardRules) {
      const text = rule.where === 'output' ? (editKinds.has(call.kind) ? '' : call.output) : rule.where === 'edit' ? (editKinds.has(call.kind) ? (rule.id === 'spread' ? call.output : target) : '') : call.kind === 'execute' ? call.input : '';
      const match = text?.match(rule.pattern);
      if (!match) continue;
      if (rule.id === 'egress') {
        if (!allowed) continue;
        const host = hostOf(match[0]);
        if (!host || allowed.some(entry => host === entry || host.endsWith(`.${entry}`))) continue;
      }
      if (rule.id === 'egress' && signals.some(signal => signal.callId === call.id && signal.rule === 'remote-code')) continue;
      const blocked = /\b(blocked by (the )?(egress|network) policy|connection refused|permission denied|operation not permitted|forbidden|could not resolve host)\b/i.test(call.output ?? '');
      signals.push({ id: `${call.id}:${rule.id}`, rule: rule.id, severity: rule.severity, label: rule.label, at: call.at, callId: call.id, title: call.title, evidence: match[0].trim().slice(0, 160), blocked });
    }
  }
  return signals;
}

/**
 * What changed between the rules a Run started with and the rules it has now. Proposed: Ploeg does not report these
 * snapshots yet; a caller passes them as `{ startedWith, current }`, each `{ instructions, skills, tools, hosts }`.
 * @param {{ startedWith: object, current: object }|null} policy
 * @returns {{ field: string, added: string[], removed: string[] }[]|null} Null when no snapshot was passed.
 */
export function policyDrift(policy) {
  if (!policy?.startedWith || !policy?.current) return null;
  const fields = ['instructions', 'skills', 'tools', 'hosts'];
  return fields.map(field => {
    const before = new Set([].concat(policy.startedWith[field] ?? []));
    const after = new Set([].concat(policy.current[field] ?? []));
    return { field, added: [...after].filter(entry => !before.has(entry)), removed: [...before].filter(entry => !after.has(entry)) };
  }).filter(change => change.added.length || change.removed.length);
}
