const scale = Number(process.env.UNFOLD_BROWSER_TIMEOUT_SCALE);

/** How long a browser flow waits for the page by default: 10 s, times `UNFOLD_BROWSER_TIMEOUT_SCALE` on a slow machine. */
export const defaultTimeout = 10_000 * (Number.isFinite(scale) && scale >= 1 ? scale : 1);
