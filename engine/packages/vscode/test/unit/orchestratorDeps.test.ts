import { describe, expect, it } from 'vitest';
import { mergeMcpConfigArg } from '../../src/wiring/orchestratorDeps.js';

describe('mergeMcpConfigArg', () => {
  it('hängt die Datei hinter das vorhandene --mcp-config', () => {
    expect(mergeMcpConfigArg(['--mcp-config', '/perm.json', '--permission-prompt-tool', 'mcp__cortex__approve'], '/canvas.json'))
      .toEqual(['--mcp-config', '/perm.json', '/canvas.json', '--permission-prompt-tool', 'mcp__cortex__approve']);
  });

  it('setzt ein neues --mcp-config ans Ende, wenn keins da ist', () => {
    expect(mergeMcpConfigArg(['--verbose'], '/canvas.json')).toEqual(['--verbose', '--mcp-config', '/canvas.json']);
    expect(mergeMcpConfigArg([], '/canvas.json')).toEqual(['--mcp-config', '/canvas.json']);
  });

  it('lässt die Eingabe unverändert', () => {
    const args = ['--mcp-config', '/a.json'];
    mergeMcpConfigArg(args, '/b.json');
    expect(args).toEqual(['--mcp-config', '/a.json']);
  });
});
