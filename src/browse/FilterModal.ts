// src/browse/FilterModal.ts
// LeetCode-style compound filter modal. Opened from the problem browser view's
// filter icon. Produces a CompoundFilter value which is persisted via
// SettingsStore.setFilter() and applied via ProblemListService.applyCompoundFilter().
//
// Fields supported today: Status, Difficulty, Topics, Question ID range,
// Acceptance range, Premium. Language / Last Submit / Published are deferred
// (see .planning/phases/01-plugin-foundation/DEFERRED-FILTERS.md).
import { App, Modal, setIcon, Notice } from 'obsidian';
import type { CompoundFilter, FilterRule } from '../settings/SettingsStore';

/** Human-readable label for each supported field. Drives the add-field menu. */
interface FieldDef {
  key: FilterRule['field'];
  label: string;
  icon: string;
  /** Returns a fresh empty rule for this field. */
  blank: () => FilterRule;
}

const FIELD_DEFS: FieldDef[] = [
  // Icon choices mirror LC's own iconography (see user-provided screenshots).
  // `gauge` gives the speedometer used for Difficulty. Icons without a direct
  // Lucide match use the closest available primitive.
  { key: 'status',      label: '状态',      icon: 'check-square',
    blank: () => ({ field: 'status', op: 'is', values: [] }) },
  { key: 'difficulty',  label: '难度',  icon: 'gauge',
    blank: () => ({ field: 'difficulty', op: 'is', values: [] }) },
  { key: 'topics',      label: '知识点',      icon: 'tag',
    blank: () => ({ field: 'topics', op: 'is', values: [] }) },
  { key: 'question-id', label: '题号', icon: 'list-ordered',
    blank: () => ({ field: 'question-id', op: 'range', min: null, max: null }) },
  { key: 'acceptance',  label: '通过率',  icon: 'cloud',
    blank: () => ({ field: 'acceptance', op: 'range', min: null, max: null }) },
  { key: 'premium',     label: '会员',     icon: 'crown',
    // Phase 5.2 D-03 — premium now uses the multi-value shape shared with
    // status/difficulty/topics. blank rule starts with no values selected.
    blank: () => ({ field: 'premium', op: 'is', values: [] }) },
];

/** Filter fields pre-populated when the modal opens empty (matches LC's
 *  starting layout — Status, Difficulty, Topics are visible rows even before
 *  the user adds anything). Language is shown too but rendered as a disabled
 *  stub since per-problem language data is deferred to Phase 3
 *  (see .planning/phases/01-plugin-foundation/DEFERRED-FILTERS.md). */
const PREPOPULATED_FIELDS: FilterRule['field'][] = ['status', 'difficulty', 'topics'];
/** Deferred fields shown as visible-but-disabled rows to match LC's layout.
 *  Phase 5.2 D-02 — the Language entry was removed per user feedback during
 *  Phase 5.1 live smoke (per-problem language filtering is deferred indefinitely
 *  since language isn't a property of a problem in LC's data model). Exported
 *  so tests can assert the list is empty (D-02 RED shell in
 *  tests/browse/FilterModal.test.ts). */
export const DEFERRED_STUB_FIELDS: { key: string; label: string; icon: string; reason: string }[] = [];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'untouched', label: '未开始' },
  { value: 'attempted', label: '已尝试' },
  { value: 'solved',    label: '已通过' },
];

const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Easy',   label: '简单' },
  { value: 'Medium', label: '中等' },
  { value: 'Hard',   label: '困难' },
];

const PREMIUM_OPTIONS: { value: 'premium' | 'non-premium'; label: string }[] = [
  { value: 'premium',     label: '会员题目' },
  { value: 'non-premium', label: '免费题目' },
];

