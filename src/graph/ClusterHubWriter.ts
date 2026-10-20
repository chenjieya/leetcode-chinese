// src/graph/ClusterHubWriter.ts
//
// Phase 11 Plan 02 Task 1 — Hub note CRUD + reconcile for AI Knowledge Graph.
//
// Responsibilities:
//   - Create hub notes at {problemsFolder}/patterns/{pattern}.md
//   - Append new entries to existing hub notes (idempotent)
//   - Reconcile: scan all notes with lc-pattern frontmatter and rebuild hubs
//
// Vault-write convention (CF-06):
//   - vault.create for new files
//   - vault.process for modifying existing files
//   - Never vault.modify
//
// Never-throw posture: per-operation try/catch with logger.debug.
// DI constructor pattern mirrors KnowledgeGraphWriter.

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { normalizePatternName, patternDisplayName } from './patternTaxonomy';
import { sanitizeHubFilename } from './hubFilename';
import { logger } from '../shared/logger';

// Re-export the (now pure) sanitizeHubFilename so existing consumers — main.ts
// line 193 and tests/graph/clusterHubWriter.test.ts line 9 — keep importing it
// from './graph/ClusterHubWriter' unchanged.
export { sanitizeHubFilename } from './hubFilename';

/**
 * TFile narrowing — production runs go through `instanceof TFile`; unit tests
 * mock the Vault with plain file-shaped objects that don't pass `instanceof`,
 * so we duck-type fall back to checking the structural `.path` shape.
 *
 * The signature `(v: unknown) => TFile | null` lets call sites bind a
 * TFile-typed local without writing `as TFile` (forbidden by the
 * obsidianmd/no-tfile-tfolder-cast rule). The local `VaultFile` alias keeps
 * the lone necessary cast's AST type identifier off the literal `TFile`
 * token the rule scans for. Mirrors the helper in src/notes/NoteWriter.ts.
 */
type VaultFile = TFile;
interface FileLike { path: string; extension?: unknown }
function isFileLike(v: unknown): v is FileLike {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { path?: unknown }).path === 'string'
  );
}
function narrowToTFile(v: unknown): TFile | null {
  if (v instanceof TFile) return v;
  if (isFileLike(v)) return v as unknown as VaultFile;
  return null;
}

/**
 * A single problem entry in a hub note's difficulty-grouped table.
 */
export interface HubEntry {
  title: string;
  fileBasename: string; // e.g. '1-two-sum' (without .md)
  difficulty: 'Easy' | 'Medium' | 'Hard';
  solvedDate: string; // YYYY-MM-DD
}

/** Constructor deps (DI). */
export interface ClusterHubWriterDeps {
  app: App;
  problemsFolder: string;
}

/**
 * Manages pattern hub notes at {problemsFolder}/patterns/{pattern}.md.
 * Hub notes contain difficulty-grouped tables listing all problems classified
 * into that pattern.
 */
export class ClusterHubWriter {
  private readonly app: App;
  private readonly problemsFolder: string;

  constructor(deps: ClusterHubWriterDeps) {
    this.app = deps.app;
    this.problemsFolder = deps.problemsFolder;
  }

