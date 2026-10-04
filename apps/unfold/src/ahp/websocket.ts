import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type ServerOptions } from 'ws';

/** The largest message, in bytes, a peer may send. A larger message closes the connection with 1009. */
export const maxMessageBytes = 16 * 1024 * 1024;
/** The outbound bytes a peer may leave unread before the next send disconnects it. */
export const maxBufferedBytes = 16 * 1024 * 1024;

const clientKey = /^[+/0-9A-Za-z]{22}==$/;
const maxCloseReasonBytes = 123;
const closingHandshakeMs = 1000;

export type WebSocketOptions = { maxBufferedBytes?: number };

export function isWebSocketUpgrade(req: IncomingMessage): boolean {
  const key = req.headers['sec-websocket-key'];
  return req.method === 'GET' && (req.headers.upgrade ?? '').toLowerCase() === 'websocket' && typeof key === 'string' && clientKey.test(key) && req.headers['sec-websocket-version'] === '13';
}

function closeReason(reason: string): string {
  let text = reason.slice(0, 120);
  while (Buffer.byteLength(text, 'utf8') > maxCloseReasonBytes) text = text.slice(0, -1);
  return text;
}

/** One accepted WebSocket. Emits `message` (text), `binary` (Buffer), `error` and, once, `close`. */
export class WebSocketConnection extends EventEmitter {
  private socket?: WebSocket;
  private readonly bufferLimit: number;
  private closed = false;

  constructor(options: WebSocketOptions = {}) {
    super();
    this.bufferLimit = options.maxBufferedBytes ?? maxBufferedBytes;
  }

  attach(socket: WebSocket): void {
    this.socket = socket;
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.emit('binary', data);
      else this.emit('message', data.toString('utf8'));
    });
    socket.on('error', error => this.emit('error', error));
    socket.on('close', () => this.finish());
  }

  get open(): boolean { return !this.closed && this.socket?.readyState === WebSocket.OPEN; }

  send(text: string): void {
    if (!this.open || !this.socket) return;
    if (this.socket.bufferedAmount > this.bufferLimit) {
      this.emit('error', new Error(`Peer left more than ${this.bufferLimit} bytes unread`));
      this.socket.terminate();
      this.finish();
      return;
    }
    this.socket.send(text);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(code, closeReason(reason));
    else this.socket?.terminate();
    this.finish();
  }

  finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

const serverOptions = { noServer: true, clientTracking: false, perMessageDeflate: false, maxPayload: maxMessageBytes, closeTimeout: closingHandshakeMs, handleProtocols: () => false as const } satisfies ServerOptions & { closeTimeout: number };
const server = new WebSocketServer(serverOptions);

/** Completes an upgrade the caller has already authorized. A handshake that cannot complete yields a connection that closes on the next tick. */
export function upgradeToWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer, options: WebSocketOptions = {}): WebSocketConnection {
  const connection = new WebSocketConnection(options);
  let accepted = false;
  server.handleUpgrade(req, socket, head, accept => { accepted = true; connection.attach(accept); });
  if (!accepted) process.nextTick(() => connection.finish());
  return connection;
}

export function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function connectionToken(): string { return randomBytes(24).toString('base64url'); }
