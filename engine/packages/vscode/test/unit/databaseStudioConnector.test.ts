import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';

import { databaseStudioServer, withBuiltInConnectors } from '../../src/database/connector.js';

/**
 * The connector is the half of the integration nobody looks at: it is written
 * into profile files an agent reads later. A mistake here is silent until a
 * tool call fails, so the merge rules and the address it carries are tested
 * rather than assumed.
 */

/** A folder shaped like the Database Studio workspace. */
function studioRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-root-'));
  mkdirSync(join(root, 'studio-mcp', 'src'), { recursive: true });
  writeFileSync(join(root, 'studio-mcp', 'src', 'database-studio.js'), '// server');
  return root;
}

function configure(values: Record<string, unknown>): void {
  (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({
    get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
    update: async () => {},
  });
}

const runningHost = (url: string, token: string) =>
  ({ running: true, url, token }) as never;

describe('databaseStudioServer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('points at the host in this window when a database is open', () => {
    configure({ 'databaseStudio.enabled': true, 'databaseStudio.path': studioRoot() });

    const server = databaseStudioServer(runningHost('http://127.0.0.1:5555', 'abc123'));

    expect(server?.env).toEqual({
      DATABASE_STUDIO_URL: 'http://127.0.0.1:5555',
      DATABASE_STUDIO_TOKEN: 'abc123',
    });
    expect(server?.args?.[0]).toMatch(/studio-mcp\/src\/database-studio\.js$/);
    // Electron's binary would start the editor, not the server.
    expect(server?.command).toBe('node');
  });

  it('carries no address when nothing is open, so the app answers instead', () => {
    configure({ 'databaseStudio.enabled': true, 'databaseStudio.path': studioRoot() });

    // Without environment variables `studio-mcp` falls back to api.json, which
    // is how a database open in the macOS app stays reachable from Cortex.
    expect(databaseStudioServer(undefined)?.env).toBeUndefined();
  });

  it('is absent when the integration is switched off', () => {
    configure({ 'databaseStudio.enabled': false, 'databaseStudio.path': studioRoot() });

    expect(databaseStudioServer(undefined)).toBeUndefined();
  });

  it('is absent when Database Studio is not where Cortex was told to look', () => {
    configure({
      'databaseStudio.enabled': true,
      'databaseStudio.path': mkdtempSync(join(tmpdir(), 'empty-')),
    });

    expect(databaseStudioServer(undefined)).toBeUndefined();
  });
});

describe('withBuiltInConnectors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the connector alongside the ones from mcp.json', () => {
    configure({ 'databaseStudio.enabled': true, 'databaseStudio.path': studioRoot() });

    const merged = withBuiltInConnectors({ context7: { command: 'npx' } }, undefined);

    expect(Object.keys(merged).sort()).toEqual(['context7', 'database-studio']);
  });

  it('lets a hand-written entry of the same name win', () => {
    configure({ 'databaseStudio.enabled': true, 'databaseStudio.path': studioRoot() });

    const merged = withBuiltInConnectors(
      { 'database-studio': { command: 'my-own-build' } },
      runningHost('http://127.0.0.1:5555', 'abc123'),
    );

    expect(merged['database-studio']).toEqual({ command: 'my-own-build' });
  });

  it('leaves the user servers untouched when the integration is off', () => {
    configure({ 'databaseStudio.enabled': false });

    const servers = { context7: { command: 'npx' } };
    expect(withBuiltInConnectors(servers, undefined)).toEqual(servers);
  });
});

describe('loadConnectorIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bleibt still, wenn Database Studio nicht da ist', async () => {
    configure({ 'databaseStudio.path': mkdtempSync(join(tmpdir(), 'empty-')) });

    const { loadConnectorIdentity } = await import('../../src/database/connector.js');
    expect(await loadConnectorIdentity()).toBeUndefined();
  });

  // Das Laden selbst wird in `cortex-bridge` geprüft, nicht hier: Vitest führt
  // Tests in einem vm-Kontext aus, und ein dynamisches `import()` scheitert
  // dort mit "A dynamic import callback was not specified". Im Extension-Host
  // — gewöhnliches Node, die Extension per `require` geladen — greift diese
  // Einschränkung nicht. Ein Test an dieser Stelle würde also eine Umgebung
  // prüfen, in der der Code nie läuft.
});
