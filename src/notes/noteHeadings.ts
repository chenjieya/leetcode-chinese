/** 章节身份沿用旧英文键；磁盘正文使用中文。兼容 Alvis 的 1. / 1.1 编号。 */
const LABELS: Readonly<Record<string, string>> = {
  Problem: '题目', Code: '代码', Notes: '笔记',
  Techniques: '解题技巧', 'Related Variants': '相关变式', 'AI Review': 'AI 复盘',
  'AI Analysis': 'AI 分析', 'Custom Tests': '自定义测试',
};

function parseHeading(line: string): { prefix: string; label: string; suffix: string } | null {
  const match = /^([ \t]*#{2,6}[ \t]+(?:\d+(?:\.\d+)*\.?[ \t]+)?)(.*?)([ \t]+#+[ \t]*\r?$|[ \t]*\r?$)/.exec(line);
  return match ? { prefix: match[1]!, label: match[2]!, suffix: match[3]! } : null;
}

/** 只规范用于比较的标题，不改正文长度，避免破坏编辑器位置与代码围栏偏移。 */
export function normalizeHeadingLine(line: string | undefined): string {
  if (line === undefined) return '';
  const heading = parseHeading(line);
  if (!heading) return line;
  const english = Object.keys(LABELS).find(key => LABELS[key] === heading.label);
  const identity = english ?? (heading.label === '问题' ? 'Problem' : heading.label);
  // 仅插件章节允许跨层级识别，用户子标题保持原有层级。
  const owned = ['Problem', 'Code', 'Notes', 'Techniques', 'Related Variants', 'AI Review', 'AI Analysis', 'Custom Tests'];
  return owned.includes(identity) ? `## ${identity}` : line.trim();
}

export function isSectionBoundary(line: string, opening: string): boolean {
  const level = /^[ \t]*(#{1,6})[ \t]+/.exec(line)?.[1]?.length;
  const startLevel = /^[ \t]*(#{1,6})[ \t]+/.exec(opening)?.[1]?.length ?? 2;
  return level !== undefined && level >= 2 && level <= startLevel;
}

export function isCodeHeading(line: string): boolean {
  return normalizeHeadingLine(line) === '## Code';
}

export function persistedHeading(line: string): string {
  const heading = parseHeading(line);
  if (!heading) return line;
  const label = LABELS[heading.label] ?? (heading.label === '问题' ? '题目' : undefined);
  return label ? heading.prefix + label + heading.suffix : line;
}

/** 新章节沿用笔记的章节层级；已有章节保留 Alvis 编号，避免写回后层级跳变。 */
export function sectionHeadingFor(body: string, identity: string): string {
  const lines = body.split('\n');
  const existing = lines.find(line => normalizeHeadingLine(line) === identity);
  if (existing) return persistedHeading(existing).trimEnd();
  const anchor = lines.find(line =>
    ['## Notes', '## Code', '## Problem'].includes(normalizeHeadingLine(line)));
  const hashes = anchor ? /^[ \t]*(#{2,6})/.exec(anchor)?.[1] : undefined;
  return persistedHeading(identity).replace(/^##/, hashes ?? '##');
}

/** 格式化后的题名可能为 ## 1. 两数之和，不能再补一个重复的 H1。 */
export function hasNoteTitle(content: string, title: string): boolean {
  for (const line of content.split('\n')) {
    if (normalizeHeadingLine(line) === '## Problem') break;
    if (/^# [^\r\n]+/.test(line)) return true;
    if (parseHeading(line)?.label === title) return true;
  }
  return false;
}

/** 仅迁移顶层章节，原样保留 YAML、围栏内的代码/样例、编号及换行格式。 */
export function localizeNoteHeadings(content: string): string {
  let frontmatter = false;
  let fence: { marker: string; length: number } | null = null;
  return content.split('\n').map((line, index) => {
    if (index === 0 && line.trim() === '---') {
      frontmatter = true;
      return line;
    }
    if (frontmatter) {
      if (line.trim() === '---') frontmatter = false;
      return line;
    }
    const delimiter = /^[ \t]{0,3}(`{3,}|~{3,})(.*)\r?$/.exec(line);
    if (delimiter) {
      const marker = delimiter[1]!;
      if (!fence) fence = { marker: marker[0]!, length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length && !delimiter[2]?.trim()) fence = null;
      return line;
    }
    return fence ? line : persistedHeading(line);
  }).join('\n');
}
