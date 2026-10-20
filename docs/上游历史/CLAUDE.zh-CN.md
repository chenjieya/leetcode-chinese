# Obsidian LeetCode 项目说明与协作规则

> 文档格式遵循 [md-output 规范](C:/Users/admin/.agents/skills/md-output/SKILL.md)。本文为原英文文件的中文翻译，保留原有技术结论、版本信息和规则；历史调研内容不代表当前源码状态。

[TOC]

---

## 修订记录

| 编号 | 版本 | 修订人 | 修订内容 | 日期 |
|:--:|:--|:--:|:--|:--|
| 001 | 1.0 | jie.chen | 将原英文项目说明与协作规则翻译为中文，保留技术标识及 GSD 标记 | 2026-10-20 |

---

<!-- GSD:project-start source:PROJECT.md -->
## 1. 项目概述

**Obsidian LeetCode**

这是一个 Obsidian 社区插件：获取 LeetCode 题目，让用户无需离开 Obsidian 就能编写和提交解答，并将每道已解决的题目转化为知识库中相互链接的笔记。项目受 vscode-leetcode 启发，充分利用 Obsidian 的标签、反向链接和知识图谱能力，让刷题过程逐步积累成个人可检索的解题技巧与模式资料库。

**核心价值：** 每解决一道 LeetCode 题目，就在 Obsidian 知识库中形成一篇带标签、链接且易于查找的笔记，让练习积累成知识图谱，而不是零散的代码文件。

### 1.1 约束

- **平台：** v1 仅支持桌面端 Obsidian（macOS、Windows、Linux），移动端暂缓。
- **目标站点：** v1 仅支持 leetcode.com，leetcode.cn 暂缓。
- **技术栈：** 使用 TypeScript 开发 Obsidian 插件，遵循官方插件 API 和社区指南，以便提交插件商店审核。
- **依赖：** 优先使用维护良好的现有 LeetCode API 库（例如 `leetcode-query` 或类似库），避免自行编写全部 GraphQL 调用；具体选型在调研阶段确定。
- **兼容性：** 必须满足 Obsidian 社区插件审核标准，包括无可疑网络请求、符合 CSP、尊重用户知识库、默认不收集遥测数据。
- **离线：** 已获取的题目内容必须能在无网络时阅读。
- **安全：** 会话 Cookie 仅保存在本地插件数据中，不得写入日志，也不得发送到 LeetCode 以外的站点。
<!-- GSD:project-end -->

---

<!-- GSD:stack-start source:research/STACK.md -->
## 2. 技术栈

### 2.1 推荐技术栈

**核心技术**

| 技术 | 版本 | 用途 | 推荐原因 |
|:--|:--|:--|:--|
| TypeScript | `^5.8.3` | 插件开发语言 | Obsidian 示例插件采用该语言；用于 `obsidian.d.ts` 类型支持；严格空值检查可提前发现运行时错误 |
| obsidian（npm） | `latest`（截至 2026-02-23 为 1.12.3） | 类型定义与运行时 API | 官方类型包；始终指定 `latest`，以便准确设置 `minAppVersion` |
| esbuild | `0.25.5` | 打包工具 | 官方示例插件采用的打包工具；生成 Obsidian 要求的 CJS 产物；监听模式比 Rollup 快 10–100 倍；`electron` 和 `obsidian` 保持 external |
| @codemirror/state | `6.6.0` | CodeMirror 对等依赖 | Obsidian 1.12.x 的对等依赖要求使用该主版本；在 esbuild 中必须保持 external |
| @codemirror/view | `6.42.1` | CodeMirror 对等依赖 | 同上，在 esbuild 中保持 external；运行时通过 `view.editor.cm as EditorView` 访问 |

**LeetCode API**

| 技术 | 版本 | 用途 | 推荐原因 |
|:--|:--|:--|:--|
| `@leetnotion/leetcode-api` | `3.0.0`（2026-04-03） | 题目列表、题目详情、提交记录、用户认证 | `leetcode-query` 的分支，2026 年仍在积极维护；同时提供 ESM 和 CJS；覆盖所需的全部读取操作。**不覆盖运行和提交代码，见下方自行实现的部分。** |
| 自行实现运行与提交 REST 请求 | — | `interpret_solution`、`submit`、`check` 接口 | 没有 npm 库覆盖这三个 LeetCode REST 接口，必须直接使用 `requestUrl` 实现 |

