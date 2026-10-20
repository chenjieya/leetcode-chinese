// src/ai/disclosure.ts
//
// Phase 07 Plan 05 AIPROV-04 — once-per-provider-switch disclosure modal +
// shared willSend/neverSends copy constant. CONTEXT.md decision D + 07-UI-SPEC
// §"Disclosure modal — verbatim copy".
//
// The gate that wraps AIClient.probe() / AIClient.invoke() lives on
// LeetCodePlugin (`requireAIDisclosure`) — see Task 2. This file is UI-only:
// the Modal class + the shared base copy that downstream phases extend.
//
// Phase 08/09/11 each append a feature-specific bullet to
// DISCLOSURE_BASE_COPY.willSend before any AIClient call site reads it
// (07-RESEARCH §"Open Question 8" + 07-PATTERNS Pattern 4). The constant is
// intentionally NOT frozen so future plans can mutate it; the per-test
// invariant in tests/ai/disclosure.test.ts asserts the Phase-07 baseline
// shape.
//
// Strict no-HTML-string-injection discipline (eslint-plugin-obsidianmd
// anti-pattern + CLAUDE.md project rule): every DOM node is built via
// `createEl` / `Setting.addButton`. No HTML strings, no script-parsing
// sinks. Bundle delta target: < 1 KB per 07-UI-SPEC §"Bundle constraint".
//
// Color contract (07-UI-SPEC §"Color"): Continue button gets `setCta()` —
// the ONLY new accent invocation across the entire src/ tree in v1.1.
// Cancel button stays neutral; Esc / X / overlay-click all converge through
// `onClose()` which fires `onCancel()` if `acknowledged === false`.

import { App, Modal, Setting } from 'obsidian';
import type { AIProvider, ProviderConfig } from './types';
import { prettyName } from './types';
// Phase 08.1 Plan 02 — per-provider display URL helper. Bedrock substitutes
// region into the regional endpoint format; other providers return cfg.baseUrl
// verbatim (no behavior change for the existing 5 providers).
import { getDisplayBaseUrl } from './displayBaseUrl';

/**
 * Shared disclosure copy. Locked verbatim from 07-UI-SPEC §"Disclosure modal
 * — verbatim copy". Phase 07 itself ships only the base 4-entry willSend +
 * 4-entry neverSends list.
 *
 * Phase 07 Plan 07 (WR-02 mitigation): Object.freeze applied at module load
 * — outer object AND both inner arrays are frozen. Mutation attempts throw
 * in strict mode (vitest default), preventing the data-race hazard
 * documented in 07-REVIEW.md WR-02 (concurrent modal renders sharing the
 * same live arrays).
 *
 * Future-phase extension contract (supersedes 07-PATTERNS.md Pattern 4
 * mutation pattern): Phase 08/09/11 must extend the disclosure copy via
 * COMPOSITION rather than mutation. Construct a new object that spreads
 * the base entries and appends the phase-specific bullet, then pass the
 * new object to AIDisclosureModal as a constructor arg (or expose a
 * factory like `withExtraBullet(base, line)`). Mutation attempts on
 * DISCLOSURE_BASE_COPY.willSend / .neverSends will throw — this is
 * intentional and load-bearing for the WR-02 mitigation.
 *
 * The shape and verbatim base entries are asserted by
 * tests/ai/disclosure.test.ts so a typo in any phase is caught at CI time.
 */
export const DISCLOSURE_BASE_COPY: { willSend: readonly string[]; neverSends: readonly string[] } = {
  willSend: Object.freeze([
    '题目内容（题面、示例和约束条件）',
    '你的“代码”章节内容',
    '最近一次运行或提交结果，以及失败用例（如有）',
    '你的“笔记”章节内容（仅在你为相应功能明确启用时发送）',
  ]),
  neverSends: Object.freeze([
    '当前笔记之外的知识库文件路径',
    '名称不以 lc- 开头的笔记属性',
    '知识库中的其他内容',
    '任何遥测数据',
  ]),
};
// Order matters: inner arrays already frozen via Object.freeze inline above;
// freeze the outer object last so the type-system view of the constant
// stays consistent (export const + Object.freeze on a literal-shaped object
// gives both the readonly typing and the runtime immutability).
Object.freeze(DISCLOSURE_BASE_COPY);

