import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { CheckoutTarget, Core } from './core.js';
import type { PloegCard, PloegDetail } from './ploeg-types.js';
import { cloneUrl, expectedRepository, hostAliases, matchingRepositories, parseWorktrees, type GitApi, type GitRepository } from './git-remotes.js';

/** What the Work Item's branch checkout reads from the workbench: its detail and, when Ploeg sent one, its Run card. */
export type CheckoutSource = { detail: PloegDetail; card?: PloegCard };

const pullRequestPath = /\/(?:pulls?|merge_requests)\/\d+\/?$/;

function pullRequestLink({ detail, card }: CheckoutSource): string | undefined {
  return [...detail.checkpoints.map(entry => entry.prUrl), ...(card?.plays ?? []).map(play => play.url)].find(url => typeof url === 'string' && pullRequestPath.test(url));
}

/** Why a Work Item has nothing to check out, in the words the extension shows. */
export function missingReason({ detail, card }: CheckoutSource): string {
  if (detail.demo || card?.demo) return 'This is a demo Work Item. Its branch exists only in the demo, so there is nothing to check out.';
  if (!detail.item.target) return 'This Work Item has no target repository, so there is no branch to check out.';
  return 'Ploeg has not reported a branch for this Work Item yet. It has one once a writing Run starts.';
}

async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  if (!extension) return undefined;
  const api = (extension.isActive ? extension.exports : await extension.activate()).getAPI(1);
  if (api.state === 'initialized') return api;
  await new Promise<void>(resolve => { const timer = setTimeout(done, 10_000); const listener = api.onDidChangeState(state => { if (state === 'initialized') done(); }); function done() { clearTimeout(timer); listener.dispose(); resolve(); } });
  return api;
}

const gitMessage = (error: unknown) => { const stderr = (error as { stderr?: unknown })?.stderr; return typeof stderr === 'string' && stderr.trim() ? stderr.trim().split('\n').at(-1)! : error instanceof Error ? error.message : 'git failed'; };
const folderName = (repository: GitRepository) => repository.rootUri.path.split('/').filter(Boolean).at(-1) ?? repository.rootUri.fsPath;

const repoName = (target: CheckoutTarget) => target.repo.split('/').at(-1) ?? target.repo;
const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '');

async function exists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}

async function offerCommand(core: Core, message: string, target: CheckoutTarget, clone?: string): Promise<void> {
  const command = core.checkoutCommand(target.branch, 'origin', repoName(target));
  const choice = await vscode.window.showWarningMessage(message, ...(command ? ['Copy git command'] : []), ...(clone ? ['Clone repository'] : []));
  if (choice === 'Copy git command') { await vscode.env.clipboard.writeText(command); void vscode.window.showInformationMessage(`Copied: ${command}`); }
  if (choice === 'Clone repository' && clone) await vscode.commands.executeCommand('git.clone', clone);
}

/**
 * Opens the branch of a Work Item in its own worktree, in a new window: fetches it from the remote of the open clone of
 * its target repository that points at `owner/repo` on the forge of the Work Item's pull request link (or a host
 * `unfold.remoteHostAliases` maps to it), adds a worktree for it beside that clone, or reuses the one that already has
 * the branch, and fast-forwards it when it is only behind. The clone itself stays on its branch.
 * Without a pull request link any forge's clone of that full path qualifies. `confirm` asks first, for a request that came from a link rather than a click in VS Code.
 */
