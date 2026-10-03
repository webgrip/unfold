import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import { connect as dial, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { setImmediate as yieldToLoop } from 'node:timers/promises';
import { WebSocketConnection, isWebSocketUpgrade, maxMessageBytes, rejectUpgrade, upgradeToWebSocket, type WebSocketOptions } from '../src/ahp/websocket.ts';
import { application, login, request } from './api-support.ts';
import { scaledTimeout } from './timeframes.ts';

type Peer = { socket: Socket; nextFrame: () => Promise<{ opcode: number; payload: Buffer }> };

async function host(options: WebSocketOptions = {}) {
  const connections: WebSocketConnection[] = [];
  const server = createServer((_req, res) => res.writeHead(404).end());
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isWebSocketUpgrade(req)) return rejectUpgrade(socket, 400, 'Bad Request');
    const connection = upgradeToWebSocket(req, socket, head, options);
    connection.on('error', () => {});
    connections.push(connection);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return { port, connections, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}

async function handshake(port: number, path = '/'): Promise<{ status: number; peer: Peer }> {
  const socket = dial(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write([`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`, 'Sec-WebSocket-Version: 13', '', ''].join('\r\n'));
  let buffer = Buffer.alloc(0);
  let ended = false;
  let wake: (() => void) | undefined;
  socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); wake?.(); });
  socket.on('close', () => { ended = true; wake?.(); });
  socket.on('error', () => {});
  const more = () => new Promise<void>(resolve => { if (ended) resolve(); else wake = () => { wake = undefined; resolve(); }; });
  while (!buffer.includes('\r\n\r\n')) { if (ended) break; await more(); }
  const end = buffer.indexOf('\r\n\r\n');
  const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buffer.subarray(0, end).toString('latin1'))?.[1] ?? 0);
  buffer = buffer.subarray(end + 4);
  const parse = () => {
    if (buffer.length < 2) return undefined;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) { if (buffer.length < 4) return undefined; length = buffer.readUInt16BE(2); offset = 4; }
    else if (length === 127) { if (buffer.length < 10) return undefined; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
    if (buffer.length < offset + length) return undefined;
    const frame = { opcode: buffer[0] & 0x0f, payload: Buffer.from(buffer.subarray(offset, offset + length)) };
    buffer = buffer.subarray(offset + length);
    return frame;
  };
  const nextFrame = async () => {
    for (;;) {
      const frame = parse();
      if (frame) return frame;
      if (ended) throw new Error('the server closed the socket without another frame');
      await more();
    }
  };
  return { status, peer: { socket, nextFrame } };
}

function masked(first: number, payload: Buffer, declaredLength = payload.length): Buffer {
  let header: Buffer;
  if (declaredLength < 126) { header = Buffer.alloc(2); header[1] = 0x80 | declaredLength; }
  else if (declaredLength < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(declaredLength, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(declaredLength), 2); }
  header[0] = first;
  const mask = randomBytes(4);
  const body = Buffer.from(payload);
  for (let index = 0; index < body.length; index++) body[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, body]);
}

async function closedByServer(peer: Peer): Promise<number> {
  for (;;) {
    const frame = await peer.nextFrame();
    if (frame.opcode !== 0x8) continue;
    peer.socket.end();
    return frame.payload.readUInt16BE(0);
  }
}

const violations: Array<[string, Buffer[], number]> = [
  ['a text frame with a reserved bit set', [masked(0x80 | 0x40 | 0x1, Buffer.from('{}'))], 1002],
  ['a text frame that is not UTF-8', [masked(0x80 | 0x1, Buffer.from([0x7b, 0xc3, 0x28, 0x7d]))], 1007],
  ['a fragmented ping', [masked(0x9, Buffer.from('ping'))], 1002],
  ['a continuation frame without a message to continue', [masked(0x80 | 0x0, Buffer.from('{}'))], 1002],
  ['an unmasked client frame', [Buffer.from([0x81, 0x02, 0x7b, 0x7d])], 1002],
];

for (const [name, frames, expected] of violations) {
  test(`${name} closes the connection with ${expected}`, async t => {
    const server = await host();
    t.after(() => server.close());
    const { status, peer } = await handshake(server.port);
    assert.equal(status, 101);
    const connection = server.connections[0];
    const closed = new Promise(resolve => connection.once('close', resolve));
    const messages: unknown[] = [];
    connection.on('message', text => messages.push(text));
    for (const frame of frames) peer.socket.write(frame);
    assert.equal(await closedByServer(peer), expected);
    await closed;
    assert.equal(connection.open, false);
    assert.deepEqual(messages, [], 'no message reaches the host');
  });
}