/** Turn a topic slug ('hash-table') into a display label ('Hash Table'). */
function formatTopicLabel(slug: string): string {
  const labels: Readonly<Record<string, string>> = {
    array: '数组', string: '字符串', 'hash-table': '哈希表', 'dynamic-programming': '动态规划',
    math: '数学', sorting: '排序', greedy: '贪心', 'depth-first-search': '深度优先搜索',
    'binary-search': '二分查找', database: '数据库', 'breadth-first-search': '广度优先搜索',
    tree: '树', matrix: '矩阵', 'two-pointers': '双指针', 'bit-manipulation': '位运算',
    'binary-tree': '二叉树', 'heap-priority-queue': '堆（优先队列）', stack: '栈',
    'prefix-sum': '前缀和', simulation: '模拟', graph: '图', design: '设计',
    backtracking: '回溯', counting: '计数', 'sliding-window': '滑动窗口',
    'linked-list': '链表', 'union-find': '并查集', 'ordered-set': '有序集合',
    'monotonic-stack': '单调栈', enumeration: '枚举', recursion: '递归',
    'divide-and-conquer': '分治', trie: '字典树', 'binary-search-tree': '二叉搜索树',
    bitmask: '状态压缩', queue: '队列', 'number-theory': '数论', 'segment-tree': '线段树',
    memoization: '记忆化搜索', geometry: '几何', 'topological-sort': '拓扑排序',
    'binary-indexed-tree': '树状数组', 'hash-function': '哈希函数', 'game-theory': '博弈',
    'shortest-path': '最短路', 'string-matching': '字符串匹配', combinatorics: '组合数学',
    'rolling-hash': '滚动哈希', 'interactive': '交互', 'data-stream': '数据流',
    'monotonic-queue': '单调队列', 'randomized': '随机化', 'merge-sort': '归并排序',
    'doubly-linked-list': '双向链表', 'probability-and-statistics': '概率与统计',
    'quickselect': '快速选择', 'bucket-sort': '桶排序', 'suffix-array': '后缀数组',
    'minimum-spanning-tree': '最小生成树', 'counting-sort': '计数排序',
    'shell': 'Shell', 'concurrency': '多线程', 'line-sweep': '扫描线',
    'eulerian-circuit': '欧拉回路', 'radix-sort': '基数排序', 'biconnected-component': '双连通分量',
    'strongly-connected-component': '强连通分量', 'rejection-sampling': '拒绝采样',
    'reservoir-sampling': '水塘抽样',
  };
  return labels[slug] ?? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Phase 5.2 D-04 — remove the `__autoDefault: true` marker from each rule
 *  before handing the draft to `onApply`. The marker is stamped onto the
 *  first-open auto-applied premium rule so `updateFilterBadge` can exclude it
 *  from the user-visible count; once the user opens the FilterModal and hits
 *  Apply (even with no edits), the marker is cleared and subsequent loads
 *  count the rule normally. Exported so tests can assert the contract
 *  directly (see tests/browse/FilterModal.test.ts Wave 0 D-04 shell). */
export function stripAutoDefaults(rules: FilterRule[]): FilterRule[] {
  return rules.map((r) => {
    const copy = { ...r } as FilterRule & { __autoDefault?: boolean };
    delete copy.__autoDefault;
    return copy as FilterRule;
  });
}

export class FilterModal extends Modal {
  private draft: CompoundFilter;
  private readonly topicSlugs: string[]; // sorted unique slugs from the cached index
  private rulesEl: HTMLElement | null = null;
  private readonly onApply: (f: CompoundFilter | null) => void;

  constructor(
    app: App,
    initial: CompoundFilter | null,
    topicSlugs: string[],
    onApply: (f: CompoundFilter | null) => void,
  ) {
    super(app);
    // Clone so edits don't mutate the caller's object until Apply is pressed.
    this.draft = initial
      ? { match: initial.match, rules: initial.rules.map((r) => ({ ...r })) }
      : { match: 'all', rules: [] };
    this.topicSlugs = [...new Set(topicSlugs)].sort();
    this.onApply = onApply;
  }

  onOpen(): void {
    this.modalEl.addClass('lc-filter-modal');
    const { contentEl } = this;
    contentEl.empty();
    // Pre-populate standard LC-style rows when the modal opens empty so the
    // user sees a consistent "always-there" set of filters. Existing rules
    // from a prior Apply are kept; missing standard fields are added as blank.
    this.ensurePrepopulated();
    this.renderMatchHeader(contentEl);
    this.rulesEl = contentEl.createDiv({ cls: 'lc-fm__rules' });
    this.renderRules();
    this.renderAddButton(contentEl);
    this.renderFooter(contentEl);
  }

  /** Ensure Status/Difficulty/Topics rules exist even if the user hasn't
   *  picked any values yet. Matches LC's starting layout (screenshot 14). */
  private ensurePrepopulated(): void {
    for (const fieldKey of PREPOPULATED_FIELDS) {
      if (!this.draft.rules.some((r) => r.field === fieldKey)) {
        const def = FIELD_DEFS.find((d) => d.key === fieldKey);
        if (def) this.draft.rules.push(def.blank());
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderMatchHeader(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__match' });
    wrap.createSpan({ text: '匹配 ' });
    // Chevron picker for All/Any so it looks like the value pickers below,
    // matching LC's uniform "everything is a dropdown" aesthetic.
    this.renderChevronSingleSelect(wrap, [
      { value: 'all', label: '全部' },
      { value: 'any', label: '任意' },
    ], this.draft.match, (next) => {
      this.draft.match = next as 'all' | 'any';
    });
    wrap.createSpan({ text: '以下筛选条件：' });
  }

  /** Small single-select chevron picker for fixed-option fields like
   *  match-mode (All/Any) and per-rule operator (is/is not). The selected
   *  value is always displayed as plain text (no pill chrome) since these
   *  pickers are inline in a sentence-like context. */
  private renderChevronSingleSelect(
    parent: HTMLElement,
    options: { value: string; label: string }[],
    current: string,
    onChange: (next: string) => void,
  ): HTMLElement {
    const picker = parent.createSpan({
      cls: 'lc-fm__picker lc-fm__picker--inline',
      attr: { role: 'button', tabindex: '0' },
    });
    const valCell = picker.createSpan({ cls: 'lc-fm__picker-val lc-fm__picker-val--inline' });
    let selected = current;
    const renderValue = (): void => {
      valCell.empty();
      const opt = options.find((o) => o.value === selected);
      valCell.setText(opt ? opt.label : '');
    };
    renderValue();
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');

    picker.addEventListener('click', () => {
      const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
      const rect = picker.getBoundingClientRect();
      const parentRect = this.contentEl.getBoundingClientRect();
      menu.setCssStyles({
        position: 'absolute',
        top: `${String(rect.bottom - parentRect.top + 4)}px`,
        left: `${String(rect.left - parentRect.left)}px`,
        minWidth: `${String(Math.max(120, rect.width))}px`,
      });
      for (const o of options) {
        const item = menu.createDiv({ cls: 'lc-fm__popover-item' });
        const check = item.createSpan({ cls: 'lc-fm__popover-check' });
        if (selected === o.value) setIcon(check, 'check');
        item.createSpan({ cls: 'lc-fm__popover-label', text: o.label });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selected = o.value;
          renderValue();
          onChange(selected);
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        });
      }
      const close = (e: MouseEvent): void => {
        if (!menu.contains(e.target as Node) && !picker.contains(e.target as Node)) {
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        }
      };
      window.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
    });
    return picker;
  }

  private renderRules(): void {
    if (!this.rulesEl) return;
    this.rulesEl.empty();
    this.draft.rules.forEach((r, i) => this.renderRule(this.rulesEl!, r, i));
    // Phase 5.2 D-02 — DEFERRED_STUB_FIELDS is now empty (Language entry
    // removed). No disabled-stub rows to render.
  }

  private renderRule(parent: HTMLElement, rule: FilterRule, idx: number): void {
    const row = parent.createDiv({ cls: 'lc-fm__rule' });
    const def = FIELD_DEFS.find((d) => d.key === rule.field);
    if (!def) return;

    // Field label with icon
    const fieldCell = row.createDiv({ cls: 'lc-fm__rule-field' });
    const iconEl = fieldCell.createSpan({ cls: 'lc-fm__rule-ficon' });
    setIcon(iconEl, def.icon);
    fieldCell.createSpan({ text: def.label });

    // Operator dropdown — varies by field
    this.renderOperator(row, rule, idx);

    // Value editor — varies by field
    this.renderValueEditor(row, rule, idx);

    // Remove button
    const rm = row.createDiv({ cls: 'lc-fm__rule-rm', attr: { 'aria-label': '删除规则' } });
    setIcon(rm, 'minus');
    rm.addEventListener('click', () => {
      this.draft.rules.splice(idx, 1);
      this.renderRules();
    });
  }

  private renderOperator(row: HTMLElement, rule: FilterRule, _idx: number): void {
    const cell = row.createDiv({ cls: 'lc-fm__rule-op' });
    if (rule.field === 'question-id' || rule.field === 'acceptance') {
      cell.setText('范围');
      return;
    }
    if (rule.field === 'premium') {
      // Phase 06 FOUND-01 — sentence-case rule (0.3.0) requires capitalized
      // first letter for UI text rendered via `setText`. The chevron picker
      // labels below stay lowercase because they're handled inside the
      // chevron component (which the rule does not currently recurse into).
      cell.setText('为');
      return;
    }
    // status / difficulty / topics → is / is-not chevron picker (matches the
    // other dropdowns in the modal; no native select chrome).
    this.renderChevronSingleSelect(cell, [
      { value: 'is',     label: 'is' },
      { value: 'is-not', label: '不是' },
    ], rule.op, (next) => {
      if (rule.field === 'status' || rule.field === 'difficulty' || rule.field === 'topics') {
        rule.op = next as 'is' | 'is-not';
      }
    });
  }

  private renderValueEditor(row: HTMLElement, rule: FilterRule, _idx: number): void {
    const cell = row.createDiv({ cls: 'lc-fm__rule-val' });
    switch (rule.field) {
      case 'status':
        this.renderMultiSelect(cell, rule, STATUS_OPTIONS);
        break;
      case 'difficulty':
        this.renderMultiSelect(cell, rule, DIFFICULTY_OPTIONS);
        break;
      case 'topics': {
        const topicOpts = this.topicSlugs.map((s) => ({ value: s, label: formatTopicLabel(s) }));
        if (topicOpts.length === 0) {
          cell.createSpan({ text: '（请先加载题库）', cls: 'lc-fm__empty-hint' });
        } else {
          this.renderMultiSelect(cell, rule, topicOpts);
        }
        break;
      }
      case 'question-id':
        this.renderRangeEditor(cell, rule, 1, 99999);
        break;
      case 'acceptance':
        this.renderRangeEditor(cell, rule, 0, 100, '%');
        break;
      case 'premium':
        // Phase 5.2 D-03 — premium now uses the shared multi-select popover
        // identical to status/difficulty/topics. Values: 'premium',
        // 'non-premium' (or both).
        this.renderMultiSelect(cell, rule, PREMIUM_OPTIONS);
        break;
    }
  }

  /** Render a multi-select with LC-style layout: inline chips like `Easy` `Med.`
   *  optionally followed by a `+N` overflow pill, right-aligned chevron that
   *  opens a checkbox popover with all choices. Matches screenshot 14. */
  private renderMultiSelect(
    parent: HTMLElement,
    rule: FilterRule & { values: string[] },
    options: { value: string; label: string }[],
  ): void {
    const picker = parent.createDiv({ cls: 'lc-fm__picker', attr: { role: 'button', tabindex: '0' } });
    const valCell = picker.createSpan({ cls: 'lc-fm__picker-val' });
    const renderValueChips = (): void => {
      valCell.empty();
      // Show up to 2 pills inline; overflow as `+N`.
      const shown = rule.values.slice(0, 2);
      const hidden = rule.values.length - shown.length;
      for (const v of shown) {
        const opt = options.find((o) => o.value === v);
        const label = opt ? opt.label : formatTopicLabel(v);
        valCell.createSpan({ cls: 'lc-fm__picker-pill', text: label });
      }
      if (hidden > 0) {
        valCell.createSpan({ cls: 'lc-fm__picker-pill lc-fm__picker-pill--more',
          text: `+${String(hidden)}` });
      }
    };
    renderValueChips();
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');

    picker.addEventListener('click', () => {
      this.openValuePopover(picker, options, rule.values, (next) => {
        rule.values = next;
        renderValueChips();
      });
    });
  }

  /** Floating checkbox menu anchored below `anchor`. Multi-select with
   *  immediate callbacks; closes on outside-click. Same pattern as the
   *  add-rule menu but with checkboxes + stay-open-on-pick. */
  private openValuePopover(
    anchor: HTMLElement,
    options: { value: string; label: string }[],
    selected: string[],
    onChange: (next: string[]) => void,
  ): void {
    const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
    const rect = anchor.getBoundingClientRect();
    const parentRect = this.contentEl.getBoundingClientRect();
    menu.setCssStyles({
      position: 'absolute',
      top: `${String(rect.bottom - parentRect.top + 4)}px`,
      left: `${String(rect.left - parentRect.left)}px`,
      minWidth: `${String(Math.max(160, rect.width))}px`,
    });

    const current = new Set(selected);
    for (const o of options) {
      const item = menu.createDiv({ cls: 'lc-fm__popover-item' });
      const check = item.createSpan({ cls: 'lc-fm__popover-check' });
      if (current.has(o.value)) setIcon(check, 'check');
      item.createSpan({ cls: 'lc-fm__popover-label', text: o.label });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (current.has(o.value)) current.delete(o.value);
        else current.add(o.value);
        // Re-render the checkmark in-place.
        check.empty();
        if (current.has(o.value)) setIcon(check, 'check');
        // Preserve option order in the `selected` list for stable display.
        onChange(options.filter((x) => current.has(x.value)).map((x) => x.value));
      });
    }

    const close = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        menu.remove();
        activeDocument.removeEventListener('click', close, true);
      }
    };
    window.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
  }

  private renderRangeEditor(
    parent: HTMLElement,
    rule: FilterRule & { min: number | null; max: number | null },
    _minBound: number,
    _maxBound: number,
    suffix = '',
  ): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__range' });
    const minInput = wrap.createEl('input', {
      attr: { type: 'number', placeholder: `最小值${suffix}`, 'aria-label': '最小值' },
    });
    if (rule.min !== null) minInput.value = String(rule.min);
    minInput.addEventListener('input', () => {
      rule.min = minInput.value === '' ? null : Number(minInput.value);
    });
    wrap.createSpan({ text: ' – ', cls: 'lc-fm__range-sep' });
    const maxInput = wrap.createEl('input', {
      attr: { type: 'number', placeholder: `最大值${suffix}`, 'aria-label': '最大值' },
    });
    if (rule.max !== null) maxInput.value = String(rule.max);
    maxInput.addEventListener('input', () => {
      rule.max = maxInput.value === '' ? null : Number(maxInput.value);
    });
  }

  // Phase 5.2 D-03 — per-field premium editor removed. The premium case in
  // renderValueEditor now routes through the shared renderMultiSelect
  // (backed by PREMIUM_OPTIONS), giving premium the same checkbox-popover UX
  // as status/difficulty/topics.

  private renderAddButton(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__add' });
    const btn = wrap.createDiv({ cls: 'lc-fm__add-btn', attr: { 'aria-label': '添加筛选规则' } });
    setIcon(btn, 'plus');
    btn.addEventListener('click', () => {
      // Offer a picker of field types not yet used (LC allows duplicates, but
      // for v1 we keep one rule per field to avoid confusing compound cases).
      const used = new Set(this.draft.rules.map((r) => r.field));
      const available = FIELD_DEFS.filter((d) => !used.has(d.key));
      if (available.length === 0) {
        new Notice('所有筛选字段都已使用。', 3000);
        return;
      }
      this.openAddMenu(btn, available);
    });
  }

  private openAddMenu(anchor: HTMLElement, fields: FieldDef[]): void {
    // Lightweight popover: a floating div anchored below the + button.
    // Closes on outside-click.
    const menu = this.contentEl.createDiv({ cls: 'lc-fm__add-menu' });
    const rect = anchor.getBoundingClientRect();
    const parentRect = this.contentEl.getBoundingClientRect();
    menu.setCssStyles({
      position: 'absolute',
      top: `${String(rect.bottom - parentRect.top + 4)}px`,
      left: `${String(rect.left - parentRect.left)}px`,
    });
    for (const f of fields) {
      const item = menu.createDiv({ cls: 'lc-fm__add-item' });
      const ic = item.createSpan({ cls: 'lc-fm__add-item-icon' });
      setIcon(ic, f.icon);
      item.createSpan({ text: f.label });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.draft.rules.push(f.blank());
        this.renderRules();
        menu.remove();
      });
    }
    // Close menu when clicking outside.
    const close = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        activeDocument.removeEventListener('click', close, true);
      }
    };
    // Defer so the current click that opened the menu doesn't also close it.
    window.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
  }

  private renderFooter(parent: HTMLElement): void {
    const footer = parent.createDiv({ cls: 'lc-fm__footer' });

    // Save as Smart List — stubbed; disabled with tooltip.
    const saveBtn = footer.createEl('button', {
      cls: 'lc-fm__save',
      attr: { disabled: 'true', title: '智能列表将在后续版本提供' },
    });
    const saveIc = saveBtn.createSpan({ cls: 'lc-fm__save-icon' });
    setIcon(saveIc, 'bookmark-plus');
    saveBtn.createSpan({ text: '保存为智能列表' });

    const rightGroup = footer.createDiv({ cls: 'lc-fm__footer-right' });

    const resetBtn = rightGroup.createEl('button', { cls: 'lc-fm__reset' });
    const resetIc = resetBtn.createSpan({ cls: 'lc-fm__reset-icon' });
    setIcon(resetIc, 'rotate-ccw');
    resetBtn.createSpan({ text: '重置' });
    resetBtn.addEventListener('click', () => {
      this.draft = { match: 'all', rules: [] };
      this.onOpen(); // full re-render
    });

    const applyBtn = rightGroup.createEl('button', {
      cls: 'lc-fm__apply mod-cta',
      text: '应用',
    });
    applyBtn.addEventListener('click', () => {
      // Phase 5.2 D-04 — strip any `__autoDefault` markers from the draft
      // rules before applying so the persisted filter only carries user-intent
      // rules. After the user hits Apply, subsequent reloads count the premium
      // rule (which previously lived as an auto-default) like any other rule.
      const cleanedRules = stripAutoDefaults(this.draft.rules);
      const cleaned: CompoundFilter | null = cleanedRules.length === 0
        ? null
        : { match: this.draft.match, rules: cleanedRules };
      this.onApply(cleaned);
      this.close();
    });
  }
}
