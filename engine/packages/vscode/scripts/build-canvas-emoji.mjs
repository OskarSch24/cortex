/**
 * Erzeugt webview/canvas/emoji-data.json: der vollständige Unicode-Emoji-Satz
 * (emojibase-data, MIT) mit deutschen Namen und Suchwörtern — gezeichnet
 * werden die Zeichen auf dem Mac von Apple Color Emoji, es ist also genau
 * Apples Emoji-Bibliothek. Reihenfolge und Gruppen wie in der Emoji-Palette.
 *
 * Aufruf: node scripts/build-canvas-emoji.mjs (nur nötig, wenn emojibase-data aktualisiert wird).
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('emojibase-data/de/data.json');
const messages = require('emojibase-data/de/messages.json');

// Komponenten (Hauttöne, Haarfarben als Einzelzeichen) sind Bausteine, keine Emojis zum Einfügen.
const groups = messages.groups.filter(g => g.key !== 'component').map(g => ({ id: g.order, name: g.message }));
const emojis = data
  .filter(e => e.group !== undefined && e.group !== 2 && e.emoji)
  .sort((a, b) => a.order - b.order)
  .map(e => {
    const out = { e: e.emoji, n: e.label, g: e.group };
    const words = (e.tags ?? []).filter(t => t !== 'all' && !e.label.toLowerCase().includes(t)).join(' ');
    if (words) out.t = words;
    // Fünf Hauttöne in der Reihenfolge von Apple (hell → dunkel), nur bei Einzelhauttönen.
    const skins = (e.skins ?? []).filter(s => typeof s.tone === 'number').sort((a, b) => a.tone - b.tone).map(s => s.emoji);
    if (skins.length === 5) out.s = skins;
    return out;
  });

writeFileSync(new URL('../webview/canvas/emoji-data.json', import.meta.url), JSON.stringify({ source: 'emojibase-data (MIT), Unicode Emoji 17', groups, emojis }));
console.log(`${emojis.length} Emojis in ${groups.length} Gruppen, ${emojis.filter(e => e.s).length} mit Hauttönen`);
