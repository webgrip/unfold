import * as vscode from 'vscode';
import type { CheckoutTarget, Core } from './core.js';
import type { PloegCard, PloegDetail } from './ploeg-types.js';
import { cloneUrl, expectedRepository, hostAliases, matchingRepositories, type GitApi, type GitRepository } from './git-remotes.js';

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
const changes = (repository: GitRepository) => repository.state.workingTreeChanges.length + repository.state.indexChanges.length + repository.state.mergeChanges.length;
const folderName = (repository: GitRepository) => repository.rootUri.path.split('/').filter(Boolean).at(-1) ?? repository.rootUri.fsPath;

async function offerCommand(core: Core, message: string, target: CheckoutTarget, clone?: string): Promise<void> {
  const command = core.checkoutCommand(target.branch);
  const choice = await vscode.window.showWarningMessage(message, ...(command ? ['Copy git command'] : []), ...(clone ? ['Clone repository'] : []));
  if (choice === 'Copy git command') { await vscode.env.clipboard.writeText(command); void vscode.window.showInformationMessage(`Copied: ${command}`); }
  if (choice === 'Clone repository' && clone) await vscode.commands.executeCommand('git.clone', clone);
}

/**
 * Checks out the branch of a Work Item in the open clone of its target repository: fetches it from the remote that
 * points at `owner/repo` on the forge of the Work Item's pull request link (or a host `unfold.remoteHostAliases` maps
 * to it), creates a tracking branch or switches to the existing one, and fast-forwards it when it is only behind.
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
  const current = repository.state.HEAD?.name === target.branch;
  const dirty = current ? 0 : changes(repository);
  if (confirm || dirty) {
    const detail = [
      `Fetches ${target.branch} from ${remote} and switches ${folder} to it.`,
      dirty ? `${folder} has ${dirty === 1 ? '1 uncommitted change' : `${dirty} uncommitted changes`}. Git carries them over to ${target.branch}, or stops without switching if they conflict.` : '',
    ].filter(Boolean).join('\n\n');
    const choice = await vscode.window.showWarningMessage(`Check out ${target.branch} of “${source.detail.item.title || `Work Item ${source.detail.item.id}`}”?`, { modal: true, detail }, 'Check out');
    if (choice !== 'Check out') return;
  }
  const upstream = `${remote}/${target.branch}`;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Checking out ${target.branch}` }, async progress => {
    progress.report({ message: `fetching from ${remote}` });
    try { await repository.fetch(remote, target.branch); }
    catch (error) { throw new Error(`Could not fetch ${target.branch} from ${remote}: ${gitMessage(error)}. The branch may have been deleted after its pull request merged.`); }
    const local = await repository.getBranch(target.branch).catch(() => undefined);
    progress.report({ message: `switching ${folder}` });
    try {
      if (!local) {
        await repository.createBranch(target.branch, true, upstream);
        await repository.setBranchUpstream(target.branch, upstream).catch(() => undefined);
      } else if (!current) await repository.checkout(target.branch);
    } catch (error) { throw new Error(`Git did not switch ${folder} to ${target.branch}: ${gitMessage(error)}`); }
    await repository.status();
    const head = repository.state.HEAD;
    if (head?.upstream && `${head.upstream.remote}/${head.upstream.name}` === upstream && !head.ahead && head.behind) { progress.report({ message: 'fast-forwarding' }); await repository.pull(); }
  });
  const head = repository.state.HEAD;
  const diverged = head?.ahead && head.behind ? ` Your local ${target.branch} and ${upstream} have diverged; Unfold left both as they are.` : '';
  void vscode.window.showInformationMessage(`${folder} is on ${target.branch}.${diverged}`);
}
