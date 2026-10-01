/** The VS Code extension that handles `checkoutLink` URIs: publisher `webgrip`, name `de-vloer`. */
export const extensionId = 'webgrip.de-vloer';

const amount = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const newer = (a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; } catch { return 0; } };

/**
 * Whether `name` is a branch Vloer offers to check out: a valid git branch name made of letters, digits and
 * `. _ - /` only, so the copied command never needs quoting and never reads as an option.
 */
export function checkoutableBranch(name) {
  const value = text(name);
  if (!value || value.length > 255 || !/^[A-Za-z0-9._/-]+$/.test(value)) return false;
  if (value.startsWith('-') || value.startsWith('/') || value.endsWith('/') || value.endsWith('.') || value.endsWith('.lock')) return false;
  return !value.includes('..') && !value.includes('//') && !value.split('/').some(part => part.startsWith('.')) && value !== 'HEAD';
}

/**
 * The branch a Work Item's change is on: the latest Shift's, else the newest checkpoint's, else the newest pull
 * request's on its Run card (open ones first). `''` when Ploeg reported none Vloer can offer to check out.
 */
export function workItemBranch(detail, card) {
  const shifts = [...(detail?.shifts || [])].sort(newer);
  const checkpoints = [...(detail?.checkpoints || [])].sort(newer);
  const plays = [...(card?.plays || [])].filter(play => play && amount(play.number)).sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || b.number - a.number);
  const candidates = [detail?.item?.latestShift?.branch, ...shifts.map(shift => shift.branch), ...checkpoints.map(entry => entry.branch), ...plays.map(play => play.branch)];
  return candidates.map(text).find(checkoutableBranch) || '';
}

/** What a person needs to check out a Work Item's branch: the branch and `owner/repo`, or null when either is missing or it is a demo. */
export function checkoutTarget(detail, card) {
  const target = detail?.item?.target;
  const branch = workItemBranch(detail, card);
  if (detail?.demo || card?.demo || !branch || !text(target?.owner) || !text(target?.repo)) return null;
  return { branch, owner: text(target.owner), repo: text(target.repo), baseBranch: text(target.baseBranch) };
}

/** The shell command that fetches `branch` from `remote` and switches to it, fast-forwarding a local copy that already exists. */
export function checkoutCommand(branch, remote = 'origin') {
  if (!checkoutableBranch(branch) || !/^[A-Za-z0-9._-]+$/.test(remote) || remote.startsWith('-')) return '';
  return `git fetch ${remote} ${branch} && git switch ${branch} && git merge --ff-only ${remote}/${branch}`;
}

/** The `vscode://` link that asks the De Vloer extension to check out Work Item `workItemId`, read from the workbench at `origin`. */
export function checkoutLink(workItemId, origin) {
  const id = String(workItemId ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(id)) return '';
  const query = new URLSearchParams({ workItem: id, ...(origin ? { origin: String(origin) } : {}) });
  return `vscode://${extensionId}/checkout?${query}`;
}
