type HeldTimer = { callback: (...args: unknown[]) => void; args: unknown[] };

const heldDelay = Number(process.env.UNFOLD_TEST_HELD_TIMEOUT_MS);
const arm = globalThis.setTimeout;
const disarm = globalThis.clearTimeout;
const held = new Set<HeldTimer>();

Object.assign(globalThis, {
  setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) {
    if (delay !== heldDelay) return arm(callback, delay, ...args);
    const timer: HeldTimer = { callback, args };
    held.add(timer);
    return timer;
  },
  clearTimeout(timer: Parameters<typeof clearTimeout>[0] | HeldTimer) {
    if (!held.delete(timer as HeldTimer)) disarm(timer as Parameters<typeof clearTimeout>[0]);
  },
});

process.on('SIGUSR2', () => {
  for (const timer of [...held]) {
    held.delete(timer);
    timer.callback(...timer.args);
  }
});
