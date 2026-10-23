import { LinkedReporter, pullRequestUrls, reporterSettings, sessionIdPattern } from '../shared/linked-report.mjs';
import { openCodeWrites } from './writes.mjs';

/**
 * The Unfold plugin for OpenCode 1.x (`opencode-ai`). It reports each session to Unfold as a Linked Session: start,
 * prompt (working), waiting for a permission or question, idle, end and commits, with Agent Trace records for the
 * commits, and tells the session its Unfold page and commit trailer through the system prompt. OpenCode calls every function a plugin file exports, so this file exports only this one. It never sends prompts, titles, tool output or file contents, never blocks a session, and does nothing
 * without `UNFOLD_URL` and `UNFOLD_TOKEN`.
 */
export const UnfoldPlugin = async ({ directory } = {}) => {
  const settings = reporterSettings(process.env);
  if (!settings) return {};
  const reporter = new LinkedReporter({ harness: 'opencode', client: 'opencode-plugin', stateName: 'unfold-opencode', settings });
  const sessions = new Map();
  const parents = new Map();
  let queue = Promise.resolve();

  const root = id => parents.get(id) ?? id;
  const enqueue = work => { queue = queue.then(work).catch(error => { if (settings.debug) process.stderr.write(`unfold: ${error.message}\n`); }); return queue; };
  const session = async id => {
    if (!sessions.has(id)) sessions.set(id, { state: { ...(await reporter.load(id)), status: '' }, cwd: directory ?? process.cwd(), started: false });
    return sessions.get(id);
  };
  const learn = (info, entry) => {
    if (typeof info?.version === 'string' && info.version) entry.state.harnessVersion = info.version;
    if (typeof info?.directory === 'string' && info.directory) entry.cwd = info.directory;
  };
  const withSession = (id, work, info) => {
    if (typeof id !== 'string' || !sessionIdPattern.test(id)) return;
    const main = root(id);
    enqueue(async () => {
      const entry = await session(main);
      if (info) learn(info, entry);
      if (!entry.started) { entry.started = true; const { answer } = await reporter.report(main, entry.cwd, entry.state, 'start'); entry.context = String(answer.context ?? ''); }
      await work(entry, main);
      await reporter.save(main, entry.state);
    });
  };
  const working = id => withSession(id, async (entry, main) => { if (entry.state.status !== 'working') await reporter.report(main, entry.cwd, entry.state, 'prompt'); });

  return {
    event: async ({ event }) => {
      const p = event?.properties ?? {};
      switch (event?.type) {
        case 'session.created':
        case 'session.updated': {
          if (typeof p.info?.parentID === 'string' && typeof p.info.id === 'string') { parents.set(p.info.id, root(p.info.parentID)); return; }
          withSession(p.info?.id, async () => {}, p.info);
          return;
        }
        case 'session.status': if (p.status?.type === 'busy') working(p.sessionID); return;
        case 'permission.asked':
        case 'permission.updated': withSession(p.sessionID, async (entry, main) => reporter.report(main, entry.cwd, entry.state, 'waiting', { waitingFor: 'permission_prompt' })); return;
        case 'question.asked': withSession(p.sessionID, async (entry, main) => reporter.report(main, entry.cwd, entry.state, 'waiting', { waitingFor: 'agent_needs_input' })); return;
        case 'permission.replied':
        case 'question.replied':
        case 'question.rejected': working(p.sessionID); return;
        case 'session.idle': {
          if (parents.has(p.sessionID)) return;
          withSession(p.sessionID, async (entry, main) => { await reporter.commits(main, entry.cwd, entry.state); await reporter.report(main, entry.cwd, entry.state, 'idle'); });
          return;
        }
        case 'session.deleted': {
          if (typeof p.info?.parentID === 'string') return;
          withSession(p.info?.id, async (entry, main) => { await reporter.report(main, entry.cwd, entry.state, 'end'); sessions.delete(main); });
          return;
        }
        default: return;
      }
    },
    'chat.message': async (input) => {
      const model = input?.model?.providerID && input?.model?.modelID ? `${input.model.providerID}/${input.model.modelID}` : '';
      withSession(input?.sessionID, async (entry, main) => {
        if (model) entry.state.model = model;
        if (entry.state.status !== 'working') await reporter.report(main, entry.cwd, entry.state, 'prompt');
      });
    },
    'tool.execute.after': async (input, output) => {
      const writes = openCodeWrites(input?.tool, input?.args);
      const agent = parents.has(input?.sessionID) ? 'subagent' : 'main';
      const command = input?.tool === 'bash' ? String(input?.args?.command ?? '') : '';
      const found = command ? pullRequestUrls(command, output?.output) : [];
      if (!writes.length && !command) return;
      withSession(input?.sessionID, async (entry, main) => {
        for (const write of writes) await reporter.rememberWrite(entry.state, entry.cwd, write.path, write.text, agent);
        if (command) await reporter.commits(main, entry.cwd, entry.state);
        if (found.length) await reporter.report(main, entry.cwd, entry.state, 'prompt', { pullRequests: found });
      });
    },
    'experimental.chat.system.transform': async (input, output) => {
      if (typeof input?.sessionID !== 'string' || !Array.isArray(output?.system)) return;
      if (!sessions.get(root(input.sessionID))?.context) await Promise.race([queue, new Promise(resolve => setTimeout(resolve, 1000).unref?.())]);
      const context = sessions.get(root(input.sessionID))?.context;
      if (context) output.system.push(context);
    },
    dispose: async () => {
      const deadline = new Promise(resolve => setTimeout(resolve, 3000).unref?.());
      await Promise.race([queue, deadline]);
      for (const id of sessions.keys()) withSession(id, async (entry, main) => { await reporter.commits(main, entry.cwd, entry.state); await reporter.report(main, entry.cwd, entry.state, 'end', {}, 1500); });
      await Promise.race([queue, deadline]);
    },
  };
};
