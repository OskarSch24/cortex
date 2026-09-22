import { describe, expect, it } from 'vitest';
import { Markdown, tableCells } from '../../webview/components/Markdown.js';
import { Transcript } from '../../webview/components/Transcript.js';
import { answerForClipboard } from '../../webview/components/answerText.js';
import { formatStamp, localUrls, describeCommand } from '../../webview/components/chat.js';
import { ActiveClock } from '../../src/panel/activeClock.js';
import { applyHostMessage } from '../../src/panel/transcript.js';

function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function content(node: any): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? content(node.props?.children) : String(node);
}

describe('issue regressions: chat output', () => {
  it('#27 uses distinct local calendar days across DST, not 24-hour intervals', () => {
    const prior = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      expect(formatStamp(new Date(2026, 2, 28, 23, 30).getTime(), new Date(2026, 2, 29, 23, 30).getTime())).toContain('Gestern');
      expect(formatStamp(new Date(2026, 9, 24, 23, 30).getTime(), new Date(2026, 9, 25, 23, 30).getTime())).toContain('Gestern');
      expect(formatStamp(new Date(2026, 8, 14, 9).getTime(), new Date(2026, 8, 17, 9).getTime())).not.toContain('Heute');
    } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  });
  it('#29 excludes suspension gaps while accumulating normal monotonic ticks', () => {
    let now = 0;
    const clock = new ActiveClock(() => now);
    now += 1000; expect(clock.elapsed()).toBe(1000);
    now += 2 * 60 * 60 * 1000; expect(clock.elapsed()).toBe(2000);
    now += 1500; expect(clock.elapsed()).toBe(3500);
    expect(clock.elapsed()).toBe(3500);
  });
  it('#31 derives routing examples from real configured accounts', () => {
    const tree = Transcript({ items: [], accounts: [{ id: 'codex-private', provider: 'codex', label: 'private', models: [], available: true, authMode: 'managed-home' }] });
    expect(content(tree)).toContain('@codex:private');
    expect(content(tree)).not.toContain('@claude:work');
  });
  it('#32 exports readable widgets and preserves ordinary code', () => {
    const text = 'Heute:\n```cortex-widget\n{"type":"weather","location":"Berlin","temp":21,"condition":"Sonnig"}\n```\n```python\nprint(1)\n```';
    const copied = answerForClipboard(text);
    expect(copied).toContain('Ort: Berlin'); expect(copied).toContain('Temperatur: 21');
    expect(copied).not.toContain('cortex-widget'); expect(copied).not.toContain('"type"');
    expect(copied).toContain('```python\nprint(1)\n```');
    expect(answerForClipboard('```widget\n{bad json}\n```')).not.toContain('{bad json}');
  });
  it('#33/#34 preserves fragments and queries and finds distinct servers', () => {
    expect(localUrls('Die App läuft auf http://localhost:3000/#/dashboard?theme=dark. Backend http://127.0.0.1:8000/api.')).toEqual(['http://localhost:3000/#/dashboard?theme=dark', 'http://127.0.0.1:8000/api']);
    expect(localUrls('[App](http://localhost:3000/?search=hello!) `http://[::1]:8000/#?` http://localhost:3000/?search=hello!')).toEqual(['http://localhost:3000/?search=hello!', 'http://[::1]:8000/#?', 'http://localhost:3000/?search=hello']);
    expect(localUrls('http://localhost:3000/ http://localhost:3000/ https://example.com')).toEqual(['http://localhost:3000/']);
  });
  it('#35 keeps short snippets visible and large blocks compact', () => {
    expect(nodes(Markdown({ text: '```python\nprint(1)\nprint(2)\n```' })).filter(node => node.type === 'pre')).toHaveLength(1);
    expect(nodes(Markdown({ text: '```python\n' + 'print(1)\n'.repeat(9) + '```' })).some(node => node.props?.class?.includes('cx-code-card'))).toBe(true);
    expect(nodes(Markdown({ text: '```cortex-widget\n{}\n```' })).filter(node => node.type === 'pre')).toHaveLength(0);
  });
  it('#37 preserves Windows paths and even/odd pipe escaping', () => {
    expect(tableCells(String.raw`| C:\Programme\App | OK |`)).toEqual([String.raw`C:\Programme\App`, 'OK']);
    expect(tableCells('| a' + '\\'.repeat(2) + '| b |')).toEqual(['a' + '\\'.repeat(2), 'b']);
    expect(tableCells('| a' + '\\'.repeat(3) + '|b | c |')).toEqual(['a' + '\\'.repeat(2) + '|b', 'c']);
  });
  it('#38 preserves source list numbering after an explanatory paragraph', () => {
    const lists = nodes(Markdown({ text: '1. First\n\nExplanation\n\n2. Second' })).filter(node => node.type === 'ol');
    expect(lists.map(node => node.props.start)).toEqual([1, 2]);
  });
  it('#39 renders rich labels without nested file anchors', () => {
    const links = nodes(Markdown({ text: '[**Dokumentation**](https://example.com) [`App.tsx`](https://example.com/app)' })).filter(node => node.type === 'a');
    expect(links).toHaveLength(2);
    expect(nodes(links[0]).some(node => node.type === 'strong')).toBe(true);
    expect(nodes(links[1]).some(node => node.type === 'code')).toBe(true);
    expect(nodes(links[1]).filter(node => node.type === 'a')).toHaveLength(1);
  });
  it('#41/#42 updates revert availability without losing file changes', () => {
    let items = applyHostMessage([], { kind: 'toolUse', messageId: 'm', name: 'Edit', path: 'a.ts', action: 'edit' });
    items = applyHostMessage(items, { kind: 'revertState', messageId: 'm', available: true });
    expect(items[0]).toMatchObject({ canRevert: true });
    items = applyHostMessage(items, { kind: 'revertState', messageId: 'm', available: false, reason: 'Stand ersetzt' });
    expect(items[0]).toMatchObject({ canRevert: false, revertReason: 'Stand ersetzt', segments: [{ kind: 'tools' }] });
  });
  it('#101 recognizes Python test runners before generic scripts', () => {
    expect(describeCommand('python3 -m pytest tests').was).toBe('Tests ausgeführt');
  });
});
