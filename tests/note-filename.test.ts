import { describe, it, expect } from 'vitest';
import { buildNoteFilename, buildNotePath } from '../src/notes/NoteTemplate';

describe('buildNoteFilename / buildNotePath (D-16 NOTE-01)', () => {
  it('produces unpadded filenames like 1. 两数之和.md, 10-..., 100-...', () => {
    expect(buildNoteFilename(1, '两数之和')).toBe('1. 两数之和.md');
    expect(buildNoteFilename(10, '正则表达式匹配')).toBe('10. 正则表达式匹配.md');
    expect(buildNoteFilename(100, '相同的树')).toBe('100. 相同的树.md');
  });

  it('strips trailing slashes from folder and joins with /', () => {
    expect(buildNotePath('LeetCode', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
    expect(buildNotePath('LeetCode/', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
    expect(buildNotePath('LeetCode//', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
  });

  it('handles nested folders', () => {
    expect(buildNotePath('Study/LeetCode', 42, '接雨水')).toBe('Study/LeetCode/42. 接雨水.md');
  });
});
