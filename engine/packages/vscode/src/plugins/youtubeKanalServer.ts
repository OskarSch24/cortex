/**
 * Zwischenserver vor `youtube-analytics-mcp` („YouTube · Google-Konto“).
 *
 * Der Server zählt und listet Videos nur über Abfragen, die YouTube auf
 * öffentliche Videos beschränkt: `statistics.videoCount` und `search.list` mit
 * `channelId`. Ein Kanal aus lauter nicht gelisteten Videos steht dort mit
 * „0 Videos“ — und der Agent sucht den Rest dann im Browser, obwohl die API ihn
 * mit genau diesem Token liefert. Die Uploads-Playlist des Kanals enthält für
 * den Eigentümer jedes Video, gleich welcher Sichtbarkeit.
 *
 * Dieser Prozess startet den eigentlichen Server als Kind und reicht alles
 * durch. Nur `list_channels`, `get_channel_info` und `get_channel_videos` beantwortet er selbst,
 * und in `tools/list` beschreibt er sie so, wie sie jetzt arbeiten.
 *
 * Aufruf: `node youtubeKanalServer.js <befehl> [argumente …]` — der Befehl ist
 * der des eigentlichen Servers. Eigener Bündel, weil er ein eigener Prozess ist.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { errorMessage } from '../util/errors.js';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

type Privacy = 'public' | 'unlisted' | 'private';

interface Video {
  id: string;
  title: string;
  privacy: Privacy;
  publishedAt: string;
  /** Nur bei geplanten Videos: wann sie öffentlich werden. */
  publishAt?: string;
  views: number;
  uploadStatus: string;
}

const API = 'https://www.googleapis.com/youtube/v3/';
const PRIVACY: readonly Privacy[] = ['public', 'unlisted', 'private'];

const OWN_TOOLS: Record<string, ToolDef> = {
  get_channel_videos: {
    name: 'get_channel_videos',
    description:
      "List the videos uploaded to the authenticated channel — public, unlisted AND private — newest first, " +
      'with privacy status, publish date and view count. Reads the uploads playlist through the YouTube Data API, ' +
      'so unlisted and private videos are included. Use this (not a browser) to count or list the channel\'s videos.',
    inputSchema: {
      type: 'object',
      properties: {
        privacy: {
          type: 'string',
          enum: ['all', ...PRIVACY],
          description: 'Only videos with this privacy status. Default: all.',
        },
        maxResults: {
          type: 'number',
          description: 'How many videos to list at most (the counts always cover every video). Default: 100.',
        },
      },
    },
  },
  list_channels: {
    name: 'list_channels',
    description:
      'List the YouTube channels of the authenticated Google account, each with subscribers and the number of ' +
      'uploaded videos broken down into public, unlisted and private.',
    inputSchema: { type: 'object', properties: {} },
  },
  get_channel_info: {
    name: 'get_channel_info',
    description:
      'Channel title, subscribers and total views of the authenticated channel, plus the number of uploaded videos ' +
      'broken down into public, unlisted and private. The API field videoCount alone counts public videos only.',
    inputSchema: { type: 'object', properties: {} },
  },
};

