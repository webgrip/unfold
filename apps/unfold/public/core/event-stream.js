/** The first wait before reopening a stream the browser gave up on. */
export const reopenDelay = 1000;
/** The longest wait between attempts to reopen a stream. */
export const maxReopenDelay = 30000;

const closed = 2;

/**
 * Follows a server-sent event stream and keeps following it after the browser gives up. An `EventSource` reconnects
 * by itself after a dropped connection, but closes for good once a reconnect gets an answer other than a stream,
 * such as the gateway's 503 while Unfold restarts. Then this reopens the stream from the last event id it saw,
 * after a jittered delay that doubles from one second up to thirty, until `close()` is called.
 * @param {(after: number) => string} url The stream's URL for events after the given id.
 * @param {number} after The id of the last event already shown.
 * @param {{ open?: () => void, message: (event: MessageEvent) => void, offline?: () => void }} handlers
 * @param {{ EventSource?: typeof EventSource, setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout, random?: () => number }} [env]
 * @returns {{ close: () => void, readonly after: number }}
 */
export function followEventStream(url, after, handlers, env = {}) {
  const Source = env.EventSource ?? globalThis.EventSource;
  const wait = env.setTimeout ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
  const cancel = env.clearTimeout ?? (id => globalThis.clearTimeout(id));
  const random = env.random ?? Math.random;
  let last = after;
  let attempts = 0;
  let source = null;
  let timer = null;
  let stopped = false;

  function connect() {
    timer = null;
    if (stopped) return;
    const current = new Source(url(last));
    source = current;
    current.onopen = () => { if (source !== current) return; attempts = 0; handlers.open?.(); };
    current.onmessage = event => {
      if (source !== current) return;
      const id = Number(event.lastEventId);
      if (Number.isFinite(id) && id > last) last = id;
      handlers.message(event);
    };
    current.onerror = () => {
      if (source !== current) return;
      handlers.offline?.();
      if (current.readyState !== closed || stopped || timer !== null) return;
      const delay = Math.min(maxReopenDelay, reopenDelay * 2 ** attempts);
      attempts += 1;
      timer = wait(connect, Math.round(delay * (0.5 + random() / 2)));
    };
  }

  connect();
  return {
    close() {
      stopped = true;
      if (timer !== null) { cancel(timer); timer = null; }
      source?.close();
      source = null;
    },
    get after() { return last; },
  };
}
