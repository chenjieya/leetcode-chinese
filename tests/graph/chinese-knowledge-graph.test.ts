import { describe, expect, it, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { ClusterHubWriter } from '../../src/graph/ClusterHubWriter';
import { mergeTechniquesSectionAI } from '../../src/graph/mergeTechniquesSection';
import { mergeRelatedVariantsSection } from '../../src/graph/mergeRelatedVariantsSection';
import { mergeAIReviewSection } from '../../src/ai/mergeAIReviewSection';
import { localizeNoteHeadings } from '../../src/notes/noteHeadings';
import { buildReviewPrompt } from '../../src/ai/buildReviewPrompt';
import { buildKgPrompt } from '../../src/graph/buildKgPrompt';

describe('中文知识整理与分类数组同步', () => {
  it('数组多分类、旧字符串、重复分类和非法值不会阻断汇总', async () => {
    const m = makeMockVaultApp({
      'leetcode/1. 两数之和.md': '',
      'leetcode/167. 两数之和 II.md': '',
      'leetcode/坏数据.md': '',
      'leetcode/patterns/Sliding Window.md': '# Sliding Window\n\n- [[已移除的题目]]',
    });
    m.seedFrontmatter('leetcode/1. 两数之和.md', {
      'lc-pattern': ['Arrays & Hashing', 'Two Pointers', 'Two Pointers', 123, null],
      'lc-title': '两数之和', 'lc-difficulty': 'Easy',
    });
    m.seedFrontmatter('leetcode/167. 两数之和 II.md', {
      'lc-pattern': 'Two Pointers', 'lc-title': '两数之和 II', 'lc-difficulty': 'Medium',
    });
    m.seedFrontmatter('leetcode/坏数据.md', { 'lc-pattern': 42 });
    m.seedFrontmatter('leetcode/patterns/Sliding Window.md', {
      'lc-pattern-hub': true, pattern: 'Sliding Window',
    });
    const files = [...m.state.files.values()].map(file => ({
      ...file, basename: file.path.split('/').pop()!.replace(/\.md$/, ''),
    }));
    const app = { ...m.app, vault: { ...m.app.vault, getMarkdownFiles: vi.fn(() => files) } };
    const writer = new ClusterHubWriter({ app: app as never, problemsFolder: 'leetcode' });
    await writer.reconcile();
    const body = m.getContent('leetcode/patterns/Two Pointers.md')!;
    expect(body).toContain('# 双指针');
    expect(body).toContain('### 简单\n\n- [[1. 两数之和|两数之和]]');
    expect(body).toContain('### 中等\n\n- [[167. 两数之和 II|两数之和 II]]');
    expect(body.match(/\[\[1\. 两数之和\|/g)).toHaveLength(1);
    expect(body).toContain('### 困难\n\n暂无题目。');
    expect(m.getContent('leetcode/patterns/Arrays & Hashing.md')).toContain('# 数组与哈希');
    const emptyHub = m.getContent('leetcode/patterns/Sliding Window.md')!;
    expect(emptyHub).toContain('# 滑动窗口');
    expect(emptyHub).not.toContain('[[已移除的题目]]');
    expect(emptyHub.match(/暂无题目。/g)).toHaveLength(3);
    await writer.reconcile();
    expect(m.getContent('leetcode/patterns/Two Pointers.md')).toBe(body);
  });

  it('中文技巧显示名保持旧链接目标，重复生成不重复且保留个人说明', () => {
    const body = '### 1.3 笔记\n我的思路\n### 1.4 Techniques\n\n- [[Arrays & Hashing]]\n个人补充\n';
    const once = mergeTechniquesSectionAI(body, ['Arrays & Hashing']);
    expect(once).toContain('### 1.4 解题技巧');
    expect(once).toContain('[[Arrays & Hashing|数组与哈希]]');
    expect(once).toContain('我的思路');
    expect(once).toContain('个人补充');
    expect(mergeTechniquesSectionAI(once, ['Arrays & Hashing'])).toBe(once);
  });

  it('新章节沿用 Alvis 层级，复盘只更新自己的区域', () => {
    const body = '## 1. 两数之和\n### 1.1 题目\n题面\n### 1.2 笔记\n我的理解\n';
    const variants = mergeRelatedVariantsSection(body, []);
    expect(variants).toContain('### 相关变式');
    expect(variants).toContain('暂无通过题库校验的关联题目。');
    const review = mergeAIReviewSection(variants, '### 解题思路\n哈希查找\n### 复杂度分析\nO(n)');
    expect(review).toContain('### AI 复盘\n\n#### 解题思路');
    const withUserSection = review + '\n### 我的补充\n务必保留\n';
    const replaced = mergeAIReviewSection(withUserSection, '### 解题思路\n新复盘');
    expect(replaced).toContain('### 我的补充\n务必保留');
    expect(replaced).toContain('我的理解');
    expect(replaced).not.toContain('哈希查找');
    expect(replaced.match(/^### AI 复盘$/gm)).toHaveLength(1);
  });

  it('已有 AI 章节可本地迁移标题，提示词明确要求中文正文', () => {
    const body = '### 1.4 Techniques\n### 1.5 Related Variants\n### 1.6 AI Review\n```text\n## AI Review\n```';
    const translated = localizeNoteHeadings(body);
    expect(translated).toContain('### 1.4 解题技巧\n### 1.5 相关变式\n### 1.6 AI 复盘');
    expect(translated).toContain('```text\n## AI Review\n```');
    const input = { problemMd: '题面', code: 'solution', language: 'python3' };
    expect(buildReviewPrompt(input)).toContain('请使用简体中文');
    expect(buildReviewPrompt(input)).toContain('### 复杂度分析');
    expect(buildKgPrompt(input)).toContain('简体中文填写 variants 和 lookAhead 中的 reason');
  });
});