export async function checkOutWorkItemBranch(core: Core, source: CheckoutSource, { confirm = false } = {}): Promise<void> {
  const target = core.checkoutTarget(source.detail, source.card);
  if (!target) throw new Error(missingReason(source));
  const name = `${target.owner}/${target.repo}`;
  const git = await gitApi();
  if (!git) { await offerCommand(core, `VS Code's Git extension is disabled, so Unfold cannot check out ${target.branch}.`, target); return; }
  const link = pullRequestLink(source);
  const expected = expectedRepository(link, target.owner, target.repo);
  const matches = matchingRepositories(git.repositories, expected, hostAliases(vscode.workspace.getConfiguration('unfold').get('remoteHostAliases')));
  if (!matches.length) { await offerCommand(core, `No open folder is a clone of ${expected.host ? `${expected.host}/` : ''}${name}. Open one to check out ${target.branch}.`, target, cloneUrl(link, target.owner, target.repo)); return; }
  const chosen = matches.length === 1 ? matches[0] : await vscode.window.showQuickPick(matches.map(match => ({ label: folderName(match.repository), description: match.repository.state.HEAD?.name ? `on ${match.repository.state.HEAD.name}` : '', detail: match.repository.rootUri.fsPath, match })), { title: `Check out ${target.branch}`, placeHolder: `Choose the clone of ${name}` }).then(pick => pick?.match);
  if (!chosen) return;
  const { repository, remote } = chosen;
  const folder = folderName(repository);
  const root = repository.rootUri as vscode.Uri;
  const runGit = (cwd: string, ...args: string[]) => promisify(execFile)(git.git?.path || 'git', args, { cwd }).then(result => result.stdout);
  if (confirm) {
    const detail = `Fetches ${target.branch} from ${remote}, adds a worktree for it beside ${folder} and opens it in a new window. ${folder} stays on its branch.`;
    const choice = await vscode.window.showWarningMessage(`Check out ${target.branch} of “${source.detail.item.title || `Work Item ${source.detail.item.id}`}”?`, { modal: true, detail }, 'Check out');
    if (choice !== 'Check out') return;
  }
  const upstream = `${remote}/${target.branch}`;
  const opened = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Checking out ${target.branch}` }, async progress => {
    progress.report({ message: `fetching from ${remote}` });
    try { await repository.fetch(remote, target.branch); }
    catch (error) { throw new Error(`Could not fetch ${target.branch} from ${remote}: ${gitMessage(error)}. The branch may have been deleted after its pull request merged.`); }
    const worktrees = parseWorktrees(await runGit(root.fsPath, 'worktree', 'list', '--porcelain').catch(() => ''));
    const existing = worktrees.find(worktree => worktree.branch === target.branch);
    let uri: vscode.Uri;
    if (existing) uri = samePath(existing.path, root.fsPath) ? root : vscode.Uri.file(existing.path);
    else {
      const base = core.worktreeFolder(folder, target.branch) || core.worktreeFolder(repoName(target), target.branch);
      if (!base) throw new Error(`Unfold cannot name a worktree folder for ${target.branch} beside ${folder}.`);
      const candidates = [base, ...Array.from({ length: 8 }, (_, index) => `${base}-${index + 2}`)].map(candidate => vscode.Uri.joinPath(root, '..', candidate));
      let free: vscode.Uri | undefined;
      for (const candidate of candidates) if (!(await exists(candidate))) { free = candidate; break; }
      if (!free) throw new Error(`Every folder Unfold would use for ${target.branch} beside ${folder} already exists.`);
      uri = free;
      const local = await repository.getBranch(target.branch).catch(() => undefined);
      progress.report({ message: 'adding a worktree' });
      try { await runGit(root.fsPath, 'worktree', 'add', ...(local ? [uri.fsPath, target.branch] : ['--track', '-b', target.branch, uri.fsPath, upstream])); }
      catch (error) { throw new Error(`Git did not add a worktree for ${target.branch}: ${gitMessage(error)}`); }
    }
    progress.report({ message: 'fast-forwarding' });
    const diverged = await runGit(uri.fsPath, 'merge', '--ff-only', upstream).then(() => false, () => true);
    return { uri, reused: Boolean(existing), diverged };
  });
  const note = opened.diverged ? ` Your local ${target.branch} could not be fast-forwarded to ${upstream}; Unfold left it as it is.` : '';
  if (opened.uri === root) { void vscode.window.showInformationMessage(`${folder} is already on ${target.branch}.${note}`); return; }
  if (note) void vscode.window.showWarningMessage(note.trim());
  await vscode.commands.executeCommand('vscode.openFolder', opened.uri, { forceNewWindow: true });
}
