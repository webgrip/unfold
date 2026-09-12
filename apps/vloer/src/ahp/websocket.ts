import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const maxMessageBytes = 16 * 1024 * 1024;

export function acceptKey(key: string): string { return createHash('sha1').update(key + guid).digest('base64'); }

export function isWebSocketUpgrade(req: IncomingMessage): boolean {
  return req.method === 'GET' && (req.headers.upgrade ?? '').toLowerCase() === 'websocket' && typeof req.headers['sec-websocket-key'] === 'string' && req.headers['sec-websocket-version'] === '13';
}

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) { header = Buffer.alloc(2); header[1] = length; }
  else if (length < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(length, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2); }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

export class WebSocketConnection extends EventEmitter {
  readonly socket: Duplex;
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  private closed = false;

  constructor(socket: Duplex, head: Buffer = Buffer.alloc(0)) {
    super();
    this.socket = socket;
    socket.on('data', chunk => this.receive(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', error => { this.emit('error', error); this.finish(); });
    socket.on('end', () => this.finish());
    if (head.length) this.receive(head);
  }

  get open(): boolean { return !this.closed; }

  send(text: string): void {
    if (this.closed) return;
    this.socket.write(frame(0x1, Buffer.from(text, 'utf8')));
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    const body = Buffer.concat([Buffer.from([code >> 8, code & 0xff]), Buffer.from(reason.slice(0, 120), 'utf8')]);
    try { this.socket.write(frame(0x8, body)); } catch {}
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref();
    this.finish();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; const big = this.buffer.readBigUInt64BE(2); if (big > BigInt(maxMessageBytes)) { this.close(1009, 'Message too large'); return; } length = Number(big); offset = 10; }
      if (!masked) { this.close(1002, 'Client frames must be masked'); return; }
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode === 0x8) { this.close(1000); return; }
      if (opcode === 0x9) { if (!this.closed) this.socket.write(frame(0xA, payload)); continue; }
      if (opcode === 0xA) continue;
      if (opcode === 0x0) { this.fragments.push(payload); }
      else if (opcode === 0x1 || opcode === 0x2) { this.fragments = [payload]; this.fragmentOpcode = opcode; }
      else { this.close(1002, 'Unsupported opcode'); return; }
      const total = this.fragments.reduce((sum, part) => sum + part.length, 0);
      if (total > maxMessageBytes) { this.close(1009, 'Message too large'); return; }
      if (fin) {
        const message = Buffer.concat(this.fragments);
        this.fragments = [];
        if (this.fragmentOpcode === 0x1) this.emit('message', message.toString('utf8'));
        else this.emit('binary', message);
      }
    }
  }
}

export function upgradeToWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer): WebSocketConnection {
  const key = String(req.headers['sec-websocket-key']);
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey(key)}`, '', ''].join('\r\n'));
  return new WebSocketConnection(socket, head);
}

export function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function connectionToken(): string { return randomBytes(24).toString('base64url'); }
