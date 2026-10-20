import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { localizeNoteHeadings, hasNoteTitle } from '../src/notes/noteHeadings';
import { buildNoteBody, applyFrontmatter, applySolveTimeFrontmatter } from '../src/notes/NoteTemplate';
import { rewriteProblemSection } from '../src/notes/HeadingRegion';
import { extractFirstFencedBlock } from '../src/solve/codeExtractor';
import { extractFenceBodyFromFullNote } from '../src/solve/resetCodeWithConfirm';
import { forceInjectCodeSection } from '../src/solve/starterCodeInjector';
import { findCodeFence } from '../src/widget/fenceLocator';
import { rewriteCodeSection } from '../src/contest/ContestFinalizer';
import { extractCodeFromScratch } from '../src/contest/ContestScratchManager';
import { isMigrationCandidate } from '../src/widget/fenceMigrator';
import { rewriteFenceOpenerTag } from '../src/widget/fenceSerialization';
import { computeLockedRanges } from '../src/main/sectionProtectionExtension';
import { NoteWriter } from '../src/notes/NoteWriter';
import { makeMockVaultApp } from './helpers/mock-vault';

function formattedNote(problem: string, code: string, notes: string): string {
  return `## 1. 两数之和\n${problem}\n题面\n\`\`\`python\nexample_only\n\`\`\`\n${code}\n\n\`\`\`leetcode-solve\nmy_solution\n\`\`\`\n${notes}\n我的思路\n`;
}