/**
 * Phase 08 Plan 03 Task 1 — `withDebugBullet` composition factory that
 * appends the AI Debug feature-specific bullet to a frozen base disclosure
 * copy. Mandatory composition pattern (08-UI-SPEC §"Disclosure copy
 * extension" + 08-PATTERNS Pattern 5): NEVER mutate the base in place — the
 * inner arrays are `Object.freeze`'d at module load (Phase 07 Plan 07 WR-02
 * mitigation), and an in-place append would throw in strict mode at runtime.
 *
 * `withDebugBullet` returns a FRESH object whose `willSend` is a NEW array
 * (not a reference to the base) ending with the locked verbatim AI Debug
 * bullet. The `neverSends` field passes through by reference equality —
 * both arrays are frozen, no copy needed.
 *
 * The bullet text is locked verbatim per 08-UI-SPEC §"Disclosure copy
 * extension" — the parenthetical `(input, expected output, your output,
 * error message)` is load-bearing (it documents exactly which LastVerdict
 * fields ship to the provider, and is the user's defense-in-depth contract
 * for what AI Debug sends beyond the base willSend bullets).
 *
 * Phase 09 + Phase 11 will mirror this factory shape (`withReviewBullet`,
 * `withKgBullet`) — siblings live in this file alongside the base constant.
 */
export function withDebugBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  // Spread (not in-place mutation) is the locked composition pattern. See
  // the JSDoc above `withDebugBullet` for the WR-02 frozen-base contract.
  return {
    willSend: [
      ...base.willSend,
      'AI 调试还会发送本题最近一次失败的运行或提交结果（输入、预期输出、你的输出和错误信息）',
    ],
    neverSends: base.neverSends,
  };
}

/**
 * Phase 09 Plan 01 Task 3 — `withReviewBullet` composition factory that
 * appends the AI Review feature-specific bullet to a frozen base disclosure
 * copy. Mandatory composition pattern (mirrors `withDebugBullet` above):
 * NEVER mutate the base in place — the inner arrays are `Object.freeze`'d at
 * module load (Phase 07 Plan 07 WR-02 mitigation).
 *
 * `withReviewBullet` returns a FRESH object whose `willSend` is a NEW array
 * (not a reference to the base) ending with the locked verbatim AI Review
 * bullet. The `neverSends` field passes through by reference equality —
 * both arrays are frozen, no copy needed.
 *
 * The bullet text is locked verbatim per D-10 — describes exactly what
 * AI Review sends to the provider (problem statement + accepted solution code).
 */
export function withReviewBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI 复盘会发送题目内容和你已通过的解答代码',
    ],
    neverSends: base.neverSends,
  };
}

/**
 * Phase 10 Plan 01 Task 1 — `withContestAnalysisBullet` composition factory
 * that appends the AI Contest Analysis feature-specific bullet to a frozen
 * base disclosure copy. Mandatory composition pattern (mirrors
 * `withDebugBullet` / `withReviewBullet` above): NEVER mutate the base in
 * place — the inner arrays are `Object.freeze`'d at module load (Phase 07
 * Plan 07 WR-02 mitigation).
 *
 * `withContestAnalysisBullet` returns a FRESH object whose `willSend` is a
 * NEW array (not a reference to the base) ending with the locked verbatim
 * AI Contest Analysis bullet (D-22). The `neverSends` field passes through
 * by reference equality — both arrays are frozen, no copy needed.
 */
export function withContestAnalysisBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      '竞赛分析会发送竞赛信息和各题摘要（题目标识、难度、判题结果、耗时和你的代码）',
    ],
    neverSends: base.neverSends,
  };
}

/**
 * Phase 11 Plan 01 Task 2 — `withKgBullet` composition factory that
 * appends the AI Knowledge Graph feature-specific bullet to a frozen base
 * disclosure copy. Mandatory composition pattern (mirrors `withDebugBullet` /
 * `withReviewBullet` / `withContestAnalysisBullet` above): NEVER mutate the
 * base in place — the inner arrays are `Object.freeze`'d at module load
 * (Phase 07 Plan 07 WR-02 mitigation).
 *
 * `withKgBullet` returns a FRESH object whose `willSend` is a NEW array
 * (not a reference to the base) ending with the locked verbatim AI Knowledge
 * Graph bullet. The `neverSends` field passes through by reference equality —
 * both arrays are frozen, no copy needed.
 *
 * The bullet text is locked verbatim per D-03 — describes exactly what
 * AI Knowledge Graph sends to the provider (problem statement + accepted code
 * for pattern classification).
 */
export function withKgBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI 知识图谱会发送题目内容和你已通过的代码，用于解题模式分类',
    ],
    neverSends: base.neverSends,
  };
}