**HTTP 客户端**

| 技术 | 版本 | 用途 | 推荐原因 |
|:--|:--|:--|:--|
| `requestUrl`（Obsidian 内置） | 内置 | 所有发往 leetcode.com 的 HTTP 请求 | 绕过 Electron 对插件环境中 `fetch` 的 CORS 限制；符合 Obsidian 插件惯例；无需额外依赖 |

**HTML → Markdown**

| 技术 | 版本 | 用途 | 推荐原因 |
|:--|:--|:--|:--|
| `turndown` | `7.2.4`（2026-04-03） | 将 LeetCode 题目 HTML 转换为 Markdown | 持续维护；支持代码块、表格、列表；轻量且支持 tree-shaking |

**辅助库**

| 库 | 版本 | 用途 | 使用时机 |
|:--|:--|:--|:--|
| `eventemitter3` | 通过 `@leetnotion/leetcode-api` 间接依赖 | LeetCode 凭据刷新的事件总线 | 仅在扩展 API 客户端时需要 |
| `@codemirror/language` | 按 Obsidian 对等依赖要求 | CM6 代码块的语言支持 | 为笔记中的解题代码块增加语法高亮时使用 |

**开发工具**

| 工具 | 用途 | 说明 |
|:--|:--|:--|
| `esbuild` 监听模式（`npm run dev`） | 保存时自动重新编译 | 将 `main.js` 输出到插件目录；需要手动重新加载 Obsidian，或使用热重载插件 |
| `pjeby/hot-reload`（Obsidian 社区插件） | 在开发知识库中自动重载插件，无需重启整个 Obsidian | v0.3.0（2025-08-14）；仅安装在开发知识库中，不是 npm 依赖 |
| `typescript-eslint` + `eslint-plugin-obsidianmd` | 检查插件特有的不推荐写法 | `eslint-plugin-obsidianmd` 0.1.9 可检查 `innerHTML` 误用、直接访问 `workspace.activeLeaf` 等问题 |
| `vitest`（`4.1.5`，2026-05-05） | 对纯逻辑进行单元测试，包括 API 包装、Markdown 转换、缓存、frontmatter 辅助函数 | 仅用于业务逻辑；没有运行中的 Obsidian 实例时，无法对插件生命周期进行单元测试 |

### 2.2 安装

原文保留的安装分类如下，未提供具体安装命令：

- 核心依赖：与 obsidian-sample-plugin 基线一致。
- LeetCode API。
- HTML → Markdown。
- 开发依赖：与官方示例一致。

### 2.3 详细决策依据

#### 2.3.1 Obsidian 插件基线

- `"module": "ESNext"`，供 esbuild 使用；`"target": "ES6"`。
- `"moduleResolution": "node"`，不使用 `bundler`，由 esbuild 处理解析。
- `"strictNullChecks": true`、`"noImplicitAny": true`，是保障知识库和 API 操作安全的必要检查。
- `"isolatedModules": true`，与 esbuild 的单文件转换模型一致。

#### 2.3.2 LeetCode API 集成

| 操作 | `@leetnotion/leetcode-api` | `leetcode-query` | 自行实现 |
|:--|:--|:--|:--|
| 题目列表（含筛选） | 支持 | 支持 | — |
| 按 slug 获取题目详情 | 支持 | 支持 | — |
| 每日一题 | 支持 | 支持 | — |
| 用户提交记录（需认证） | 支持 | 支持 | — |
| 提交详情（代码、百分位） | 支持 | 支持 | — |
| 用户资料 | 支持 | 支持 | — |
| **运行代码**（`interpret_solution`） | 不支持 | 不支持 | **必须** |
| **提交代码** | 不支持 | 不支持 | **必须** |
| **轮询提交状态**（`check`） | 不支持 | 不支持 | **必须** |

