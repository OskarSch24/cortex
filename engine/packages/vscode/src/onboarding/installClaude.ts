import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { managedClaudeRoot } from '../paths.js';

export const CLAUDE_PACKAGE = '@anthropic-ai/claude-code@2.1.280';
const run = promisify(execFile);
export type InstallerCommand = (file: string, args: string[], options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv }) => Promise<{ stdout: string; stderr: string }>;

/** Called only after the explicit installation button; never during a run. */
export async function installManagedClaude(
  progress: (message: string) => void,
  execute: InstallerCommand = (file, args, options) => run(file, args, options),
  root = managedClaudeRoot(),
): Promise<{ path: string; version: string }> {
  await mkdir(root, { recursive: true });
  progress('Claude Code wird in Cortex’ eigener Laufzeit installiert …');
  const options = { timeout: 300_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, BROWSER: 'none', CI: '1', npm_config_update_notifier: 'false' } };
  try {
    await execute('npm', ['install', '--prefix', root, '--no-audit', '--no-fund', CLAUDE_PACKAGE], options);
    const path = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'claude.cmd' : 'claude');
    progress('Installation abgeschlossen. Die Claude-Code-Version wird geprüft …');
    const result = await execute(path, ['--version'], { ...options, timeout: 20_000 });
    const version = result.stdout.trim();
    if (!version) throw new Error('Claude Code meldet nach der Installation keine Version.');
    return { path, version };
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & { stderr?: string };
    throw new Error(failed.code === 'ENOENT'
      ? 'npm oder Claude Code wurde nicht gefunden. Installiere Node.js mit npm und versuche es erneut.'
      : failed.stderr?.trim() || failed.message || 'Claude Code konnte nicht installiert werden.');
  }
}
