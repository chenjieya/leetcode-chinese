// eslint-disable-next-line import/no-extraneous-dependencies -- supplied by Obsidian
import { StateField, type EditorState, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- supplied by Obsidian
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, type App, type Plugin } from 'obsidian';

const HEADINGS: Readonly<Record<string, string>> = {
  Problem: '题目', Code: '代码', Notes: '笔记', Techniques: '解题技巧',
  'Related Variants': '相关变式', 'AI Review': 'AI 复盘',
  'Custom Tests': '自定义测试', 'AI Analysis': 'AI 分析',
};

/** 仅翻译展示层，磁盘上的章节锚点保持兼容，避免破坏旧笔记、代码提取和用户链接。 */
export function chineseHeading(heading: string): string | undefined {
  return HEADINGS[heading];
}

class ChineseHeadingWidget extends WidgetType {
  constructor(private label: string) { super(); }
  eq(other: ChineseHeadingWidget): boolean { return this.label === other.label; }
  toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement('span');
    span.className = 'cm-header cm-header-2';
    span.textContent = this.label;
    return span;
  }
}

function headingDecorations(state: EditorState, app: App): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;
  const file = state.field(editorInfoField, false)?.file;
  if (!file || !app.metadataCache.getFileCache(file)?.frontmatter?.['lc-slug']) return Decoration.none;
  const ranges = [];
  let fence: { marker: string; length: number } | null = null;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const delimiter = /^\s*(`{3,}|~{3,})(.*)$/.exec(line.text);
    if (delimiter) {
      const marker = delimiter[1]!;
      if (!fence) fence = { marker: marker[0]!, length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length && !delimiter[2]?.trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^## (.+)$/.exec(line.text);
    const label = match?.[1] ? chineseHeading(match[1]) : undefined;
    if (label) ranges.push(Decoration.replace({ widget: new ChineseHeadingWidget(label) }).range(line.from + 3, line.to));
  }
  return Decoration.set(ranges);
}

export function chineseHeadingExtension(app: App): Extension {
  return StateField.define<DecorationSet>({
    create: state => headingDecorations(state, app),
    update: (_value, tr) => headingDecorations(tr.state, app),
    provide: field => EditorView.decorations.from(field),
  });
}

/** 阅读模式保留标题 DOM 与 data-heading 锚点，只替换可见文本。 */
export function registerChineseHeadings(plugin: Plugin): void {
  plugin.registerEditorExtension(chineseHeadingExtension(plugin.app));
  plugin.registerMarkdownPostProcessor((element, context) => {
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!file || !plugin.app.metadataCache.getFileCache(file)?.frontmatter?.['lc-slug']) return;
    for (const heading of Array.from(element.querySelectorAll('h2'))) {
      const label = chineseHeading(heading.getAttribute('data-heading') ?? heading.textContent?.trim() ?? '');
      if (label) {
        if (!heading.hasAttribute('data-heading')) heading.setAttribute('data-heading', heading.textContent?.trim() ?? '');
        heading.textContent = label;
      }
    }
  }, 1000);
}
