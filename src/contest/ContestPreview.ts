// src/contest/ContestPreview.ts
// Phase 10 Plan 03 Task 2 — Contest preview modal.
//
// Shows contest details (title, duration, problem list) before the user commits
// to starting. "Start Contest" button disables on click and delegates to
// the onStart callback.
//
// Pattern precedent: src/solve/VerdictModal.ts (Modal pattern).
// UI-SPEC: §Contest preview, §Copywriting Contract.

import { Modal, Notice, type App } from 'obsidian';
import type { CachedContest } from './types';
import type { LeetCodeClient } from '../api/LeetCodeClient';

/** Shape returned by LeetCodeAdvanced.getContestQuestions() per question. */
export interface ContestQuestion {
  credit: number;
  title: string;
  title_slug: string;
  difficulty: number; // 1=Easy, 2=Medium, 3=Hard
}

export class ContestPreviewModal extends Modal {
  private readonly contest: CachedContest;
  private readonly client: LeetCodeClient;
  private readonly onStart: (questions: ContestQuestion[]) => Promise<void>;

  constructor(
    app: App,
    contest: CachedContest,
    client: LeetCodeClient,
    onStart: (questions: ContestQuestion[]) => Promise<void>,
  ) {
    super(app);
    this.contest = contest;
    this.client = client;
    this.onStart = onStart;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    // Title
    contentEl.createEl('h2', { text: this.contest.title });

    // Duration label
    const durationMin = Math.round(this.contest.duration / 60);
    contentEl.createEl('p', {
      text: `时长：${String(durationMin)} 分钟`,
      cls: 'lc-contest-preview__duration',
    });

    // Problems heading
    contentEl.createEl('h3', { text: '题目' });

    // Loading indicator for problems
    const problemsContainer = contentEl.createDiv({ cls: 'lc-contest-preview__problems' });
    problemsContainer.createEl('p', { text: '正在加载题目…', cls: 'lc-contest-preview__loading' });

    // Start Contest button (primary CTA — accent background per UI-SPEC)
    const footer = contentEl.createDiv({ cls: 'lc-contest-preview__footer' });
    const startBtn = footer.createEl('button', {
      text: '开始竞赛',
      cls: 'lc-contest-preview__start',
    });
    startBtn.addClass('mod-cta');

    // Fetch contest questions
    let questions: ContestQuestion[] = [];
    try {
      const resp = await this.client.getContestQuestions(this.contest.slug);
      questions = resp.questions.map((q: { credit: number; title: string; title_slug: string; difficulty: number }) => ({
        credit: q.credit,
        title: q.title,
        title_slug: q.title_slug,
        difficulty: q.difficulty,
      }));

      // Render problem list
      problemsContainer.empty();
      const list = problemsContainer.createEl('ol', { cls: 'lc-contest-preview__list' });
      for (const q of questions) {
        const item = list.createEl('li', { cls: 'lc-contest-preview__problem' });
        const diffMap: Record<number, string> = { 1: 'easy', 2: 'medium', 3: 'hard' };
        const diffLabel: Record<number, string> = { 1: '简单', 2: '中等', 3: '困难' };
        const diffClass = diffMap[q.difficulty] ?? 'easy';
        item.createSpan({
          text: diffLabel[q.difficulty] ?? '简单',
          cls: `lc-diff--${diffClass}`,
        });
        item.createSpan({ text: ' ' });
        item.createSpan({ text: q.title, cls: 'lc-contest-preview__problem-title' });
      }
    } catch {
      problemsContainer.empty();
      problemsContainer.createEl('p', {
        text: "无法加载竞赛题目，请检查网络连接。",
        cls: 'lc-contest-preview__error',
      });
    }

    // Start contest click handler
    startBtn.addEventListener('click', () => {
      void (async () => {
        if (questions.length === 0) {
          new Notice("无法获取竞赛题目，请检查网络连接。", 4000);
          return;
        }
        startBtn.disabled = true;
        startBtn.setText('正在开始…');
        try {
          await this.onStart(questions);
          this.close();
        } catch {
          new Notice("无法获取竞赛题目，请检查网络连接。", 4000);
          startBtn.disabled = false;
          startBtn.setText('开始竞赛');
        }
      })();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
