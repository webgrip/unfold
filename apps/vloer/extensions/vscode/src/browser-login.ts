export type BrowserLoginClient = {
  authMethods(): Promise<{ local: boolean; oidc: { name: string; issuer: string } | null }>;
  beginBrowserLogin(): Promise<{ code: string; secret: string; url: string; expiresIn: number }>;
  collectBrowserLogin(code: string, secret: string): Promise<{ status: 'pending' } | { status: 'ready'; cookie: string; user: { name: string } }>;
  acceptCookie(cookie: string): Promise<void>;
};
export type BrowserLoginUi = { open(url: string): Promise<void>; cancelled(): boolean; sleep(ms: number): Promise<void> };

export function safeSignInUrl(value: string, origin: string): string {
  const url = new URL(value);
  if (url.origin !== origin) throw new Error('The workbench returned a sign-in URL on another origin.');
  return url.toString();
}

export async function browserLogin(client: BrowserLoginClient, ui: BrowserLoginUi, origin: string, intervalMs = 2000): Promise<{ name: string } | undefined> {
  const started = await client.beginBrowserLogin();
  await ui.open(safeSignInUrl(started.url, origin));
  const deadline = Date.now() + Math.min(started.expiresIn, 900) * 1000;
  while (Date.now() < deadline) {
    if (ui.cancelled()) return undefined;
    const result = await client.collectBrowserLogin(started.code, started.secret);
    if (result.status === 'ready') { await client.acceptCookie(result.cookie); return result.user; }
    await ui.sleep(intervalMs);
  }
  throw new Error('The browser sign-in was not completed in time. Start it again.');
}
