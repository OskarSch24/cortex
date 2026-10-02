import { getObject, getString } from './ndjson.js';
import { describeToolUse, toolUseEvent, type ToolDetail } from './toolDetail.js';
import type { AdapterEvent } from '../types.js';

type ToolUseEvent = Extract<AdapterEvent, { type: 'tool-use' }>;

/** Grok's calls that name a background task only by its id. */
const TASK_ACTIONS = new Set(['get_command_or_subagent_output', 'kill_command_or_subagent']);

const MAX_SOURCES = 8;

/**
 * ACP `tool_call` updates as transcript steps.
 *
 * The protocol has a field for what a call does — `kind`: read, edit,
 * execute, search. Copilot fills it. Grok leaves it empty on the first update
 * and sends its own tool name as `title` (`run_terminal_command`,
 * `read_file`) with the category in `_meta["x.ai/tool"]`. Going by `kind`
 * alone, every Grok step came out as an unnamed tool.
 *
 * Three Grok calls need more than the call itself:
 * - Its own web search starts empty; the query arrives only with the result.
 *   The step waits for it — the two come back to back — and goes out without
 *   one when anything else visible happens first.
 * - `use_tool` runs a plugin tool (`exokortex__suche`). The step is named like
 *   every other plugin call, `mcp__exokortex__suche`, and described by the
 *   plugin tool's own arguments.
 * - `get_command_or_subagent_output` and `kill_command_or_subagent` name a task
 *   only by id — for a background command, the id of the call that started it.
 *   The step says which command that was.
 */
export function acpToolSteps(cwd?: string) {
  /** What a command was for, by the id of the call that started it. */
  const commands = new Map<string, string>();
  /** Web searches waiting for their query, in the order they started. */
  const searches = new Set<string>();

  const webSearch = (query?: string, sources: string[] = []): ToolUseEvent =>
    toolUseEvent('WebSearch', {
      action: 'fetch',
      detail: query,
      preview: sources.length ? sources.slice(0, MAX_SOURCES).join('\n') : undefined,
    });

  /** A finished web search: the query from its result, else from a title that names it. */
  const searched = (message: Record<string, unknown> | undefined): ToolUseEvent => {
    const action = getObject(message, 'rawOutput', 'action');
    const query = getString(action, 'query') ?? /^web search:\s*(.*)$/i.exec(getString(message, 'title') ?? '')?.[1];
    const sources = Array.isArray(action?.sources)
      ? action.sources.flatMap((source) => getString(source, 'url') ?? [])
      : [];
    return webSearch(query?.trim() || undefined, sources);
  };

  const settled = (message: Record<string, unknown> | undefined) => {
    const status = getString(message, 'status');
    return status === 'completed' || status === 'failed';
  };

  /** Web searches still waiting go out as they are — something else is about to show. */
  const flush = (): ToolUseEvent[] => {
    const waiting = [...searches].map(() => webSearch());
    searches.clear();
    return waiting;
  };

  /** A `tool_call` update: its step, or nothing while a web search waits for its query. */
  const call = (update: Record<string, unknown> | undefined): ToolUseEvent[] => {
    const callId = getString(update, 'toolCallId');
    const rawInput = getObject(update, 'rawInput') ?? {};
    if (getString(rawInput, 'variant') === 'WebSearch') {
      if (!callId || settled(update)) return [...flush(), searched(update)];
      searches.add(callId);
      return [];
    }

    const kind = getString(update, 'kind');
    const title = getString(update, 'title') ?? kind ?? 'tool';
    const meta = getObject(update, '_meta', 'x.ai/tool');
    const toolName = getString(meta, 'name') ?? title;
    const plugin = toolName === 'use_tool' ? getString(rawInput, 'tool_name') : undefined;
    const name = plugin ? (plugin.includes('__') ? `mcp__${plugin}` : plugin) : title;
    const input = plugin ? (getObject(rawInput, 'tool_input') ?? {}) : rawInput;
    const located = getString(update, 'locations', '0', 'path');
    const args = located ? { path: located, ...input } : input;

    // The protocol's kind first, then the agent's own tool name, then its own
    // category — whichever knows what the call does. When none does, the
    // first answer still carries the most readable argument.
    let info: ToolDetail | undefined;
    for (const candidate of plugin ? [name] : [kind, toolName, getString(meta, 'kind')]) {
      if (!candidate) continue;
      const described = describeToolUse(candidate, args, cwd);
      if (described.action !== 'other') {
        info = described;
        break;
      }
      info ??= described;
    }
    info ??= describeToolUse(name, args, cwd);

    if (info.action === 'run' && callId) commands.set(callId, info.description ?? info.detail ?? '');
    if (TASK_ACTIONS.has(toolName)) {
      const ids = [...(Array.isArray(rawInput.task_ids) ? rawInput.task_ids : []), rawInput.task_id];
      const known = ids.flatMap((id) => (typeof id === 'string' && commands.get(id)) || []);
      info = { ...info, detail: known.length ? known.join(' · ') : undefined };
    }

    // ACP ships the real before/after for an edit; prefer it over ours.
    const diff = getObject(update, 'content', '0');
    const edited =
      getString(diff, 'type') === 'diff'
        ? describeToolUse(
            'edit',
            {
              file_path: getString(diff, 'path') ?? located,
              old_string: getString(diff, 'oldText') ?? '',
              new_string: getString(diff, 'newText') ?? '',
            },
            cwd,
          )
        : undefined;
    return [
      ...flush(),
      toolUseEvent(name, {
        ...info,
        preview: edited ? edited.preview : info.preview,
        added: edited?.added ?? info.added,
        removed: edited?.removed ?? info.removed,
      }),
    ];
  };

  /** A `tool_call_update`: the result of a web search that waits for its query. */
  const update = (progress: Record<string, unknown> | undefined): ToolUseEvent[] => {
    const callId = getString(progress, 'toolCallId');
    if (!callId || !searches.has(callId) || !settled(progress)) return [];
    searches.delete(callId);
    return [searched(progress)];
  };

  return { call, update, flush };
}
