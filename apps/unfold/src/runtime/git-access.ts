import type { Repository } from '../types.ts';

export function gitAccessVariables(env: Record<string, string | undefined>, repository: Repository): Record<string, string> {
  if (!repository.access) return {};
  const count = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const header = 'Authorization: Basic ' + Buffer.from(`${repository.access.username}:${repository.access.password}`).toString('base64');
  return { GIT_CONFIG_COUNT: String(count + 1), [`GIT_CONFIG_KEY_${count}`]: `http.${new URL(repository.url).origin}/.extraheader`, [`GIT_CONFIG_VALUE_${count}`]: header };
}
