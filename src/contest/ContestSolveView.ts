// src/contest/ContestSolveView.ts
// Phase 10 Plan 04 — Contest problem solving ItemView.
//
// Dedicated editing surface for contest problems. Users navigate here from
// the timer header's problem badges (Plan 05). Code persists in PluginData
// (ephemeral — no .md file created per D-09).
//
// Pattern analog: src/preview/ProblemPreviewView.ts (ItemView lifecycle,
// setState/getState, renderToken guard, sticky header).
//
// All HTTP through existing LC REST infrastructure (interpretSolution from
// leetcodeRest.ts + pollSubmission for submit flow). Verdicts recorded via
// ContestSessionManager.recordVerdict.

import {
  ItemView,
  MarkdownRenderer,
  Notice,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import type LeetCodePlugin from '../main';
import { htmlToMarkdown } from '../notes/htmlToMarkdown';
import { LC_LANG_DISPLAY_LABELS, LC_CHEVRON_LANG_ORDER } from '../solve/languages';
import { interpretSolution, authHeaders } from '../solve/leetcodeRest';
import { pollSubmission, type AbortLike } from '../solve/pollingOrchestrator';
import { showSessionExpiredNotice } from '../solve/SessionExpiredNotice';
import { classifyStatus } from '../solve/statusMap';
import { throttledRequestUrl } from '../api/requestUrlFetcher';
import { setWindowTimeout, type TimerHandle } from '../shared/timers';
import { VerdictModal } from '../solve/VerdictModal';

export const CONTEST_SOLVE_VIEW_TYPE = 'leetcode-contest-solve';

/** Map LC language slugs to markdown fence language tags for highlighting. */
function langToFenceTag(slug: string): string {
  const map: Record<string, string> = {
    python3: 'python', python: 'python', java: 'java',
    cpp: 'cpp', c: 'c', javascript: 'javascript', typescript: 'typescript',
    golang: 'go', ruby: 'ruby', swift: 'swift', kotlin: 'kotlin',
    rust: 'rust', scala: 'scala', csharp: 'csharp',
  };
  return map[slug] ?? slug;
}

/** Debounce delay for auto-saving code to PluginData (30 seconds). */
const CODE_SAVE_DEBOUNCE_MS = 30_000;

export class ContestSolveView extends ItemView {
  private problemIdx: number | null = null;
  private rootEl: HTMLElement | null = null;
  private renderToken = 0;
  private highlightEl: HTMLElement | null = null;
  private saveTimer: TimerHandle | null = null;
  /** Track in-memory code before flush to avoid stale reads. */
  private pendingCode: string | null = null;
  private pendingLanguage: string | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return CONTEST_SOLVE_VIEW_TYPE;
  }

  getIcon(): string {
    return 'trophy';
  }

  getDisplayText(): string {
    if (this.problemIdx == null) return 'Contest';
    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return 'Contest';
    const problem = session.problems[this.problemIdx];
    if (!problem) return 'Contest';
    return `竞赛：${String(this.problemIdx + 1)}. ${problem.title}`;
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-contest-solve');
    this.rootEl = root;

    if (this.problemIdx != null) {
      this.renderProblem();
    }
  }

  async onClose(): Promise<void> {
    // Flush pending code save
    this.flushCodeSave();
    this.rootEl = null;
    this.highlightEl = null;
    this.renderToken += 1;
    if (this.saveTimer != null) {
      window.clearTimeout(this.saveTimer as unknown as number);
      this.saveTimer = null;
    }
  }

  async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    const next = (state && typeof state === 'object'
      ? (state as Partial<{ problemIdx: number }>)
      : {});
    const idx = typeof next.problemIdx === 'number' ? next.problemIdx : null;
    this.problemIdx = idx;

    // Lazy-init root (Obsidian may call setState before onOpen)
    if (!this.rootEl && this.containerEl?.children?.[1]) {
      const root = this.containerEl.children[1] as HTMLElement;
      root.empty();
      root.addClass('leetcode-contest-solve');
      this.rootEl = root;
    }
    if (this.rootEl && idx != null) {
      this.renderProblem();
    }
  }

  getState(): { problemIdx: number | null } {
    return { problemIdx: this.problemIdx };
  }

  /** Render the full problem solving surface. */
  private renderProblem(): void {
    if (!this.rootEl || this.problemIdx == null) return;
    const root = this.rootEl;
    this.renderToken += 1;

    root.empty();

    const session = this.plugin.contestSessionManager.getSession();
    if (!session) {
      root.createEl('p', { text: '当前没有正在进行的竞赛。' });
      return;
    }

    const problem = session.problems[this.problemIdx];
    if (!problem) {
      root.createEl('p', { text: '当前竞赛中未找到这道题。' });
      return;
    }

    const detail = this.plugin.lcSettings.getProblemDetail(problem.slug);

    // ── Sticky header ──
    const header = root.createDiv({ cls: 'leetcode-contest-solve__header' });
    const titleRow = header.createDiv({ cls: 'leetcode-contest-solve__title-row' });
    titleRow.createEl('h2', {
      cls: 'leetcode-contest-solve__title',
      text: `${String(this.problemIdx + 1)}. ${problem.title}`,
    });

    const diffText = problem.difficulty === 1 ? '简单'
      : problem.difficulty === 2 ? '中等' : '困难';
    const diffClass = `lc-diff lc-diff--${problem.difficulty === 1 ? 'easy' : problem.difficulty === 2 ? 'medium' : 'hard'}`;
    titleRow.createSpan({ cls: diffClass, text: diffText });

    header.createSpan({
      cls: 'leetcode-contest-solve__position',
      text: `题目 ${String(this.problemIdx + 1)}/${String(session.problems.length)}`,
    });

    // ── Problem description ──
    if (detail) {
      const body = root.createDiv({ cls: 'leetcode-contest-solve__body markdown-rendered' });
      const md = htmlToMarkdown(detail.contentHtml);
      void MarkdownRenderer.render(this.app, md, body, '', this);
    } else {
      root.createEl('p', {
        cls: 'leetcode-contest-solve__no-detail',
        text: '题面尚未缓存，请重新打开竞赛。',
      });
    }

    // ── Code editor: click-to-edit with highlighted preview ──
    const currentCode = this.pendingCode ?? problem.code;
    const currentLang = this.pendingLanguage ?? problem.language;

    const codeContainer = root.createDiv({ cls: 'leetcode-contest-solve__code' });

    // Highlighted preview (rendered via MarkdownRenderer — native Obsidian highlighting)
    const highlightWrap = codeContainer.createDiv({ cls: 'leetcode-contest-solve__highlight' });
    this.highlightEl = highlightWrap;
    this.renderHighlight(currentCode, currentLang, highlightWrap);

    // Editable textarea (hidden until user clicks the highlight)
    const codeArea = codeContainer.createEl('textarea', {
      cls: 'leetcode-contest-solve__textarea is-hidden',
    });
    codeArea.value = currentCode;
    codeArea.setAttribute('spellcheck', 'false');
    codeArea.setAttribute('autocomplete', 'off');
    codeArea.setAttribute('aria-label', '解答代码编辑器');
    codeArea.setAttribute('wrap', 'off');

    // Click highlight → show textarea, hide highlight
    highlightWrap.addEventListener('click', () => {
      highlightWrap.addClass('is-hidden');
      codeArea.removeClass('is-hidden');
      codeArea.focus();
    });

    // Blur textarea → show highlight, hide textarea
    codeArea.addEventListener('blur', () => {
      this.renderHighlight(codeArea.value, currentLang, highlightWrap);
      codeArea.addClass('is-hidden');
      highlightWrap.removeClass('is-hidden');
    });

    // Wire code input with debounced save
    codeArea.addEventListener('input', () => {
      this.pendingCode = codeArea.value;
      this.scheduleSave();
    });

    // ── Action row: language selector + Run/Submit ──
    const actionsRow = root.createDiv({ cls: 'leetcode-contest-solve__actions' });

    // Language selector
    const langSelect = actionsRow.createEl('select', {
      cls: 'leetcode-contest-solve__lang-select',
    });
    langSelect.setAttribute('aria-label', '编程语言选择');
    for (const slug of LC_CHEVRON_LANG_ORDER) {
      const label = LC_LANG_DISPLAY_LABELS[slug] ?? slug;
      const opt = langSelect.createEl('option', { text: label });
      opt.value = slug;
      if (slug === currentLang) opt.selected = true;
    }
    langSelect.addEventListener('change', () => {
      this.pendingLanguage = langSelect.value;
      this.scheduleSave();
    });

    // Run button
    const runBtn = actionsRow.createEl('button', {
      cls: 'leetcode-contest-solve__run-btn',
      text: '运行',
    });
    runBtn.addEventListener('click', () => {
      void this.handleRun();
    });

    // Submit button
    const submitBtn = actionsRow.createEl('button', {
      cls: 'leetcode-contest-solve__submit-btn mod-cta',
      text: '提交',
    });
    submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
  }

  /** Schedule a debounced code save to ContestSessionManager. */
  private renderHighlight(code: string, lang: string, container: HTMLElement): void {
    container.empty();
    const fenceTag = langToFenceTag(lang);
    const md = '```' + fenceTag + '\n' + code + '\n```';
    void MarkdownRenderer.render(this.app, md, container, '', this);
  }

  private scheduleSave(): void {
    if (this.saveTimer != null) {
      window.clearTimeout(this.saveTimer as unknown as number);
      this.saveTimer = null;
    }
    this.saveTimer = setWindowTimeout(() => {
      this.flushCodeSave();
      this.saveTimer = null;
    }, CODE_SAVE_DEBOUNCE_MS);
  }

  /** Immediately flush pending code to the session manager. */
  flushCodeSave(): void {
    if (this.problemIdx == null) return;
    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;
    const problem = session.problems[this.problemIdx];
    if (!problem) return;

    const code = this.pendingCode ?? problem.code;
    const language = this.pendingLanguage ?? problem.language;

    this.plugin.contestSessionManager.updateCode(this.problemIdx, code, language);
    this.pendingCode = null;
    this.pendingLanguage = null;
  }

  /** Run code against sample test cases via interpretSolution. */
  async handleRun(): Promise<void> {
    if (this.problemIdx == null) return;

    // Flush latest code
    this.flushCodeSave();

    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;
    const problem = session.problems[this.problemIdx];
    if (!problem) return;
    const detail = this.plugin.lcSettings.getProblemDetail(problem.slug);
    if (!detail) {
      new Notice('题面尚未缓存，暂时无法运行。', 4000);
      return;
    }

    const cookies = this.plugin.lcSettings.getAuthCookies();
    if (!cookies) {
      showSessionExpiredNotice(() => { void this.plugin.auth.login(); });
      return;
    }

    const code = problem.code;
    const lang = problem.language;
    const questionId = detail.internalQuestionId ?? String(detail.id);
    const dataInput = detail.exampleTestcases ?? '';

    // Open VerdictModal for Run feedback (same pattern as main.ts runInterpretedInput)
    const abort: AbortLike = { aborted: false };
    const modal = new VerdictModal(this.app, {
      problemTitle: problem.title,
      onCancel: () => { abort.aborted = true; },
    });
    modal.open();

    try {
      const { interpret_id } = await interpretSolution({
        slug: problem.slug,
        cookies,
        lang,
        questionId,
        typedCode: code,
        dataInput,
      });
      const terminal = await pollSubmission({
        fetcher: throttledRequestUrl,
        submissionId: interpret_id,
        slug: problem.slug,
        registerInterval: (fn, ms) => setWindowTimeout(fn, ms),
        abortSignal: abort,
        headers: authHeaders(problem.slug, cookies),
      });

      // Render result in the modal
      const t = terminal as Record<string, unknown>;
      const statusCode = typeof t.status_code === 'number' ? t.status_code : 0;
      const statusMsg = typeof t.status_msg === 'string' ? t.status_msg : undefined;
      const info = classifyStatus(statusCode, statusMsg);

      modal.renderVerdict(terminal as Parameters<typeof modal.renderVerdict>[0], problem.title, {
        metaData: detail.metaData,
        joinedDataInput: dataInput,
      });

      // Record verdict if not AC
      if (info.kind !== 'ac' && info.kind !== 'unknown' && info.kind !== 'unknown-lc') {
        if (problem.verdict === 'unsolved') {
          this.plugin.contestSessionManager.recordVerdict(this.problemIdx, 'attempted');
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      new Notice(`运行失败：${(err as Error).message?.slice(0, 100) ?? '未知错误'}`, 6000);
    }
  }

  /** Submit code for full judge via submit endpoint. */
  async handleSubmit(): Promise<void> {
    if (this.problemIdx == null) return;

    // Flush latest code
    this.flushCodeSave();

    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;
    const problem = session.problems[this.problemIdx];
    if (!problem) return;
    const detail = this.plugin.lcSettings.getProblemDetail(problem.slug);
    if (!detail) {
      new Notice('题面尚未缓存，暂时无法提交。', 4000);
      return;
    }

    const cookies = this.plugin.lcSettings.getAuthCookies();
    if (!cookies) {
      showSessionExpiredNotice(() => { void this.plugin.auth.login(); });
      return;
    }

    const code = problem.code;
    const lang = problem.language;
    const questionId = detail.internalQuestionId ?? String(detail.id);

    // Open VerdictModal for submit feedback
    const abort: AbortLike = { aborted: false };
    const modal = new VerdictModal(this.app, {
      problemTitle: problem.title,
      onCancel: () => { abort.aborted = true; },
    });
    modal.open();

    try {
      // POST /problems/{slug}/submit/
      const submitRes = await throttledRequestUrl({
        url: `https://leetcode.cn/problems/${problem.slug}/submit/`,
        method: 'POST',
        headers: authHeaders(problem.slug, cookies),
        body: JSON.stringify({
          lang,
          question_id: questionId,
          typed_code: code,
          judge_type: 'large',
        }),
        throw: false,
      });

      if (submitRes.status === 401 || submitRes.status === 403) {
        showSessionExpiredNotice(() => { void this.plugin.auth.login(); });
        modal.close();
        return;
      }
      if (submitRes.status >= 400) {
        new Notice(`提交失败：HTTP ${String(submitRes.status)}`, 6000);
        modal.close();
        return;
      }

      const data = submitRes.json as { submission_id?: string | number };
      if (data.submission_id == null) {
        new Notice('提交失败：服务端未返回提交编号。', 6000);
        modal.close();
        return;
      }

      const submissionId = String(data.submission_id);

      // Poll for terminal result
      const terminal = await pollSubmission({
        fetcher: throttledRequestUrl,
        submissionId,
        slug: problem.slug,
        registerInterval: (fn, ms) => setWindowTimeout(fn, ms),
        abortSignal: abort,
        headers: authHeaders(problem.slug, cookies),
      });

      // Classify and render verdict
      const t = terminal as Record<string, unknown>;
      const statusCode = typeof t.status_code === 'number' ? t.status_code : 0;
      const statusMsg = typeof t.status_msg === 'string' ? t.status_msg : undefined;
      const info = classifyStatus(statusCode, statusMsg);

      modal.renderVerdict(terminal as Parameters<typeof modal.renderVerdict>[0], problem.title);

      // Record verdict in contest session
      if (info.kind === 'ac') {
        this.plugin.contestSessionManager.recordVerdict(this.problemIdx, 'accepted');
      } else if (info.kind !== 'unknown' && info.kind !== 'unknown-lc') {
        if (problem.verdict === 'unsolved') {
          this.plugin.contestSessionManager.recordVerdict(this.problemIdx, 'attempted');
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      new Notice(`提交失败：${(err as Error).message?.slice(0, 100) ?? '未知错误'}`, 6000);
    }
  }
}
