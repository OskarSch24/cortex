/*
 * Vorgeladen in Remotion Studio (NODE_OPTIONS=--require …), wenn Cortex es
 * für die Video-Vorschau im Dock startet. Studio bindet sich sonst immer an
 * alle Netzwerkschnittstellen und wäre im WLAN erreichbar — samt den Dateien
 * des Projekts. Hier wird jede Bindung an „alle“ auf 127.0.0.1 umgelenkt.
 */
const net = require('node:net');
const listen = net.Server.prototype.listen;
const everywhere = host => host === undefined || host === '0.0.0.0' || host === '::';
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  if (first && typeof first === 'object' && everywhere(first.host)) {
    args[0] = { ...first, host: '127.0.0.1' };
  } else if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    if (typeof args[1] === 'string') { if (everywhere(args[1])) args[1] = '127.0.0.1'; }
    else args.splice(1, 0, '127.0.0.1');
  }
  return listen.apply(this, args);
};
