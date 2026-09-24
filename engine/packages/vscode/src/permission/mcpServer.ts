/**
 * A one-tool MCP server, spawned by the Claude CLI, that asks cortex.
 *
 * Claude Code cannot ask for permission over stream-json in headless mode —
 * `--permission-mode manual` silently degrades to `default` and the tool just
 * runs. Its real hook is `--permission-prompt-tool`, which names an MCP tool
 * Claude calls before every action. This file is that tool.
 *
 * It holds no policy of its own: it forwards the question to the extension
 * over a loopback socket and returns whatever the user decided. If the
 * extension is unreachable it denies, because a permission prompt that fails
 * open is worse than no permission prompt at all.
 *
 * Bundled separately from the extension — it runs as its own process.
 */
import { askLoopback, runStdioMcpServer } from '../mcp/stdioServer.js';

const PORT = Number(process.env.CORTEX_PERMISSION_PORT ?? 0);
const TOKEN = process.env.CORTEX_PERMISSION_TOKEN ?? '';
const ASK_TIMEOUT_MS = 10 * 60_000;

type Decision = { allow: boolean; message?: string };

/** Asks the extension host; denies if it cannot be reached or does not answer. */
function askHost(payload: Record<string, unknown>): Promise<Decision> {
  return askLoopback<Decision>({
    port: PORT,
    token: TOKEN,
    payload,
    timeoutMs: ASK_TIMEOUT_MS,
    unreachable: { allow: false, message: 'cortex is not reachable' },
    timedOut: { allow: false, message: 'timed out waiting for a decision' },
    malformed: { allow: false, message: 'malformed decision' },
    // Hanging up without an answer is a denial, not a reason to wait ten minutes.
    closed: { allow: false, message: 'connection closed' },
    read: (value) => {
      const answer = value as { allow?: boolean; message?: string };
      return { allow: answer.allow === true, message: answer.message };
    },
  });
}

const TOOL = {
  name: 'approve',
  description:
    'Ask the user to approve a tool call. Called automatically by Claude Code before it acts.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string' },
      input: { type: 'object' },
      tool_use_id: { type: 'string' },
    },
    required: ['tool_name', 'input'],
  },
};

runStdioMcpServer({
  name: 'cortex',
  // Fixed, not echoed back like the canvas and search servers do.
  protocolVersion: '2024-11-05',
  tools: [TOOL],
  ping: false,
  requireId: false,
  unknownMethod: (method) => `unknown method ${method}`,
  // Only one tool exists, so the name is not checked.
  call: async (_name, args) => {
    const decision = await askHost({
      toolName: args.tool_name,
      input: args.input,
      toolUseId: args.tool_use_id,
    });
    // The contract Claude expects: a single JSON text block naming the behavior.
    const behavior = decision.allow
      ? { behavior: 'allow', updatedInput: args.input }
      : { behavior: 'deny', message: decision.message ?? 'denied by the user' };
    return { content: [{ type: 'text', text: JSON.stringify(behavior) }] };
  },
});
