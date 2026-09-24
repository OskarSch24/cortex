/**
 * Videos mit Remotion im Dock: was das Modell tun soll, wenn der Chat ein
 * Video baut.
 *
 * Cortex zeigt im Reiter „Video“ eine Live-Vorschau (Remotion Studio) des
 * Remotion-Projekts im Videoordner des Chats und darunter die fertig
 * gerenderten Dateien aus `out/`. Das Modell schreibt nur Code und rendert;
 * Studio startet Cortex selbst, einen Browser öffnet niemand.
 *
 * Mit geht diese Anweisung, wenn der Auftrag mit `/remotion` beginnt, der
 * Reiter offen ist, oder der Chat schon ein Videoprojekt hat und die
 * Nachricht davon handelt.
 */

import type { BriefSection } from './brief.js';

/** `/remotion …` — auch hinter einer Konto-Erwähnung wie `@claude`. */
export function asksForVideo(prompt: string): boolean {
  return /^\s*(?:@\S+\s+)?\/remotion\b/i.test(prompt);
}

/** Handelt die Nachricht vom Video? Lieber einmal zu oft ja. */
export function touchesVideo(prompt: string): boolean {
  return asksForVideo(prompt) ||
    /remotion|video|clip|film|animation|animier|szene|scene|intro|outro|untertitel|caption|rendern|render|komposition|composition|frame|sekunde|second|übergang|transition|musik|sound|ton\b/i.test(prompt);
}

export interface RemotionBriefState {
  /** Absoluter Videoordner des Chats. */
  folder: string;
  /** Liegt dort schon ein Remotion-Projekt (package.json)? */
  exists: boolean;
  /** Ist der Reiter „Video“ gerade offen? */
  open: boolean;
  /** Von Cortex angelegt: die Dateien in public/, die schon in der Komposition „Material“ liegen. */
  material?: string[];
}

export function remotionSections(state: RemotionBriefState): BriefSection[] {
  const q = JSON.stringify(state.folder);
  const body = [
    'Remotion video: Cortex shows the video of this chat in its side panel — a live preview (Remotion Studio) of the Remotion project in the video folder, ' +
      'and below it every rendered file in its out/ folder. Every file you save there appears in the preview within a second.',
    `Video folder of this chat: ${q}. Build the video only there — not in the project root, not in a new folder of your choosing.`,
    state.material
      ? 'Cortex already set up the Remotion project there (packages installed, preview running) — do not scaffold or run npm install. ' +
        'The composition "Material" (src/Material.tsx, list in src/materialList.ts) already shows the attached files on the timeline' +
        (state.material.length ? `: ${state.material.map(file => `public/${file}`).join(', ')}` : ' (none attached yet)') + '. ' +
        'Build the real video from there: add your scenes and compositions, reuse or replace "Material" as you see fit, and register everything in src/Root.tsx.'
      : state.exists
      ? 'A Remotion project already exists there: extend or change it (src/Root.tsx registers the compositions). Do not scaffold a second one.'
      : `No project yet: create the folder, then run \`npx create-video@latest --yes --blank --no-tailwind .\` inside it and \`npm i\` (as in the remotion-create skill). ` +
        'Cortex starts the preview as soon as the packages are installed.',
    'Do not run `remotion studio`, `npm run dev` or open a browser — Cortex runs the Studio and shows it. ' +
      'Use the Remotion skills (remotion-best-practices, remotion-create, remotion-render, …) and the remotion documentation tool when you need the current API.',
    'Files the user attached (videos, images, audio, logos) are material for this video: copy them into public/ of the video folder and use them with staticFile() — ' +
      '<OffthreadVideo>, <Img>, <Audio> from remotion. If the message is only the command plus attachments, build a fitting video from that material.',
    'Write real, finished scenes: sensible duration, fps 30, 1920×1080 unless the user wants another format (1080×1920 for vertical/short-form), readable text sizes, motion with spring()/interpolate(). ' +
      'Register every composition in src/Root.tsx with a clear id.',
    'When the video is done, render it: `npx remotion render <CompositionId> out/<CompositionId>.mp4` in the video folder. Cortex shows the file in the side panel right away. ' +
      'Then tell the user in one or two sentences what the video shows — no long description of the code.',
  ].join('\n');
  return [{ id: 'remotion', title: 'Remotion video', body }];
}
