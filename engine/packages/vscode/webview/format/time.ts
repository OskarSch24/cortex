/** Uhrzeit wie auf der Uhr: „16:36“. */
export function clockTime(at: number | Date): string {
  return new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