- `@leetnotion/leetcode-api` 是持续维护的 `leetcode-query` 分支，发布于 2026-04-03，而 `leetcode-query` 对应发布日期为 2025-07-11。前者每周下载量为 184，后者为 1,955；前者社区采用率较低，但版本更新，维护者会积极适配 LeetCode API 的破坏性变更。
- 两个库采用相同架构：`Credential` 类接收 `LEETCODE_SESSION` Cookie 和 `csrftoken`，使用 `graphql()` 基础方法，提供可选的内存 TTL 缓存、限流器（每 10 秒 20 次请求），以及用于 CSRF 刷新的 EventEmitter。
- 两个库的自定义 fetcher API（`fetcher.set(...)`）均可替换为 Obsidian 的 `requestUrl`，这是在插件环境中绕过 CORS 限制的关键。
- 两个库都没有封装代码执行所需的三个 REST 接口，必须自行实现。
- `leetcode-cli` / `vsc-leetcode-cli` npm 包属于 CLI 工具，不是库；v2.6.2 最后发布于 2019 年。
- npm 上不存在 `leetcode.js`。
- 在插件环境中直接使用 `fetch()` 向 `leetcode.com` 发起跨域请求，会受到 Electron CORS 限制，应改用 `requestUrl`。

#### 2.3.3 认证

- `vscode-leetcode` 使用的 `authorize-login/vscode/` 接口是 LeetCode 与 VSCode 的专用集成，会重定向到 `vscode://` URI；Obsidian 没有对应接口。
- OAuth/PKCE 流程：LeetCode 没有提供公开 OAuth API。
- `@electron/remote` 兼容层：当前 Electron 中无需使用，会为已弃用的行为引入额外依赖。

#### 2.3.4 HTTP 客户端

- `fetch()`：从插件渲染进程向 `leetcode.com` 发起跨域请求会被 Electron 的 CORS 策略阻止。这是新开发的、需要调用外部 API 的 Obsidian 插件最常见的错误。
- `axios`：会增加约 14 kB 包体积，存在与 `fetch` 相同的 CORS 问题，相比 `requestUrl` 没有优势。
- `node-fetch` / `cross-fetch`：同样受到 Electron CORS 限制，打包后还会增加体积。
- `requestUrl` 是 Obsidian 自带的 HTTP 原语，专门用于让插件绕过 Electron CORS 限制。它兼容同步 API 风格（返回带类型的 `RequestUrlResponse`），可处理 JSON 和二进制响应。

#### 2.3.5 离线缓存

- **插件设置与会话凭据：** 使用 `this.loadData()` / `this.saveData()`，存储在 `.obsidian/plugins/obsidian-leetcode/data.json`。适用于认证令牌、用户偏好、题目元数据索引（slug→id 映射）、缓存的题目 HTML/内容和解题状态。
- **题目笔记：** 存放在用户配置的知识库目录中，例如 `LeetCode/problems/`。通过 `app.vault.create()` 和 `app.vault.modify()` 创建或更新。这些文件是知识库中的正式笔记，可搜索、链接和离线阅读。
- **禁止：** 把用户需要阅读的内容单独存放在 `.obsidian/plugins/` 下，因为这些内容不会显示在知识库界面中。
- 题目内容（HTML、元数据）：缓存在 `data.json` 中，带 `cachedAt` 时间戳；超过 7 天或用户明确执行刷新命令时重新获取。
- 题目列表索引（slug→标题、难度、主题）：插件加载时，如果缓存超过 24 小时则刷新。
- 提交状态：不缓存，始终实时轮询。
- 会话 Cookie：持续保存；收到 401/403 响应时失效，并提示重新登录。

#### 2.3.6 Markdown 渲染

- 对 LeetCode HTML 使用 `innerHTML`：Obsidian 插件指南明确禁止，存在 XSS 风险。
- `marked` / `remark`：转换方向不符，它们用于 Markdown → HTML，而 LeetCode 返回的 HTML 需要转换成 Markdown。
- `rehype` 流水线：方向正确，但更重；`turndown` 足以处理 LeetCode 使用的 HTML 子集。

#### 2.3.7 笔记内代码编辑器

原文的笔记结构示意如下；章节名属于技术约定，保留英文：

```markdown
## Problem
## Solution
# 在这里编写解答
## Notes
```

- Obsidian 的编辑器本身就是 CodeMirror 6。笔记代码块已经通过 `@codemirror/language` 基础设施获得 CM6 语法高亮能力。
- 单独创建编辑器窗格会重复 Obsidian 已有能力，与其用户体验模型冲突，并显著增加复杂度。
- 插件可以通过 `view.editor.cm as EditorView` 访问 CM6 的 `EditorView`，但这是未公开文档的内部接口。

#### 2.3.8 社区插件商店要求

