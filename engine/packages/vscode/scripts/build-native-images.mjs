import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function buildNativeImages() {
  if (process.platform !== 'darwin') return;
  const source = 'native/image-tool.swift', output = 'dist/cortex-image-tool';
  try { if (statSync(output).mtimeMs >= Math.max(statSync(source).mtimeMs, statSync(new URL(import.meta.url)).mtimeMs)) return; } catch { /* first build */ }
  mkdirSync('dist', { recursive: true });
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const result = spawnSync('/usr/bin/xcrun', ['--sdk', 'macosx', 'swiftc', '-target', `${architecture}-apple-macosx12.0`, '-O', source, '-o', output], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Der lokale Bildhelfer konnte nicht gebaut werden. Prüfe die Xcode Command Line Tools.');
}
if (process.argv[1]?.endsWith('/build-native-images.mjs') || process.argv[1] === 'scripts/build-native-images.mjs') buildNativeImages();
