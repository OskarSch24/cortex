import { isWidgetLang, parseWidget } from './widgets/spec.js';

const LABELS: Record<string, string> = { location: 'Ort', temp: 'Temperatur', condition: 'Wetter', date: 'Datum', high: 'Höchstwert', low: 'Tiefstwert', wind: 'Wind', rain: 'Regen', title: 'Titel', label: 'Bezeichnung', text: 'Text', value: 'Wert', price: 'Kurs', change: 'Änderung', symbol: 'Symbol', source: 'Quelle', name: 'Name', status: 'Status', url: 'Link', path: 'Datei', note: 'Hinweis', detail: 'Details', done: 'Erledigt', total: 'Gesamt', passed: 'Bestanden', durationSec: 'Dauer in Sekunden', station: 'Station', destination: 'Ziel', from: 'Von', to: 'Nach', amount: 'Betrag', rate: 'Kurs', question: 'Frage', explanation: 'Erklärung' };
const DECORATION = new Set(['type', 'tone', 'color', 'icon', 'series', 'peaks', 'points', 'edges', 'background', 'primary', 'prompt']);

/** Export data, not implementation JSON or decorative chart coordinates. */
function readable(value: unknown, key = '', depth = 0): string {
  if (DECORATION.has(key) || depth > 8 || value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(item => readable(item, '', depth + 1)).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => readable(v, k, depth + 1)).filter(Boolean).join(' · ');
  const shown = typeof value === 'boolean' ? value ? 'Ja' : 'Nein' : String(value);
  return key ? `${LABELS[key] ?? key}: ${shown}` : shown;
}

export function answerForClipboard(text: string): string {
  return text.replace(/```([\w.-]+)\s*\n([\s\S]*?)```/g, (block, lang: string, code: string) => {
    if (!isWidgetLang(lang)) return block;
    const parsed = parseWidget(code);
    return parsed.ok ? readable(parsed.spec) : '[Widget konnte nicht als Text gelesen werden]';
  });
}
