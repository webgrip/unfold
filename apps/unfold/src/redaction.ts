import type { AppConfig } from './types.ts';

/** The configured secret values the workbench never serves: card theme, delivery verifier and publisher, gateway, runtime, bootstrap, Ploeg and task source credentials. */
export function knownSecrets(config: AppConfig): string[] {
  return [
    config.cardThemes?.ai ? process.env[config.cardThemes.ai.keyEnv] : undefined,
    config.delivery?.verifierTokenEnv ? process.env[config.delivery.verifierTokenEnv] : undefined,
    config.delivery?.publisher ? process.env[config.delivery.publisher.tokenEnv] : undefined,
    config.litellm?.masterKey, config.runtime.password, config.auth.bootstrapPassword,
    config.ploeg?.tokenEnv ? process.env[config.ploeg.tokenEnv] : undefined,
    ...(config.taskSources ?? []).map(source => source.token),
  ].filter((value): value is string => Boolean(value));
}

/** Replaces every occurrence of each of `secrets` with `[redacted]`. */
export function withoutKnownSecrets(value: string, secrets: readonly string[]): string {
  let cleaned = value;
  for (const secret of secrets) cleaned = cleaned.split(secret).join('[redacted]');
  return cleaned;
}

/**
 * Plain text that is safe to show outside the sandbox: terminal escape sequences and control characters other than newline
 * and tab are removed, and credentials in URLs, `sk-` keys, bearer, basic and token values and `token=`-style parameters are masked.
 */
export function plainRedactedText(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[^\P{C}\n\t]/gu, '')
    .replace(/:\/\/[^\s/@]+@/g, '://[redacted]@')
    .replace(/\bsk-[\w-]+/g, '[redacted]')
    .replace(/\b(Bearer|Basic|token)\s+\S+/gi, '$1 [redacted]')
    .replace(/\b(token|password|secret|key|authorization)=[^\s&]+/gi, '$1=[redacted]');
}