| 要求 | 详情 |
|:--|:--|
| `manifest.json` 有效 | 包含 `id`、`name`、`author`、`description`（不超过 250 字符，以 `.` 结尾）、`version`（semver）、`minAppVersion`、`isDesktopOnly: true` |
| `README.md` | 描述用途、使用方法和截图；必须说明网络用途（LeetCode API） |
| `LICENSE` 文件 | 必须存在 |
| GitHub release | 标签必须与 `manifest.json` 版本一致；附件包含 `main.js` 和 `manifest.json` |
| `community-plugins.json` PR | 向 `obsidianmd/obsidian-releases` 添加条目，`id`、`name`、`author`、`description`、`repo` 必须匹配 |
| 不收集遥测数据 | 未明确告知用户时，不得进行客户端分析、使用追踪像素或收集数据 |
| 不执行远程代码 | 不得使用 `eval()`、`new Function()` 或动态注入 `<script>` |
| 不将用户数据传给 `innerHTML` | 改用 `createEl()` / DOM API |
| 不混淆代码 | 源码必须可读 |
| 不实现自动更新机制 | 由 Obsidian 通过 GitHub releases 管理插件更新 |
| 说明网络用途 | README 必须说明：插件会与 leetcode.com 通信，以获取题目和提交解答 |
| 插件 ID 不包含 `obsidian` | 插件 ID 中不得出现单词 `obsidian` |
| 不设置默认快捷键 | 不为命令设置默认键盘快捷键 |
| Electron/Node API 要求 `isDesktopOnly: true` | 使用 BrowserWindow 时必须设置该标记 |
| 资源清理 | 所有事件监听器通过 `registerEvent()` 注册；自定义视图在 `onClose()` 中清理 |
| 使用 `this.app`，不使用全局 `app` | 通过插件实例访问 app，不使用全局对象 |

#### 2.3.9 知识图谱集成

原文未在此小节填写具体内容。

### 2.4 考虑过的替代方案

| 推荐方案 | 替代方案 | 未采用原因 |
|:--|:--|:--|
| `@leetnotion/leetcode-api` + 自行实现 REST | 完全自行实现 GraphQL | 可行，但对于库已经覆盖良好的题目、提交记录和用户资料操作，会增加 200–400 行样板代码 |
| `@leetnotion/leetcode-api` + 自行实现 REST | 仅使用 `leetcode-query` | `leetcode-query` 同样缺少运行和提交能力；`@leetnotion/leetcode-api` 的维护更新更近（2026 年 4 月，对比 2025 年 7 月） |
| `requestUrl`（Obsidian 内置） | `axios` | 存在与 `fetch` 相同的 CORS 问题；增加包体积；在插件环境中没有优势 |
| `requestUrl`（Obsidian 内置） | `node-fetch` | 渲染进程中的 Node fetch 等价实现也受 Electron CORS 限制；不符合插件惯例 |
| `esbuild` | `rollup` | 两者都可用；esbuild 更快，且自 2022 年起是官方示例插件的默认选择 |
| `turndown` | `rehype-remark`（unified） | 方向正确但更重；`turndown` gzip 后为 7 kB，能够处理 LeetCode 的全部 HTML 模式 |
| 笔记原生代码块 | 自定义 CodeMirror 编辑器窗格 | 复杂度很高，与 Obsidian 用户体验冲突；笔记编辑器中已经存在 CM6 |
| `vitest` 单元测试 | `jest` + `ts-jest` | 两者都可用；vitest 更快，原生支持 ESM，无需配置 `ts-jest` |
| Electron `require('electron').BrowserWindow` | `@electron/remote` | `remote` 模块已弃用；Obsidian 的 Electron 宿主支持直接 `require('electron')` |

### 2.5 不应使用的方案

