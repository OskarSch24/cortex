import { clockTime } from '../../format/time.js';

/* ── Zeit ────────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** „Heute, 16:36“ · „Gestern, …“ · „Dienstag, …“ innerhalb einer Woche · sonst „11. Sept., …“. */
export function formatStamp(at: number, now = Date.now()): string {
  const date = new Date(at);
  const time = clockTime(date);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(date)) / 86_400_000);
  if (days === 0) return `Heute, ${time}`;
  if (days === 1) return `Gestern, ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]}, ${time}`;
  return `${date.getDate()}. ${MONTHS[date.getMonth()]}${date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`}, ${time}`;
}