/**
 * Once-per-provider-switch disclosure modal. Fired by
 * `LeetCodePlugin.requireAIDisclosure` (see src/main.ts) when the active
 * provider's `disclosureAcknowledged` flag is false. Continue persists the
 * flag via SettingsStore.setProviderConfig (handled by the caller); Cancel
 * leaves the flag false so the modal re-fires on the next call.
 *
 * Lifecycle:
 *   - `onOpen()` builds the DOM via createEl + Setting.addButton.
 *   - Continue click sets `acknowledged = true`, fires `onContinue`, closes.
 *   - Cancel click fires `onCancel`, closes.
 *   - `onClose()` (Esc / X / overlay-click) fires `onCancel` if and only if
 *     `acknowledged === false` — this is what makes Esc-as-cancel safe
 *     against double-fire after a Continue+close sequence.
 */
export class AIDisclosureModal extends Modal {
  /**
   * `acknowledged === true` means the user clicked Continue — the disclosure
   * gate may persist `disclosureAcknowledged: true` and let the AI call
   * proceed.
   *
   * `decided === true` means the user made ANY explicit choice (Continue OR
   * Cancel button click). The Esc/X/overlay-click fallback in onClose() fires
   * `onCancel` only when `decided === false`, preventing double-fire when
   * Cancel's click handler already invoked `onCancel` and then triggered
   * close() → onClose().
   */
  private acknowledged = false;
  private decided = false;

  constructor(
    app: App,
    private provider: AIProvider,
    private cfg: ProviderConfig,
    private onContinue: () => void,
    private onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-ai-disclosure');
    // Locked verbatim — 07-UI-SPEC §"Disclosure modal — verbatim copy".

    titleEl.setText(`数据发送确认：即将发送至 ${prettyName(this.provider)}`);

    // Phase 08.1 Plan 02 — route through getDisplayBaseUrl so Bedrock renders
    // the region-substituted regional endpoint (`https://bedrock-runtime.{region}.amazonaws.com`)
    // instead of cfg.baseUrl (which is unused / empty for Bedrock). Other
    // providers return cfg.baseUrl verbatim — no visible behavior change.
    const baseUrlText =
      getDisplayBaseUrl(this.provider, this.cfg) || '（尚未配置服务地址）';
    contentEl.createEl('p', {

      text: `当前服务提供商：${prettyName(this.provider)} — ${baseUrlText}`,
    });


    contentEl.createEl('p', { text: '使用 AI 功能时可能发送以下内容：' });
    const willList = contentEl.createEl('ul');
    for (const line of DISCLOSURE_BASE_COPY.willSend) {
      willList.createEl('li', { text: line });
    }


    contentEl.createEl('p', { text: '插件不会发送以下内容：' });
    const neverList = contentEl.createEl('ul');
    for (const line of DISCLOSURE_BASE_COPY.neverSends) {
      neverList.createEl('li', { text: line });
    }

    // Action buttons: Cancel first (deliberate friction — Enter on a freshly
    // opened modal must NOT auto-acknowledge per UI-SPEC §"Layout Contract").
    new Setting(contentEl)
      .addButton((b) =>
        b

          .setButtonText('取消')
          .onClick(() => {
            this.decided = true;
            this.onCancel();
            this.close();
          }),
      )
      .addButton((b) =>
        b
          // Locked verbatim — 07-UI-SPEC §"Color" + §"Disclosure modal — verbatim copy".
          // The ONLY new setCta() invocation across the src/ tree in v1.1.

          .setButtonText('我已了解，继续')
          .setCta()
          .onClick(() => {
            this.acknowledged = true;
            this.decided = true;
            this.onContinue();
            this.close();
          }),
      );
  }

  onClose(): void {
    // Esc / X / overlay-click semantics: if the user closed without making
    // an explicit choice (no button click), fire onCancel. The `decided`
    // guard prevents double-fire when Cancel's own click handler already
    // invoked onCancel and then called close() → onClose(). The
    // `acknowledged` flag is checked first because Continue+close MUST never
    // route through the cancel path (defence in depth — `decided` already
    // covers it, but the explicit acknowledged check is the load-bearing
    // T-07-04 mitigation).
    if (!this.acknowledged && !this.decided) {
      try {
        this.onCancel();
      } catch {
        /* swallow — onCancel must never bubble out of onClose */
      }
    }
    this.contentEl.empty();
  }
}
