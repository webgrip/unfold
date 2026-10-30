import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { askFailures } from '../src/ask/service.ts';
import { errorCodesPage } from '../src/error-catalogue.ts';

const page = join(import.meta.dirname, '../docs/contracts/error-codes.md');
writeFileSync(page, errorCodesPage(askFailures));
console.log(`wrote ${page}`);
