/** A JSON-RPC error with the code and message the peer receives. */
export class RpcError extends Error {
  /** @param {number} code @param {string} message @param {unknown} [data] */
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/** The JSON-RPC codes the agent answers with; `authRequired` is ACP's code for a call that needs `authenticate` first. */
export const rpcCodes = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, authRequired: -32000 };

const lineLimit = 4 * 1024 * 1024;

/**
 * One JSON-RPC 2.0 connection over newline-delimited JSON, as ACP's stdio transport frames it. `handle(method, params)`
 * answers each request and notification from the peer; `request` and `notify` send to the peer. A request from the
 * peer is answered when its handler settles, so several can be in flight at once.
 */
export class Connection {
  /**
   * @param {NodeJS.ReadableStream} input
   * @param {NodeJS.WritableStream} output
   * @param {(method: string, params: any) => Promise<unknown> | unknown} handle
   */
  constructor(input, output, handle) {
    this.output = output;
    this.handle = handle;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = new Promise(resolve => { this.close = resolve; });
    let buffered = '';
    input.setEncoding?.('utf8');
    input.on('data', chunk => {
      buffered += chunk;
      let newline;
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) this.receive(line);
      }
      if (buffered.length > lineLimit) { buffered = ''; this.send({ jsonrpc: '2.0', id: null, error: { code: rpcCodes.parse, message: 'A message was longer than 4 MiB.' } }); }
    });
    input.on('end', () => {
      for (const { reject } of this.pending.values()) reject(new Error('The editor closed the connection.'));
      this.pending.clear();
      this.close();
    });
  }

  send(message) { this.output.write(`${JSON.stringify(message)}\n`); }

  /** Sends a notification to the peer. */
  notify(method, params) { this.send({ jsonrpc: '2.0', method, params }); }

  /** Sends a request to the peer and resolves with its result, or rejects with its error. */
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { this.send({ jsonrpc: '2.0', id: null, error: { code: rpcCodes.parse, message: 'That was not JSON.' } }); return; }
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') { this.send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: rpcCodes.invalidRequest, message: 'Send JSON-RPC 2.0.' } }); return; }
    if (typeof message.method !== 'string') {
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id);
      if (message.error) waiting.reject(new RpcError(Number(message.error.code) || rpcCodes.internal, String(message.error.message ?? 'The editor answered with an error.'), message.error.data));
      else waiting.resolve(message.result);
      return;
    }
    const isRequest = 'id' in message && message.id !== null;
    Promise.resolve().then(() => this.handle(message.method, message.params ?? {})).then(
      result => { if (isRequest) this.send({ jsonrpc: '2.0', id: message.id, result: result ?? null }); },
      error => {
        if (!isRequest) return;
        const known = error instanceof RpcError;
        this.send({ jsonrpc: '2.0', id: message.id, error: { code: known ? error.code : rpcCodes.internal, message: known ? error.message : String(error?.message ?? error), ...(known && error.data !== undefined ? { data: error.data } : {}) } });
      },
    );
  }
}
