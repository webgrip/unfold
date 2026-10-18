/** The Activities a tool call can have (RFC-0009), in the order the trace draws them, each with its label and what it covers. */
export const activities = Object.freeze([
  ['orient', 'Orient', 'Reads its instructions and briefing: AGENTS.md, knowledge, notes, the board'],
  ['explore', 'Explore', 'Reads and searches code and history'],
  ['change', 'Change', 'Edits, writes, moves or deletes files'],
  ['verify', 'Verify', 'Runs tests, builds, linters or the verify script'],
  ['ship', 'Ship', 'Stages, commits, pushes, opens a pull request or writes its outcome'],
  ['setup', 'Setup', 'Installs or repairs its environment'],
  ['wait', 'Wait', 'Sleeps or polls'],
  ['other', 'Other', 'Anything the rules do not place'],
].map(([key, label, covers]) => Object.freeze({ key, label, covers })));

/** One Activity's label and description by key; an unknown key reads as Other. */
export function activityMeta(key) { return activities.find(entry => entry.key === key) ?? activities.at(-1); }

/** Which Activity wins when one command does several things, strongest first. */
export const activityStrength = Object.freeze(['change', 'ship', 'verify', 'setup', 'wait', 'explore', 'orient']);

const toolKinds = Object.freeze({ edit: 'change', delete: 'change', move: 'change', read: 'explore', search: 'explore', fetch: 'explore' });

