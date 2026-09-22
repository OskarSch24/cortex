import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DesktopTerminal } from './terminal.js';

let temporary: string, helper: string;
beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), 'cortex-pty-test-')); helper = join(temporary, 'cortex-pty');
  const source = resolve(__dirname, '../native/pty.c');
  const build = spawnSync('/usr/bin/xcrun', ['clang', '-O2', '-Wall', source, '-o', helper], { encoding: 'utf8', timeout: 60_000 });
  if (build.status !== 0) throw new Error(`Synthetic PTY helper build failed: ${build.stderr}`);
});
afterAll(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });

async function until(condition: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('PTY condition did not finish in time.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function alive(pid: number): boolean {
  const status = spawnSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  return status.status === 0 && !!status.stdout.trim() && !status.stdout.trim().startsWith('Z');
}
function killOwnedGroup(pid: number): void {
  if (pid > 1) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already finished */ } }
}
function frame(kind: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(5); header.write(kind); header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
async function closeOwn(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.end(); child.kill('SIGTERM');
  await until(() => child.exitCode !== null || child.signalCode !== null, 2000).catch(() => child.kill('SIGKILL'));
}

describe('native PTY protocol', () => {
  it('handles fragmented input frames, resize and shell exit status through a real pseudoterminal', async () => {
    const child = spawn(helper, [temporary, '/bin/sh', '-c', 'printf "READY\\n"; IFS= read -r line; printf "RECEIVED:%s\\n" "$line"; /bin/stty size; exit 7'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let closed = false, code: number | null = null;
    child.stdout.on('data', data => chunks.push(data)); child.on('close', value => { closed = true; code = value; });
    try {
      await until(() => Buffer.concat(chunks).toString().includes('READY'));
      const size = Buffer.alloc(4); size.writeUInt16BE(91, 0); size.writeUInt16BE(33, 2);
      const packet = Buffer.concat([frame('R', size), frame('I', Buffer.from('Grüße aus Cortex\r'))]);
      child.stdin.write(packet.subarray(0, 3));
      child.stdin.write(packet.subarray(3, 8));
      child.stdin.write(packet.subarray(8));
      await until(() => closed);
      expect(Buffer.concat(chunks).toString()).toContain('RECEIVED:Grüße aus Cortex');
      expect(Buffer.concat(chunks).toString()).toMatch(/33\s+91/);
      expect(code).toBe(7);
    } finally { await closeOwn(child); }
  });

  it('stops its own shell when the protocol stream closes', async () => {
    const child = spawn(helper, [temporary, '/bin/sh', '-c', 'printf "SHELLPID:%s\\n" "$$"; exec /bin/sleep 120'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', shellPid = 0, closed = false;
    child.stdout.on('data', data => { output += data.toString(); }); child.on('close', () => { closed = true; });
    try {
      await until(() => /SHELLPID:(\d+)/.test(output)); shellPid = Number(/SHELLPID:(\d+)/.exec(output)![1]);
      child.stdin.end(); await until(() => closed);
      await until(() => !alive(shellPid));
      expect(alive(shellPid)).toBe(false);
    } finally { killOwnedGroup(shellPid); await closeOwn(child); }
  });
});

describe('desktop terminal adapter', () => {
  it('exposes input, output, resize, replay and real exit status', async () => {
    const events: any[] = []; let finished = false;
    const terminal = new DesktopTerminal(helper, { name: 'Fixture', cwd: temporary, shellPath: '/bin/sh', shellArgs: ['-c', 'printf "READY\\n"; IFS= read -r line; printf "ADAPTER:%s\\n" "$line"; /bin/stty size; exit 9'] }, event => events.push(event), () => { finished = true; });
    try {
      await until(() => terminal.snapshot().buffer.includes('READY'));
      terminal.resize(72, 29); terminal.sendText('hello adapter');
      await until(() => finished);
      expect(terminal.snapshot().buffer).toContain('ADAPTER:hello adapter');
      expect(terminal.snapshot().buffer).toMatch(/29\s+72/);
      expect(terminal.snapshot().name).toBe('Fixture');
      expect(terminal.exitStatus?.code).toBe(9);
      expect(terminal.state.isInteractedWith).toBe(true);
      expect(events.some(event => event.type === 'terminal-exit' && event.code === 9)).toBe(true);
      terminal.show(); expect(events.at(-1)?.type).toBe('terminal-open');
      terminal.hide(); expect(events.at(-1)?.type).toBe('terminal-hide');
    } finally { terminal.dispose(); }
  });

  it('cleans up a shell which ignores hangup when the terminal is disposed', async () => {
    let output = '', finished = false, shellPid = 0;
    const terminal = new DesktopTerminal(helper, { cwd: temporary, shellPath: '/bin/sh', shellArgs: ['-c', 'trap "" HUP TERM; printf "SHELLPID:%s\\n" "$$"; while :; do /bin/sleep 1; done'] }, event => { if (event.type === 'terminal-data') output += event.data; }, () => { finished = true; });
    try {
      await until(() => /SHELLPID:(\d+)/.test(output)); shellPid = Number(/SHELLPID:(\d+)/.exec(output)![1]);
      terminal.dispose(); await until(() => finished, 5000);
      await until(() => !alive(shellPid), 3000);
      expect(alive(shellPid)).toBe(false);
    } finally { killOwnedGroup(shellPid); terminal.dispose(); }
  });

  it('preserves a multibyte character split across separate PTY output chunks', async () => {
    let finished = false;
    const terminal = new DesktopTerminal(helper, { cwd: temporary, shellPath: '/bin/sh', shellArgs: ['-c', 'printf "\\303"; /bin/sleep 0.1; printf "\\244\\n"'] }, () => {}, () => { finished = true; });
    try {
      await until(() => finished);
      expect(terminal.snapshot().buffer).toContain('ä');
      expect(terminal.snapshot().buffer).not.toContain('�');
    } finally { terminal.dispose(); }
  });

  it('deletes null account environment overrides instead of passing the string null', async () => {
    const previous = process.env.CORTEX_PTY_FIXTURE_AUTH;
    process.env.CORTEX_PTY_FIXTURE_AUTH = 'synthetic-parent-value';
    let finished = false;
    const terminal = new DesktopTerminal(helper, {
      cwd: temporary, shellPath: '/bin/sh',
      shellArgs: ['-c', 'printf "AUTH:%s MARKER:%s PROGRAM:%s\\n" "${CORTEX_PTY_FIXTURE_AUTH-unset}" "$CORTEX_PTY_FIXTURE_MARKER" "$TERM_PROGRAM"'],
      env: { CORTEX_PTY_FIXTURE_AUTH: null, CORTEX_PTY_FIXTURE_MARKER: 'chosen-profile' },
    }, () => {}, () => { finished = true; });
    try {
      await until(() => finished);
      expect(terminal.snapshot().buffer).toContain('AUTH:unset MARKER:chosen-profile PROGRAM:Cortex');
      expect(process.env.CORTEX_PTY_FIXTURE_AUTH).toBe('synthetic-parent-value');
    } finally {
      terminal.dispose();
      if(previous===undefined)delete process.env.CORTEX_PTY_FIXTURE_AUTH;else process.env.CORTEX_PTY_FIXTURE_AUTH=previous;
    }
  });
});
