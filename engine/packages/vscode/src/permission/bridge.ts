import * as vscode from 'vscode';
import { createServer, type Server } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeToolKind, describeToolUse, type PermissionDecision, type PermissionRequest } from '@cortex/core';

/**
 * Host side of Claude's permission bridge.
 *
 * Claude spawns the MCP server as its own process, so the two need a channel.
 * A loopback socket bound to 127.0.0.1 with a per-session random token is the
 * cheapest thing that works on every platform without leaving a socket file
 * behind — and the token means another local process cannot answer for us.
 */
export class PermissionBridge implements vscode.Disposable {
  private server?: Server;
  private port = 0;
  private configPaths = new Map<string, string>();
  private conversationTokens = new Map<string, { conversationId: string; cwd: string }>();
  private nextId = 0;

  constructor(
    private serverScript: string,
    /** Asks the user; resolving to a decision releases the waiting CLI. */
    private onRequest: (request: PermissionRequest, conversationId: string) => Promise<PermissionDecision>,
    private output: vscode.OutputChannel,
  ) {}

  /** Starts listening. Safe to call repeatedly. */
  private starting?: Promise<void>;
  async start(): Promise<void> {
    if (this.server) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve) => {
      const server = createServer((socket) => {
        let buffer = '';
        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          const nl = buffer.indexOf('\n');
          if (nl < 0) return;
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          void this.answer(line).then((decision) => {
            socket.write(JSON.stringify(decision) + '\n');
          });
        });
        socket.on('error', () => socket.destroy());
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        this.server = server;
        this.output.appendLine(`[permission] bridge listening on 127.0.0.1:${this.port}`);
        resolve();
      });
      server.on('error', (e) => {
        this.output.appendLine(`[permission] bridge failed: ${e.message}`);
        resolve();
      });
    });
    try { await this.starting; } finally { this.starting = undefined; }
  }

  private async answer(line: string): Promise<{ allow: boolean; message?: string }> {
    let payload: { token?: string; toolName?: string; input?: unknown; toolUseId?: string };
    try {
      payload = JSON.parse(line) as typeof payload;
    } catch {
      return { allow: false, message: 'malformed request' };
    }
    const session = this.conversationTokens.get(payload.token ?? '');
    if (!session) return { allow: false, message: 'unauthorized' };

    const toolName = String(payload.toolName ?? 'a tool');
    const cwd = session.cwd;
    const info = describeToolUse(toolName, payload.input, cwd);
    const decision = await this.onRequest({
      id: `claude-${++this.nextId}`,
      tool: toolName,
      signature: JSON.stringify({ cwd, input: payload.input }),
      kind: claudeToolKind(toolName),
      title: info.detail ? `${toolName} ${info.detail}` : toolName,
      detail: info.preview ?? info.detail,
      path: info.path,
    }, session.conversationId);
    return decision.outcome === 'deny'
      ? { allow: false, message: decision.reason ?? 'denied by the user' }
      : { allow: true };
  }

  /**
   * The `--mcp-config` file and the env the CLI needs. Written once per
   * session into a temp dir; the token never touches the workspace.
   */
  claudeArgs(conversationId: string, cwd: string): { args: string[]; env: Record<string, string> } | undefined {
    if (!this.server || !this.port) return undefined;
    let configPath = this.configPaths.get(conversationId);
    if (!configPath) {
      const token = randomBytes(24).toString('hex');
      this.conversationTokens.set(token, { conversationId, cwd });
      const dir = mkdtempSync(join(tmpdir(), 'cortex-perm-'));
      configPath = join(dir, 'mcp.json');
      writeFileSync(configPath, JSON.stringify({ mcpServers: { cortex: {
        command: process.execPath, args: [this.serverScript],
        env: { CORTEX_PERMISSION_PORT: String(this.port), CORTEX_PERMISSION_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' },
      } } }), { mode: 0o600 });
      this.configPaths.set(conversationId, configPath);
    }
    return { args: ['--mcp-config', configPath, '--permission-prompt-tool', 'mcp__cortex__approve'], env: {} };
  }

  dispose(): void {
    this.server?.close();
    this.server = undefined;
  }
}
