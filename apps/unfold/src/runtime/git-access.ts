import type { GitRewrite, Repository } from '../types.ts';

export function gitAccessVariables(env: Record<string, string | undefined>, repository: Repository): Record<string, string> {
  if (!repository.access) return {};
  const count = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const header = 'Authorization: Basic ' + Buffer.from(`${repository.access.username}:${repository.access.password}`).toString('base64');
  return { GIT_CONFIG_COUNT: String(count + 1), [`GIT_CONFIG_KEY_${count}`]: `http.${new URL(repository.url).origin}/.extraheader`, [`GIT_CONFIG_VALUE_${count}`]: header };
}

/** Environment that makes git fetch and push every URL starting with `insteadOf` from `url` instead, such as a forge's in-cluster Service in place of its public address. */
export function gitRewriteVariables(rewrites: GitRewrite[] = []): { name: string; value: string }[] {
  if (!rewrites.length) return [];
  return [{ name: 'GIT_CONFIG_COUNT', value: String(rewrites.length) }, ...rewrites.flatMap((rewrite, index) => [{ name: `GIT_CONFIG_KEY_${index}`, value: `url.${rewrite.url}.insteadOf` }, { name: `GIT_CONFIG_VALUE_${index}`, value: rewrite.insteadOf }])];
}
