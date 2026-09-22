import { expect, it } from 'vitest';
import { OptimisticSettings } from '../../webview/settings/optimistic.js';
it('keeps the newest value while older and other-key acknowledgements arrive', () => {
  const settings = new OptimisticSettings();
  settings.receive({ a: false, b: false }, 0);
  settings.write('a', true, '1'); settings.write('b', true, '2'); settings.write('a', false, '3');
  settings.receive({ a: true, b: false }, 1, { key: 'a', requestId: '1' });
  expect(settings.values()).toEqual({ a: false, b: true });
  settings.receive({ a: false, b: true }, 3, { key: 'a', requestId: '3' });
  settings.receive({ a: true, b: true }, 2, { key: 'b', requestId: '2' });
  expect(settings.values()).toEqual({ a: false, b: true });
});
it('rolls a failed setting back to the last confirmed state', () => {
  const settings = new OptimisticSettings(); settings.receive({ a: false }, 1);
  settings.write('a', true, '1');
  settings.receive({ a: false }, 2, { key: 'a', requestId: '1', error: 'failed' });
  expect(settings.values()).toEqual({ a: false });
});
