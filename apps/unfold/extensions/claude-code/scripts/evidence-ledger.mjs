#!/usr/bin/env node
import { join } from 'node:path';
import { latestLedger, ledgerDir, readLedger } from './evidence.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const given = args.find(arg => !arg.startsWith('--')) ?? '';
const dir = ledgerDir();
const sessionId = /^[A-Za-z0-9_-]{8,128}$/.test(given) ? given : latestLedger(dir);
const entries = sessionId ? readLedger(join(dir, `${sessionId}.jsonl`)) : [];

if (asJson) {
  process.stdout.write(`${JSON.stringify({ sessionId, entries }, null, 2)}\n`);
} else if (!entries.length) {
  process.stdout.write(`No evidence recorded${sessionId ? ` for session ${sessionId}` : ''}. Claims from this session stay unverified unless you check them now.\n`);
} else {
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ⏎ ');
  const rows = entries.map(entry => `| ${entry.id} | ${entry.at} | ${entry.kind} | ${entry.outcome}${entry.exitCode === undefined ? '' : ` (${entry.exitCode})`} | \`${cell(entry.command)}\` | ${cell(entry.tail)} |`);
  process.stdout.write([`Evidence ledger for session ${sessionId} (${entries.length} entries)`, '', '| id | at | kind | outcome | command | last output |', '| --- | --- | --- | --- | --- | --- |', ...rows, ''].join('\n'));
}
