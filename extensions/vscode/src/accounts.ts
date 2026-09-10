import type { AccountLink } from './types.js';

export type AccountsClient = { links(): Promise<AccountLink[]>; linkGitlab(): Promise<string>; unlinkGitlab(): Promise<void> };
export type AccountAction = 'link' | 'unlink' | 'open';
export type AccountChoice = { label: string; description: string; detail: string; action: AccountAction };
export type AccountsUi = {
  pick(choices: AccountChoice[], title: string): Promise<AccountAction | undefined>;
  confirm(message: string, detail: string, action: string): Promise<boolean>;
  open(url: string): Promise<void>;
  info(message: string): void;
};

export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}

export function describeLink(link: AccountLink): string {
  if (!link.configured) return 'Not configured on this workbench. An administrator sets links.gitlab.clientId to an OAuth application ID.';
  if (link.linked) return `Linked as ${link.login ?? 'unknown account'}${link.scopes?.length ? ` · ${link.scopes.join(', ')}` : ''}`;
  return 'Not linked. Private repositories on this host cannot be cloned until you link.';
}

export function accountChoices(link: AccountLink): AccountChoice[] {
  if (!link.configured) return [];
  if (!link.linked) return [{ label: '$(link) Link GitLab', description: link.host, detail: 'Opens GitLab in your browser to approve the workbench application once. Tokens stay on the workbench.', action: 'link' }];
  const choices: AccountChoice[] = [{ label: '$(debug-disconnect) Unlink GitLab', description: link.host, detail: 'The workbench forgets the tokens and asks GitLab to revoke them.', action: 'unlink' }];
  if (safeHttpUrl(link.webUrl)) choices.push({ label: '$(link-external) Open profile', description: link.login ?? '', detail: link.webUrl ?? '', action: 'open' });
  return choices;
}

export async function linkedAccounts(client: AccountsClient, ui: AccountsUi): Promise<AccountAction | undefined> {
  const links = await client.links();
  const gitlab = links.find(link => link.provider === 'gitlab');
  if (!gitlab) { ui.info('This workbench has no linkable accounts. GitLab linking is configured per workbench with links.gitlab.'); return undefined; }
  const choices = accountChoices(gitlab);
  if (!choices.length) { ui.info(`GitLab · ${gitlab.host}: ${describeLink(gitlab)}`); return undefined; }
  const action = await ui.pick(choices, `GitLab · ${gitlab.host} · ${describeLink(gitlab)}`);
  if (!action) return undefined;
  if (action === 'link') {
    const url = await client.linkGitlab();
    await ui.open(url);
    ui.info('Approve the De Vloer application in your browser. Run Linked Accounts again to see the result.');
    return action;
  }
  if (action === 'unlink') {
    const confirmed = await ui.confirm('Unlink GitLab?', 'The workbench forgets the tokens and asks GitLab to revoke them. Sessions on private repositories from this host will fail to clone until you link again.', 'Unlink');
    if (!confirmed) return undefined;
    await client.unlinkGitlab();
    ui.info(`GitLab · ${gitlab.host} is unlinked.`);
    return action;
  }
  const url = safeHttpUrl(gitlab.webUrl);
  if (url) await ui.open(url);
  return action;
}