test('a peer that never answers the server\'s close loses its socket after the one-second closing timeout', async t => {
  const server = await host();
  t.after(() => server.close());
  const { peer } = await handshake(server.port);
  const connection = server.connections[0];
  const socketClosed = once(peer.socket, 'close');
  const started = Date.now();
  connection.close(1008, 'Connection token revoked');
  assert.equal(connection.open, false);
  const close = await peer.nextFrame();
  assert.deepEqual([close.payload.readUInt16BE(0), close.payload.subarray(2).toString()], [1008, 'Connection token revoked']);
  await socketClosed;
  const waited = Date.now() - started;
  assert.ok(waited >= 900 && waited < scaledTimeout(5_000), `the socket closed after ${waited} ms`);
});

test('a well-formed fragmented text message with an interleaved ping reaches the host and the ping is answered', async t => {
  const server = await host();
  t.after(() => server.close());
  const { peer } = await handshake(server.port);
  const connection = server.connections[0];
  const received = once(connection, 'message');
  peer.socket.write(Buffer.concat([masked(0x1, Buffer.from('{"jsonrpc":')), masked(0x80 | 0x9, Buffer.from('hi')), masked(0x80 | 0x0, Buffer.from('"2.0"}'))]));
  const pong = await peer.nextFrame();
  assert.deepEqual([pong.opcode, pong.payload.toString()], [0xA, 'hi']);
  assert.deepEqual(await received, ['{"jsonrpc":"2.0"}']);
  connection.send('reply');
  const reply = await peer.nextFrame();
  assert.deepEqual([reply.opcode, reply.payload.toString()], [0x1, 'reply']);
  connection.close(1000, 'done');
  const close = await peer.nextFrame();
  assert.equal(close.payload.readUInt16BE(0), 1000);
  peer.socket.end();
});

test('a message over 16 MiB closes the connection with 1009 before its payload arrives', async t => {
  const server = await host();
  t.after(() => server.close());
  const { peer } = await handshake(server.port);
  peer.socket.write(masked(0x80 | 0x1, Buffer.alloc(0), maxMessageBytes + 1));
  assert.equal(await closedByServer(peer), 1009);
});

test('a peer that stops reading is disconnected once its unread bytes pass the limit', { timeout: scaledTimeout(60_000) }, async t => {
  const limit = 256 * 1024;
  const server = await host({ maxBufferedBytes: limit });
  t.after(() => server.close());
  const { peer } = await handshake(server.port);
  peer.socket.pause();
  const connection = server.connections[0];
  const errors: Error[] = [];
  connection.on('error', error => errors.push(error));
  const closed = new Promise(resolve => connection.once('close', resolve));
  const chunk = 'x'.repeat(64 * 1024);
  const ceiling = 512 * 1024 * 1024;
  let sent = 0;
  while (connection.open && sent < ceiling) {
    connection.send(chunk);
    sent += chunk.length;
    await yieldToLoop();
  }
  assert.equal(connection.open, false, `still open after ${sent} bytes to a peer that reads nothing`);
  assert.ok(sent > limit, 'the kernel and the limit absorb some unread bytes first');
  await closed;
  assert.match(errors[0]?.message ?? '', /unread/);
  peer.socket.destroy();
});

test('a peer that keeps reading stays connected through more traffic than the limit', { timeout: scaledTimeout(60_000) }, async t => {
  const limit = 256 * 1024;
  const server = await host({ maxBufferedBytes: limit });
  t.after(() => server.close());
  const { peer } = await handshake(server.port);
  peer.socket.removeAllListeners('data');
  let received = 0;
  peer.socket.on('data', chunk => { received += chunk.length; });
  const connection = server.connections[0];
  const chunk = 'x'.repeat(64 * 1024);
  const total = 32 * 1024 * 1024;
  for (let sent = 0; sent < total; sent += chunk.length) {
    connection.send(chunk);
    await yieldToLoop();
  }
  assert.equal(connection.open, true);
  while (received < total) await yieldToLoop();
  connection.close();
  peer.socket.destroy();
});

test('the agent host authenticates the upgrade before any frame is read and closes on a protocol violation', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const port = Number(new URL(server.url).port);
  assert.equal((await handshake(port, '/')).status, 403, 'no token');
  assert.equal((await handshake(port, '/?tkn=not-a-real-token-at-all')).status, 403, 'unknown token');
  const auth = await login(server.url);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: 'raw' } });
  const { status, peer } = await handshake(port, `/?tkn=${issued.body.token}`);
  assert.equal(status, 101);
  peer.socket.write(masked(0x80 | 0x40 | 0x1, Buffer.from('{}')));
  assert.equal(await closedByServer(peer), 1002);
});
