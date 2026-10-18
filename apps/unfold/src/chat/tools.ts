import type { User } from '../types.ts';
import { confirmationLedger, createMcpServer, mcpModernProtocolVersions } from '../mcp.ts';
import type { ChatTool, ChatToolbox, ToolAnswer, ToolPlan } from './service.ts';

type Json = Record<string, any>;

/** What the chat's toolbox needs from the Unfold server: a short-lived credential for the person, where its own API answers, and where links point. */
export type McpToolboxOptions = {
  delegate(user: User, ttlMs: number): { token: string; revoke(): void };
  apiUrl(): string;
  linkUrl: string;
  version: string;
  fetch?: typeof fetch;
};

const delegationMs = 120_000;

/**
 * The chat's tools are Unfold's MCP tools (`src/mcp.ts`), served in process: each call runs as the person chatting
 * with a credential delegated for that call, exactly as the MCP endpoint does. A tool that confirms first is called
 * over the stateless protocol, whose first answer states the effect and cost without acting; the second call carries
 * the person's confirmation.
 */
export function mcpToolbox(options: McpToolboxOptions): ChatToolbox {
  const confirmations = confirmationLedger();
  const meta = { 'io.modelcontextprotocol/protocolVersion': mcpModernProtocolVersions[0], 'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {} } }, 'io.modelcontextprotocol/clientInfo': { name: 'unfold-chat', version: options.version } };
  const server = (user: User, token: string) => createMcpServer({ url: options.linkUrl || options.apiUrl(), apiUrl: options.apiUrl(), token, version: options.version, principal: user.id, role: user.role, confirmations, ...(options.fetch ? { fetch: options.fetch } : {}) });
  const catalogue = createMcpServer({ url: options.linkUrl || 'http://localhost', version: options.version, confirmations });
  let listed: Promise<ChatTool[]> | undefined;

  async function call(user: User, name: string, args: Json, modern: Json | undefined): Promise<Json> {
    const delegated = options.delegate(user, delegationMs);
    try {
      const answer = await server(user, delegated.token).handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, ...(modern ?? {}) } });
      if (!answer || answer.error) throw new Error(String(answer?.error?.message ?? 'The tool did not answer.'));
      return answer.result;
    } finally { delegated.revoke(); }
  }

  const textOf = (result: Json): string => (Array.isArray(result.content) ? result.content : []).map((part: Json) => typeof part?.text === 'string' ? part.text : '').join('\n');
  const answerOf = (result: Json): ToolAnswer => ({ ok: result.isError !== true, text: textOf(result) || (result.isError ? 'The tool failed.' : '{}') });

  return {
    list() {
      listed ??= Promise.resolve(catalogue.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).then(answer => (answer?.result?.tools ?? []).map((tool: Json) => ({ name: String(tool.name), title: String(tool.title ?? tool.name), description: String(tool.description ?? ''), inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }, readOnly: tool.annotations?.readOnlyHint !== false })));
      return listed;
    },
    confirmsFirst: name => catalogue.confirmsFirst(name),
    async run(user, name, args) { return answerOf(await call(user, name, args, undefined)); },
    async plan(user, name, args): Promise<ToolPlan> {
      const result = await call(user, name, args, { _meta: meta });
      if (result.resultType !== 'input_required') return { kind: 'answer', answer: answerOf(result) };
      const request = Object.values(result.inputRequests ?? {})[0] as Json | undefined;
      return { kind: 'confirm', message: String(request?.params?.message ?? `Run ${name}?`), requestState: String(result.requestState) };
    },
    async perform(user, name, args, requestState) {
      const result = await call(user, name, args, { _meta: meta, requestState, inputResponses: { confirm_action: { action: 'accept', content: { confirm: true } } } });
      return answerOf(result);
    },
  };
}
