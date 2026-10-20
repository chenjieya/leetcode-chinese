import { describe, expect, it, vi } from 'vitest';
import { buildNoteFilename, resolveProblemNotePath } from '../src/notes/NoteTemplate';
import { NoteWriter } from '../src/notes/NoteWriter';
import { SettingsStore } from '../src/settings/SettingsStore';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockDetail, makeMockLeetCodeClient } from './helpers/mock-leetcode-client';

describe('题名文件路径与旧笔记兼容', () => {
  it('保留中文和特殊题号，清理文件系统及链接中的特殊字符', () => {
    expect(buildNoteFilename('LCR 001', '两数相除')).toBe('LCR 001. 两数相除.md');
    expect(buildNoteFilename('面试题 01.01', '判定字符是否唯一')).toBe('面试题 01.01. 判定字符是否唯一.md');
    expect(buildNoteFilename(1, '  A/B: C? [D] #E.  ')).toBe('1. A-B- C- -D- -E.md');
    expect(buildNoteFilename(1, '')).toBe('1. 未命名题目.md');
  });

  it('旧 slug 文件仍然复用', () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '我的代码' });
    expect(resolveProblemNotePath(m.app as never, 'LeetCode', 'two-sum', { id: 1, title: '两数之和' }))
      .toBe('LeetCode/1-two-sum.md');
  });

  it('翻译变化或缓存丢失时通过 lc-slug 找回已有题名文件', () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '我的代码' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-slug': 'two-sum' });
    const app = { ...m.app, vault: { ...m.app.vault, getMarkdownFiles: () => [...m.state.files.values()] } };
    expect(resolveProblemNotePath(app as never, 'LeetCode', 'two-sum', { id: 1, title: '两数之和' }))
      .toBe('LeetCode/1. Two Sum.md');
    expect(resolveProblemNotePath(app as never, 'LeetCode', 'two-sum', null))
      .toBe('LeetCode/1. Two Sum.md');
  });

  it('实际新建以 lc-id 和 lc-title 命名，重复打开不重复创建', async () => {
    const m = makeMockVaultApp();
    const settings = await SettingsStore.load({ loadData: vi.fn().mockResolvedValue({ leetcodeSite: 'cn' }), saveData: vi.fn() } as never);
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum', { title: '两数之和' }) });
    const writer = new NoteWriter(m.app as never, client, settings);
    await writer.openProblem('two-sum');
    const path = 'leetcode/1. 两数之和.md';
    expect(m.getFrontmatter(path)).toMatchObject({ 'lc-id': 1, 'lc-title': '两数之和' });
    expect(m.state.files.has('leetcode/1-two-sum.md')).toBe(false);
    await writer.openProblem('two-sum');
    expect(m.spies.create.mock.calls.filter(([createdPath]) => createdPath === path)).toHaveLength(1);
  });
});
