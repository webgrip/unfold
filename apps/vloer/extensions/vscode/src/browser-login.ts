export type BrowserLoginStart = { code: string; secret: string; userCode: string; url: string; expiresIn: number; interval: number };
export type BrowserLoginClient = {
  authMethods(): Promise<{ local: boolean; oidc: { name: string; issuer: string } | null }>;
  beginBrowserLogin(): Promise<BrowserLoginStart>;
  collectBrowserLogin(code: string, secret: string): Promise<{ status: 'pending' } | { status: 'ready'; token: string; user: { name: string } }>;
  acceptCredential(token: string): Promise<void>;
};
export type BrowserLoginUi = { open(url: string): Promise<void>; showCode(userCode: string): void; cancelled(): boolean; sleep(ms: number): Promise<void> };

export function safeSignInUrl(value: string, origin: string): string {
  const url = new URL(value);
  if (url.origin !== origin) throw new Error('The workbench returned a sign-in URL on another origin.');
  return url.toString();
}

/** The message the editor shows while it waits, so the person can compare the code with the approval page. */
export function codePrompt(userCode: string): string {
  return `Approve only if your browser shows ${userCode}.`;
}

function slowDown(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'slow_down');
}

export async function browserLogin(client: BrowserLoginClient, ui: BrowserLoginUi, origin: string, intervalMs?: number): Promise<{ name: string } | undefined> {
  const started = await client.beginBrowserLogin();
  ui.showCode(started.userCode);
  await ui.open(safeSignInUrl(started.url, origin));
  let interval = intervalMs ?? Math.max(1, started.interval) * 1000;
  const deadline = Date.now() + Math.min(started.expiresIn, 900) * 1000;
  while (Date.now() < deadline) {
    if (ui.cancelled()) return undefined;
    try {
      const result = await client.collectBrowserLogin(started.code, started.secret);
      if (result.status === 'ready') { await client.acceptCredential(result.token); return result.user; }
    } catch (error) {
      if (!slowDown(error)) throw error;
      interval += 1000;
    }
    await ui.sleep(interval);
  }
  throw new Error('The browser sign-in was not approved in time. Start it again.');
}
