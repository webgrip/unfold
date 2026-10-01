import { readFileSync } from 'node:fs';

const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const id = /^database_id = "([^"]*)"$/m.exec(wrangler)?.[1] ?? '';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  process.stderr.write(
    `wrangler.toml has no D1 database id for SIGNUPS (found "${id}"). Create the EU database and paste its id, as apps/site/docs/deploy.md describes; the site is not deployed until then.\n`,
  );
  process.exit(1);
}
process.stdout.write(`D1 database id for SIGNUPS is set (${id}).\n`);
