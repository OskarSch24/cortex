import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appSymbol } from '../../src/exokortex/icons.js';

const ICONS = join(__dirname, '..', '..', 'media', 'icons');
const png = (name: string) => `data:image/png;base64,${readFileSync(join(ICONS, name)).toString('base64')}`;

describe('Symbole der Datenwege', () => {
  it('zeigt für Geräte und Cortex das mitgelieferte Zeichen vor dem des Programms', () => {
    expect(appSymbol('com.apple.screenshot.launcher', 'mac_schirm', ICONS, 'Screenshot')).toBe(png('mac_schirm.png'));
    expect(appSymbol('com.apple.ScreenContinuity', 'iphone_schirm', ICONS, 'iPhone Mirroring')).toBe(png('iphone_schirm.png'));
    expect(appSymbol('dev.oskarschiermeister.cortex', 'cortex', ICONS, 'Cortex')).toBe(png('cortex.png'));
    expect(appSymbol(null, 'mac', ICONS)).toBe(png('mac.png'));
  });

  it('nimmt für Telegram ohne installierte App das offizielle Logo', () => {
    expect(appSymbol('invalid.cortex.test.telegram', 'telegram', ICONS, 'Telegram-nicht-da')).toBe(png('telegram.png'));
  });
});
