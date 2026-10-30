import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { BillingSendError, billingCsvColumns, billingCsvRecord, ublInvoiceLines, type BillingDependencies, type BillingExporter, type BillingExporterDefinition, type BillingSendResult, type BillingTarget, type PricedBillingLine } from './billing-export.ts';

/** The checked `billing.file` block: the directory the lines are written to. */
export type FileExportSettings = { directory: string };

/**
 * Writes each line for any billing tool to read: `<directory>/<tenant>/<key>.json`, one UBL 2.1 JSON document with that
 * single invoice line, and one record appended to `<directory>/<tenant>/lines.csv`. The JSON file is created only when
 * it does not exist, so a line is never appended twice.
 */
export class FileExporter implements BillingExporter {
  private readonly directory: string;
  constructor(settings: FileExportSettings) { this.directory = settings.directory; }

  async send(line: PricedBillingLine, target: BillingTarget): Promise<BillingSendResult> {
    const folder = join(this.directory, line.tenant);
    const name = `${line.key.replace(/[^a-z0-9-]/gi, '_')}.json`;
    const reference = target.reference ?? null;
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      try { await writeFile(join(folder, name), `${JSON.stringify(ublInvoiceLines([line], () => reference), null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { remoteId: name }; throw error; }
      const csv = join(folder, 'lines.csv');
      await writeFile(csv, `${billingCsvColumns.join(',')}\r\n`, { flag: 'wx', mode: 0o600 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
      await appendFile(csv, `${billingCsvRecord(line, reference)}\r\n`);
      return { remoteId: name };
    } catch (error) {
      throw new BillingSendError('refused', `The line could not be written to ${folder}: ${String((error as Error).message).slice(0, 200)}`);
    }
  }
}

/** The `file` billing adapter: CSV and UBL 2.1 JSON invoice lines for a tool Unfold has no adapter for. */
export const fileExporter: BillingExporterDefinition = {
  name: 'file',
  title: 'CSV and UBL files',
  targetFields: [{ key: 'reference', label: 'Reference in your tool', required: false, hint: 'Written on each line, such as the customer or project code your tool uses.' }],
  settings(raw, context) {
    if (raw === undefined) return { directory: join(context.dataDir, 'billing-export') };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'directory')) throw new Error('billing.file takes only directory');
    const directory = (raw as { directory?: unknown }).directory;
    if (typeof directory !== 'string' || !directory.trim()) throw new Error('billing.file.directory must be a path');
    return { directory: isAbsolute(directory) ? directory : resolve(context.dataDir, directory) };
  },
  create: (value: Record<string, unknown>, _dependencies: BillingDependencies) => new FileExporter(value as FileExportSettings),
};
