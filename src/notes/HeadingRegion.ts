import { normalizeHeadingLine, persistedHeading, isSectionBoundary } from './noteHeadings';
// src/notes/HeadingRegion.ts
// Pure string transform for rewriting the `## Problem` region of a problem note.
//
// Ownership model (D-08):
//   - Plugin owns ONLY the `## Problem` body — from the `## Problem` heading line
//     to the line before the NEXT `## ` heading (same-level H2 only — H3 doesn't
//     close the region) or EOF.
//   - If `## Problem` is renamed or missing, the plugin re-inserts a fresh
//     `## Problem` block at the TOP of the body (above the first `## `
//     heading if any — typically `## Notes`; otherwise at EOF). The user's
//     renamed section is left untouched (D-09 clarified).
//
// Purity (Pitfall 4):
//   - No captured mutable state.
//   - Same (current, newMarkdown) → same return value.
//   - Safe to pass as the callback to Obsidian's `vault.process`, which may
//     silently retry the callback on a write conflict.
//
// 仅依赖纯字符串章节工具，不依赖 Obsidian；调用方负责文件写入。

/** Exact string the rewriter searches for. MUST match buildNoteBody() output. */
export const PROBLEM_HEADING_LINE = '## Problem' as const;

/**
 * Replace the `## Problem` section with the fresh Markdown, preserving everything else.
 *
 * @param current - full file body (between frontmatter delimiters is already stripped by
 *                  Obsidian's `vault.process`; `current` here is the post-frontmatter body
 *                  OR the entire file depending on the caller). This function is agnostic —
 *                  it line-scans for `## Problem` wherever it appears.
 * @param newMarkdown - the fresh Markdown body (without the heading — the function
 *                      emits `## Problem\n${newMarkdown}` itself).
 * @returns rewritten content.
 */
export function rewriteProblemSection(current: string, newMarkdown: string, titleUpdate?: { previous: string; next: string }): string {
  if (titleUpdate?.previous && titleUpdate.next && titleUpdate.previous !== titleUpdate.next) {
    // 只更新插件原来的题目标题，保留用户自定义标题、代码和笔记正文。
    const titleLines = current.split('\n');
    for (let i = 0; i < titleLines.length; i++) {
      if (normalizeHeadingLine(titleLines[i]) === PROBLEM_HEADING_LINE) break;
      const match = /^(#{1,6}[ \t]+(?:\d+(?:\.\d+)*\.?[ \t]+)?)([^\r\n]+?)(\r?)$/.exec(titleLines[i]!);
      if (match?.[2] === titleUpdate.previous) {
        titleLines[i] = `${match[1]}${titleUpdate.next}${match[3]}`;
        break;
      }
    }
    current = titleLines.join('\n');
  }
  const lines = current.split('\n');

  // Step 1: locate the `## Problem` heading, if present.
  let problemStart = -1;
  let problemEnd = lines.length;  // exclusive upper bound (EOF sentinel)
  for (let i = 0; i < lines.length; i++) {
    if (normalizeHeadingLine(lines[i]) === PROBLEM_HEADING_LINE) {
      problemStart = i;
      // Find next H2 heading to close the region (H3/H4/H5 do NOT close it).
      problemEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (isSectionBoundary(lines[j] ?? '', lines[i]!)) {
          problemEnd = j;
          break;
        }
      }
      break;
    }
  }

  // Alvis 可将章节整体降级；刷新时让题面内部标题维持相对层级。
  const heading = problemStart >= 0 ? lines[problemStart]! : PROBLEM_HEADING_LINE;
  const shift = (/^\s*(#+)/.exec(heading)?.[1]?.length ?? 2) - 2;
  let fence: { marker: string; length: number } | null = null;
  const trimmedNew = newMarkdown.trim().split('\n').map(line => {
    const delimiter = /^[ \t]{0,3}(`{3,}|~{3,})(.*)\r?$/.exec(line);
    if (delimiter) {
      const marker = delimiter[1]!;
      if (!fence) fence = { marker: marker[0]!, length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length && !delimiter[2]?.trim()) fence = null;
      return line;
    }
    return fence || shift === 0 ? line : line.replace(/^(#{1,6})([ \t]+)/, (_all, hashes: string, space: string) =>
      '#'.repeat(Math.min(6, hashes.length + shift)) + space);
  }).join('\n');
  const newBlock = `${problemStart >= 0 ? lines[problemStart] : persistedHeading(PROBLEM_HEADING_LINE)}\n${trimmedNew}\n\n`;

  if (problemStart >= 0) {
    // Heading found — splice out the old region, insert the new block in place.
    const before = lines.slice(0, problemStart).join('\n');
    const after = lines.slice(problemEnd).join('\n');
    // Glue logic: if `before` is empty, no leading newline; if `before` ends
    // mid-line (rare), ensure a newline.
    const leadingGlue = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    return `${before}${leadingGlue}${newBlock}${after}`;
  }

  // Heading missing (or renamed — D-09 treats rename identically to missing):
  // insert the `## Problem` block ABOVE the first `## ` heading if any (typically
  // `## Notes` or the user's renamed section), else at the top of the body
  // (skipping any leading frontmatter delimiters the caller might have left in).

  let insertAt = 0;

  // Skip past a leading frontmatter block if present.
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        insertAt = i + 1;
        break;
      }
    }
  }

  // Skip leading blank lines.
  while (insertAt < lines.length && (lines[insertAt] ?? '').trim() === '') {
    insertAt++;
  }

  // Find the first same-level H2 to insert BEFORE.
  let insertionPoint = lines.length;
  for (let i = insertAt; i < lines.length; i++) {
    if (/^## /.test(lines[i] ?? '')) {
      insertionPoint = i;
      break;
    }
  }

  const head = lines.slice(0, insertionPoint).join('\n').replace(/\s*$/, '');
  const tail = lines.slice(insertionPoint).join('\n');
  const glue = head.length > 0 ? '\n\n' : '';
  return `${head}${glue}${newBlock}${tail}`;
}
