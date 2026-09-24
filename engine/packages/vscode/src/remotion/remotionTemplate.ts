import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describeMaterial, materialKind, safeName, type MaterialItem } from './media.js';
import { FILES, materialSource, parseMaterialList } from './projectFiles.js';
import { cloneFile, cloneModules, ensureCache } from './cache.js';

/**
 * Das Videoprojekt, bevor der Agent es anfasst.
 *
 * Damit im Reiter „Video“ sofort etwas steht, legt Cortex das Remotion-Projekt
 * beim Absenden von `/remotion` selbst an: Vorlage aus diesem Modul, Pakete
 * aus einem einmal installierten Zwischenspeicher (auf APFS geklont, also in
 * Sekunden und ohne zusätzlichen Platz), angehängte Videos, Bilder und Töne
 * unter `public/material/` und in der Komposition „Material“ auf der Timeline.
 * Der Agent baut darauf auf, statt erst `create-video` und `npm i` abzuwarten.
 */

export { describeMaterial, materialKind, mp4Info, safeName, type MaterialItem } from './media.js';
export { materialSource, parseMaterialList } from './projectFiles.js';
export { ensureCache } from './cache.js';

interface PrepareResult {
  created: boolean;
  material: MaterialItem[];
}

/**
 * Legt das Projekt an (falls es fehlt) und legt die Anhänge dazu. Die
 * Quelltexte kommen zuerst, damit der Reiter sofort „wird eingerichtet“
 * zeigt; die Pakete folgen aus dem Vorrat.
 */
export async function prepareProject(folder: string, attachments: string[], log?: (line: string) => void): Promise<PrepareResult> {
  const created = !existsSync(join(folder, 'package.json'));
  if (created) {
    for (const [file, text] of Object.entries(FILES)) {
      await mkdir(join(folder, file, '..'), { recursive: true });
      await writeFile(join(folder, file), text);
    }
    await writeFile(join(folder, 'src', 'materialList.ts'), materialSource([]));
    await mkdir(join(folder, 'public', 'material'), { recursive: true });
  }

  // Anhänge nur in ein Projekt, dessen Materialliste Cortex führt.
  const listFile = join(folder, 'src', 'materialList.ts');
  let material: MaterialItem[] = [];
  if (existsSync(listFile)) {
    try { material = parseMaterialList(await readFile(listFile, 'utf8')); } catch { material = []; }
    const added: MaterialItem[] = [];
    await mkdir(join(folder, 'public', 'material'), { recursive: true });
    for (const source of attachments) {
      if (!materialKind(source) || !existsSync(source)) continue;
      const name = safeName(basename(source));
      const file = `material/${name}`;
      if (material.some(item => item.file === file) || added.some(item => item.file === file)) continue;
      await cloneFile(source, join(folder, 'public', file));
      const item = await describeMaterial(source, file);
      if (item) added.push(item);
    }
    if (added.length) {
      material = [...material, ...added];
      await writeFile(listFile, materialSource(material));
      log?.(`Material übernommen: ${added.map(item => item.file).join(', ')}`);
    }
  }

  if (!existsSync(join(folder, 'node_modules', '@remotion', 'cli'))) {
    await ensureCache(log);
    await cloneModules(folder);
  }
  return { created, material };
}
