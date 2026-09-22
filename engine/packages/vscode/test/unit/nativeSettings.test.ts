import { expect, it } from 'vitest';
import { validNativeSetting } from '../../src/panel/nativeSettings.js';
it('accepts supported native values including false and zero', () => {
 expect(validNativeSetting('editor.minimap.enabled', false)).toBe(true);
 expect(validNativeSetting('terminal.integrated.scrollback', 0)).toBe(true);
 expect(validNativeSetting('files.autoSave', 'afterDelay')).toBe(true);
});
it('rejects arbitrary keys, invalid enum values and invalid numbers', () => {
 expect(validNativeSetting('security.workspace.trust.enabled', false)).toBe(false);
 expect(validNativeSetting('files.autoSave', 'always')).toBe(false);
 expect(validNativeSetting('editor.fontSize', NaN)).toBe(false);
 expect(validNativeSetting('editor.fontSize', -10)).toBe(false);
 expect(validNativeSetting('editor.tabSize', 1.5)).toBe(false);
});
