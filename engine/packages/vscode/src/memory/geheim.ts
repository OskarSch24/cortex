/**
 * Schwärzt Schlüssel und Passwörter, bevor Cortex etwas als Erinnerung ablegt.
 *
 * Dieselbe Idee wie `maskiere()` in `Exokortex/bruecke/chats.py`: der Wert
 * wird ersetzt, der Name bleibt, damit „der Apify-Token liegt in der .env“
 * erinnerbar bleibt, ohne dass der Token selbst mitwandert.
 */

const MUSTER: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bapify_api_[A-Za-z0-9]{20,}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bxai-[A-Za-z0-9]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

/** `API_KEY=…`, `"password": "…"`, `token: …` */
const ZUWEISUNG =
  /\b([A-Za-z_]*(?:api[_-]?key|secret|token|passwor[dt]|passwd|pwd)[A-Za-z_]*)(["']?\s*[:=]\s*["']?)([^\s"',;]{8,})/gi;

/** `postgres://user:pass@host` */
const URI_PASSWORT = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi;

export function schwaerze(text: string): string {
  let out = text;
  for (const m of MUSTER) out = out.replace(m, '<geheim>');
  out = out.replace(ZUWEISUNG, (_all, name: string, trenner: string, wert: string) =>
    wert === '<geheim>' ? `${name}${trenner}${wert}` : `${name}${trenner}<geheim>`,
  );
  out = out.replace(URI_PASSWORT, '$1<geheim>$3');
  return out;
}
