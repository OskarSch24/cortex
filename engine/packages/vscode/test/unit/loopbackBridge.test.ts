import { readFileSync, rmSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { basename, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LoopbackTokenServer, newSessionToken, nodeMcpServer, writeMcpConfig } from '../../src/mcp/loopbackBridge.js';
import { PermissionBridge } from '../../src/permission/bridge.js';

/** Schickt eine Zeile und liest, was bis zum Ende der Verbindung zurückkommt. */
function exchange(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    let data = '';
    socket.on('connect', () => socket.write(line + '\n'));
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

class Probe extends LoopbackTokenServer {
  constructor(private readonly answer: (request: Record<string, unknown>) => object | Promise<object>) { super('/pfad/zum/server.js'); }
  protected reply(_conversationId: string, request: Record<string, unknown>) { return this.answer(request); }
  issue(conversationId: string): string { const token = newSessionToken(); this.tokens.set(token, conversationId); return token; }
  get boundPort(): number { return this.port; }
}

describe('Loopback-Brücke', () => {
  it('beschreibt den Server mit dem eigenen Node und schreibt die Konfiguration nur für den Nutzer lesbar', () => {
    expect(newSessionToken()).toMatch(/^[0-9a-f]{48}$/);
    const server = nodeMcpServer('/s.js', { A: '1', B: '2' });
    expect(server).toEqual({ command: process.execPath, args: ['/s.js'], env: { A: '1', B: '2', ELECTRON_RUN_AS_NODE: '1' } });
    expect(Object.keys(server.env)).toEqual(['A', 'B', 'ELECTRON_RUN_AS_NODE']);
    const path = writeMcpConfig('cortex-probe-', 'probe', server);
    expect(basename(path)).toBe('mcp.json');
    expect(basename(dirname(path))).toMatch(/^cortex-probe-/);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf8')).toBe(JSON.stringify({ mcpServers: { probe: server } }));
    rmSync(dirname(path), { recursive: true, force: true });
  });

  it('weist fremde Token ab und beantwortet eine Frage je Verbindung', async () => {
    const probe = new Probe(async (request) => {
      if (request.fail) throw new Error('ging schief');
      return { text: `hallo ${request.name}` };
    });
    await probe.start();
    try {
      const token = probe.issue('chat-1');
      expect(await exchange(probe.boundPort, JSON.stringify({ token: 'falsch' }))).toBe('{"text":"","error":"Cortex kennt diese Sitzung nicht."}\n');
      expect(await exchange(probe.boundPort, '{kaputt')).toBe('{"text":"","error":"Cortex kennt diese Sitzung nicht."}\n');
      expect(await exchange(probe.boundPort, JSON.stringify({ token, name: 'Welt' }))).toBe('{"text":"hallo Welt"}\n');
      expect(await exchange(probe.boundPort, JSON.stringify({ token, fail: true }))).toBe('{"text":"","error":"ging schief"}\n');
    } finally { probe.dispose(); }
  });

  it('schickt eine Antwort ohne Promise sofort', async () => {
    const probe = new Probe(() => ({ text: '', error: 'sofort' }));
    await probe.start();
    try {
      expect(await exchange(probe.boundPort, JSON.stringify({ token: probe.issue('c') }))).toBe('{"text":"","error":"sofort"}\n');
    } finally { probe.dispose(); }
  });
});

describe('Genehmigungsbrücke', () => {
  it('legt je Chat einmal eine Konfiguration an und nennt das Genehmigungswerkzeug', async () => {
    const lines: string[] = [];
    const bridge = new PermissionBridge('/perm.js', async () => ({ outcome: 'allow' }) as any, { appendLine: (l: string) => lines.push(l) } as any);
    expect(bridge.claudeArgs('c1', '/p')).toBeUndefined();
    await bridge.start();
    try {
      const first = bridge.claudeArgs('c1', '/p')!;
      expect(first.env).toEqual({});
      expect(first.args.slice(2)).toEqual(['--permission-prompt-tool', 'mcp__cortex__approve']);
      expect(bridge.claudeArgs('c1', '/p')!.args[1]).toBe(first.args[1]);
      const config = JSON.parse(readFileSync(first.args[1]!, 'utf8'));
      expect(Object.keys(config.mcpServers)).toEqual(['cortex']);
      expect(Object.keys(config.mcpServers.cortex.env)).toEqual(['CORTEX_PERMISSION_PORT', 'CORTEX_PERMISSION_TOKEN', 'ELECTRON_RUN_AS_NODE']);
      expect(basename(dirname(first.args[1]!))).toMatch(/^cortex-perm-/);
      const port = Number(config.mcpServers.cortex.env.CORTEX_PERMISSION_PORT);
      expect(lines).toEqual([`[permission] bridge listening on 127.0.0.1:${port}`]);
      rmSync(dirname(first.args[1]!), { recursive: true, force: true });
    } finally { bridge.dispose(); }
  });
});
