import { expect, it } from 'vitest';
import { searchConversations } from '../../src/panel/conversationSearch.js';
it('finds message/code contents, provides a snippet and excludes archived tasks/projects', () => {
  const record = { id: 'a', title: 'Regex', updatedAt: 1, projectPath: '/a', turns: [{ text: 'Use /[A-Z]+/g in the parser.' }] };
  expect(searchConversations([record], '[a-z]+')[0]).toMatchObject({ id: 'a', snippet: 'Use /[A-Z]+/g in the parser.' });
  expect(searchConversations([{ ...record, archived: true }], 'regex')).toEqual([]);
  expect(searchConversations([record], 'parser', ['/a'])).toEqual([]);
  expect(searchConversations([record], 'missing')).toEqual([]);
});
