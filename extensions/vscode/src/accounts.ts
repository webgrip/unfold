import type { AccountLink } from './types.js';

export type AccountsClient = { links(): Promise<AccountLink[]>; linkGitlab(): Promise<string>; unlinkGitlab(): Promise<void>; link?(provider: string): Promise<string>; unlink?(provider: string): Promise<void> };
const providerLabels: Record<string, string> = { gitlab: 'GitLab', clickup: 'ClickUp' };
export function providerLabel(provider: string): string { return providerLabels[provider] ?? provider; }
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
  if (!link.configured) return `Not configured on this workbench. An administrator sets links.${link.provider}.clientId to an OAuth application ID.`;
  if (link.linked) return `Linked as ${link.login ?? 'unknown account'}${link.scopes?.length ? ` · ${link.scopes.join(', ')}` : ''}`;
  return link.provider === 'gitlab' ? 'Not linked. Private repositories on this host cannot be cloned until you link.' : 'Not linked. Task connections on this provider show nothing until you link.';
}

export function accountChoices(link: AccountLink): AccountChoice[] {
  if (!link.configured) return [];
  if (!link.linked) return [{ label: `$(link) Link ${providerLabel(link.provider)}`, description: link.host, detail: `Opens ${providerLabel(link.provider)} in your browser to approve the workbench application once. Tokens stay on the workbench.`, action: 'link' }];
  const choices: AccountChoice[] = [{ label: `$(debug-disconnect) Unlink ${providerLabel(link.provider)}`, description: link.host, detail: link.provider === 'gitlab' ? 'The workbench forgets the tokens and asks GitLab to revoke them.' : 'The workbench forgets the token.', action: 'unlink' }];
  if (safeHttpUrl(link.webUrl)) choices.push({ label: '$(link-external) Open profile', description: link.login ?? '', detail: link.webUrl ?? '', action: 'open' });
  return choices;
}

export async function linkedAccounts(client: AccountsClient, ui: AccountsUi, pickProvider?: (links: AccountLink[]) => Promise<AccountLink | undefined>): Promise<AccountAction | undefined> {
  const links = await client.links();
  const configured = links.filter(link => link.configured);
  if (!links.length) { ui.info('This workbench has no linkable accounts. Linking is configured per workbench with links.gitlab and links.clickup.'); return undefined; }
  const link = configured.length > 1 && pickProvider ? await pickProvider(configured) : configured[0] ?? links[0];
  if (!link) return undefined;
  const label = providerLabel(link.provider);
  const choices = accountChoices(link);
  if (!choices.length) { ui.info(`${label} · ${link.host}: ${describeLink(link)}`); return undefined; }
  const action = await ui.pick(choices, `${label} · ${link.host} · ${describeLink(link)}`);
  if (!action) return undefined;
  const linkNow = () => client.link ? client.link(link.provider) : client.linkGitlab();
  const unlinkNow = () => client.unlink ? client.unlink(link.provider) : client.unlinkGitlab();
  if (action === 'link') {
    const url = await linkNow();
    await ui.open(url);
    ui.info(`Approve the De Vloer application in your browser. Run Linked Accounts again to see the result.`);
    return action;
  }
  if (action === 'unlink') {
    const confirmed = await ui.confirm(`Unlink ${label}?`, link.provider === 'gitlab' ? 'The workbench forgets the tokens and asks GitLab to revoke them. Sessions on private repositories from this host will fail to clone until you link again.' : 'The workbench forgets the token. Task connections on this provider will show nothing until you link again.', 'Unlink');
    if (!confirmed) return undefined;
    await unlinkNow();
    ui.info(`${label} · ${link.host} is unlinked.`);
    return action;
  }
  const url = safeHttpUrl(link.webUrl);
  if (url) await ui.open(url);
  return action;
}
