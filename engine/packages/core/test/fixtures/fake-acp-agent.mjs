#!/usr/bin/env node
/**
 * Minimal ACP agent used by tests: speaks the same JSON-RPC dialect as
 * `grok --acp` / `copilot --acp` so the adapter can be verified end to end
 * without a live account. Behaviour is driven by the prompt text:
 *   "TOOL"       → emits a tool_call update
 *   "PERMISSION" → asks the client for permission before answering
 *   "SLOW"       → streams slowly so a test can inject mid-turn
 *   "LIMIT"      → fails the prompt with a quota error
 *   "IMAGE:<p>"  → an image_gen call whose result is the file <p>, shaped
 *                  exactly like Grok 1.0.24 reports it
 *   "CONFIG"     → answers with the session config options set so far
 * Env: GROK_WITHOUT_CONFIG_OPTIONS=1 plays a pre-1.0.30 CLI that does not
 * implement session/set_config_option.
 */
import { createInterface } from 'node:readline';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const update = (sessionId, update) => notify('session/update', { sessionId, update });
const chunk = (sessionId, text) =>
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });

let nextServerId = 1000;
const serverPending = new Map();
const askPermission = (sessionId, title) =>
  new Promise((resolve) => {
    const id = nextServerId++;
    serverPending.set(id, resolve);
    send({
      jsonrpc: '2.0',
      id,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: { title, kind: 'execute' },
        options: [
          { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
          { optionId: 'no', name: 'Reject', kind: 'reject_once' },
        ],
      },
    });
  });

let sessionCounter = 0;
let authenticated = false;
let selectedModel;
const configOptions = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The turn currently streaming, so a new prompt can cancel it like real agents do. */
let active = null;

