import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { formatTarget, type Target } from '@cortex/core';
import type { PermissionRequest } from '@cortex/core';
import type { HostToWebview } from '../panel/protocol.js';
import { applyHostMessage, type Segment, type TranscriptItem } from '../panel/transcript.js';

/**
 * Writes every conversation out as one Markdown file, for the Exokortex.
 *
 * Until this existed, a chat lived in exactly one place: VS Code's globalState,
 * capped at MAX_CONVERSATIONS. The 51st conversation did not move to an archive
 * — the next persist dropped it, and nothing said so. Whatever was worked out
 * in it was gone.
 *
 * These files are the durable copy. `bruecke/chats.py` picks them up on its own
 * schedule and feeds them into the graph; nothing here waits on that, and a
 * failure over there costs nothing here.
 */

/** What this module needs of a conversation. Structural, so no import cycle. */
export interface ExportableConversation {
  id: string;
  title: string;
  projectPath?: string;
  pinnedTarget?: Target;
  createdAt: number;
  updatedAt: number;
  log: HostToWebview[];
  /** Der Notizzettel des Chats — landet als eigenes Kapitel im Exokortex. */
  notizen?: string;
}

export const CHAT_ORDNER = join(homedir(), 'Cortex-Chats');

/**
 * The Exokortex refuses a source that lives inside its own storage or the
 * vault, so this cannot move under ~/.exokortex. It is a plain folder in the
 * home directory — outside ~/Documents and ~/Desktop, which are under TCC and
 * time out without ever asking for permission.
 */
export class ExokortexExport {
  /** updatedAt of the version already on disk, per conversation. */
  private geschrieben = new Map<string, number>();
  /** Frozen path per conversation: the first name a chat gets, it keeps. */
  private pfade = new Map<string, string>();

  constructor(private readonly ordner: string = CHAT_ORDNER) {}

  /** Explicitly deleting a chat also removes its own exported transcript. */
  entferne(id: string): void {
    if (!existsSync(this.ordner)) return;
    const marker = `--${id.slice(0, 8)}.md`;
    for (const year of readdirSync(this.ordner).filter(name => /^\d{4}$/.test(name))) {
      const folder = join(this.ordner, year);
      for (const name of readdirSync(folder).filter(name => name.endsWith(marker))) {
        const path = join(folder, name);
        if (readFileSync(path, 'utf8').split('\n').includes(`chat: ${feld(id)}`)) unlinkSync(path);
      }
    }
    this.geschrieben.delete(id); this.pfade.delete(id);
  }

  /**
   * Writes what changed. Called with *all* conversations, before any cap is
   * applied — a conversation about to be dropped is exactly the one that must
   * reach disk.
   */
  schreibe(alle: Iterable<ExportableConversation>): void {
    for (const rec of alle) {
      if (rec.log.length === 0) continue;
      if (this.geschrieben.get(rec.id) === rec.updatedAt) continue;
      try {
        const pfad = this.pfadFuer(rec);
        const text = alsMarkdown(rec);
        // Nur schreiben, wenn sich wirklich etwas geändert hat. `geschrieben`
        // ist nach einem Neustart leer, also gilt jede Konversation zunächst
        // als neu — und eine bloß neu gestempelte Datei kostet drüben einen
        // vollen Sechs-Minuten-Lauf für einen unveränderten Chat.
        if (unveraendert(pfad, text)) {
          this.geschrieben.set(rec.id, rec.updatedAt);
          continue;
        }
        writeFileSync(pfad, text, 'utf8');
        this.geschrieben.set(rec.id, rec.updatedAt);
      } catch {
        // Never let the archive break the chat. A missed write is retried on
        // the next persist, because `geschrieben` was not updated.
      }
    }
  }

  /**
   * The path a conversation writes to, stable for its whole life.
   *
   * The title changes as a chat develops — Cortex derives it from the first
   * message and the model may sharpen it later. If the filename followed the
   * title, a rename would produce a second document node in the graph and
   * leave the first behind as a corpse. So the name is taken once, from
   * whatever the title was then, and never revised.
   */
  private pfadFuer(rec: ExportableConversation): string {
    const bekannt = this.pfade.get(rec.id);
    if (bekannt) return bekannt;

    const jahr = join(this.ordner, String(new Date(rec.createdAt).getFullYear()));
    mkdirSync(jahr, { recursive: true });
    const marke = `--${rec.id.slice(0, 8)}.md`;
    const vorhanden = readdirSync(jahr).find((n) => n.endsWith(marke));
    const pfad = vorhanden
      ? join(jahr, vorhanden)
      : join(jahr, `${datum(rec.createdAt)}-${slug(rec.title)}${marke}`);

    // A chat started before midnight and continued after it keeps its own
    // year folder; only a conversation restored from an older host could land
    // in the wrong one, and then the file moves rather than forking.
    const alt = altePfade(this.ordner, marke, jahr);
    if (alt && !existsSync(pfad)) renameSync(alt, pfad);

    this.pfade.set(rec.id, pfad);
    return pfad;
  }
}

/** Ob auf der Platte schon genau das steht, was geschrieben werden soll. */
function unveraendert(pfad: string, text: string): boolean {
  try {
    return readFileSync(pfad, 'utf8') === text;
  } catch {
    return false;
  }
}

function altePfade(wurzel: string, marke: string, ausser: string): string | undefined {
  if (!existsSync(wurzel)) return undefined;
  for (const jahr of readdirSync(wurzel)) {
    const ordner = join(wurzel, jahr);
    if (ordner === ausser || !/^\d{4}$/.test(jahr)) continue;
    const treffer = readdirSync(ordner).find((n) => n.endsWith(marke));
    if (treffer) return join(ordner, treffer);
  }
  return undefined;
}

