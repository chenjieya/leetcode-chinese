import { isSectionBoundary, normalizeHeadingLine, sectionHeadingFor } from '../notes/noteHeadings';
// src/ai/mergeAIReviewSection.ts
//
// Phase 09 Plan 01 Task 2 — Idempotent vault-write transform for ## AI Review.
//
// Purity contract (mirrors `src/graph/mergeTechniquesSection.ts` posture):
//   - Only import is NOTES_HEADING_LINE from NoteTemplate (SSoT constant).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same (body, reviewContent) input → same string output.
//   - Safe inside `vault.process` retry semantics (D-17/D-18/D-20).
//
// Invariants:
//   - Idempotent: merge(merge(body, content), content) === merge(body, content)
//   - First write (D-17/D-18): appends ## AI Review after existing content at EOF
//   - Replacement (D-20): replaces from ## AI Review heading to EOF with new content
//   - Output ends with exactly one trailing newline
//   - Never mutates input string (returns new string)

import { AI_REVIEW_HEADING_LINE } from '../notes/NoteTemplate';

export { AI_REVIEW_HEADING_LINE };

/**
 * Idempotent vault-write transform. Inserts or replaces `## AI Review` in the
 * note body.
 *
 * @param body          — full note body (same contract as `vault.process` callbacks)
 * @param reviewContent — the AI-generated review text (may be empty)
 * @returns new body with ## AI Review section inserted/replaced at EOF
 */
export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines);
  const heading = sectionHeadingFor(body, AI_REVIEW_HEADING_LINE);
  const shift = (/^#+/.exec(heading)?.[0].length ?? 2) - 2;
  let fence = false;
  const content = reviewContent.split('\n').map(line => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fence = !fence;
      return line;
    }
    return fence || !shift ? line : line.replace(/^(#{3,6})(\s+)/, (_all, hashes: string, space: string) =>
      '#'.repeat(Math.min(6, hashes.length + shift)) + space);
  }).join('\n');

  if (headingIdx >= 0) {
    // 只替换复盘章节，保留其后的个人章节，兼容 Alvis 调整后的标题层级。
    const next = lines.findIndex((line, i) => i > headingIdx && isSectionBoundary(line, lines[headingIdx]!));
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    const after = next < 0 ? '' : '\n' + lines.slice(next).join('\n');
    return before + '\n\n' + heading + '\n\n' + content + '\n' + after;
  }

  // First-write path (D-17/D-18): append after all existing content.
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + heading + '\n\n' + content + '\n';
}

/**
 * Find the line index that is an EXACT literal match for AI_REVIEW_HEADING_LINE.
 * Not a regex/prefix match — '## AI Reviews' must NOT match.
 */
function findExactHeading(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (normalizeHeadingLine(lines[i]) === AI_REVIEW_HEADING_LINE) return i;
  }
  return -1;
}
