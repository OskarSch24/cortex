import esbuild from 'esbuild';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { buildNativeImages } from './scripts/build-native-images.mjs';
import { buildNativeHistory } from './scripts/build-native-history.mjs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
buildNativeImages();
buildNativeHistory();

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
};

/**
 * Claude spawns this as its own process for permission prompts, so it cannot
 * live inside the extension bundle.
 */
/** @type {import('esbuild').BuildOptions} */
const permissionServerConfig = {
  entryPoints: ['src/permission/mcpServer.ts'],
  bundle: true,
  outfile: 'dist/permissionServer.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
};

/**
 * Steht als eigener Prozess vor dem YouTube-Analytics-Server, den eine CLI startet.
 */
/** @type {import('esbuild').BuildOptions} */
const youtubeKanalServerConfig = {
  ...permissionServerConfig,
  entryPoints: ['src/plugins/youtubeKanalServer.ts'],
  outfile: 'dist/youtubeKanalServer.js',
};

/** Der Zeichenflächen-MCP-Server (canvas_view / canvas_draw) — ein eigener Prozess wie der Genehmigungsserver. */
/** @type {import('esbuild').BuildOptions} */
const canvasServerConfig = {
  ...permissionServerConfig,
  entryPoints: ['src/canvas/canvasMcp.ts'],
  outfile: 'dist/canvasServer.js',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/main.tsx'],
  bundle: true,
  outfile: 'media/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
  sourcemap: !production,
  minify: production,
};

/**
 * Excalidraw für die Zeichenfläche im Dock: mit echtem React, eigenes Paket,
 * erst geladen, wenn die Fläche aufgeht (webview/canvas/bundle.tsx). Immer
 * verkleinert — unverkleinert wäre es ein Vielfaches schwerer.
 */
/** @type {import('esbuild').BuildOptions} */
const canvasConfig = {
  entryPoints: ['webview/canvas/bundle.tsx'],
  bundle: true,
  outfile: 'media/excalidraw.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' },
  conditions: ['production'],
  loader: { '.woff2': 'file', '.svg': 'dataurl', '.png': 'dataurl', '.json': 'json' },
  logOverride: { 'empty-import-meta': 'silent' },
  sourcemap: false,
  minify: true,
};

/**
 * Die Schriften liegen neben dem Paket, damit Excalidraw sie ohne Netz findet
 * (`EXCALIDRAW_ASSET_PATH`). Xiaolai (Chinesisch, 12 MB) bleibt draußen —
 * fehlende Zeichen fallen auf die Systemschrift zurück.
 */
function copyCanvasFonts() {
  const from = 'node_modules/@excalidraw/excalidraw/dist/prod/fonts';
  const to = 'media/excalidraw/fonts';
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  for (const family of readdirSync(from)) {
    if (family === 'Xiaolai') continue;
    cpSync(`${from}/${family}`, `${to}/${family}`, { recursive: true });
  }
}
copyCanvasFonts();

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(permissionServerConfig),
    esbuild.context(youtubeKanalServerConfig),
    esbuild.context(canvasServerConfig),
    esbuild.context(webviewConfig),
    esbuild.context(canvasConfig),
  ]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('[cortex] watching...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(permissionServerConfig),
    esbuild.build(youtubeKanalServerConfig),
    esbuild.build(canvasServerConfig),
    esbuild.build(webviewConfig),
    esbuild.build(canvasConfig),
  ]);
  console.log('[cortex] build complete');
}
