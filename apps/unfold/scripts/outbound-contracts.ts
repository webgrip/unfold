import { readFileSync, writeFileSync } from 'node:fs';
import { asyncApiYaml, cloudEventSchemaJson } from '../src/outbound/contracts.ts';

const files: Record<string, string> = {
  'docs/contracts/events.asyncapi.yaml': asyncApiYaml(),
  'docs/contracts/cloudevent.v1.schema.json': cloudEventSchemaJson(),
};
const check = process.argv.includes('--check');
let stale = 0;
for (const [path, text] of Object.entries(files)) {
  const url = new URL(`../${path}`, import.meta.url);
  let current = '';
  try { current = readFileSync(url, 'utf8'); } catch { current = ''; }
  if (current === text) continue;
  if (check) { stale++; process.stderr.write(`${path} is out of date; run node scripts/outbound-contracts.ts\n`); }
  else { writeFileSync(url, text); process.stdout.write(`wrote ${path}\n`); }
}
process.exitCode = stale ? 1 : 0;
