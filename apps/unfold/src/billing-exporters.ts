import { BillingExporterRegistry } from './billing-export.ts';
import { fileExporter } from './billing-file.ts';
import { simplicateExporter } from './billing-simplicate.ts';

/** Every billing adapter this build ships: Simplicate first (system ADR-0050), and the file adapter for any other tool. */
export const billingExporters = new BillingExporterRegistry().register(simplicateExporter).register(fileExporter);