function send(message: JsonRpcMessage): void {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// ── Zugang ───────────────────────────────────────────────────────────────────

interface StoredToken {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
}

let refreshed: { token: string; expires: number } | undefined;

function readJson<T>(path: string | undefined, what: string): T {
  if (!path) throw new Error(`${what} fehlt — YouTube in Cortex neu verbinden.`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * Der Token aus der Datei, die Cortex pflegt; ist er abgelaufen, ein frischer
 * nur im Speicher. Die Datei gehört Cortex — geschrieben wird sie hier nie.
 */
async function accessToken(): Promise<string> {
  const stored = readJson<StoredToken>(process.env.YOUTUBE_TOKEN_PATH, 'Die Token-Datei');
  const now = Date.now();
  if (stored.access_token && (stored.expiry_date ?? 0) > now + 60_000) return stored.access_token;
  if (refreshed && refreshed.expires > now + 60_000) return refreshed.token;
  if (!stored.refresh_token) throw new Error('Der Token ist abgelaufen — YouTube in Cortex neu verbinden.');

  const file = readJson<Record<string, Record<string, string>>>(process.env.YOUTUBE_CREDENTIALS_PATH, 'Die Client-Datei');
  const client = file.installed ?? file.web;
  if (!client?.client_id) throw new Error('Die Client-Datei enthält keinen OAuth-Client.');
  const response = await fetch(client.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret ?? '',
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`Token konnte nicht erneuert werden (${body.error ?? response.status}) — YouTube in Cortex neu verbinden.`);
  }
  refreshed = { token: body.access_token, expires: now + (body.expires_in ?? 3600) * 1000 };
  return refreshed.token;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(`YouTube-API ${path}: ${body.error?.message ?? response.status}`);
  return body;
}

// ── Kanal und Videos ─────────────────────────────────────────────────────────

interface Channel {
  id: string;
  snippet: { title: string; customUrl?: string };
  statistics: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
}

async function channels(params: Record<string, string>): Promise<Channel[]> {
  const result = await api<{ items?: Channel[] }>('channels', { part: 'snippet,statistics,contentDetails', ...params });
  return result.items ?? [];
}

async function channel(): Promise<Channel> {
  const id = process.env.YOUTUBE_CHANNEL_ID;
  const found = (await channels(id ? { id } : { mine: 'true' }))[0];
  if (!found) throw new Error(id ? `Kanal ${id} nicht gefunden.` : 'Unter diesem Google-Konto gibt es keinen Kanal.');
  return found;
}

/** Jedes Video der Uploads-Playlist, in der Reihenfolge der Playlist (neueste zuerst). */
async function uploads(playlistId: string): Promise<Video[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await api<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>('playlistItems', {
      part: 'contentDetails',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...page.items.map((item) => item.contentDetails.videoId));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const videos: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = await api<{
      items: {
        id: string;
        snippet: { title: string; publishedAt: string };
        status: { privacyStatus: Privacy; publishAt?: string; uploadStatus: string };
        statistics?: { viewCount?: string };
      }[];
    }>('videos', { part: 'snippet,status,statistics', id: ids.slice(i, i + 50).join(',') });
    for (const v of batch.items) {
      videos.push({
        id: v.id,
        title: v.snippet.title,
        privacy: v.status.privacyStatus,
        publishedAt: v.snippet.publishedAt,
        publishAt: v.status.publishAt,
        views: Number(v.statistics?.viewCount ?? 0),
        uploadStatus: v.status.uploadStatus,
      });
    }
  }
  return videos;
}

function counts(videos: Video[]): string {
  const by = (p: Privacy) => videos.filter((v) => v.privacy === p).length;
  return `${videos.length} videos in total — ${by('public')} public, ${by('unlisted')} unlisted, ${by('private')} private`;
}

async function listChannels(): Promise<string> {
  const all = await channels({ mine: 'true', maxResults: '50' });
  if (!all.length) return 'No channel found under this Google account.';
  const current = process.env.YOUTUBE_CHANNEL_ID;
  const blocks = [];
  for (const [i, ch] of all.entries()) {
    const videos = await uploads(ch.contentDetails.relatedPlaylists.uploads);
    const s = ch.statistics;
    blocks.push(
      [
        `${i + 1}. ${ch.snippet.title}${ch.id === current ? ' (selected via YOUTUBE_CHANNEL_ID)' : ''}`,
        `   Channel ID: ${ch.id}`,
        `   Subscribers: ${s.hiddenSubscriberCount ? 'hidden' : Number(s.subscriberCount ?? 0).toLocaleString('en')}`,
        `   Videos: ${counts(videos)}`,
        ch.snippet.customUrl ? `   URL: youtube.com/${ch.snippet.customUrl}` : '',
      ].filter(Boolean).join('\n'),
    );
  }
  return `Channels on this account:\n\n${blocks.join('\n\n')}`;
}

async function channelInfo(): Promise<string> {
  const ch = await channel();
  const videos = await uploads(ch.contentDetails.relatedPlaylists.uploads);
  const s = ch.statistics;
  return [
    `Channel: ${ch.snippet.title}${ch.snippet.customUrl ? ` (${ch.snippet.customUrl})` : ''}`,
    `Channel ID: ${ch.id}`,
    `Subscribers: ${s.hiddenSubscriberCount ? 'hidden' : Number(s.subscriberCount ?? 0).toLocaleString('en')}`,
    `Total views (public videos): ${Number(s.viewCount ?? 0).toLocaleString('en')}`,
    `Videos: ${counts(videos)}`,
  ].join('\n');
}

async function channelVideos(args: Record<string, unknown>): Promise<string> {
  const privacy = typeof args.privacy === 'string' && PRIVACY.includes(args.privacy as Privacy) ? (args.privacy as Privacy) : undefined;
  const limit = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.floor(args.maxResults) : 100;
  const ch = await channel();
  const videos = await uploads(ch.contentDetails.relatedPlaylists.uploads);
  const selected = privacy ? videos.filter((v) => v.privacy === privacy) : videos;
  const shown = selected.slice(0, limit);

  const lines = [`${ch.snippet.title}: ${counts(videos)}.`];
  if (privacy) lines.push(`${selected.length} of them ${privacy}.`);
  lines.push('');
  for (const v of shown) {
    const extra = [
      v.publishAt ? `scheduled for ${v.publishAt}` : '',
      v.uploadStatus !== 'processed' ? `upload ${v.uploadStatus}` : '',
    ].filter(Boolean);
    lines.push(
      `- ${v.title} [${v.privacy}] · ${v.publishedAt.slice(0, 10)} · ${v.views.toLocaleString('en')} views · ` +
        `https://youtu.be/${v.id}${extra.length ? ` · ${extra.join(', ')}` : ''}`,
    );
  }
  if (selected.length > shown.length) lines.push(`… ${selected.length - shown.length} more (raise maxResults).`);
  return lines.join('\n');
}

const HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  list_channels: listChannels,
  get_channel_videos: channelVideos,
  get_channel_info: channelInfo,
};

/** Eigene Antworten, die noch laufen — ein Ende des Kinds wartet auf sie. */
let pending = 0;
let exitCode: number | undefined;

async function answer(id: number | string, name: string, args: Record<string, unknown>): Promise<void> {
  pending++;
  try {
    const text = await HANDLERS[name]!(args);
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
  } catch (error) {
    const text = errorMessage(error);
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } });
  } finally {
    pending--;
    if (exitCode !== undefined && pending === 0) process.exit(exitCode);
  }
}

