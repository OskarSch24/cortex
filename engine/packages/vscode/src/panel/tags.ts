/**
 * `#hashtags` werden zu Routing-Tags — dasselbe, was das Panel beim Senden ableitet.
 *
 * Bewusst ohne Node- oder VS-Code-Importe: die Webview darf diese Datei laden.
 */
export function tagsOf(text: string): string[] {
  return [...text.matchAll(/(^|\s)#([\w-]+)/g)].map((m) => m[2]!);
}
