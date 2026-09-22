/** Native startup/IPC check. UI interaction tests use tests/headless_browser.py. */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const isolated = mkdtempSync(join(tmpdir(), 'cortex-startup-'));
const home = join(isolated, 'home');
mkdirSync(home);
const executable = process.argv[2] || require('electron');
const args = process.argv[2] ? ['--verify-startup'] : [import.meta.dirname, '--verify-startup'];
const environment = { ...process.env, HOME: home, CORTEX_TEST_HOME: home, CORTEX_DATA_DIR: join(isolated, 'data') };
delete environment.ELECTRON_RUN_AS_NODE;
let output = '';
let child;
let timer;
try {
  const code = await new Promise((resolve, reject) => {
    child = spawn(executable, args, { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; process.stdout.write(data); });
    child.stderr.on('data', data => { output += data; process.stderr.write(data); });
    child.on('error', reject);
    child.on('close', resolve);
    timer = setTimeout(() => { child.kill('SIGKILL'); }, 30000);
  });
  if (code !== 0 || !output.includes('CORTEX_STANDALONE_STARTUP_OK') || output.includes('[Cortex renderer]') || output.includes('UnhandledPromiseRejection')) {
    throw new Error(`Eigenständiger Start fehlgeschlagen (Status ${code}).`);
  }
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  rmSync(isolated, { recursive: true, force: true });
}
