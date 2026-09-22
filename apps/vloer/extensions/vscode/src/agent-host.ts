export type AgentHostEntry = { address?: string; name?: string; connectionToken?: string };

export function withAgentHost(entries: readonly AgentHostEntry[] | undefined, entry: AgentHostEntry): AgentHostEntry[] {
  return [...(entries ?? []).filter(item => item?.address !== entry.address), entry];
}

export function hasAgentHost(entries: readonly AgentHostEntry[] | undefined, address: string): boolean {
  return (entries ?? []).some(item => item?.address === address);
}

export function withoutIssuedAgentHost(entries: readonly AgentHostEntry[] | undefined, address: string, issuedToken: string | undefined): AgentHostEntry[] {
  return (entries ?? []).filter(item => !(issuedToken && item?.address === address && item.connectionToken === issuedToken));
}