function patchTools(result: unknown): unknown {
  const tools = (result as { tools?: ToolDef[] } | undefined)?.tools;
  if (!Array.isArray(tools)) return result;
  const patched = tools.map((tool) => {
    const own = OWN_TOOLS[tool.name];
    return own ? { ...tool, ...own } : tool;
  });
  for (const own of Object.values(OWN_TOOLS)) {
    if (!patched.some((t) => t.name === own.name)) patched.push(own);
  }
  return { ...(result as object), tools: patched };
}

// ── Durchreichen ─────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write('youtubeKanalServer: kein Serverbefehl angegeben\n');
  process.exit(2);
}

const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
child.on('error', (error) => {
  process.stderr.write(`youtubeKanalServer: ${command} startet nicht: ${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  exitCode = code ?? (signal ? 1 : 0);
  if (pending === 0) process.exit(exitCode);
});

/** Ids der `tools/list`-Anfragen, deren Antwort umgeschrieben wird. */
const listRequests = new Set<number | string>();

createInterface({ input: process.stdin }).on('line', (line) => {
  let message: JsonRpcMessage | undefined;
  try {
    message = JSON.parse(line) as JsonRpcMessage;
  } catch {
    // Was nicht zu lesen ist, soll der eigentliche Server beanstanden.
  }
  if (message?.method === 'tools/call' && message.id !== undefined) {
    const name = String(message.params?.name ?? '');
    if (HANDLERS[name]) {
      void answer(message.id, name, (message.params?.arguments as Record<string, unknown>) ?? {});
      return;
    }
  }
  if (message?.method === 'tools/list' && message.id !== undefined) listRequests.add(message.id);
  child.stdin.write(line + '\n');
}).on('close', () => child.stdin.end());

createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const message = JSON.parse(line) as JsonRpcMessage;
    if (message.id !== undefined && message.method === undefined && listRequests.delete(message.id) && message.result) {
      send({ ...message, result: patchTools(message.result) });
      return;
    }
  } catch {
    // Keine JSON-Zeile: unverändert weiter.
  }
  process.stdout.write(line + '\n');
});