| 避免使用 | 原因 | 替代方案 |
|:--|:--|:--|
| 使用 `fetch()` / `axios` 调用 LeetCode API | 插件渲染进程中的 Electron CORS 会阻止请求，可能导致静默网络失败 | 使用 `obsidian` 提供的 `requestUrl` |
| 将 LeetCode HTML 内容传给 `innerHTML` | 会被 `eslint-plugin-obsidianmd` 标记；存在 XSS 风险；无法通过插件审核 | 用 `turndown` 转成 Markdown；UI 元素使用 `createEl()` |
| `@electron/remote` | 已弃用的 Electron API，需要额外兼容包；旧插件曾使用，新插件不应再用 | 直接使用 `require('electron')`，Electron 设为 external，由 Obsidian 宿主提供 |
| `eval()` 或 `new Function()` | Obsidian 开发者政策禁止，会直接导致商店审核拒绝 | 在编译时构建逻辑 |
| 全局 `app` 对象 | 被视为调试 API，可能移除，会在插件审核中被标记 | 使用 `Plugin` 实例的 `this.app` |
| 预热完整题目缓存 | 3,000 多道题 × 每题约 10–50 kB HTML = 30–150 MB，会严重影响 `data.json` 可用性 | 按需获取；只缓存索引（slug、id、标题、难度、标签） |
| 直接访问 `workspace.activeLeaf` | 已弃用的模式，会在插件审核中被标记 | `app.workspace.getActiveViewOfType(MarkdownView)` |
| 打包 `obsidian` 或 `@codemirror/*` | 它们由 Obsidian 在运行时提供，打包会产生版本冲突并增加体积 | 在 esbuild 配置中标记为 `external`，示例插件已采用该方式 |
| `rollup` 打包器 | 并非错误，但不是官方基线；切换会增加熟悉示例插件惯例的贡献者的适应成本 | `esbuild` |

### 2.6 不同场景的技术栈用法

- 使用 `ItemView` 与 DOM 辅助方法（`createEl`、`createDiv`）。
- 不使用 React、Svelte，以便将包体积控制在 50 kB 以下。
- 通过 `this.registerView(VIEW_TYPE, leaf => new ProblemBrowserView(leaf))` 注册视图。
- 使用 `PluginSettingTab` 与 `Setting` API。
- 设置字段包括登录按钮、默认语言下拉框、题目目录路径、清除缓存。
- 通过 `this.registerInterval()` 管理 `setInterval` / `clearInterval`，确保插件卸载时自动清理。
- 每 2 秒轮询 `check/`，30 秒后中止（LeetCode 判题超时）。
- 使用 `app.fileManager.processFrontMatter()`，它提供原子操作并处理 YAML 解析错误。
- 不对活动文件使用 `Vault.modify()`，否则会丢失光标位置。

### 2.7 版本兼容性

| 包 | 兼容对象 | 说明 |
|:--|:--|:--|
| `obsidian@1.12.3` | `@codemirror/state@6.5.0`、`@codemirror/view@6.38.6` | 对等依赖在 `obsidian` npm 包中声明；两者均在 esbuild 中设为 external |
| `esbuild@0.25.5` | `typescript@^5.8.3` | 无直接依赖；esbuild 独立转换 TS |
| `@leetnotion/leetcode-api@3.0.0` | Node ESM + 浏览器 fetch | 使用 ESM，由 esbuild 处理打包；将 fetcher 替换为 `requestUrl` |
| `turndown@7.2.4` | 浏览器 + Node | 同时支持 CJS/ESM；无对等依赖 |
| `vitest@4.1.5` | `typescript@^5.8.3` | 仅开发时使用，不打包进插件 |

### 2.8 调研来源

- `obsidianmd/obsidian-sample-plugin`：esbuild 配置、tsconfig、package.json（2026-05-07 获取，当时已确认是最新内容）。
- `obsidianmd/obsidian-api` 的 obsidian.d.ts：API 范围、`requestUrl`、`MarkdownRenderer`、`FileManager.processFrontMatter`（2026-05-07 获取）。
- 通过 Context7 的 `/obsidianmd/obsidian-developer-docs` 获取 `obsidianmd/obsidian-developer-docs`：`RequestUrlParam`、`Plugin.loadData/saveData`、`ItemView`、`processFrontMatter`、提交审核要求（高置信度）。
- `obsidianmd/obsidian-releases` 的 plugin-review.md 与 GitHub 原始开发者政策：安全要求、禁止遥测、禁止 innerHTML、isDesktopOnly、manifest 要求（2026-05-07 获取）。
- `skygragon/leetcode-cli` 的 lib/config.js：interpret_solution、submit、check 的 LeetCode REST 接口（中等置信度；工具较旧但接口稳定，社区使用情况也提供了佐证）。
- `codewithsathya/leetcode-api` 的 README 与源码树：API 覆盖矩阵、自定义 fetcher API（2026-05-07 获取，高置信度）。
- `JacobLinCool/LeetCode-Query` 的 base-leetcode.ts：GraphQL 架构、凭据模型（2026-05-07 获取）。
- `hadynz/obsidian-kindle-plugin`：Electron BrowserWindow 用法（中等置信度；原项目使用已弃用的 `remote` API，此处建议已调整为直接 `require('electron')`）。
- npm registry：各包的版本与发布日期（2026-05-07 核验）。
- npm download API：`leetcode-query` 每周 1,955 次、`@leetnotion/leetcode-api` 每周 184 次下载（2026-05-07 核验）。
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
<!-- GSD:conventions-end -->

