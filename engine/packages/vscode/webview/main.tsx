import { render } from 'preact';
import { App } from './App.js';

// Nachrichten nimmt die Oberfläche nur von ihrem Host an. Die HTML-Vorschau im
// Dock ist eine fremde Seite in einem Rahmen; ohne diesen Filter könnte sie per
// `parent.postMessage` Host-Nachrichten vortäuschen. Geprüft wird die Herkunft,
// nicht das Absenderfenster: in Code-OSS ist `e.source` einer Host-Nachricht
// weder `window.parent` noch `window.top` — ein Vergleich damit verwarf jede
// Nachricht, und die Oberfläche blieb ohne Konten, Projekte und Chats. Der Host
// schickt von der Herkunft der Webview selbst, die Vorschau läuft unter
// http://127.0.0.1, ein Rahmen ohne allow-same-origin als "null". Ohne
// Herkunft ('') kommt nur ein `dispatchEvent` aus diesem Fenster — so speist
// der Vorschau-Harness unter dev/ seine Nachrichten ein.
window.addEventListener('message', (e) => {
  if (e.origin && e.origin !== window.origin) e.stopImmediatePropagation();
}, true);

// Zieht jemand Dateien aus dem Finder über die Oberfläche, meldet die Workbench
// das (scripts/patch-webview-drop.py). Die Pfade selbst kommen danach als
// gewöhnliche `attachments`-Nachricht.
window.addEventListener('message', (e) => {
  if (e.data?.kind === 'dropHover') document.documentElement.classList.toggle('cx-drop-hover', !!e.data.active);
});
// Ein Ziehen, das außerhalb des Fensters endet, meldet nie „vorbei“. Während
// eines echten Ziehens feuern keine Mausbewegungen — kommt eine, ist keins mehr.
window.addEventListener('mousemove', () => document.documentElement.classList.remove('cx-drop-hover'), { passive: true });

render(<App />, document.getElementById('root')!);
