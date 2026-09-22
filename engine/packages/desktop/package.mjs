import { packager } from '@electron/packager';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const desktop = import.meta.dirname;
const root = resolve(desktop, '../../..');
const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
const brand = JSON.parse(readFileSync(join(root, 'brand/config.json'), 'utf8'));
const stage = join(root, '.cache/desktop-package');
if (!existsSync(join(desktop, 'dist/build-info.json'))) throw new Error('Zuerst Cortex Desktop bauen.');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const part of ['dist', 'resources']) cpSync(join(desktop, part), join(stage, part), { recursive: true });
cpSync(join(root, 'engine/LICENSE'), join(stage, 'LICENSE'));
const licenses = join(stage, 'resources/licenses');
mkdirSync(licenses, { recursive: true });
for (const file of ['LICENSE', 'LICENSES.chromium.html']) cpSync(join(desktop, 'node_modules/electron/dist', file), join(licenses, file === 'LICENSE' ? 'Electron-LICENSE.txt' : file));
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'cortex', productName: 'Cortex', version: manifest.version, description: 'Cortex — eigenständige macOS-App', author: 'Oskar Schiermeister', license: 'MIT', main: 'dist/main.js' }, null, 2) + '\n');
const paths = await packager({
  dir: stage, out: join(root, '.cache/desktop'), name: 'Cortex', platform: 'darwin', arch: process.arch,
  electronVersion: manifest.dependencies.electron, appBundleId: brand.darwinBundleIdentifier,
  appCategoryType: 'public.app-category.productivity', icon: join(root, 'brand/Code.icns'),
  overwrite: true, prune: false, asar: false,
  extendInfo: {
    CFBundleDisplayName: 'Cortex',
    NSMicrophoneUsageDescription: 'Cortex verwendet das Mikrofon für von dir gestartete Spracheingaben.',
    NSAppleEventsUsageDescription: 'Cortex verbindet sich auf deinen Auftrag mit lokalen Anwendungen.',
    CFBundleURLTypes: [{ CFBundleURLName: brand.darwinBundleIdentifier, CFBundleURLSchemes: [brand.urlProtocol] }],
  },
});
writeFileSync(join(root, '.cache/desktop-package-path.json'), JSON.stringify({ app: join(paths[0], 'Cortex.app'), architecture: process.arch, version: manifest.version }, null, 2) + '\n');
console.log(paths.map(path => join(path, 'Cortex.app')).join('\n'));
