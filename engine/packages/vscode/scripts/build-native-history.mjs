import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Compile only; this must never start the helper or open a browser/app. */
export function buildNativeHistory() {
  if (process.platform !== 'darwin') return;
  const source = 'native/history-tool.swift', output = 'dist/history-tool';
  try { if (statSync(output).mtimeMs >= Math.max(statSync(source).mtimeMs, statSync('scripts/build-native-history.mjs').mtimeMs)) return; } catch { /* first build */ }
  mkdirSync('dist', { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const result = spawnSync('/usr/bin/xcrun', [
      '--sdk', 'macosx', 'swiftc', '-parse-as-library', '-O',
      '-target', `${architecture}-apple-macosx26.0`,
      '-framework', 'AppKit', '-framework', 'ApplicationServices',
      '-framework', 'FoundationModels', source, '-o', temporary,
    ], { stdio: 'inherit', timeout: 120_000 });
    if (result.error || result.status !== 0) throw new Error('Der lokale Verlaufshelfer konnte nicht gebaut werden. Er benötigt die Xcode Command Line Tools mit macOS-26-SDK oder neuer.');
    renameSync(temporary, output);
  } finally { rmSync(temporary, { force: true }); }
}

if (process.argv[1]?.endsWith('/build-native-history.mjs') || process.argv[1] === 'scripts/build-native-history.mjs') buildNativeHistory();
