import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { allowedResource, injectShell, previewUrl, resourcePath, resourceUrl } from './security.js';

const temporary: string[] = [];
const fixture = () => { const root = mkdtempSync(join(tmpdir(), 'cortex-resource-test-')); temporary.push(root); return root; };
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('desktop resource allowlist', () => {
  it('allows existing descendants and rejects sibling-prefix and missing paths', () => {
    const root = fixture(), allowed = join(root, 'allowed'), sibling = join(root, 'allowed-outside');
    mkdirSync(allowed); mkdirSync(sibling);
    writeFileSync(join(allowed, 'good.png'), 'fixture'); writeFileSync(join(sibling, 'bad.png'), 'fixture');
    expect(allowedResource(join(allowed, 'good.png'), [allowed])).toBe(true);
    expect(allowedResource(allowed, [allowed])).toBe(true);
    expect(allowedResource(join(sibling, 'bad.png'), [allowed])).toBe(false);
    expect(allowedResource(join(allowed, 'missing.png'), [allowed])).toBe(false);
    expect(allowedResource(join(allowed, 'good.png'), [join(root, 'missing-root')])).toBe(false);
  });
  it('resolves symlinks before granting access', () => {
    const root = fixture(), allowed = join(root, 'allowed'), outside = join(root, 'outside');
    mkdirSync(allowed); mkdirSync(outside);
    writeFileSync(join(outside, 'private.txt'), 'synthetic private fixture');
    writeFileSync(join(allowed, 'public.txt'), 'synthetic public fixture');
    symlinkSync(outside, join(allowed, 'escaped')); symlinkSync(join(allowed, 'public.txt'), join(allowed, 'inside.txt'));
    symlinkSync(allowed, join(root, 'alias'));
    expect(allowedResource(join(allowed, 'escaped', 'private.txt'), [allowed])).toBe(false);
    expect(allowedResource(join(allowed, 'inside.txt'), [allowed])).toBe(true);
    expect(allowedResource(join(root, 'alias', 'public.txt'), [allowed])).toBe(true);
    expect(allowedResource(join(allowed, 'public.txt'), [join(root, 'alias')])).toBe(true);
  });
  it('accepts ordinary filenames beginning with two dots without confusing them with parent traversal', () => {
    const root = fixture(), file = join(root, '..visible.png'); writeFileSync(file, 'fixture');
    expect(allowedResource(file, [root])).toBe(true);
  });
  it('round-trips panel resources with unicode, spaces and URL punctuation', () => {
    const root = fixture(), file = join(root, 'Änderung #1?.png'); writeFileSync(file, 'fixture');
    const url = resourceUrl('panel-123', file);
    expect(resourcePath(new URL(url))).toEqual({ panel: 'panel-123', path: file });
    expect(allowedResource(resourcePath(new URL(url)).path, [root])).toBe(true);
    expect(url).not.toContain('Änderung');
  });
  it('resolves asset-relative suffixes but does not permit escaping an allowed root', () => {
    const root = fixture(), inside = join(root, 'inside'); mkdirSync(inside);
    const outsideFile = join(root, 'outside.txt'); writeFileSync(outsideFile, 'fixture');
    const url = `${resourceUrl('panel-123', inside)}/%2E%2E%2Foutside.txt`;
    expect(allowedResource(resourcePath(new URL(url)).path, [inside])).toBe(false);
    const file = join(inside, 'shell.css'); writeFileSync(file, 'fixture');
    expect(resourcePath(new URL(`${resourceUrl('panel-123', inside)}/shell.css`)).path).toBe(file);
  });
  it('rejects malformed resource identifiers', () => {
    for (const value of ['cortex-app://resource/', 'cortex-app://resource/panel/', 'cortex-app://resource/panel/!!!']) {
      expect(() => resourcePath(new URL(value))).toThrow();
    }
  });
});

describe('desktop preview navigation', () => {
  it.each([
    ['https://example.test/path', 'https://example.test/path'],
    ['example.test', 'https://example.test/'],
    ['http://127.0.0.1:4173/demo', 'http://127.0.0.1:4173/demo'],
    ['localhost:4173', 'http://localhost:4173/'],
    ['127.0.0.1:4173/demo', 'http://127.0.0.1:4173/demo'],
    ['example.test/path:section', 'https://example.test/path:section'],
    ['about:blank', 'about:blank'],
  ])('normalizes a supported address %s', (input, expected) => {
    expect(previewUrl(input)).toBe(expected);
  });
  it.each([
    'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello',
    'cortex-app://view/anything', 'ftp://example.test', 'about:config',
    'https://user:secret@example.test', 'http://user@example.test',
  ])('rejects privileged protocols or URL credentials: %s', value => {
    expect(() => previewUrl(value)).toThrow();
  });
});

describe('desktop shell injection', () => {
  it('loads only the shell assets with the existing page nonce', () => {
    const source = '<html><head></head><body><div id="root"></div><script nonce="nonce123" src="app.js"></script></body></html>';
    const result = injectShell(source, 'panel-123', '/synthetic/shell');
    expect(result).toContain(`${resourceUrl('panel-123', '/synthetic/shell')}/shell.css`);
    expect(result).toContain(`<script nonce="nonce123" src="${resourceUrl('panel-123', '/synthetic/shell')}/shell.js" data-cortex-desktop-shell>`);
    expect(injectShell('<html><body>foreign content</body></html>', 'panel-123', '/synthetic/shell')).toBe('<html><body>foreign content</body></html>');
  });
});
