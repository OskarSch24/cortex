import { describe, expect, it } from 'vitest';
import { activeToken, submitsInput } from '../../webview/components/composerInput.js';

describe('composer and inline editor keyboard input', () => {
  it('never sends while confirming an IME composition', () => {
    for (const mode of ['enter', 'cmd-enter']) {
      expect(submitsInput({ key: 'Enter', isComposing: true, metaKey: true }, mode)).toBe(false);
      expect(submitsInput({ key: 'Enter', keyCode: 229, ctrlKey: true }, mode)).toBe(false);
    }
  });
  it('honors the same send shortcut and keeps Shift+Enter for newlines', () => {
    expect(submitsInput({ key: 'Enter' }, 'enter')).toBe(true);
    expect(submitsInput({ key: 'Enter' }, 'cmd-enter')).toBe(false);
    expect(submitsInput({ key: 'Enter', metaKey: true }, 'cmd-enter')).toBe(true);
    expect(submitsInput({ key: 'Enter', ctrlKey: true }, 'cmd-enter')).toBe(true);
    expect(submitsInput({ key: 'Enter', shiftKey: true, metaKey: true }, 'cmd-enter')).toBe(false);
  });
  it('offers mentions after opening brackets but never inside an email', () => {
    for (const prefix of ['(', '[', '{', ' ']) {
      const text = 'Frage ' + prefix + '@claude:work';
      expect(activeToken(text, text.length)?.token).toBe('@claude:work');
    }
    expect(activeToken('mail@claude', 11)).toBeUndefined();
    expect(activeToken('ein /bin/sh', 11)).toBeUndefined();
    expect(activeToken('/help', 5)).toEqual({ start: 0, token: '/help' });
  });
  it('recognizes German slash searches with Unicode letters and combining accents', () => {
    for (const text of ['/erinnerungen', '/überarbeiten', '/ÄNDERUNGEN', '/u\u0308berarbeiten']) {
      expect(activeToken(text, text.length)).toEqual({ start: 0, token: text });
    }
    const draft = '/überarbeiten Mein Entwurf';
    expect(activeToken(draft, '/überarbeiten'.length)).toEqual({ start: 0, token: '/überarbeiten' });
    expect(activeToken('Bitte /überarbeiten', 'Bitte /überarbeiten'.length)).toBeUndefined();
  });
});
