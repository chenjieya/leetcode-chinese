import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChineseProblemClient } from '../src/api/ChineseProblemClient';
import { SettingsStore } from '../src/settings/SettingsStore';
import { toDetailCacheEntry, NoteWriter } from '../src/notes/NoteWriter';
import { rewriteProblemSection } from '../src/notes/HeadingRegion';
import { buildNoteFilename } from '../src/notes/NoteTemplate';
import { makeMockVaultApp } from './helpers/mock-vault';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api/requestUrlFetcher', () => ({ throttledRequestUrl: request }));

const detail = {
  questionFrontendId: '1', questionId: '1', title: 'Two Sum', titleSlug: 'two-sum',
  translatedTitle: '两数之和', content: '<p>English</p>', translatedContent: '<p>中文题面</p>',
  difficulty: 'Easy' as const, isPaidOnly: false,
};
const response = (data: unknown) => ({ status: 200, json: { data } });

describe('力扣中国站适配', () => {
  beforeEach(() => request.mockReset());

  it('只向中国站请求，并优先使用中文题名和题面', async () => {
    request.mockResolvedValue(response({ question: detail }));
    const client = new ChineseProblemClient(() => ({ LEETCODE_SESSION: 'cn-session', csrftoken: 'cn-csrf' }));
    const result = await client.problem('two-sum');
    expect(result).toMatchObject({ title: '两数之和', content: '<p>中文题面</p>', questionId: '1' });
    expect(result?.translationCheckedAt).toEqual(expect.any(Number));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://leetcode.cn/graphql/',
      headers: expect.objectContaining({ Origin: 'https://leetcode.cn', 'x-csrftoken': 'cn-csrf' }),
    }));
  });

  it('缺少翻译时保留原文，匿名请求不发送 cookie', async () => {
    request.mockResolvedValue(response({ question: { ...detail, translatedTitle: null, translatedContent: '' } }));
    expect(await new ChineseProblemClient(() => null).problem('two-sum'))
      .toMatchObject({ title: 'Two Sum', content: '<p>English</p>' });
    const call = request.mock.calls[0]?.[0] as { headers: Record<string, string> };
    expect(call.headers).not.toHaveProperty('Cookie');
  });

  it('映射中国站分页字段、难度、通过率和提交状态，保留英文搜索名', async () => {
    request.mockResolvedValue(response({ problemsetQuestionList: { total: 3, questions:
      ['SOLVED', 'TRIED', 'NOT_STARTED'].map((status, i) => ({
        frontendQuestionId: i ? 'LCR 001' : '1', title: 'Two Sum', titleCn: '两数之和',
        titleSlug: 'two-sum', difficulty: 'EASY', paidOnly: false, acRate: 0.55, status,
      })),
    } }));
    const result = await new ChineseProblemClient(() => null).problems({ limit: 3, offset: 6 });
    expect(result.questions[0]).toMatchObject({ title: '两数之和', originalTitle: 'Two Sum', difficulty: 'Easy' });
    expect(result.questions[0]?.acRate).toBeCloseTo(55);
    expect(result.questions.map(q => q.status)).toEqual(['ac', 'notac', null]);
    expect(result.questions[1]?.questionFrontendId).toBe('LCR 001');
    const call = request.mock.calls[0]?.[0] as { body: string };
    expect(JSON.parse(call.body)).toMatchObject({ variables: { limit: 3, skip: 6 } });
  });

  it('GraphQL 错误不能伪装成空题库', async () => {
    request.mockResolvedValue({ status: 200, json: { data: null, errors: [{ message: 'schema error' }] } });
    await expect(new ChineseProblemClient(() => null).problems({ limit: 1, offset: 0 })).rejects.toThrow();
  });

  it('保留 LCR 题号并生成安全文件名', () => {
    const entry = toDetailCacheEntry({ ...detail, questionFrontendId: 'LCR 001' });
    expect(entry.id).toBe('LCR 001');
    expect(buildNoteFilename(entry.id, '两数相除')).toBe('LCR 001. 两数相除.md');
    expect(buildNoteFilename('LCR/001', '两数相除')).toBe('LCR-001. 两数相除.md');
  });

  it('首次迁移清除国际站凭据和进度，保留离线题面和个人偏好', async () => {
    const original = toDetailCacheEntry({ ...detail, translationCheckedAt: 123 });
    const plugin = {
      loadData: vi.fn().mockResolvedValue({
        version: 1, auth: { LEETCODE_SESSION: 'international-session', csrftoken: 'old-csrf' },
        username: 'old-user', problemsFolder: '我的算法', defaultLanguage: 'java',
        problemDetails: { 'two-sum': original },
        problemIndex: { fetchedAt: 1, problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false, status: 'solved' }] },
      }), saveData: vi.fn().mockResolvedValue(undefined),
    };
    const settings = await SettingsStore.load(plugin as never);
    expect(settings.getAuthCookies()).toBeNull();
    expect(settings.getUsername()).toBeNull();
    expect(settings.getProblemIndex()).toBeNull();
    expect(settings.getProblemsFolder()).toBe('我的算法');
    expect(settings.getDefaultLanguage()).toBe('java');
    expect(settings.getProblemDetail('two-sum')).toMatchObject({ contentHtml: original.contentHtml, fetchedAt: 0 });
    expect(settings.getProblemDetail('two-sum')?.internalQuestionId).toBeUndefined();
    expect(settings.getProblemDetail('two-sum')?.translationCheckedAt).toBeUndefined();
    expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ leetcodeSite: 'cn', auth: null }));
    plugin.loadData.mockResolvedValue(plugin.saveData.mock.calls[0]?.[0]);
    plugin.saveData.mockClear();
    await SettingsStore.load(plugin as never);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('重新打开旧笔记时更新题目，保留解题语言、代码和个人笔记', async () => {
    const path = 'LeetCode/1-two-sum.md';
    const suffix = '## Code\n```java\n// 我的代码\n```\n\n## Notes\n我的思路\n';
    const vault = makeMockVaultApp({ [path]: '# Two Sum\n\n## Problem\nEnglish\n\n' + suffix });
    vault.seedFrontmatter(path, { 'lc-slug': 'two-sum', 'lc-title': 'Two Sum', 'lc-language': 'java', custom: '保留' });
    const plugin = { loadData: vi.fn().mockResolvedValue({ leetcodeSite: 'cn' }), saveData: vi.fn() };
    const settings = await SettingsStore.load(plugin as never);
    const client = { getProblemDetail: vi.fn().mockResolvedValue({ ...detail, title: '两数之和', content: '<p>中文题面</p>', translationCheckedAt: Date.now() }) };
    const writer = new NoteWriter(vault.app as never, client as never, settings);
    const file = vault.app.vault.getAbstractFileByPath(path);
    await writer.refreshChineseNote(file as never);
    const body = await vault.app.vault.read(file as never);
    expect(body).toContain('# 两数之和');
    expect(body).toContain('中文题面');
    expect(body).toContain(suffix.replace('## Code', '## 代码').replace('## Notes', '## 笔记'));
    expect(vault.getFrontmatter(path)).toMatchObject({ 'lc-language': 'java', custom: '保留' });
    await writer.refreshChineseNote(file as never);
    expect(client.getProblemDetail).toHaveBeenCalledTimes(1);
  });

  it('刷新不替换用户自定义一级标题', () => {
    const result = rewriteProblemSection('# 我的解法\n## Problem\nold\n## Notes\nkeep', '中文题面', { previous: 'Two Sum', next: '两数之和' });
    expect(result).toContain('# 我的解法');
    expect(result).toContain('## Notes\nkeep');
  });

  it('缺少一级题名时，不把代码或个人笔记内的一级标题当成题名', () => {
    const suffix = '## Code\n```python\n# Two Sum\n```\n## Notes\n# Two Sum\n';
    const result = rewriteProblemSection('## Problem\nold\n' + suffix, '中文题面', { previous: 'Two Sum', next: '两数之和' });
    expect(result).toContain(suffix);
  });
});