const datum = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const UMLAUTE: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss',
};

function slug(titel: string): string {
  // Umlauts are transliterated before the accents are stripped, so "hängen"
  // becomes "haengen" and not "hangen". Filenames stay ASCII on purpose: APFS
  // stores them decomposed, and a name that round-trips through NFC/NFD is one
  // more way for the same chat to arrive twice.
  const s = (titel || 'chat')
    .replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z]!)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s || 'chat';
}

/** YAML needs quoting for anything that could read as structure. */
const feld = (wert: string) => `"${String(wert).replace(/["\\]/g, '\\$&')}"`;

/**
 * One conversation as Markdown, in the shape the Exokortex parses:
 * frontmatter for the properties, `#` per turn, `##`/`###` beneath it. Each
 * turn becomes its own chapter node, which is the granularity that makes a
 * chat searchable — a whole session as one blob would answer every query with
 * the whole session.
 */
export function alsMarkdown(rec: ExportableConversation): string {
  const items = rec.log.reduce<TranscriptItem[]>((acc, msg) => applyHostMessage(acc, msg), []);
  const zeilen: string[] = [
    '---',
    'art: cortex-chat',
    `title: ${feld(rec.title || 'Chat')}`,
    `chat: ${feld(rec.id)}`,
    `begonnen: ${feld(new Date(rec.createdAt).toISOString())}`,
    `zuletzt: ${feld(new Date(rec.updatedAt).toISOString())}`,
  ];
  if (rec.projectPath) zeilen.push(`projekt_pfad: ${feld(rec.projectPath)}`);
  if (rec.pinnedTarget) zeilen.push(`konto: ${feld(formatTarget(rec.pinnedTarget))}`);
  zeilen.push('---', '');

  let runde = 0;
  for (const item of items) {
    switch (item.kind) {
      case 'user':
        zeilen.push(`# ${++runde} · Oskar`, '', item.text.trim(), '');
        if (item.attachments?.length) {
          zeilen.push('## Anhänge', '', ...item.attachments.map((a) => `- \`${a}\``), '');
        }
        break;
      case 'assistant': {
        // Only a routed answer carries its own target; an answer on the
        // conversation's pinned account carries none, and saying "Assistent"
        // there would lose the one fact worth keeping — which subscription
        // actually did the work.
        const ziel = item.target ?? rec.pinnedTarget;
        const wer = ziel ? formatTarget(ziel) : 'Assistent';
        zeilen.push(`# ${++runde} · ${wer}`, '');
        if (item.stopped) zeilen.push(`> Abgebrochen: ${item.stoppedReason ?? 'ohne Angabe'}`, '');
        for (const segment of item.segments) zeilen.push(...segmentZeilen(segment));
        break;
      }
      case 'permission':
        zeilen.push(
          `# ${++runde} · Rückfrage`,
          '',
          beschreibung(item.request),
          '',
          item.answered ? `> ${item.allowed ? 'Erlaubt' : 'Abgelehnt'}` : '> Unbeantwortet',
          '',
        );
        break;
      case 'tasks':
        zeilen.push('## Aufgabenliste', '', ...item.items.map(
          (t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.text}`), '');
        break;
      case 'review':
        zeilen.push(`## Durchsicht durch ${item.by}`, '', item.text.trim(), '');
        break;
      case 'failover':
      case 'notice':
        zeilen.push(`> ${item.text.trim()}`, '');
        break;
      case 'error':
        zeilen.push(`> Fehler: ${item.text.trim()}`, '');
        break;
    }
  }
  if (rec.notizen?.trim()) {
    // Eigene Überschrift ohne Rundennummer: das Kapitel, das bei einer Suche
    // nach einer Entscheidung am knappsten antwortet. Unterüberschriften eine
    // Ebene tiefer, damit sie Abschnitte dieses Kapitels bleiben.
    zeilen.push('# Notizzettel', '', rec.notizen.trim().replace(/^## /gm, '### '), '');
  }
  return zeilen.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n';
}

function segmentZeilen(segment: Segment): string[] {
  if (segment.kind === 'text') return [segment.text.trim(), ''];
  if (segment.kind === 'tools') {
    const out = ['## Werkzeuge', ''];
    for (const s of segment.steps) {
      out.push(`### ${s.name}${s.detail ? ` — ${s.detail}` : ''}`, '');
      if (s.path) out.push(`Datei: \`${s.path}\``, '');
      if (s.preview) out.push(...block(s.preview, s.action));
    }
    return out;
  }
  const out = ['## Nebenläufige Agenten', ''];
  for (const lane of segment.lanes) {
    out.push(`### ${lane.label}${lane.agentKind ? ` (${lane.agentKind})` : ''} — ${lane.status}`, '');
    if (lane.prompt) out.push(`Auftrag: ${lane.prompt.trim()}`, '');
    if (lane.summary) out.push(lane.summary.trim(), '');
    for (const s of lane.steps) {
      out.push(`- ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
      if (s.preview) out.push('', ...block(s.preview, s.action));
    }
    out.push('');
  }
  return out;
}

/**
 * A fence long enough to survive its own content: a preview containing ``` —
 * a diff of a Markdown file, say — would otherwise close the block early and
 * turn the rest of the chat into prose.
 */
function block(text: string, action?: string): string[] {
  const laengste = Math.max(2, ...[...text.matchAll(/^`{3,}/gm)].map((m) => m[0].length));
  const zaun = '`'.repeat(laengste + 1);
  return [`${zaun}${action === 'edit' ? 'diff' : ''}`, text.replace(/\n+$/, ''), zaun, ''];
}

function beschreibung(request: PermissionRequest): string {
  return [request.title, request.detail].filter(Boolean).join(' — ') || 'Rückfrage ohne Text';
}
