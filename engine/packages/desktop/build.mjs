import { build } from 'esbuild';
import { cpSync, mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const desktop = import.meta.dirname;
const root = resolve(desktop, '../../..');
const host = resolve(desktop, '../vscode');
const out = join(desktop, 'dist');
const renderer = join(out, 'renderer');
const resources = join(desktop, 'resources/cortex');
if (!existsSync(join(host, 'media/webview.js'))) throw new Error('Cortex-Oberfläche zuerst mit pnpm -C engine/packages/vscode exec node esbuild.mjs --production bauen.');
mkdirSync(renderer, { recursive: true });

const builds = await Promise.all([
  build({ entryPoints: [join(desktop, 'src/main.ts')], bundle: true, outfile: join(out, 'main.js'), platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], alias: { vscode: join(desktop, 'src/platform.ts') }, sourcemap: true, metafile: true }),
  build({ entryPoints: [join(desktop, 'src/preload.ts')], bundle: true, outfile: join(out, 'preload.js'), platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], metafile: true }),
  build({ entryPoints: [join(desktop, 'renderer/shell.ts')], bundle: true, outfile: join(renderer, 'shell.js'), platform: 'browser', format: 'iife', target: 'es2022', loader: { '.ttf': 'file', '.woff2': 'file', '.svg': 'dataurl' }, minify: true, metafile: true }),
  ...[
    ['editor', 'editor/editor.worker.js'],
    ['json', 'languages/features/json/json.worker.js'],
    ['ts', 'languages/features/typescript/ts.worker.js'],
    ['html', 'languages/features/html/html.worker.js'],
    ['css', 'languages/features/css/css.worker.js'],
  ].map(([name, source]) => build({ entryPoints: [join(desktop, 'node_modules/monaco-editor/esm/vs', source)], bundle: true, outfile: join(renderer, `${name}.worker.js`), platform: 'browser', format: 'iife', target: 'es2022', minify: true, metafile: true })),
]);

if (process.platform !== 'darwin') throw new Error('Der native Cortex-Terminalhelfer wird auf macOS gebaut.');
execFileSync('/usr/bin/xcrun', ['clang', '-O2', '-Wall', '-mmacosx-version-min=13.0', join(desktop, 'native/pty.c'), '-o', join(out, 'cortex-pty')], { stdio: 'inherit' });
mkdirSync(resources, { recursive: true });
for (const part of ['media', 'dist', 'schemas', 'templates', 'package.json', 'LICENSE', 'README.md']) {
  const source = join(host, part);
  if (!existsSync(source)) continue;
  rmSync(join(resources, part), { recursive: true, force: true });
  cpSync(source, join(resources, part), { recursive: true });
}
// Main bundles the reusable services directly. No extension host is packaged.
rmSync(join(resources, 'dist/extension.js'), { force: true });
rmSync(join(resources, 'dist/extension.js.map'), { force: true });
rmSync(join(resources, 'themes'), { recursive: true, force: true });
cpSync(join(root, 'extensions/theme-oskars/themes'), join(resources, 'themes'), { recursive: true });
cpSync(join(root, 'engine/LICENSE'), join(resources, 'LICENSE'));

// Preserve runtime licenses, including dependencies of the prebuilt UI. Build
// tooling is not packaged. Electron/Chromium notices are added by package.mjs.
const licenseDir = join(desktop, 'resources/licenses');
rmSync(licenseDir, { recursive: true, force: true });
mkdirSync(licenseDir, { recursive: true });
const packages = new Map();
function packageRoot(path) {
  let directory = dirname(path);
  while (dirname(directory) !== directory) {
    if (existsSync(join(directory, 'package.json'))) return directory;
    directory = dirname(directory);
  }
}
function collect(directory) {
  if (!directory) return;
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const key = `${manifest.name}@${manifest.version}`;
  if (!manifest.name || packages.has(key)) return;
  const files = readdirSync(directory).filter(name => /^(LICENSE|LICENCE|NOTICE|COPYING|THIRD[-_ ]?PARTY[-_ ]?NOTICES?)(\.|$)/i.test(name));
  const record = { name: manifest.name, version: manifest.version, license: manifest.license, homepage: manifest.homepage, author: manifest.author, files: [] };
  packages.set(key, record);
  const folder = manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + manifest.version;
  for (const file of files) {
    mkdirSync(join(licenseDir, folder), { recursive: true });
    cpSync(join(directory, file), join(licenseDir, folder, file), { recursive: true });
    record.files.push(`${folder}/${file}`);
  }
  const require = createRequire(join(directory, 'package.json'));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    try { collect(packageRoot(require.resolve(name))); }
    catch {
      const conventional = join(directory, 'node_modules', name);
      if (existsSync(join(conventional, 'package.json'))) collect(conventional);
    }
  }
}
for (const result of builds) for (const file of Object.keys(result.metafile.inputs)) {
  if (file.includes('node_modules/')) collect(packageRoot(resolve(file)));
}
collect(host);
for (const name of ['@xterm/xterm', '@xterm/addon-fit', 'monaco-editor']) collect(join(desktop, 'node_modules', name));
// Die beiden Schriften der Oberfläche liegen als Dateien in media/fonts, nicht als Paket.
for (const [name, file, homepage] of [
  ['Manrope', 'OFL-Manrope.txt', 'https://github.com/googlefonts/manrope'],
  ['JetBrains Mono', 'OFL-JetBrainsMono.txt', 'https://github.com/JetBrains/JetBrainsMono'],
]) {
  const folder = `font-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  mkdirSync(join(licenseDir, folder), { recursive: true });
  cpSync(join(host, 'media/fonts', file), join(licenseDir, folder, file));
  packages.set(`font:${name}`, { name: `${name} (Schrift)`, version: '', license: 'OFL-1.1', homepage, files: [`${folder}/${file}`] });
}
writeFileSync(join(licenseDir, 'index.json'), JSON.stringify([...packages.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n');
writeFileSync(join(licenseDir, 'README.txt'), 'Cortex bundles these runtime dependencies. License and notice files are copied unchanged. Electron and Chromium notices are included separately. Cortex source: MIT; see resources/cortex/LICENSE.\n');
const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
writeFileSync(join(out, 'build-info.json'), JSON.stringify({ product: 'Cortex', version: manifest.version, runtime: 'Electron', electron: manifest.dependencies.electron, architecture: process.arch, workbench: false, builtAt: new Date().toISOString(), workers: ['editor', 'json', 'ts', 'html', 'css'] }, null, 2) + '\n');
console.log(`Cortex Desktop gebaut; ${packages.size} Lizenzhinweise, eigene Oberfläche und Terminal, keine VSCodium-Workbench.`);
