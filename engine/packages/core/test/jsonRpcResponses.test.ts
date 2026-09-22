import { describe, expect, it } from 'vitest';
import { JsonRpcProcess } from '../src/adapters/jsonRpc.js';

// Only a local Node child speaks this protocol: no provider or account is used.
const agent = `
  const readline = require('node:readline');
  const lines = [];
  const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
  let timer;
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line); lines.push(message);
    if (message.method) send({ jsonrpc: '2.0', id: message.id, result: {} });
    clearTimeout(timer);
    timer = setTimeout(() => send({ jsonrpc: '2.0', method: 'observed', params: { lines } }), 30);
  });
  send({ jsonrpc: '2.0', id: 'approval', method: 'approve', params: {} });
`;

describe('JSON-RPC server replies', () => {
  it.each([false, true])('sends one denial before the post-response callback, even if it throws=%s', async throws => {
    let finish!: (lines: Array<Record<string, unknown>>) => void;
    let fail!: (error: Error) => void;
    const observed = new Promise<Array<Record<string, unknown>>>((resolve, reject) => { finish = resolve; fail = reject; });
    const timeout = setTimeout(() => fail(new Error('Local protocol fixture timed out')), 3000);
    const followups: Array<Promise<unknown>> = [];
    const rpc = new JsonRpcProcess(process.execPath, ['-e', agent], {
      cwd: process.cwd(), env: process.env, signal: new AbortController().signal,
      onNotification: message => { if (message.method === 'observed') finish(message.params.lines as Array<Record<string, unknown>>); },
      onSpawnError: message => fail(new Error(message)),
      onExit: code => fail(new Error(`Local protocol fixture exited: ${code}`)),
      onServerRequest: () => ({ decision: 'denied' }),
      onServerResponse: () => {
        if (throws) throw new Error('A view callback failed after replying');
        followups.push(rpc.request('turn/steer', { expectedTurnId: 'same-turn' }));
      },
    });
    rpc.start();
    try {
      const lines = await observed;
      expect(lines[0]).toEqual({ jsonrpc: '2.0', id: 'approval', result: { decision: 'denied' } });
      expect(lines.filter(line => line.id === 'approval')).toHaveLength(1);
      expect(lines).toHaveLength(throws ? 1 : 2);
      if (!throws) expect(lines[1]).toMatchObject({ method: 'turn/steer', params: { expectedTurnId: 'same-turn' } });
      await Promise.all(followups);
    } finally { clearTimeout(timeout); rpc.dispose(); }
  });
});

// Ein Agent, der lange arbeitet und dabei meldet, was er tut: erst nach
// 1,2 Sekunden Meldungen kommt die Antwort auf den Auftrag.
const busyAgent = `
  const readline = require('node:readline');
  const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line);
    let ticks = 0;
    const beat = setInterval(() => {
      send({ jsonrpc: '2.0', method: 'session/update', params: { tick: ++ticks } });
      if (ticks === 12) { clearInterval(beat); send({ jsonrpc: '2.0', id: message.id, result: { done: true } }); }
    }, 100);
  });
`;

describe('Frist eines Auftrags', () => {
  it('misst Stille, nicht Dauer — ein meldender Agent läuft weiter', async () => {
    const rpc = new JsonRpcProcess(process.execPath, ['-e', busyAgent], {
      cwd: process.cwd(), env: process.env, signal: new AbortController().signal,
      onNotification: () => undefined,
    });
    rpc.start();
    try {
      // Die Frist ist kürzer als der ganze Lauf; jede Meldung stellt sie neu.
      const result = await rpc.request('session/prompt', {}, 400);
      expect(result).toEqual({ done: true });
    } finally { rpc.dispose(); }
  });

  it('gibt auf, wenn gar nichts mehr kommt, und sagt es verständlich', async () => {
    const mute = 'setInterval(() => {}, 1000);';
    const rpc = new JsonRpcProcess(process.execPath, ['-e', mute], {
      cwd: process.cwd(), env: process.env, signal: new AbortController().signal,
      onNotification: () => undefined,
    });
    rpc.start();
    try {
      await expect(rpc.request('session/prompt', {}, 300)).rejects.toThrow(/session\/prompt: seit \d+ Minuten kein Lebenszeichen/);
    } finally { rpc.dispose(); }
  });
});
