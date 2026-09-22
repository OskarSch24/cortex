// Pure webview modules use the host bridge at import time, before a DOM exists.
(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} });
