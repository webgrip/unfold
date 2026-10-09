import { setTimeout as delay } from 'node:timers/promises';

const configuredScale = Number(process.env.UNFOLD_TEST_TIMEOUT_SCALE ?? '1');
const scale = Number.isFinite(configuredScale) && configuredScale >= 1 ? configuredScale : 1;

/** Scale every test upper bound with UNFOLD_TEST_TIMEOUT_SCALE so a loaded runner keeps the headroom an idle one has. */
export function scaledTimeout(milliseconds: number): number {
  return Math.ceil(milliseconds * scale);
}

export function deadlineAfter(milliseconds: number): number {
  return Date.now() + scaledTimeout(milliseconds);
}

export function testTimeout(milliseconds: number): number {
  return scaledTimeout(milliseconds);
}

export function threadCpuMilliseconds(): number {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
}

export async function settle(milliseconds: number): Promise<void> {
  await delay(scaledTimeout(milliseconds));
}

export async function waitFor<T>(read: () => T | Promise<T>, accepts: ((value: T) => boolean) | undefined, options: { reason: string; withinMs: number; everyMs?: number }): Promise<T> {
  const deadline = deadlineAfter(options.withinMs);
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (accepts ? accepts(last) : Boolean(last)) return last;
    await delay(options.everyMs ?? 25);
  }
  throw new Error(`${options.reason}: ${JSON.stringify(last)}`);
}
