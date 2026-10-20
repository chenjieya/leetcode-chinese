// src/settings/SettingsTab.ts
// Phase 1 settings UI — D-09 layout verbatim; UI-SPEC.md copy + color rules LOCKED.
// All user-visible strings are LOCKED — paraphrasing is forbidden.
//
// Accent color (`var(--interactive-accent)` via the call-to-action modifier) is
// RESERVED for the primary `Log in via embedded window` button only
// (UI-SPEC.md § Color). Logout, Save cookies, and every other button in this
// file MUST remain neutral. Grep gate: exactly one invocation of the accent
// modifier in this file.
import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { AuthCookies } from '../auth/types';
import type { AIProvider, BedrockProviderConfig } from '../ai/types';
// Phase 07 Plan 04 — single source of truth for provider display names; the
// local copy of `prettyName` was moved to src/ai/types.ts so main.ts (Notice
// copy) and SettingsTab.ts (sub-form) render identical brand strings without
// duplication. 07-UI-SPEC.md §"Copywriting Contract" remains the locked spec.
import { prettyName } from '../ai/types';

// Phase 07 Plan 03 — model placeholders per provider, locked by 07-UI-SPEC.md
// §"Copywriting Contract" (Model placeholders row).
//
// Phase 08.1 Plan 02 — Bedrock joins the exhaustive switch. The placeholder
// returns '' because Bedrock's per-provider sub-form replaces the generic
// "Model" row with a dedicated "Model ID" row inside renderAIProviderForm's
// `case 'bedrock'` branch (the generic Model row is hidden when active is
// 'bedrock'). The placeholder is referenced by the generic Model row only,
// so the empty string here never reaches a UI surface for Bedrock.
function modelPlaceholder(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'claude-haiku-4-5';
    case 'openai': return 'gpt-5-mini';
    case 'openrouter': return 'anthropic/claude-haiku-4.5';
    case 'ollama': return 'llama3.2';
    case 'custom': return '';
    case 'bedrock': return '';
  }
}

// Phase 5.2 D-12 — mirrors LC's submission-language dropdown as of 2026-05-11.
// Keys = LC langSlug (the value LC accepts in /interpret_solution/ + /submit/ bodies);
// values = UI display labels. SQL dialects excluded — v1 scope is algorithm problems.
// Insertion order matches LC's own dropdown order and drives the rendered order
// because `Object.entries` preserves insertion order for string keys.
// Exported so tests/settings/SettingsTab.test.ts can pin the exact key set.
export const LANGUAGE_OPTIONS: Record<string, string> = {
  python3:    'Python3',
  python:     'Python',
  java:       'Java',
  cpp:        'C++',
  c:          'C',
  csharp:     'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php:        'PHP',
  swift:      'Swift',
  kotlin:     'Kotlin',
  dart:       'Dart',
  golang:     'Go',
  ruby:       'Ruby',
  scala:      'Scala',
  rust:       'Rust',
  racket:     'Racket',
  erlang:     'Erlang',
  elixir:     'Elixir',
};