async function runPrompt(sessionId, text, respond) {
  if (active) {
    active.cancelled = true;
    chunk(sessionId, 'Info: Operation cancelled by user');
  }
  const turn = { cancelled: false };
  active = turn;

  if (/LIMIT/.test(text)) {
    active = null;
    respond({ error: { code: -32000, message: 'Quota exceeded: RESOURCE_EXHAUSTED' } });
    return;
  }
  if (/TOOL/.test(text)) {
    update(sessionId, {
      sessionUpdate: 'tool_call',
      title: 'Shell',
      kind: 'execute',
      rawInput: { command: 'ls -la' },
    });
  }
  const image = /IMAGE:(\S+)/.exec(text);
  if (image) {
    const toolCallId = 'call-image-1';
    const meta = { 'x.ai/tool': { version: 1, name: 'image_gen', kind: 'image_gen', namespace: 'grok_build' } };
    update(sessionId, { sessionUpdate: 'tool_call', toolCallId, title: 'image_gen', rawInput: { prompt: 'A red cube', aspect_ratio: '1:1' }, _meta: meta });
    update(sessionId, {
      sessionUpdate: 'tool_call_update', toolCallId, status: 'completed', _meta: meta,
      content: [{ type: 'content', content: { type: 'text', text: JSON.stringify({ path: image[1], filename: '1.jpg' }) } }],
      rawOutput: { type: 'ImageGen', path: image[1], filename: '1.jpg', session_folder: 'images' },
    });
  }
  if (/PERMISSION/.test(text)) {
    const outcome = await askPermission(sessionId, 'Run shell command');
    chunk(sessionId, outcome === 'yes' ? 'PERMISSION-GRANTED' : 'PERMISSION-DENIED');
    if (turn.cancelled) return;
    active = null;
    respond({ result: { stopReason: 'end_turn' } });
    return;
  }

  const pieces = /SLOW/.test(text) ? ['one ', 'two ', 'three ', 'four ', 'five '] : ['done'];
  for (const piece of pieces) {
    if (turn.cancelled) break;
    chunk(sessionId, piece);
    await sleep(/SLOW/.test(text) ? 120 : 0);
  }
  if (/INJECTED/.test(text)) chunk(sessionId, 'INJECTED-OK');
  if (active === turn) active = null;
  // A cancelled turn settles last, exactly like the real agents.
  if (turn.cancelled) await sleep(80);
  // Usage is optional in the protocol; an agent that reports it puts it here,
  // in the shape the real Copilot bundle declares.
  const usage = /USAGE/.test(text)
    ? {
        usage: {
          inputTokens: 1200,
          outputTokens: 300,
          cachedReadTokens: 8000,
          cachedWriteTokens: 0,
          thoughtTokens: 0,
          totalTokens: 9500,
        },
      }
    : {};
  respond({ result: { stopReason: 'end_turn', ...usage } });
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  // Response to one of our server→client requests (permission).
  if (msg.id !== undefined && msg.result !== undefined && !msg.method) {
    const resolve = serverPending.get(msg.id);
    if (resolve) {
      serverPending.delete(msg.id);
      const outcome = msg.result?.outcome;
      resolve(outcome?.outcome === 'selected' ? outcome.optionId : 'cancelled');
      return;
    }
  }

  const respond = (payload) => send({ jsonrpc: '2.0', id: msg.id, ...payload });

  switch (msg.method) {
    case 'initialize':
      respond({
        result: {
          protocolVersion: 1,
          authMethods: [{ id: 'cached_token' }],
          agentCapabilities: { loadSession: true },
          agentInfo: { name: 'FakeAcp', version: '1.0.0' },
        },
      });
      break;
    case 'authenticate':
      authenticated = msg.params?.methodId === 'cached_token' && msg.params?._meta?.headless === true;
      respond({ result: {} });
      break;
    case 'session/set_model':
      if (!authenticated) { respond({ error: { code: -32000, message: 'not authenticated' } }); break; }
      if (!['grok-4.6', 'grok-4.5'].includes(msg.params?.modelId)) { respond({ error: { code: -32602, message: 'unknown model id' } }); break; }
      selectedModel = msg.params.modelId;
      respond({ result: {} });
      break;
    case 'session/set_config_option':
      // Grok gained session config options in 1.0.30. An older CLI answers
      // -32601 here, which is what GROK_WITHOUT_CONFIG_OPTIONS replays.
      if (process.env.GROK_WITHOUT_CONFIG_OPTIONS === '1') {
        respond({ error: { code: -32601, message: 'Method not found' } });
        break;
      }
      configOptions[msg.params?.configId] = msg.params?.value;
      respond({ result: { configOptions: Object.entries(configOptions).map(([id, currentValue]) => ({ id, currentValue })) } });
      break;
    case 'session/new':
      respond({ result: { sessionId: `fake-session-${++sessionCounter}` } });
      break;
    case 'session/load':
      if (String(msg.params?.sessionId ?? '').startsWith('fake-session-')) {
        // Like the real agents: the history comes back as updates before the
        // load answers — the earlier question, the earlier answer, its tools.
        const id = msg.params.sessionId;
        update(id, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'EARLIER-QUESTION' } });
        update(id, { sessionUpdate: 'tool_call', title: 'Shell', kind: 'execute', rawInput: { command: 'echo earlier' } });
        chunk(id, 'EARLIER-ANSWER');
        respond({ result: {} });
      }
      else respond({ error: { code: -32000, message: 'unknown session' } });
      break;
    case 'session/prompt': {
      const text = (msg.params?.prompt ?? []).map((p) => p.text ?? '').join(' ');
      if (text === 'CONFIG_CHECK') { chunk(msg.params.sessionId, JSON.stringify(configOptions)); respond({ result: { stopReason: 'end_turn' } }); break; }
      if (text === 'MODEL_CHECK') { chunk(msg.params.sessionId, selectedModel ?? 'DEFAULT'); respond({ result: { stopReason: 'end_turn' } }); break; }
      void runPrompt(msg.params.sessionId, text, respond);
      break;
    }
    default:
      // A real agent answers an unimplemented method with -32601. Answering
      // an empty success here once hid exactly that case from these tests.
      if (msg.id !== undefined) respond({ error: { code: -32601, message: 'Method not found' } });
  }
});