---

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## 3. 架构

**v1.3 内嵌 widget 架构（Phase 22 之后）。**

插件编辑模型由一组 `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` 与 `registerEditorExtension(leetCodeFenceViewPlugin)` 构成，分别用于阅读模式和实时预览，两者都调用 `mountLeetCodeWidget`。widget 拥有独立的内嵌 CM6 `EditorView`；widget 编辑通过 `app.vault.process(file, fn)` 写入，它是插件中唯一的修改原语。frontmatter 中的 `lc-language` 是 Run / Submit / AI 分派的唯一可信来源，由 `src/solve/codeExtractor.ts` 中的 `extractFirstFencedBlock(noteBody, frontmatter)` 读取。

`src/main/sectionProtectionExtension.ts` 是唯一的保护扩展，范围收窄到 `## Problem` 正文和 `## Techniques` 标题。无需再锁定代码围栏的起止行：widget 通过 `EditorView.atomicRanges` 管理围栏范围，因此父文档光标无法进入围栏。

迁移基础设施（`src/widget/fenceMigrator.ts`、`src/widget/legacyFenceBanner.ts`、`src/widget/migrationBackupGc.ts` 及 `autoMigrateOnOpen` 设置）长期保留，使较晚从 1.2.x 升级到 1.3.x 的用户仍能获得按需的单围栏迁移。备份写入 `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/`，保留 30 天；垃圾清理在插件加载时执行。

`src/widget/widgetRegistry.ts` 是轻量的 `Map<key, EditorView>`，使用 `${file.path}::${fenceIdentity}` 作为键，替代 v1.2 的 `childEditorRegistry`。自身写入回声抑制使用按路径存储的内容哈希映射，TTL 为 2 秒，**不能使用布尔标记替代**。TTL 常量为 `SelfWriteSuppression.TTL_MS`，安全计时器**必须导入同一个常量**，使两种机制具有相同生命周期。用户正在输入时若发生外部编辑，会弹出冲突对话框，提供“保留我的内容 / 保留外部内容 / 查看差异”（`Keep mine / Keep external / View diff`）。

`WidgetController` 保存 `childDirty: boolean`：子编辑器每次 CM6 `docChange` 事务都会将它置为 true，由 `markChildClean` 清除。`markChildClean` 执行**实时哈希比较**：在 modify 事件到达时，对磁盘上的当前文件内容计算哈希，而不是使用预先设置抑制标记时的快照；仅当实时哈希与写入哈希一致时，才清除 `childDirty`。这样可以抵御并发 frontmatter 写入与同步交错对脏标记清理的影响，见 PITFALLS.md 的问题 28。`childDirty` 是判断“子编辑器正在输入”的标准条件；引入其他输入中检测逻辑前，先确认它是否已经覆盖该场景。

当 `isComposing` 为 true 时，防抖写入暂停，对应子 CM6 DOM 上 IME 的 `compositionstart` → `compositionend` 生命周期。在持续 3–5 秒的中日韩文字候选菜单窗口期间，写入会重新调度，避免在输入法组合尚未完成时把组合前的内容写入知识库，见 PITFALLS.md 的问题 29。

安全计时器在**每次** `docChange` 时重新计时，采用滑动窗口，而不是第一次进入脏状态时只启动一次。它最迟在最后一次编辑后的 `SelfWriteSuppression.TTL_MS` 内触发，即使防抖写入受到焦点丢失、IME 暂停超时等影响，也能保证执行写入。由于安全计时器与抑制记录使用相同 TTL，安全计时器触发的写入始终落在抑制窗口内，并正确识别为自身写入，见 PITFALLS.md 的问题 30。

所有插件主动发起的子编辑器 dispatch 都携带 `'leetcode.*'` userEvent 注解，让区段保护扩展及未来的过滤器无需检查内容即可区分插件写入与用户编辑。围栏正文写入器（`copyToCode`、`resetCodeWithConfirm`）通过 `applyAuthoritativeBody` 辅助函数，在调用 `vault.process` 前原子地设置 `SelfWriteSuppression`；不存在绕过该辅助函数写入围栏正文的代码路径。