export class LeetCodeSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LeetCodePlugin) {
    super(app, plugin);
  }

  // Compatibility fallback for Obsidian 1.12.7; newer hosts use definitions.
  display(): void {
    this.sectionContainers.clear();
    this.containerEl.empty();
    this.renderTab();
  }

  /** 使用分区定义支持 1.13+ 设置搜索，复用原控件与持久化逻辑。 */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.settingSections().map(section => ({
      name: section.name,
      aliases: section.aliases,
      render: (setting: Setting) => {
        const container = setting.settingEl;
        this.containerEl.addClass('leetcode-settings');
        container.empty();
        container.addClass('lc-settings-section');
        this.sectionContainers.set(section.name, container);
        section.render(container);
        return () => {
          if (this.sectionContainers.get(section.name) === container) {
            this.sectionContainers.delete(section.name);
          }
        };
      },
    }));
  }

  private readonly sectionContainers = new Map<string, HTMLElement>();

  private settingSections() {
    return [
      { name: '账号与登录', aliases: ["力扣中国站账号","状态","手动填写 Cookie（备用方式）","LEETCODE_SESSION","csrftoken"], render: (el: HTMLElement) => this.renderAuthSection(el) },
      { name: '笔记', aliases: ["题目目录","默认编程语言","点击行为"], render: (el: HTMLElement) => this.renderNotesSection(el) },
      { name: '代码编辑器', aliases: ["缩进大小","在代码编辑器中显示相对行号"], render: (el: HTMLElement) => this.renderEditorSection(el) },
      { name: '旧笔记迁移', aliases: ["打开时自动迁移 v1.2 笔记","保存延迟"], render: (el: HTMLElement) => this.renderMigrationSection(el) },
      { name: 'AI 解题助手', aliases: ["服务提供商","通过后自动复盘","通过后自动分类解题模式","推荐后续练习","竞赛分析","API 密钥","模型","服务地址","预算","OpenAI","DeepSeek","Ollama","AWS Bedrock"], render: (el: HTMLElement) => this.renderAISection(el) },
      { name: '知识图谱', aliases: ["自定义技巧笔记目录","通过后自动创建技巧反向链接"], render: (el: HTMLElement) => this.renderGraphSection(el) },
    ];
  }

  // Internal re-render hook used by click handlers that need to refresh the
  // tab after mutating auth/settings state. Routing through a private method
  // (instead of `this.display()`) keeps every call site off the deprecated
  // `PluginSettingTab.display` symbol while preserving the framework's
  // public `display()` contract for the initial paint.
  private renderTab(): void {
    this.containerEl.addClass('leetcode-settings');
    for (const section of this.settingSections()) {
      let container = this.sectionContainers.get(section.name);
      if (!container || !this.containerEl.contains(container)) {
        container = this.containerEl.createDiv('lc-settings-section');
        this.sectionContainers.set(section.name, container);
      }
      container.empty();
      section.render(container);
    }
  }

  private renderAuthSection(containerEl: HTMLElement): void {
    // =============================
    //   Authentication section
    // =============================
    new Setting(containerEl).setName('力扣中国站账号').setDesc('当前使用 LeetCode.cn，请登录中国站账号。国际站账号和提交记录不通用。').setHeading();

    const loggedIn = this.plugin.auth.isLoggedIn();
    const username = this.plugin.lcSettings.getUsername();
    const statusText = loggedIn
      ? `已登录：${username ?? '…'}`
      : '未登录';

    // Phase 5.2 D-01 — Status row and primary auth button merged into a single
    // Setting. Name+Desc render on the left via Obsidian's built-in
    // `.setting-item-info` flex cell; the button renders on the right via
    // `.setting-item-control`. No custom CSS required.
    //
    // Accent-modifier grep gate preserved: exactly one invocation of the
    // call-to-action modifier in this file, on the logged-out Log-in branch.
    new Setting(containerEl)
      .setName('状态')
      .setDesc(statusText)
      .addButton((b) => {
        if (loggedIn) {
          // AUTH-05: immediate logout, no confirmation modal (UI-SPEC.md § Destructive actions).
          b.setButtonText('退出登录')

            .setTooltip('退出 LeetCode 登录')
            .onClick(async () => {
              await this.plugin.auth.logout();
              this.renderTab();
            });
        } else {
          // Only button in this file that receives the call-to-action accent modifier.
          b.setButtonText('通过内嵌窗口登录')
            .setCta()
            .onClick(async () => {
              await this.plugin.auth.login();
              this.renderTab();
            });
        }
      });

    // =============================
    //   Manual cookie (fallback) — D-05 first-class, inside Auth section per D-09
    // =============================
    let sessionVal = '';
    let csrfVal = '';

    new Setting(containerEl)
      .setName('手动填写 Cookie（备用方式）')
      .setDesc('如果内嵌登录窗口无法使用，请粘贴力扣中国站会话 Cookie。')
      .setHeading()
      .addButton((b) => {
        b.setIcon('save')
          .setTooltip('保存 Cookie')
          .onClick(async () => {
            const session = sessionVal.trim();
            const csrf = csrfVal.trim();
            if (!session || !csrf) {
              new Notice('两个字段都必须填写。', 3000);
              return;
            }
            const cookies: AuthCookies = {
              LEETCODE_SESSION: session,
              csrftoken: csrf,
            };
            await this.plugin.auth.loginManual(cookies);
            this.renderTab();
          });
        b.buttonEl.addClass('clickable-icon');
      });

    const cookieGroup = containerEl.createDiv('lc-settings-group');
    new Setting(cookieGroup)
      .setName('LEETCODE_SESSION')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { sessionVal = v; });
      });

    new Setting(cookieGroup)
      .setName('csrftoken')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { csrfVal = v; });
      });
  }

  private renderNotesSection(containerEl: HTMLElement): void {
    // =============================
    //   Notes section
    // =============================
    new Setting(containerEl).setName('笔记').setHeading();

    const notesGroup = containerEl.createDiv('lc-settings-group');
    new Setting(notesGroup)
      .setName('题目目录')
      .setDesc('用于保存题目笔记的知识库目录。')
      .addText((t) => t
        .setPlaceholder('输入题目目录')
        .setValue(this.plugin.lcSettings.getProblemsFolder())
        .onChange(async (v) => {
          // D-10: strip trailing slash on persist (stored without trailing slash).
          await this.plugin.lcSettings.setProblemsFolder(v.replace(/\/+$/, ''));
        }),
      );

    new Setting(notesGroup)
      .setName('默认编程语言')
      .setDesc('新题目初始代码使用的编程语言。')
      .addDropdown((d) => d
        .addOptions(LANGUAGE_OPTIONS)
        .setValue(this.plugin.lcSettings.getDefaultLanguage())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setDefaultLanguage(v);
        }),
      );

    new Setting(notesGroup)
      .setName('点击行为')
      .setDesc('点击题目时执行的操作；按住 shift 点击始终直接打开笔记。')
      .addDropdown((d) => d
        .addOption('preview', '先预览题目')
        .addOption('open', '直接打开笔记')
        .setValue(this.plugin.lcSettings.getPreviewClickBehavior())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setPreviewClickBehavior(v as 'preview' | 'open');
        }),
      );
  }

  private renderEditorSection(containerEl: HTMLElement): void {
    // =============================
    //   Code editor section (Phase 16 INDENT-04 D-06)
    // =============================
    // User-visible override for the code-editor indent unit. 'auto' defers to
    // the per-language default (4 for Java/Python/C/C++/Rust, 2 for JS/TS,
    // tab for Go); a numeric literal forces that many spaces for every
    // language EXCEPT Go (gofmt non-negotiable; exception lives in the
    // consumer at childEditorLanguage.ts:effectiveIndent).
    //
    // Four-option dropdown using addOption(value, label) chain (NOT
    // addOptions Record literal) per the locked precedent for explicit-order
    // dropdowns in this file (Preview section). Dropdown values are strings
    // in Obsidian's API; coerce back to 'auto' | 2 | 4 | 8 in onChange.
    new Setting(containerEl).setName('代码编辑器').setHeading();

    const codeEditorGroup = containerEl.createDiv('lc-settings-group');
    new Setting(codeEditorGroup)
      .setName('缩进大小')
      .setDesc('代码编辑器每级缩进的空格数。“自动”使用语言默认值：Java、Python、C++ 为 4，JS、TS 为 2，Go 使用制表符。')
      .addDropdown((d) => d
        .addOption('auto', '自动（使用语言默认值）')
        .addOption('2', '2 spaces')
        .addOption('4', '4 spaces')
        .addOption('8', '8 spaces')
        .setValue(String(this.plugin.lcSettings.getIndentSizeOverride()))
        .onChange(async (v) => {
          const val: 'auto' | 2 | 4 | 8 =
            v === '2' ? 2 :
            v === '4' ? 4 :
            v === '8' ? 8 :
            'auto';
          await this.plugin.lcSettings.setIndentSizeOverride(val);
          // Live-apply: fan out to every mounted widget so the new
          // indent unit takes effect without needing to reopen notes.
          // Mirrors the `applyDelay` pattern used by 'Save delay' below.
          this.plugin.widgetRegistry?.applyIndentReconfigure(val);
        }),
      );

    new Setting(codeEditorGroup)
      .setName('在代码编辑器中显示相对行号')
      .setDesc('显示各行与光标所在行的距离，下次打开笔记时生效。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.lcSettings.getShowRelativeLineNumbers())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setShowRelativeLineNumbers(v);
        }),
      );

    // Phase 22 (D-settings-01) — `useInlineWidget` / `useNestedEditor`
    // toggles retired with the v1.2 path. The v1.3 inline widget is the only
    // mount path and migration runs unconditionally on file open.
  }

  private renderMigrationSection(containerEl: HTMLElement): void {
    // =============================
    //   Migration section
    // =============================
    new Setting(containerEl).setName('旧笔记迁移').setHeading();

    const expGroup = containerEl.createDiv('lc-settings-group');

    // Phase 21 MIGRATE-06 — auto-migrate v1.2 notes when opened. Default ON
    // (D-auto-01). When OFF, the widget mount path renders a legacy banner
    // with a [Migrate now] CTA (D-auto-02). Live-applies: no reload required
    // because the next file-open consults the setting fresh from
    // SettingsStore. The onChange handler ONLY persists; never triggers
    // workspace.detachLeavesOfType or any reload path.
    new Setting(expGroup)

      .setName('打开时自动迁移 v1.2 笔记')
      .setDesc('打开旧版题目笔记时自动转换为 v1.3 代码块格式；关闭后可通过迁移提示手动执行。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.lcSettings.getAutoMigrateOnOpen())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setAutoMigrateOnOpen(v);
          // No reload needed — live-applies on next file open.
        }),
      );

    new Setting(expGroup)
      .setName('保存延迟')
      .setDesc('停止输入后等待多久保存到磁盘；时间越短保存越及时，时间越长文件事件越少。')
      .addDropdown((d) => d
        .addOption('300', '300ms')
        .addOption('400', '400ms (default)')
        .addOption('500', '500ms')
        .addOption('1000', '1s')
        .addOption('2000', '2s')
        .setValue(String(this.plugin.lcSettings.getWidgetSyncDebounceMs()))
        .onChange(async (v) => {
          const val: 300 | 400 | 500 | 1000 | 2000 =
            v === '300' ? 300 :
            v === '500' ? 500 :
            v === '1000' ? 1000 :
            v === '2000' ? 2000 :
            400;
          await this.plugin.lcSettings.setWidgetSyncDebounceMs(val);
          // Phase 19 Plan 02 — live-apply across all live widgets without
          // note reload (D-08). No-op when no widgets registered.
          this.plugin.widgetRegistry?.applyDelay(val);
        }),
      );
  }

  private renderAISection(containerEl: HTMLElement): void {
    // =============================
    //   AI section (Phase 07 Plan 03 — AIPROV-01 / AIPROV-02)
    // =============================
    // Active-provider dropdown swaps the visible sub-form. When activeAIProvider
    // is null only the dropdown row renders (07-UI-SPEC §"Layout Contract").
    // All copy LOCKED VERBATIM from 07-UI-SPEC §"Copywriting Contract" — every
    // provider name, description, placeholder string, and Notice text must
    // match the spec byte-for-byte. The Test connection button delegates to
    // the shared plugin-level probe path (shared with the palette
    // command); Plan 07-05 will wrap probe() with the disclosure gate.
    //
    // Color/CTA invariant (07-UI-SPEC §"Color"): exactly ONE setCta() in this
    // file (the pre-existing Login button at line ~86). The AI section adds
    // ZERO setCta() calls — the Test connection button stays neutral. The
    // disclosure modal's Continue button (Plan 07-05) will be the only new
    // setCta() invocation in v1.1, in src/ai/disclosure.ts.
    const active = this.plugin.lcSettings.getActiveAIProvider();
    const aiEnabled = active !== null;

    new Setting(containerEl).setName('AI 解题助手').setHeading()
      .setDesc('使用 AI 辅助调试、复盘和解题模式分类。')
      .addButton((b) => {
        b.setIcon('refresh-cw')
          .setTooltip('测试连接')
          .onClick(async () => {
            b.setIcon('loader');
            b.setDisabled(true);
            try {
              await this.plugin.testActiveAIConnection();
            } finally {
              b.setIcon('refresh-cw');
              b.setDisabled(false);
            }
          });
        b.buttonEl.addClass('clickable-icon');
      })
      .addToggle((toggle) => toggle
        .setValue(aiEnabled)
        .onChange(async (value) => {
          if (value) {
            await this.plugin.lcSettings.setActiveAIProvider('anthropic');
          } else {
            await this.plugin.lcSettings.setActiveAIProvider(null);
          }
          this.renderTab();
        }),
      );

    if (aiEnabled) {
      const aiConnGroup = containerEl.createDiv('lc-settings-group');

      new Setting(aiConnGroup)
        .setName('服务提供商')
        .setDesc('切换服务提供商时保留已填写的密钥。')
        .addDropdown((d) => d
          .addOption('anthropic',  'Anthropic')
          .addOption('openai',     'OpenAI')
          .addOption('openrouter', 'OpenRouter')
          .addOption('ollama',     'Ollama')
          .addOption('custom',     '自定义（兼容 OpenAI）')
          .addOption('bedrock',    'AWS Bedrock')
          .setValue(active)
          .onChange(async (v) => {
            await this.plugin.lcSettings.setActiveAIProvider(v as AIProvider);
            this.renderTab();
          }),
        );

      this.renderAIProviderForm(aiConnGroup, active);

      const aiFeatGroup = containerEl.createDiv('lc-settings-group');

      new Setting(aiFeatGroup)
        .setName('通过后自动复盘')
        .setDesc('每次通过后分析解题思路、效率和代码风格。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIReviewOnAC())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIReviewOnAC(value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('通过后自动分类解题模式')
        .setDesc('将解答归类到算法模式并维护汇总笔记。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIKnowledgeGraph())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIKnowledgeGraph(value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('推荐后续练习')
        .setDesc('在汇总笔记中推荐相同模式下尚未完成的题目。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getFeatureFlags().lookAheadEdges)
          .onChange(async (value) => {
            await this.plugin.lcSettings.setFeatureFlag('lookAheadEdges', value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('竞赛分析')
        .setDesc('模拟竞赛结束时生成表现总结。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIContestAnalysis())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIContestAnalysis(value);
          }),
        );
    }
  }

  private renderGraphSection(containerEl: HTMLElement): void {
    // =============================
    //   Knowledge Graph section (Phase 5 POLISH-01 D-14)
    // =============================
    // D-17: no Advanced / collapsible section — always visible.
    // Accent-modifier grep-gate preserved: no call-to-action modifier in
    // this block (the single accent invocation is the Authentication login
    // button above — see the top-of-file grep gate).
    new Setting(containerEl).setName('知识图谱').setHeading();

    const kgGroup = containerEl.createDiv('lc-settings-group');
    // D-15: technique folder visible override with derived default. Placeholder
    // is computed LIVE from the current `problemsFolder` setting so users see
    // e.g. `LeetCode/techniques` when no override is set, their typed value
    // otherwise. Empty value preserves Phase 4 derived-default behavior.
    new Setting(kgGroup)
      .setName('自定义技巧笔记目录')
      .setDesc('主题标签技巧笔记的保存目录，留空时使用题目目录下的 techniques。AI 模式汇总保存在 patterns 中，不受此设置影响。')
      .addText((t) => t
        .setPlaceholder(`${this.plugin.lcSettings.getProblemsFolder()}/techniques`)
        .setValue(this.plugin.lcSettings.getTechniquesFolderOverride())
        .onChange(async (v) => {
          // Phase 4 convention — UI layer owns trailing-slash sanitization.
          await this.plugin.lcSettings.setTechniquesFolderOverride(
            v.trim().replace(/[\\/]+$/, ''),
          );
        }),
      );

    // D-16 / D-32: auto-backlink toggle (behavior-first copy LOCKED).
    // Bound to the Phase 4 D-21 persistence field.
    new Setting(kgGroup)
      .setName('通过后自动创建技巧反向链接')

      .setDesc('开启后，提交通过时自动更新“解题技巧”和关联笔记；使用 AI 分类还需开启“通过后自动分类解题模式”。关闭后仅更新题目状态和标签，保留已有内容。')
      .addToggle((t) => t
        .setValue(this.plugin.lcSettings.getAutoBacklinksEnabled())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setAutoBacklinksEnabled(v);
        }),
      );
  }

  /**
   * Phase 07 Plan 03 — render the per-provider sub-form for the active
   * AIProvider. Provider-conditional rendering matrix (07-UI-SPEC §Layout):
   *
   *   anthropic | openai | openrouter   API key + Base URL (read-only desc)
   *                                       + Model + Test connection
   *   ollama                            Base URL (editable) + Model
   *                                       + Test connection (NO API key row)
   *   custom                            API key + Base URL (editable, empty
   *                                       w/ placeholder) + Model
   *                                       + Test connection
   *
   * Test connection delegates to the plugin-level probe entry point; the
   * button label flips to 'Testing...' and is disabled while a probe is in
   * flight per 07-UI-SPEC §"Test connection — debouncing".
   */
  private renderAIProviderForm(containerEl: HTMLElement, active: AIProvider): void {
    const cfg = this.plugin.lcSettings.getProviderConfig(active);
    const providerName = prettyName(active);

    // ─── API key row (omitted for Ollama and Bedrock) ────────────────────
    // Phase 08.1 Plan 02 — Bedrock skips the standard API key row because
    // its 4-mode auth dropdown (default-chain / access-keys / sso-profile /
    // api-key) renders mode-specific secret rows below. Ollama remains
    // skip-listed (Phase 07 — local Ollama has no API key).
    if (active !== 'ollama' && active !== 'bedrock') {
      new Setting(containerEl)
        .setName('API 密钥')
        .setDesc(`以明文保存在本机插件的 data.json 中，仅发送给 ${providerName}。`)
        .addText((t) => {
          t.inputEl.type = 'password';
          t.inputEl.addClass('lc-ai-input');
          t.setPlaceholder('sk-…');
          t.setValue(cfg.apiKey);
          t.onChange(async (v) => {
            // Re-read the latest cfg so concurrent edits to other fields in
            // the same render frame don't get clobbered (defensive — the
            // re-render on dropdown change drops the closure anyway).
            const current = this.plugin.lcSettings.getProviderConfig(active);
            await this.plugin.lcSettings.setProviderConfig(active, { ...current, apiKey: v });
          });
        });
    }

    // ─── Base URL row ────────────────────────────────────────────────────
    switch (active) {
      case 'anthropic':
      case 'openai':
      case 'openrouter': {
        // Read-only: render the canonical URL inline in the desc text. No
        // input field — UI-SPEC §Layout Contract specifies the URL displays
        // as descriptive text.
        new Setting(containerEl)
          .setName('接口地址')
          .setDesc(`服务地址（只读）：${cfg.baseUrl}`);
        break;
      }
      case 'ollama': {
        new Setting(containerEl)
          .setName('接口地址')
          .setDesc('Ollama 主机和端口，默认为 localhost:11434，可修改为其他主机。')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active);
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
      case 'custom': {
        new Setting(containerEl)
          .setName('接口地址')
          .setDesc('兼容 OpenAI 协议的服务地址；如果服务要求，请包含 /v1 后缀。')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setPlaceholder('https://your-host.example.com/v1');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active);
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
      case 'bedrock': {
        // Phase 08.1 Plan 02 — Bedrock-specific sub-form per CONTEXT
        // decision B + 08.1-PATTERNS.md "Plan 08.1-02 #src/settings/SettingsTab.ts".
        // Renders Region + Model ID + Auth method dropdown + conditional
        // secret rows in place of Base URL/Model rows. The 4-mode dropdown
        // calls this.renderTab() onChange so the conditional rows re-render
        // atomically — Pitfall 10 invariant: switching authMethod ONLY
        // changes which rows render, never which fields are stored.
        const bcfg = cfg as BedrockProviderConfig;

        // Region row (text input, default 'us-east-1').
        new Setting(containerEl)
          .setName('区域')
          .setDesc('Bedrock 运行时所在的 AWS 区域，默认为 us-east-1。')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setPlaceholder('us-east-1');
            t.setValue(bcfg.region);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, region: v });
            });
          });

        // Model ID row (replaces the generic Model row for Bedrock).
        new Setting(containerEl)
          .setName('模型 ID')
          .setDesc('Bedrock 模型标识，例如 us.anthropic.claude-sonnet-4-6。')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(bcfg.modelId);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, modelId: v });
            });
          });

        // Auth method dropdown — onChange triggers a re-render so the
        // conditional secret rows below swap atomically.
        new Setting(containerEl)
          .setName('凭据来源')
          .setDesc('插件调用 Bedrock 时获取 AWS 凭据的方式。')
          .addDropdown((d) => d
            .addOption('default-chain', '默认凭据链（推荐）')
            .addOption('access-keys',   '手动填写访问密钥')
            .addOption('sso-profile',   '配置名称')
            .addOption('api-key',       'Bedrock API 密钥')
            .setValue(bcfg.authMethod)
            .onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, {
                ...current,
                authMethod: v as BedrockProviderConfig['authMethod'],
              });
              // Re-render so the conditional secret rows for the newly-active
              // mode appear atomically. Pitfall 10 invariant: this only
              // changes which rows RENDER — `current` (and the persisted
              // config) keeps every secret field byte-for-byte intact.
              this.renderTab();
            }),
          );

        // Conditional secret rows — only the active mode's rows render, but
        // ALL secret fields stay PERSISTED in data.json (Pitfall 10).
        if (bcfg.authMethod === 'default-chain') {
          // Helper-text-only row — no input.
          new Setting(containerEl)
            .setName('凭据来源')
            .setDesc('优先读取 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 环境变量，其次读取 ~/.aws/credentials 和 ~/.aws/config 中 AWS_PROFILE、AWS_DEFAULT_PROFILE 或 default 配置。支持 credential_process 以及 AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE 指定的路径。使用 SSO 时，请在启动 Obsidian 前执行 aws sso login。');
        } else if (bcfg.authMethod === 'access-keys') {
          new Setting(containerEl)
            .setName('访问密钥 ID')
            .setDesc('AWS 访问密钥 ID，以明文保存在本机 data.json 中。')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.accessKeyId ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, accessKeyId: v });
              });
            });
          new Setting(containerEl)
            .setName('私有访问密钥')
            .setDesc('AWS 私有访问密钥，以明文保存在本机 data.json 中。')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.secretAccessKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, secretAccessKey: v });
              });
            });
          new Setting(containerEl)
            .setName('会话令牌')
            .setDesc('仅使用临时 STS 凭据时需要填写。')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.sessionToken ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, sessionToken: v });
              });
            });
        } else if (bcfg.authMethod === 'sso-profile') {
          new Setting(containerEl)
            .setName('配置名称')
            .setDesc('填写 ~/.aws/credentials 或 ~/.aws/config 中的配置名称，无需另行设置 AWS_PROFILE。支持 aws-vault、awsume 等 credential_process 辅助程序。')
            .addText((t) => {
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.ssoProfile ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, ssoProfile: v });
              });
            });
        } else if (bcfg.authMethod === 'api-key') {
          new Setting(containerEl)
            .setName('Bedrock API 密钥')
            .setDesc('在 AWS 控制台的 IAM > Users > Service-specific credentials 中创建 Bedrock 长期 API 密钥。密钥以明文保存在本机插件的 data.json 中。')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.bedrockApiKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, bedrockApiKey: v });
              });
            });
        }
        break;
      }
    }

    // ─── Model row (all providers EXCEPT Bedrock — Bedrock uses Model ID) ─
    // Phase 08.1 Plan 02 — Bedrock's case branch above already rendered a
    // dedicated "Model ID" row, so we skip the generic Model row when
    // active === 'bedrock' to avoid duplicate input rows. The Model ID row
    // writes to cfg.modelId; the generic row writes to cfg.model (which is
    // unused for Bedrock).
    if (active !== 'bedrock') {
      new Setting(containerEl)
        .setName('模型')
        .setDesc('填写服务提供商支持的模型标识。如果连接测试提示找不到模型，请更新此字段。')
        .addText((t) => {
          t.inputEl.addClass('lc-ai-input');
          t.setPlaceholder(modelPlaceholder(active));
          t.setValue(cfg.model);
          t.onChange(async (v) => {
            const current = this.plugin.lcSettings.getProviderConfig(active);
            await this.plugin.lcSettings.setProviderConfig(active, { ...current, model: v });
          });
        });
    }

  }
}