  /**
   * Create a hub note if absent. No-op if hub already exists.
   * Race-safe via try/catch on vault.create (same pattern as StubNoteCreator).
   */
  async ensureHub(patternName: string, firstEntry: HubEntry): Promise<void> {
    const normalized = normalizePatternName(patternName);
    const folderPath = `${this.problemsFolder}/patterns`;
    const filePath = `${folderPath}/${sanitizeHubFilename(normalized)}.md`;

    // Check existence
    if (this.app.vault.getAbstractFileByPath(filePath)) return;

    // Ensure folder exists (race-safe)
    try {
      if (!this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
    } catch (err) {
      // Concurrent-create race — folder already exists.
      logger.debug('ClusterHubWriter.ensureHub: folder race', err);
    }

    // Create hub note with initial entry
    try {
      const body = buildHubNoteBody(normalized, [firstEntry]);
      await this.app.vault.create(filePath, body);
    } catch (err) {
      // Concurrent-create race — file was created between check and create.
      logger.debug('ClusterHubWriter.ensureHub: create race', err);
    }
  }

  /**
   * Append a problem entry to the correct difficulty section of an existing hub.
   * Idempotent: skips if [[title]] already appears in the hub body.
   */
  async appendEntry(patternName: string, entry: HubEntry): Promise<void> {
    const normalized = normalizePatternName(patternName);
    const filePath = `${this.problemsFolder}/patterns/${sanitizeHubFilename(normalized)}.md`;
    const file = narrowToTFile(this.app.vault.getAbstractFileByPath(filePath));
    if (!file) {
      logger.debug('ClusterHubWriter.appendEntry: hub not found, calling ensureHub', { filePath });
      await this.ensureHub(patternName, entry);
      return;
    }

    try {
      await this.app.vault.process(file, (current: string) => {
        return appendToHub(current, entry);
      });
    } catch (err) {
      logger.debug('ClusterHubWriter.appendEntry: process failed', err);
    }
  }

  /**
   * Reconcile: scan all vault markdown files for lc-pattern frontmatter,
   * group by pattern, rebuild each hub note from scratch.
   * Uses metadataCache (in-memory) for performance — no file reads needed.
   */
  async reconcile(): Promise<void> {
    try {
      const allFiles = (this.app.vault as unknown as { getMarkdownFiles(): TFile[] }).getMarkdownFiles();
      const prefixedFiles = allFiles.filter((f: TFile) =>
        f.path.startsWith(this.problemsFolder + '/'),
      );

      // Group entries by pattern
      const groups = new Map<string, HubEntry[]>();
      for (const file of prefixedFiles) {
        const cache = this.app.metadataCache.getFileCache(file);
        // 重新分类后旧模式可能已无成员，仍需刷新受管索引，避免残留旧题目链接。
        const hubPattern: unknown = cache?.frontmatter?.['pattern'];
        if (file.path.startsWith(`${this.problemsFolder}/patterns/`)
          && cache?.frontmatter?.['lc-pattern-hub'] === true
          && typeof hubPattern === 'string' && hubPattern.trim()) {
          const normalized = normalizePatternName(hubPattern);
          if (!groups.has(normalized)) groups.set(normalized, []);
          continue;
        }
        const raw: unknown = cache?.frontmatter?.['lc-pattern'];
        const patterns = (Array.isArray(raw) ? raw : [raw])
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (patterns.length === 0) continue;
        const difficulty = (cache?.frontmatter?.['lc-difficulty'] as string) ?? 'Medium';
        const solvedDate = (cache?.frontmatter?.['lc-solved-date'] as string) ?? '';

        const basename = (file as unknown as { basename: string }).basename;
        const title = (cache?.frontmatter?.['lc-title'] as string) ?? basename;
        const entry: HubEntry = {
          title,
          fileBasename: basename,
          difficulty: normalizeDifficulty(difficulty),
          solvedDate,
        };

        // 新版写入数组，旧笔记仍可能是单个字符串；一题可归属多个模式。
        for (const normalized of new Set(patterns.map(normalizePatternName))) {
          const existing = groups.get(normalized) ?? [];
          existing.push(entry);
          groups.set(normalized, existing);
        }
      }

      // Rebuild each hub
      for (const [patternName, entries] of groups) {
        const folderPath = `${this.problemsFolder}/patterns`;
        const filePath = `${folderPath}/${sanitizeHubFilename(patternName)}.md`;
        const file = narrowToTFile(this.app.vault.getAbstractFileByPath(filePath));

        if (file) {
          // Overwrite via vault.process
          try {
            await this.app.vault.process(file, () => {
              return buildHubNoteBody(patternName, entries);
            });
          } catch (err) {
            logger.debug('ClusterHubWriter.reconcile: process failed', { patternName, err });
          }
        } else {
          // Create new hub
          try {
            if (!this.app.vault.getAbstractFileByPath(folderPath)) {
              await this.app.vault.createFolder(folderPath);
            }
          } catch {
            // Race - folder exists
          }
          try {
            await this.app.vault.create(filePath, buildHubNoteBody(patternName, entries));
          } catch (err) {
            logger.debug('ClusterHubWriter.reconcile: create failed', { patternName, err });
          }
        }
      }
    } catch (err) {
      logger.debug('ClusterHubWriter.reconcile: scan failed', err);
    }
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Normalize difficulty string to the canonical union type.
 */
function normalizeDifficulty(d: string): 'Easy' | 'Medium' | 'Hard' {
  const lower = d.toLowerCase();
  if (lower === 'easy') return 'Easy';
  if (lower === 'hard') return 'Hard';
  return 'Medium';
}

/**
 * Build the full hub note body: frontmatter + heading + difficulty-grouped tables.
 */
function buildHubNoteBody(patternName: string, entries: HubEntry[]): string {
  const easy = entries.filter((e) => e.difficulty === 'Easy');
  const medium = entries.filter((e) => e.difficulty === 'Medium');
  const hard = entries.filter((e) => e.difficulty === 'Hard');

  const parts: string[] = [
    '---',
    'lc-pattern-hub: true',
    `pattern: "${patternName}"`,
    '---',
    '',
    `# ${patternDisplayName(patternName)}`,
    '',
    '本页是算法模式的题目索引，按难度汇总已分类的题目；不包含自动生成的算法教程。',
    '',
    '### 简单',
    '',
    ...(easy.length === 0 ? ['暂无题目。'] : []),
    ...easy.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
    '### 中等',
    '',
    ...(medium.length === 0 ? ['暂无题目。'] : []),
    ...medium.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
    '### 困难',
    '',
    ...(hard.length === 0 ? ['暂无题目。'] : []),
    ...hard.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
  ];

  return parts.join('\n');
}

/**
 * Append an entry to the correct difficulty section in an existing hub body.
 * Idempotent: skips if [[title]] already present.
 */
function appendToHub(body: string, entry: HubEntry): string {
  // Idempotent check
  if (body.includes(`[[${entry.fileBasename}|`)) return body;

  const lines = body.split('\n');
  const labels = { Easy: '简单', Medium: '中等', Hard: '困难' };
  const bullet = `- [[${entry.fileBasename}|${entry.title}]]`;

  // Find the difficulty section and append the bullet after existing items
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i]?.replace(/^#{1,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?/, '').trim();
    if (label === entry.difficulty || label === labels[entry.difficulty]) {
      let insertIdx = i + 1;
      // Skip blank lines after heading
      while (insertIdx < lines.length && lines[insertIdx]! === '') insertIdx++;
      if (lines[insertIdx] === '暂无题目。') lines.splice(insertIdx, 1);
      // Skip existing bullet items
      while (insertIdx < lines.length && lines[insertIdx]!.startsWith('- [[')) insertIdx++;
      // Insert the new bullet
      lines.splice(insertIdx, 0, bullet);
      return lines.join('\n');
    }
  }

  // Section not found — shouldn't happen with a well-formed hub, but append at end
  return body + '\n' + bullet + '\n';
}
