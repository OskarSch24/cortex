import type { ToolStep } from './transcript.js';

/**
 * Grok-Schritte aus Chats, die aufgezeichnet wurden, bevor Cortex Groks
 * Werkzeugnamen kannte (bis 25.09.2026). Damals kam jeder Grok-Aufruf als
 * namenloses Werkzeug an — „Werkzeug verwendet“, zehnmal untereinander.
 *
 * Gespeichert ist nur, was damals ankam: der Name (`run_terminal_command`,
 * `read_file`) und als Zeile das lesbarste Argument, bei Dateien die Argumente
 * als JSON. Daraus lässt sich die Art sicher ablesen, und alte Chats sagen
 * dann dasselbe wie neue. Schritte, die ihre Art schon tragen, bleiben, wie
 * sie sind.
 */
export function recognizeGrokStep(step: ToolStep): ToolStep {
  // Groks eigene Websuche kam als Suche mit leerem Muster an: `""`.
  if (step.name === 'Web search:') return { ...step, name: 'WebSearch', action: 'fetch', detail: undefined };
  if (step.action && step.action !== 'other') return step;
  const detail = step.detail?.trim() ?? '';
  switch (step.name) {
    case 'run_terminal_command':
    case 'monitor':
      return { ...step, action: 'run', detail: detail.replace(/\n… \+\d+ more lines$/, '') };
    case 'read_file': {
      const path = jsonField(detail, 'target_file');
      return path ? { ...step, action: 'read', path, detail: path } : step;
    }
    case 'list_dir': {
      const path = jsonField(detail, 'target_directory');
      return path ? { ...step, action: 'search', path, detail: path } : step;
    }
    case 'search_replace':
      return { ...step, action: 'edit' };
    case 'web_fetch':
      return { ...step, action: 'fetch' };
    case 'spawn_subagent':
      return { ...step, action: 'task' };
    case 'use_tool': {
      const tool = jsonField(detail, 'tool_name');
      if (!tool) return step;
      let input: unknown;
      try {
        input = (JSON.parse(detail) as { tool_input?: unknown }).tool_input;
      } catch {
        // Auf eine Zeile gekürzt — der Name steht dann trotzdem fest.
      }
      const args = input && typeof input === 'object' && Object.keys(input).length ? JSON.stringify(input) : undefined;
      return { ...step, name: tool.includes('__') ? `mcp__${tool}` : tool, detail: args };
    }
    case 'get_command_or_subagent_output':
    case 'kill_command_or_subagent':
      // Damals nur Kennungen als JSON — sie sagen keinem Menschen etwas. Neue
      // Schritte nennen hier den Befehl, auf den sie warten.
      return detail.startsWith('{') ? { ...step, detail: undefined } : step;
    default:
      return step;
  }
}

/** Ein Textfeld aus dem gespeicherten JSON, auch wenn es hinter dem Feld abgeschnitten wurde. */
function jsonField(json: string, key: string): string | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(json);
  if (!match) return undefined;
  try {
    return (JSON.parse(`"${match[1]}"`) as string) || undefined;
  } catch {
    return undefined;
  }
}