const orientPath = /(^|[\s/"'=$])(AGENTS\.md|CLAUDE\.md|SKILL\.md|\.agents\/|\.claude\/|knowledge\/|PLOEG_(KNOWLEDGE_DIR|NOTES_FILE|BOARD_FILE|OUTCOME_FILE|VERIFY_SCRIPT))|\bPLOEG_[A-Z_]+|\benv\b[^|]*\|\s*grep\b[^|]*ploeg/i;
const outcomeFile = /PLOEG_OUTCOME_FILE|(^|\/)outcome[^/\s'"]*\.json/;
const draft = /^\/tmp\/[^/\s]*(pr|pull|body|commit|message|description)[^/\s]*$/i;
const scratch = /^(\/dev\/(null|stderr|stdout)|&\d|\/tmp\/|\/proc\/)/;

const filters = new Set(['head', 'tail', 'grep', 'egrep', 'rg', 'wc', 'sort', 'uniq', 'cut', 'tr', 'awk', 'sed', 'xargs', 'jq', 'less', 'more', 'column', 'nl', 'tee', 'cat', 'fold', 'fmt', 'base64', 'sha256sum', 'md5sum', 'paste', 'rev', 'diff']);
const neutral = new Set(['cd', 'pushd', 'popd', 'echo', 'printf', 'true', 'false', ':', 'set', 'export', 'unset', 'source', '.', 'clear', 'exit', 'test', '[', '[[', 'local', 'shopt']);
const explorers = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'find', 'fd', 'ls', 'tree', 'wc', 'stat', 'file', 'du', 'df', 'nl', 'jq', 'yq', 'diff', 'cmp', 'readlink', 'realpath', 'pwd', 'which', 'type', 'whereis', 'env', 'printenv', 'id', 'whoami', 'uname', 'hostname', 'date', 'basename', 'dirname', 'awk', 'sed', 'cut', 'sort', 'column', 'tr', 'od', 'xxd', 'hexdump', 'strings', 'command', 'man', 'ps', 'top', 'free', 'nproc', 'lsof', 'netstat', 'ss', 'dig', 'nslookup', 'ping', 'git-log']);
const changers = new Set(['mv', 'cp', 'rm', 'rmdir', 'mkdir', 'touch', 'ln', 'chmod', 'chown', 'truncate', 'patch', 'apply_patch', 'install']);
const setupTools = new Set(['apt', 'apt-get', 'apk', 'dnf', 'yum', 'brew', 'pip', 'pip3', 'pipx', 'conda', 'gem', 'rustup', 'nvm', 'corepack', 'sdk']);
const waiters = new Set(['sleep', 'watch', 'wait', 'timeout-wait']);
const verifiers = new Set(['pytest', 'tsc', 'eslint', 'prettier', 'vitest', 'jest', 'mocha', 'ava', 'tap', 'shellcheck', 'ruff', 'mypy', 'pyright', 'flake8', 'pylint', 'black', 'golangci-lint', 'staticcheck', 'hadolint', 'yamllint', 'markdownlint', 'actionlint', 'biome', 'stylelint', 'playwright', 'c8', 'nyc', 'kubeconform', 'helm-lint', 'tox', 'nox', 'phpunit', 'rspec']);
const testFile = /(^|\/)(test[_-][^/]*|[^/]*[_-](test|mutation|bench)|[^/]*\.test)\.(py|sh|mjs|js|ts)$|(^|\/)tests?\//;
const verifyScript = /\b(test|tests|check|checks|lint|verify|build|typecheck|type-check|types|docs-check|e2e|ci|qualify|validate|format:check|fmt-check)\b/;

/** Splits a shell command into its simple commands, each with whether it reads a pipe. Quotes and here-document bodies stay with their command. */
export function shellSegments(command) {
  const segments = [];
  let current = '', quote = null, piped = false, escaped = false;
  const push = next => { if (current.trim()) segments.push({ text: current.trim(), piped }); current = ''; piped = next; };
  const text = String(command ?? '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\') { current += char; escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === '"' || char === '\'' || char === '`') { quote = char; current += char; continue; }
    if (char === '\n') {
      const heredoc = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(current);
      if (heredoc) {
        const end = new RegExp(`\\n\\s*${heredoc[1]}\\s*(\\n|$)`).exec(text.slice(index));
        const stop = end ? index + end.index + end[0].length : text.length;
        current += text.slice(index, stop);
        index = stop - 1;
        push(false);
        continue;
      }
      push(false);
      continue;
    }
    if (char === ';') { push(false); continue; }
    if (char === '&' && text[index + 1] === '&') { push(false); index += 1; continue; }
    if (char === '|' && text[index + 1] === '|') { push(false); index += 1; continue; }
    if (char === '|' && text[index - 1] !== '>') { push(true); continue; }
    if (char === '&' && text[index - 1] !== '>' && text[index + 1] !== '>' && text[index - 1] !== '<') { push(false); continue; }
    current += char;
  }
  push(false);
  return segments;
}

function words(segment) {
  const list = (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(word => word.replace(/^\(+/, ''));
  let index = 0;
  while (index < list.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(list[index]) || ['sudo', 'time', 'nice', 'nohup', 'exec', 'then', 'do', 'else', '{', '(', '!'].includes(list[index]))) index += 1;
  if (list[index] === 'timeout') { index += 1; while (index < list.length && /^(-|\d)/.test(list[index])) index += 1; }
  if (list[index] === 'env') { let next = index + 1; while (next < list.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(list[next])) next += 1; if (next > index + 1 && next < list.length) index = next; }
  if (list[index] === 'mise' && list[index + 1] === 'exec') { let next = index + 2; while (next < list.length && list[next] !== '--') next += 1; if (next < list.length) index = next + 1; }
  if (['npx', 'pnpx', 'bunx'].includes(list[index]) || (list[index] === 'uv' && list[index + 1] === 'run') || (list[index] === 'poetry' && list[index + 1] === 'run')) { index += list[index] === 'uv' || list[index] === 'poetry' ? 2 : 1; while (index < list.length && list[index].startsWith('-')) index += 1; }
  const program = (list[index] ?? '').split('/').at(-1);
  return { program, args: list.slice(index + 1).map(arg => arg.replace(/^["']|["']$/g, '')) };
}

const unquoted = text => text.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
const writesFile = segment => {
  for (const match of unquoted(segment.split('\n')[0]).replace(/<<-?\s*\S+/g, '').matchAll(/(?:^|[^<>&\d])(?:\d?>>?|&>>?)\s*("[^"]*"|'[^']*'|[^\s;&|)]+)/g)) {
    const target = match[1].replace(/^["']|["']$/g, '');
    if (match[1] === '""') return segment.match(/>\s*("[^"]*"|'[^']*')/)?.[1] ?? 'a quoted path';
    if (target && !scratch.test(target)) return target;
  }
  return null;
};

function gitActivity(args) {
  const sub = args.find(arg => !arg.startsWith('-') && !/^-C$/.test(arg)) ?? '';
  if (sub === 'tag') return args.filter(arg => !arg.startsWith('-')).length > 1 && !args.includes('-l') && !args.includes('--list') ? ['ship', 'git tag'] : ['explore', 'git tag list'];
  if (['commit', 'push', 'add', 'am'].includes(sub)) return ['ship', `git ${sub}`];
  if (['apply', 'mv', 'rm', 'restore', 'revert', 'cherry-pick', 'reset'].includes(sub)) return ['change', `git ${sub}`];
  if (['merge', 'rebase', 'stash'].includes(sub)) return ['setup', `git ${sub}`];
  if (sub === 'checkout') return args.includes('--') || args.includes('-p') ? ['change', 'git checkout file'] : ['setup', 'git checkout'];
  if (['remote', 'config', 'worktree', 'submodule'].includes(sub)) return args.some(arg => /^(add|set-url|remove|rm|set|--add|--unset|update|init|prune)$/.test(arg)) || (sub === 'config' && args.filter(arg => !arg.startsWith('-')).length >= 3) ? ['setup', `git ${sub}`] : ['explore', `git ${sub}`];
  if (['clone', 'fetch', 'pull', 'switch', 'init', 'lfs'].includes(sub)) return ['setup', `git ${sub}`];
  return ['explore', `git ${sub || 'read'}`];
}

function packageScript(program, args) {
  const runner = ['npm', 'pnpm', 'yarn', 'bun', 'deno'].includes(program);
  if (!runner) return null;
  const sub = args.find(arg => !arg.startsWith('-')) ?? '';
  if (['ci', 'install', 'i', 'add', 'remove', 'uninstall', 'update', 'up', 'upgrade', 'rebuild', 'link', 'prune', 'dedupe'].includes(sub)) return ['setup', `${program} ${sub}`];
  if (['test', 't'].includes(sub)) return ['verify', `${program} test`];
  if (sub === 'run' || sub === 'run-script') return verifyScript.test(args.slice(args.indexOf(sub) + 1).join(' ')) ? ['verify', `${program} run check`] : ['other', `${program} run`];
  if (verifyScript.test(sub)) return ['verify', `${program} ${sub}`];
  if (['view', 'ls', 'list', 'outdated', 'info', 'why', 'explain', 'audit'].includes(sub)) return ['explore', `${program} ${sub}`];
  return null;
}

/** The Activity of one simple command and the rule that placed it, or null when it says nothing on its own (cd, echo, a filter in a pipe). */
export function segmentActivity({ text, piped }) {
  const { program, args } = words(text);
  const draftTarget = unquoted(text.split('\n')[0]).match(/>\s*(\/tmp\/\S+)/)?.[1];
  if (draftTarget && draft.test(draftTarget)) return ['ship', 'drafts the pull request'];
  const target = writesFile(text);
  if (target) return outcomeFile.test(target) ? ['ship', 'writes the outcome file'] : ['change', 'writes a file'];
  if (!program) return null;
  if (program === 'git') return gitActivity(args);
  if (['gh', 'tea', 'glab', 'fj'].includes(program)) return args.some(arg => /^(create|merge|push|comment|review|edit)$/.test(arg)) ? ['ship', `${program} pull request`] : ['explore', `${program} read`];
  if (program === 'sed' || program === 'perl') return args.some(arg => /^-[a-zA-Z]*i/.test(arg)) ? ['change', `${program} -i`] : piped ? null : ['explore', `${program} read`];
  if (program === 'tee') return args.some(arg => !arg.startsWith('-') && !scratch.test(arg)) ? ['change', 'tee'] : null;
  if (changers.has(program)) {
    const targets = args.filter(arg => !arg.startsWith('-'));
    const written = program === 'cp' || program === 'install' || program === 'ln' ? targets.slice(-1) : targets;
    return written.length && written.every(arg => scratch.test(arg)) ? null : ['change', program];
  }
  if (waiters.has(program)) return ['wait', program];
  if (setupTools.has(program)) return args.some(arg => /^(install|add|upgrade|update|sync)$/.test(arg)) || program.startsWith('apt') ? ['setup', `${program} install`] : ['explore', `${program} read`];
  if (program === 'mise') {
    const sub = args.find(arg => !arg.startsWith('-')) ?? '';
    if (['install', 'trust', 'use', 'upgrade', 'plugins', 'settings', 'reshim', 'sync'].includes(sub)) return ['setup', `mise ${sub}`];
    if (sub === 'run' || sub === 'r' || sub === 'tasks') return sub === 'tasks' ? ['explore', 'mise tasks'] : verifyScript.test(args.slice(1).join(' ')) ? ['verify', 'mise run check'] : ['other', 'mise run'];
    return ['explore', `mise ${sub || 'read'}`];
  }
  const script = packageScript(program, args);
  if (script) return script;
  if (/^\$\{?PLOEG_VERIFY_SCRIPT/.test(program) || /verify(\.sh)?$/.test(program)) return ['verify', 'verify script'];
  if (verifiers.has(program)) return ['verify', program];
  if (program === 'go') return /^(test|vet|build)$/.test(args[0] ?? '') ? ['verify', `go ${args[0]}`] : /^(mod|get|install)$/.test(args[0] ?? '') ? ['setup', `go ${args[0]}`] : ['other', 'go'];
  if (program === 'cargo') return /^(test|build|check|clippy|fmt)$/.test(args[0] ?? '') ? ['verify', `cargo ${args[0]}`] : /^(fetch|install|add|update)$/.test(args[0] ?? '') ? ['setup', `cargo ${args[0]}`] : ['other', 'cargo'];
  if (program === 'make' || program === 'just' || program === 'task') return verifyScript.test(args.join(' ')) ? ['verify', `${program} check`] : ['other', program];
  if (program === 'uv' || program === 'poetry') return /^(sync|add|install|lock|pip)$/.test(args[0] ?? '') ? ['setup', `${program} ${args[0]}`] : ['other', program];
  if (/^python\d*(\.\d+)?$/.test(program) && args[0] === '-m') {
    const modules = args.filter((arg, index) => args[index - 1] === '-m');
    if (modules.some(module => /^(pytest|unittest|mypy|ruff|pyright|black|flake8|cProfile|timeit|coverage)$/.test(module)) || args.some(arg => testFile.test(arg))) return ['verify', `python -m ${modules.at(-1)}`];
    return modules[0] === 'pip' ? ['setup', 'python -m pip'] : ['other', 'python -m'];
  }
  if (/^python\d*(\.\d+)?$/.test(program)) return pythonActivity(args, text);
  if (['sh', 'bash', 'zsh', 'dash'].includes(program)) {
    if (args[0] === '-c' && args[1]) return strongestOf(shellSegments(args[1]).map(segmentActivity).filter(Boolean)) ?? null;
    const script = args.find(arg => !arg.startsWith('-')) ?? '';
    return /PLOEG_VERIFY_SCRIPT|verify/.test(script) ? ['verify', 'verify script'] : testFile.test(script) ? ['verify', `${program} test script`] : ['other', `${program} script`];
  }
  if (program === 'node' && (args.includes('--test') || testFile.test(args.find(arg => !arg.startsWith('-')) ?? ''))) return ['verify', 'node test'];
  if (['curl', 'wget'].includes(program)) {
    const output = args.findIndex(arg => /^-(o|O)$|^--output(-document)?$/.test(arg));
    if (output >= 0 && !scratch.test(args[output + 1] ?? '')) return ['setup', `${program} download`];
    return args.some(arg => /^-(X|-request)$|^--data|^-d$|^-F$/.test(arg)) ? ['ship', `${program} posts`] : ['explore', `${program} read`];
  }
  if (program === 'kubectl' || program === 'helm' || program === 'docker') return /^(get|describe|logs|ls|ps|inspect|images|top|version|template|history|status|show)$/.test(args.find(arg => !arg.startsWith('-')) ?? '') ? ['explore', `${program} read`] : ['other', program];
  if (neutral.has(program)) return null;
  if (piped && filters.has(program)) return null;
  if (explorers.has(program)) return ['explore', program];
  if (program === 'for' || program === 'while' || program === 'until' || program === 'if' || program === 'done' || program === 'fi') return null;
  return ['other', program];
}

function pythonActivity(args, text) {
  const inline = args[0] === '-c' || args[0] === '-' || /<<-?\s*'?[A-Z]+/.test(text);
  if (!inline) {
    return args.some(arg => testFile.test(arg)) ? ['verify', 'python test'] : ['other', 'python script'];
  }
  if (/PLOEG_OUTCOME_FILE|outcome[^'"]*\.json/.test(text) && /json\.dump|\.write\(/.test(text)) return ['ship', 'python writes the outcome'];
  if (/urllib\.request|requests\.|http\.client/.test(text)) return /method\s*=\s*['"](POST|PATCH|PUT)|data\s*=|\.post\(/.test(text) ? ['ship', 'python posts to the forge'] : ['explore', 'python reads the forge'];
  if (/open\(\s*(?!['"]\/tmp\/)[^)]*,\s*['"][wa]b?\+?['"]|\.write_text\(|\.write_bytes\(|shutil\.(copy|move)|os\.(remove|rename|replace)/.test(text)) return ['change', 'python writes a file'];
  if (/\bunittest\b|\bpytest\b|cProfile|timeit/.test(text)) return ['verify', 'python runs tests'];
  if (/\bopen\(|json\.load|print\(/.test(text)) return ['explore', 'python reads'];
  return ['other', 'python'];
}

const strongest = list => activityStrength.find(key => list.includes(key)) ?? 'other';
const strongestOf = placed => { const known = placed.filter(([key]) => key !== 'other'); if (!placed.length) return null; const key = known.length ? strongest(known.map(([activity]) => activity)) : 'other'; return placed.find(([activity]) => activity === key); };

/**
 * What one tool call does, from its ACP tool kind when that already says it and otherwise from its command (RFC-0009):
 * the Activity, every Activity the command touched, and the rule that decided, so a person can see why and correct it.
 * Instructions and briefing reads are Orient; a chained command takes its strongest Activity.
 * @param {{ kind?: string, input?: string, title?: string, paths?: string[] }} call
 * @returns {{ activity: string, touched: string[], rule: string }}
 */
export function activityOf(call) {
  const kind = call?.kind ?? 'other';
  const input = String(call?.input ?? '');
  const paths = Array.isArray(call?.paths) ? call.paths : [];
  const orientOnly = text => orientPath.test(text);
  if (toolKinds[kind]) {
    const activity = toolKinds[kind] === 'explore' && (orientOnly(paths.join(' ')) || (!paths.length && orientOnly(input || call?.title || ''))) ? 'orient' : toolKinds[kind];
    if (activity === 'change' && outcomeFile.test(paths.join(' '))) return { activity: 'ship', touched: ['ship'], rule: `${kind}: outcome file` };
    if (activity === 'change' && paths.length && paths.every(path => scratch.test(path))) return { activity: 'other', touched: ['other'], rule: `${kind}: a scratch file outside the repository` };
    return { activity, touched: [activity], rule: `tool kind ${kind}${activity === 'orient' ? ': instructions' : ''}` };
  }
  if (/"kind"\s*:\s*"InvokeSkillAction"/.test(input)) return { activity: 'orient', touched: ['orient'], rule: 'loads a skill' };
  if (/^(c-c|ctrl[- ]?c|\^c)$/i.test(input.trim())) return { activity: 'other', touched: [], rule: 'interrupts a command' };
  if (kind !== 'execute' && !input.trim()) return { activity: 'other', touched: [], rule: `tool kind ${kind}` };
  const inner = [...input.matchAll(/\$\(([^()]*)\)/g)].map(match => match[1]);
  let inBriefing = false;
  const placed = [...shellSegments(input), ...inner.flatMap(shellSegments)].map(segment => {
    if (/^cd\s/.test(segment.text)) inBriefing = orientOnly(segment.text);
    const result = segmentActivity(segment);
    if (result && result[0] === 'explore' && (inBriefing || orientOnly(segment.text))) return ['orient', `${result[1]}: instructions`];
    return result;
  }).filter(Boolean);
  if (!placed.length) return orientOnly(input) ? { activity: 'orient', touched: ['orient'], rule: 'prints the briefing' } : { activity: 'other', touched: [], rule: 'no command the rules know' };
  const touched = [...new Set(placed.map(([activity]) => activity))];
  const known = touched.filter(activity => activity !== 'other');
  const activity = known.length ? strongest(known) : 'other';
  return { activity, touched, rule: placed.find(([key]) => key === activity)?.[1] ?? 'no command the rules know' };
}

/** Calls of a different Activity this short, between two runs of one Activity, stay in that Activity's move, unless they are a milestone (`keep`). */
export const activityRules = Object.freeze({ absorbCalls: 2, absorbSeconds: 60, keep: Object.freeze(['change', 'verify', 'ship']) });

/**
 * The Activity each call's move takes: its own, except that a short interruption (at most `absorbCalls` calls within
 * `absorbSeconds`) between two runs of the same Activity takes theirs, so one stray `ls` does not split a change. A
 * Change, Verify or Ship call is never absorbed: it is a milestone the move list must show.
 * @param {{ activity: string, at: number|null }[]} calls In order.
 * @returns {string[]} One move Activity per call.
 */
export function moveActivities(calls) {
  const runs = [];
  for (const [index, call] of calls.entries()) {
    const last = runs.at(-1);
    if (last && last.activity === call.activity) { last.end = index; continue; }
    runs.push({ activity: call.activity, start: index, end: index });
  }
  const result = calls.map(call => call.activity);
  for (let index = 1; index < runs.length - 1; index += 1) {
    const run = runs[index], before = runs[index - 1], after = runs[index + 1];
    const count = run.end - run.start + 1;
    const from = calls[run.start].at, to = calls[run.end].at;
    const quick = from === null || to === null || (to - from) / 1000 <= activityRules.absorbSeconds;
    if (before.activity === after.activity && count <= activityRules.absorbCalls && quick && !activityRules.keep.includes(run.activity)) {
      for (let call = run.start; call <= run.end; call += 1) result[call] = before.activity;
      run.activity = before.activity;
    }
  }
  return result;
}

/**
 * How a Run's time split across Activities: the time before each call (the agent deciding on it) counts for that call's
 * Activity, and the time after the last call until `end` for the last call's. Time before the first call is the
 * harness starting and counts for none.
 * @param {{ activity: string, at: number|null }[]} calls In order.
 * @param {number|null} end When the Run finished, or now while it runs.
 * @returns {{ seconds: Record<string, number>, calls: Record<string, number>, firstChangeAt: number|null }}
 */
export function activityTime(calls, end) {
  const seconds = Object.fromEntries(activities.map(entry => [entry.key, 0]));
  const counts = Object.fromEntries(activities.map(entry => [entry.key, 0]));
  let previous = null;
  for (const call of calls) {
    counts[call.activity] = (counts[call.activity] ?? 0) + 1;
    if (call.at === null) continue;
    if (previous !== null) seconds[call.activity] += Math.max(0, (call.at - previous) / 1000);
    previous = call.at;
  }
  const last = calls.findLast(call => call.at !== null);
  if (last && end !== null) seconds[last.activity] += Math.max(0, (end - last.at) / 1000);
  return { seconds, calls: counts, firstChangeAt: calls.find(call => call.activity === 'change')?.at ?? null };
}
