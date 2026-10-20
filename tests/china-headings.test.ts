import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, type App, type Plugin } from 'obsidian';
import { chineseHeadingExtension, registerChineseHeadings } from '../src/main/chineseHeadings';

describe('中文章节显示与英文存储锚点兼容', () => {
  const app = { metadataCache: { getFileCache: () => ({ frontmatter: { 'lc-slug': 'two-sum' } }) } } as unknown as App;
  const doc = '## Problem\n正文\n## Code\n```python\n## Notes\n```\n## Notes';
  function state(preview = true, isLeetcode = true) {
    return EditorState.create({ doc, extensions: [
      editorInfoField.init(() => ({ file: { path: 'problem.md' } }) as never),
      editorLivePreviewField.init(() => preview),
      chineseHeadingExtension(isLeetcode ? app : { metadataCache: { getFileCache: () => null } } as unknown as App),
    ] });
  }
  function labels(editor: EditorState) {
    const result: string[] = [];
    for (const decorations of editor.facet(EditorView.decorations)) {
      if (typeof decorations === 'function') continue;
      decorations.between(0, editor.doc.length, (_from, _to, value) => {
        result.push(value.spec.widget.toDOM({ dom: document.body }).textContent);
      });
    }
    return result;
  }
  it('实时预览翻译章节但不翻译代码字符串，也不改文档内容', () => {
    const editor = state();
    expect(labels(editor)).toEqual(['题目', '代码', '笔记']);
    expect(editor.doc.toString()).toBe(doc);
  });
  it('源码模式和普通笔记不添加中文装饰', () => {
    expect(labels(state(false))).toEqual([]);
    expect(labels(state(true, false))).toEqual([]);
  });
  it('阅读模式保留 data-heading，供代码按钮和原有锚点使用', () => {
    const register = vi.fn();
    registerChineseHeadings({ app: { ...app, vault: { getFileByPath: () => ({ path: 'problem.md' }) } },
      registerEditorExtension: vi.fn(), registerMarkdownPostProcessor: register } as unknown as Plugin);
    const callback = register.mock.calls[0]?.[0] as (element: HTMLElement, ctx: { sourcePath: string }) => void;
    const root = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'Code';
    root.appendChild(heading);
    callback(root, { sourcePath: 'problem.md' });
    expect(heading.textContent).toBe('代码');
    expect(heading.getAttribute('data-heading')).toBe('Code');
  });
});
