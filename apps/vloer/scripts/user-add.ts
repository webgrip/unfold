import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Store } from '../src/store.ts';
import { hashPassword } from '../src/auth.ts';
import type { UserRole } from '../src/types.ts';

const dataDir = resolve(process.env.VLOER_DATA_DIR || '.vloer');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const read = createInterface({ input: process.stdin, output: process.stdout });
try {
  const name = (process.env.VLOER_USER_NAME || await read.question('Account name: ')).trim();
  const role = (process.env.VLOER_USER_ROLE || await read.question('Role (admin/operator/viewer): ')).trim() as UserRole;
  if (!/^[a-zA-Z0-9._@-]{1,100}$/.test(name) || !['admin','operator','viewer'].includes(role)) throw new Error('Provide a valid name and role.');
  const generated = !process.env.VLOER_USER_PASSWORD;
  const password = process.env.VLOER_USER_PASSWORD || randomBytes(18).toString('base64url');
  const store = new Store(join(dataDir, 'vloer.sqlite'));
  try {
    if (store.getUserByName(name)) throw new Error('An account with that name already exists.');
    store.addUser({ id: randomBytes(12).toString('hex'), name, role, passwordHash: hashPassword(password) });
    console.log(`Created ${name} (${role}).${generated ? `\nGenerated password (shown once): ${password}` : ''}`);
  } finally { store.close(); }
} finally { read.close(); }
