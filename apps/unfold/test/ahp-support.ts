import { scaledTimeout } from './timeframes.ts';

export type Json = Record<string, any>;

export function connect(url: string) {
  const socket = new WebSocket(url);
  const inbox: Json[] = [];
  const waiters: Array<{ predicate: (message: Json) => boolean; resolve: (message: Json) => void }> = [];
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id)!; pending.delete(message.id);
      if (message.error) waiter.reject(Object.assign(new Error(message.error.message), { code: message.error.code, data: message.error.data })); else waiter.resolve(message.result);
      return;
    }
    inbox.push(message);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(message); }
  });
  const open = new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve()); socket.addEventListener('error', () => reject(new Error('connection refused'))); });
  return {
    socket, inbox, open,
    rpc(method: string, params: Json): Promise<Json> { const id = nextId++; socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); },
    notify(method: string, params: Json) { socket.send(JSON.stringify({ jsonrpc: '2.0', method, params })); },
    until(predicate: (message: Json) => boolean, timeoutMs = scaledTimeout(25_000)): Promise<Json> {
      const existing = inbox.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`timed out waiting for a message; seen: ${inbox.map(message => `${message.method}:${message.params?.action?.type ?? message.params?.channel ?? ''}`).join(', ')}`)), timeoutMs); waiters.push({ predicate, resolve: message => { clearTimeout(timer); resolve(message); } }); });
    },
    close() { socket.close(); },
  };
}

export type AgentHostClient = ReturnType<typeof connect>;

export const action = (message: Json, channel: string, type: string) => message.method === 'action' && message.params.channel === channel && message.params.action.type === type;

export const closed = (socket: WebSocket) => new Promise<number>(resolve => { if (socket.readyState === WebSocket.CLOSED) resolve(1006); else socket.addEventListener('close', event => resolve(event.code), { once: true }); });

/** The default chat VS Code derives for a session URI: `ahp-chat://default/` and the URI in unpadded base64url. */
export const defaultChatOf = (sessionUri: string) => `ahp-chat://default/${Buffer.from(sessionUri).toString('base64url')}`;

const renderedChangeKinds = new Set(['branch', 'uncommitted', 'session', 'turn', 'agent-merge']);

/**
 * The changesets VS Code 1.141 and main show for a chat: `resolveChatChangesetCatalogue` over the chat's and the
 * session's catalogue, then `createChangesets`, which instantiates only the kinds it knows and drops the rest.
 */
export function vscodeChangesets(chat: Json, session: Json): Json[] {
  const chatChangesets: Json[] | undefined = chat.changesets;
  const sessionChangesets: Json[] | undefined = session.changesets;
  let resolved: Json[] | undefined;
  if (sessionChangesets === undefined) resolved = chatChangesets;
  else if (chatChangesets === undefined) {
    const legacy = sessionChangesets.filter(changeset => changeset.changeKind !== 'session');
    resolved = !legacy.length ? undefined : chat.resource === session.defaultChat ? sessionChangesets : sessionChangesets.filter(changeset => ['session', 'turn', 'compare-turns'].includes(changeset.changeKind));
  } else {
    resolved = [...chatChangesets];
    const sessionEntry = sessionChangesets.find(changeset => changeset.changeKind === 'session');
    if (sessionEntry && !chatChangesets.some(changeset => changeset.changeKind === 'session')) {
      const turn = resolved.findIndex(changeset => changeset.changeKind === 'turn');
      resolved.splice(turn < 0 ? resolved.length : turn, 0, sessionEntry);
    }
  }
  return (resolved ?? []).filter(changeset => renderedChangeKinds.has(changeset.changeKind));
}

/**
 * The chat reducer of AHP 0.9 (`types/channels-chat/reducer.ts`), reduced to the actions this host sends: a client
 * applies them to its snapshot exactly so, dropping parts and input that arrive without a matching active turn.
 */
export function reduceChat(state: Json, action: Json): Json {
  const active = state.activeTurn;
  const openInput = (requestId: string) => active?.responseParts.findIndex((part: Json) => part.kind === 'inputRequest' && part.response === undefined && part.request.id === requestId) ?? -1;
  switch (action.type) {
    case 'chat/turnStarted': return { ...state, activeTurn: { id: action.turnId, startedAt: action.startedAt, message: action.message, responseParts: [] } };
    case 'chat/responsePart': return active?.id === action.turnId ? { ...state, activeTurn: { ...active, responseParts: [...active.responseParts, action.part] } } : state;
    case 'chat/delta': return active?.id === action.turnId ? { ...state, activeTurn: { ...active, responseParts: active.responseParts.map((part: Json) => part.kind === 'markdown' && part.id === action.partId ? { ...part, content: part.content + action.content } : part) } } : state;
    case 'chat/turnComplete': case 'chat/turnCancelled': case 'chat/error':
      return active?.id === action.turnId ? { ...state, activeTurn: undefined, turns: [...state.turns, { ...active, state: action.type === 'chat/turnComplete' ? 'complete' : action.type === 'chat/turnCancelled' ? 'cancelled' : 'error' }] } : state;
    case 'chat/inputRequested': {
      if (!active) return state;
      const index = openInput(action.request.id);
      const responseParts = [...active.responseParts];
      if (index >= 0) responseParts[index] = { kind: 'inputRequest', request: { ...action.request, answers: action.request.answers ?? responseParts[index].request.answers } };
      else responseParts.push({ kind: 'inputRequest', request: action.request });
      return { ...state, activeTurn: { ...active, responseParts } };
    }
    case 'chat/inputCompleted': {
      const index = openInput(action.requestId);
      if (index < 0) return state;
      const responseParts = [...active.responseParts];
      const part = responseParts[index];
      const answers = { ...(part.request.answers ?? {}), ...(action.answers ?? {}) };
      responseParts[index] = { ...part, request: { ...part.request, answers: Object.keys(answers).length ? answers : undefined }, response: action.response };
      return { ...state, activeTurn: { ...active, responseParts } };
    }
    case 'chat/activityChanged': return { ...state, activity: action.activity };
    default: return state;
  }
}
