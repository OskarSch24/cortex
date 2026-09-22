import { contextBridge, ipcRenderer, webUtils } from 'electron';

const listeners = new Set<(message: unknown) => void>();
const queued: unknown[] = [];
ipcRenderer.on('cortex:host', (_event, message) => {
  // Kept in the isolated preload; foreign preview frames have no access.
  window.dispatchEvent(new MessageEvent('message', { data: message }));
});
ipcRenderer.on('cortex:shell', (_event, message) => {
  if (!listeners.size) queued.push(message);
  else for (const listener of listeners) listener(message);
});
contextBridge.exposeInMainWorld('acquireVsCodeApi', () => ({
  postMessage: (message: unknown) => ipcRenderer.send('cortex:message', message),
}));
contextBridge.exposeInMainWorld('cortexDesktop', {
  send: (message: unknown) => ipcRenderer.send('cortex:shell-message', message),
  subscribe: (listener: (message: unknown) => void) => {
    listeners.add(listener); queued.splice(0).forEach(listener);
    return () => listeners.delete(listener);
  },
  getFilePath: (file: File) => webUtils.getPathForFile(file),
});
window.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); document.documentElement.classList.add('cx-drop-hover'); }
  }, true);
  window.addEventListener('drop', event => {
    document.documentElement.classList.remove('cx-drop-hover');
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const paths = [...event.dataTransfer.files].map(file => webUtils.getPathForFile(file)).filter(Boolean);
    ipcRenderer.send('cortex:drop', paths);
  }, true);
});
