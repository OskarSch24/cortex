import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * Der Ortungshelfer für „Mein Standort“ (CoreLocation) — als kleine,
 * unsichtbare App: Die Ortungsdienste fragen nur Programme mit eigener
 * App-Kennung und Freigabetext. Der Host startet sie über `open`.
 */
export function buildNativeLocation() {
  if (process.platform !== 'darwin') return;
  const source = 'native/location-tool.swift';
  const bundle = 'dist/CortexLocation.app';
  const output = `${bundle}/Contents/MacOS/cortex-location`;
  try { if (statSync(output).mtimeMs >= Math.max(statSync(source).mtimeMs, statSync(new URL(import.meta.url)).mtimeMs)) return; } catch { /* first build */ }
  rmSync('dist/cortex-location-tool', { force: true });
  mkdirSync(`${bundle}/Contents/MacOS`, { recursive: true });
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const result = spawnSync('/usr/bin/xcrun', ['--sdk', 'macosx', 'swiftc', '-target', `${architecture}-apple-macosx12.0`, '-O', source, '-o', output], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Der Ortungshelfer konnte nicht gebaut werden. Prüfe die Xcode Command Line Tools.');
  const why = 'Cortex verwendet deinen Standort nur, wenn du im Chat „Mein Standort“ wählst — als Mittelpunkt für Fragen zu Orten in der Nähe.';
  writeFileSync(`${bundle}/Contents/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>dev.oskarschiermeister.cortex.location</string>
  <key>CFBundleName</key><string>Cortex</string>
  <key>CFBundleDisplayName</key><string>Cortex</string>
  <key>CFBundleExecutable</key><string>cortex-location</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSLocationUsageDescription</key><string>${why}</string>
  <key>NSLocationWhenInUseUsageDescription</key><string>${why}</string>
</dict></plist>
`);
  // Vorläufig ad hoc; assemble.sh signiert die App mit der stabilen Identität.
  spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', bundle], { stdio: 'inherit' });
}
if (process.argv[1]?.endsWith('/build-native-images.mjs') || process.argv[1] === 'scripts/build-native-images.mjs') { buildNativeImages(); buildNativeLocation(); }