describe('中文正文与 Alvis 保存格式兼容', () => {
  it('新笔记直接写中文；源码、预览和格式化后使用同一正文', () => {
    expect(buildNoteBody({ problemMarkdown: '题面', starterCode: '# Code' }))
      .toBe('## 题目\n题面\n\n## 代码\n\n```leetcode-solve\n# Code\n```\n\n## 笔记\n\n');
  });

  it('迁移保留编号、层级、CRLF、YAML 和围栏内原文，并且幂等', () => {
    const input = '---\ntext: |\n  ## Notes\n---\n## 1. 标题\n### 1.1 Problem\n```python\n## Notes\n```\n~~~text\n## Code\n~~~\n### 1.2 Code\n### 1.3 Notes\n'.replace(/\n/g, '\r\n');
    const output = localizeNoteHeadings(input);
    expect(output).toContain('### 1.1 题目\r\n');
    expect(output).toContain('### 1.2 代码\r\n### 1.3 笔记');
    expect(output).toContain('  ## Notes\r\n');
    expect(output).toContain('```python\r\n## Notes\r\n```');
    expect(output).toContain('~~~text\r\n## Code\r\n~~~');
    expect(localizeNoteHeadings(output)).toBe(output);
  });

  it.each([
    ['## Problem', '## Code', '## Notes'],
    ['## 题目', '## 代码', '## 笔记'],
    ['### 1.1 Problem', '### 1.2 Code', '### 1.3 Notes'],
    ['### 1.1 题目', '### 1.2 代码', '### 1.3 笔记'],
  ])('识别 %s 下的题面和 %s 下的解答', (problem, code, notes) => {
    const body = formattedNote(problem, code, notes);
    expect(extractFirstFencedBlock(body, { 'lc-language': 'python3' }))
      .toMatchObject({ code: 'my_solution', lang: 'python3' });
    expect(extractFenceBodyFromFullNote(body)).toBe('my_solution');
    expect(extractCodeFromScratch(body)).toBe('my_solution');
    const state = EditorState.create({ doc: body });
    const location = findCodeFence(state);
    expect(location).not.toBeNull();
    expect(state.doc.line(location!.openerLine + 1).text).toBe('my_solution');
    const ranges = computeLockedRanges(state);
    const position = body.indexOf(code);
    expect(ranges.some((from, index) => index % 2 === 0 && from <= position && ranges[index + 1]! > position)).toBe(true);
    const reset = forceInjectCodeSection(body, { langSlug: 'python3', starterCode: 'new_solution', fenceKind: 'leetcode-solve' });
    expect(reset).toContain('example_only');
    expect(reset).toContain(`${notes}\n我的思路`);
    expect(reset).toContain('new_solution');
    expect(reset).not.toContain('my_solution');
    expect(rewriteCodeSection(body, 'contest_solution', 'python3')).toContain(`${notes}\n我的思路`);
    const legacy = body.replace('```leetcode-solve', '```python');
    expect(isMigrationCandidate(legacy, { 'lc-slug': 'two-sum' })).toBe(true);
    expect(rewriteFenceOpenerTag(legacy, 'leetcode-solve')).toBe(body);
  });

  it('代码章节没有围栏时，不会取到后续个人笔记中的围栏', () => {
    const body = '### 1.1 代码\n\n### 1.2 我的补充\n```python\nprivate_note\n```';
    expect(extractFirstFencedBlock(body)).toBeNull();
    expect(findCodeFence(EditorState.create({ doc: body }))).toBeNull();
  });

  it('格式化后的 Python 标题形状注释不作为章节边界或解答标题', () => {
    const body = '### 1.1 题目\n```python\n### Code\nexample\n```\n### 1.2 代码\n```leetcode-solve\n# comment\n### Notes\nsolution\n```\n### 1.3 笔记\nkeep';
    expect(extractFirstFencedBlock(body, { 'lc-language': 'python3' })?.code)
      .toBe('# comment\n### Notes\nsolution');
  });

  it('刷新格式化后的题面保持层级和原题名位置，完整保留代码与笔记', () => {
    const body = formattedNote('### 1.1 题目', '### 1.2 代码', '### 1.3 笔记').replace('两数之和', 'Two Sum');
    const refreshed = rewriteProblemSection(body, '### 示例\n新题面', { previous: 'Two Sum', next: '两数之和' });
    expect(refreshed).toContain('## 1. 两数之和\n### 1.1 题目\n#### 示例\n新题面');
    expect(refreshed.slice(refreshed.indexOf('### 1.2 代码'))).toBe(body.slice(body.indexOf('### 1.2 代码')));
    expect(hasNoteTitle(refreshed, '两数之和')).toBe(true);
  });

  it('题面已缓存时仍离线迁移旧标题和状态，不重复写、不请求 API', async () => {
    const path = 'LeetCode/1. 两数之和.md';
    const m = makeMockVaultApp({ [path]: formattedNote('### 1.1 Problem', '### 1.2 Code', '### 1.3 Notes') });
    m.seedFrontmatter(path, { 'lc-slug': 'two-sum', 'lc-title': '两数之和', 'lc-url': 'cn', 'lc-status': 'accepted' });
    const client = { getProblemDetail: vi.fn() };
    const settings = { getProblemDetail: () => ({ translationCheckedAt: 1, title: '两数之和', url: 'cn' }) };
    const writer = new NoteWriter(m.app as never, client, settings as never);
    const file = m.state.files.get(path)!;
    await writer.refreshChineseNote(file as never);
    expect(m.getContent(path)).toContain('### 1.2 代码');
    expect(m.getFrontmatter(path)?.['lc-status']).toBe('已完成');
    const count = m.spies.process.mock.calls.length;
    await writer.refreshChineseNote(file as never);
    expect(m.spies.process).toHaveBeenCalledTimes(count);
    expect(client.getProblemDetail).not.toHaveBeenCalled();
  });

  it.each(['accepted', '已完成', '待复习'])('保留完成或自定义状态 %s，提交通过后写入已完成', async status => {
    const path = 'LeetCode/1.md';
    const m = makeMockVaultApp({ [path]: '' });
    const file = m.state.files.get(path)!;
    m.seedFrontmatter(path, { 'lc-status': status });
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: '两数之和', difficulty: 'Easy',
      url: 'cn', language: 'python3', pluginTags: [], initialStatus: '未开始',
    });
    expect(m.getFrontmatter(path)?.['lc-status']).toBe(status === '待复习' ? status : '已完成');
    await applySolveTimeFrontmatter(m.app as never, file as never, { language: 'python3', currentPassTags: [] });
    expect(m.getFrontmatter(path)?.['lc-status']).toBe('已完成');
  });
});
