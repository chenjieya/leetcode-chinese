// src/graph/OtherPatternModal.ts
//
// Phase 11 Plan 02 Task 2 — Modal for naming an OTHER pattern (AIKG-01).
//
// When AI classification returns 'OTHER', the user is prompted ONCE to name
// the pattern or accept OTHER. The choice is persisted to lc-pattern frontmatter
// and never re-prompted for that problem (persistence check in PatternClusterEngine).
//
// Uses createEl/createDiv DOM API (no innerHTML). Follows Modal lifecycle pattern
// from VerdictModal / CookiePasteModal.

import { App, Modal } from 'obsidian';
import { normalizePatternName } from './patternTaxonomy';

/**
 * Modal that prompts the user to name a pattern when AI classification
 * returns 'OTHER'. Resolves a Promise with the user's chosen pattern name
 * (normalized) or 'OTHER' if they accept the default / dismiss the modal.
 */
export class OtherPatternModal extends Modal {
  private resultPromise: Promise<string>;
  private resolveResult!: (value: string) => void;
  private resolved = false;
  private problemTitle: string;

  constructor(app: App, problemTitle: string) {
    super(app);
    this.problemTitle = problemTitle;
    this.resultPromise = new Promise<string>((resolve) => {
      this.resolveResult = resolve;
    });
  }

  /**
   * Await this to get the user's chosen pattern name (or 'OTHER').
   */
  waitForResult(): Promise<string> {
    return this.resultPromise;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-other-pattern');

    contentEl.createEl('h3', {
      text: 'AI 暂时无法确定解题模式',
    });

    contentEl.createEl('p', {
      text: `题目：${this.problemTitle}`,
    });

    contentEl.createEl('p', {
      text: '请输入自定义模式名称，或保留“其他”表示暂未分类。',
    });

    const inputEl = contentEl.createEl('input', {
      type: 'text',
      value: '其他',
      cls: 'leetcode-other-pattern-input',
    });

    const buttonContainer = contentEl.createDiv({ cls: 'leetcode-other-pattern-buttons' });

    const acceptBtn = buttonContainer.createEl('button', {
      text: '确定',
    });
    acceptBtn.addClass('mod-cta');
    acceptBtn.addEventListener('click', () => {
      const value = inputEl.value.trim();
      const normalized = value.length > 0 ? normalizePatternName(value) : 'OTHER';
      this.resolved = true;
      this.resolveResult(normalized);
      this.close();
    });
  }

  onClose(): void {
    // If promise not yet resolved (user dismissed modal), resolve with 'OTHER'.
    if (!this.resolved) {
      this.resolved = true;
      this.resolveResult('OTHER');
    }
    this.contentEl.empty();
  }
}