子编辑器的缩进单位只来自 `languageCompartment.of(...)` 中的 `buildLanguageExtensions(slug, override)`；可编辑扩展数组中**不能存在顶层 `indentUnit.of(...)`**。硬编码顶层缩进会覆盖 compartment 配置，原因见 PITFALLS.md 的问题 37。`src/main/childEditorLanguage.ts` 中的 `effectiveIndent(slug, override)` 是唯一可信来源：Python/Java/C++/Rust 默认 4 个空格，JS/TS 默认 2 个空格，Go 默认 `\t`。用户的 `indentSizeOverride` 可覆盖非 Go 语言的数值配置；根据 D-06，Go 始终使用制表符。

Tab 键处理器读取 `view.state.facet(indentUnit)`，使用该缩进单位手动 dispatch `replaceSelection`，**不能调用** `@codemirror/commands` 的 `insertTab`，因为后者会插入字面量 `\t`。这样 Enter 自动缩进和 Tab 缩进就不会不一致。设置响应式更新通过 `WidgetRegistry.applyIndentReconfigure(override)` 完成，沿用 `applyDelay` / `reconfigureVim` 的模式：对每个 controller 仅发送 `languageCompartment.reconfigure(buildLanguageExtensions(currentSlug, override))` effects，不带 `changes` 字段，也不与 SelfWriteSuppression 交互。重新配置只改变后续输入使用的实时 facet，绝不重写已有缓冲区内容。

语言下拉切换流程由纯辅助函数 `runLanguageSwitch`（`src/main/runLanguageSwitch.ts`）负责，`LeetCodePlugin.switchLanguageFromWidget` 委托给它执行。

- 对于**未编辑的围栏**：满足 `!childDirty && !hasEverBeenDirtySinceMount`，且正文为空，或与 `resolveStarterCode` 返回的旧语言初始代码逐字节相同。辅助函数通过 `WidgetController.dispatchAuthoritativeBodySwap`，将正文替换与 `languageCompartment.reconfigure` 合并为**一个 CM6 事务**，并向相同 `file.path` 下的所有可编辑同伴 widget 分发相同 dispatch；随后调用 `processFrontMatter` 修改 `lc-language`。整个流程由 `applyAuthoritativeBodyAndFrontmatter` 包装，在 dispatch 前设置抑制标记，并在 frontmatter 写入后让每个 widget 确认该写入。
- 对于**已编辑的围栏**：保留用户代码，只执行 `processFrontMatter`，不修改正文，并显示 Notice，提示可通过 `Cmd-Shift-P > LeetCode: Reset code` 重置代码。
- `resolveStarterCode` 返回 `{ code, reason: 'ok' | 'unavailable' | 'network' }`，让降级提示能够区分“LeetCode 未提供该语言的初始代码”和“获取失败，可能离线，请重试”，见 PITFALLS.md 的问题 33。
- IME 组合输入期间，**整个切换流程**（不仅是 dispatch）都推迟到 `compositionend`，避免中日韩文字候选菜单与解析器重新配置冲突，见 PITFALLS.md 的问题 35。
<!-- GSD:architecture-end -->

---

<!-- GSD:skills-start source:skills/ -->
## 4. 项目技能

未找到项目技能。可以在以下任一目录中添加技能，并提供 `SKILL.md` 索引文件：`.claude/skills/`、`.agents/skills/`、`.cursor/skills/`、`.github/skills/` 或 `.codex/skills/`。
<!-- GSD:skills-end -->

---

<!-- GSD:workflow-start source:GSD defaults -->
## 5. GSD 工作流强制要求

使用 Edit、Write 或其他会修改文件的工具之前，必须先通过 GSD 命令开始工作，使规划产物与执行上下文保持同步。

使用以下入口：

- `/gsd-quick`：小修复、文档更新和临时任务。
- `/gsd-debug`：问题调查与缺陷修复。
- `/gsd-execute-phase`：按计划执行阶段工作。

除非用户明确要求绕过 GSD，否则不得在 GSD 工作流之外直接修改仓库。
<!-- GSD:workflow-end -->

---

<!-- GSD:profile-start -->
## 6. 开发者画像

> 尚未配置开发者画像。运行 `/gsd-profile-user` 生成你的开发者画像。
> 本节由 `generate-claude-profile` 管理，请勿手动编辑。
<!-- GSD:profile-end -->
