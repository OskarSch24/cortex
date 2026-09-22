import { describe, expect, it } from 'vitest';
import { availableLabel } from '../../src/onboarding/addAccount.js';
import type { AccountProfile } from '@cortex/core';
const account = (id: string, provider: AccountProfile['provider'], label: string): AccountProfile => ({ id, provider, label, authMode: 'managed-home', homeDir: `/profiles/${id}`, hasSecret: false, priority: 1 });
describe('multiple subscriptions from the same provider', () => {
  const existing = [account('a', 'claude', 'privat'), account('b', 'claude', 'privat-2'), account('c', 'codex', 'privat')];
  it('keeps account names unique within a provider without replacing another identity', () => {
    expect(availableLabel(existing, 'claude', 'privat')).toBe('privat-3');
    expect(availableLabel(existing, 'copilot', 'privat')).toBe('privat');
  });
  it('reconnect keeps the existing label and unrelated profiles unchanged', () => {
    expect(availableLabel(existing, 'claude', 'privat', 'a')).toBe('privat');
    expect(existing.map(a => a.homeDir)).toEqual(['/profiles/a', '/profiles/b', '/profiles/c']);
  });
  it('produces labels that the routing mention parser can address', () => {
    expect(availableLabel(existing, 'claude', 'Geschäftlich Studio')).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('Trennung mehrerer Konten desselben Anbieters', () => {
  const konto = (id: string, provider: string, label: string, home: string) =>
    ({ id, provider, label, authMode: 'managed-home', homeDir: home, hasSecret: false, priority: 1 }) as never;

  it('gibt jedem Konto ein eigenes Profilverzeichnis', () => {
    // Der Pfad enthält die Konto-Id und einen Zufallsteil. Zwei Anmeldungen
    // desselben Anbieters dürfen sich nicht dieselbe Sitzung teilen — sonst
    // überschreibt die zweite die erste, ohne dass es jemand merkt.
    const a = konto('claude-aaa', 'claude', 'privat', '/h/.cortex/profiles/claude-aaa-x1');
    const b = konto('claude-bbb', 'claude', 'firma', '/h/.cortex/profiles/claude-bbb-y2');
    expect((a as { homeDir: string }).homeDir).not.toBe((b as { homeDir: string }).homeDir);
  });

  it('vergibt bei gleichem Wunschnamen einen freien, statt den bestehenden zu treffen', () => {
    const bestehend = [konto('claude-aaa', 'claude', 'privat', '/h/a')];
    const neu = availableLabel(bestehend, 'claude', 'privat');
    expect(neu).toBe('privat-2');
    expect(neu).not.toBe('privat');
  });

  it('zählt weiter, wenn schon mehrere Varianten belegt sind', () => {
    const bestehend = [
      konto('c1', 'claude', 'privat', '/h/1'),
      konto('c2', 'claude', 'privat-2', '/h/2'),
      konto('c3', 'claude', 'privat-3', '/h/3'),
    ];
    expect(availableLabel(bestehend, 'claude', 'privat')).toBe('privat-4');
  });

  it('hält Anbieter auseinander: derselbe Name bei Codex bleibt frei', () => {
    const bestehend = [konto('claude-aaa', 'claude', 'business', '/h/a')];
    expect(availableLabel(bestehend, 'codex', 'business')).toBe('business');
  });
});
