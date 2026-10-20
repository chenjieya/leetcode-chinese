# LeetCode Chinese

**English overview:** LeetCode Chinese is a desktop plugin for practicing problems on LeetCode China (leetcode.cn) inside Obsidian. Browse Chinese problem statements, write and run solutions, submit with a LeetCode China account, and keep linked study notes. Optional AI features generate Chinese solution reviews, algorithm classifications, and related practice suggestions. The interface and generated learning content are primarily in Chinese.

**Installation:** Download `leetcode-chinese.zip` from [GitHub Releases](https://github.com/chenjieya/leetcode-chinese/releases), extract it into your vault’s `.obsidian/plugins/leetcode-chinese/` directory, then enable LeetCode Chinese. Requires Obsidian desktop 1.12.7 or later. Disable the original LeetCode plugin before migrating. Configure your China-site login and, optionally, an AI provider in settings.

**Privacy and external programs:** Problem browsing and submissions connect to leetcode.cn. AI requests send problem statements, solution code, and judging information to your chosen provider after confirmation; personal notes are excluded. Provider fees may apply. Cookies and API keys are stored in plain text in local `data.json`; do not share this file. Optional AWS Bedrock authentication can read `~/.aws/credentials` and `~/.aws/config` outside the vault and execute a configured `credential_process` helper. Only that credential flow probes the shell PATH on macOS/Linux; normal plugin startup does not launch a shell. Helpers run without shell command interpolation and have a 30-second timeout. The plugin does not execute submitted solution code locally, insert ads, or add client telemetry.

**Attribution:** Derived from [Mo Xu / moxu’s obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode), under the MIT license. Original copyright notices are retained. This independently maintained China-site adaptation is not affiliated with the original project, LeetCode, or Obsidian.

面向力扣中国站的 Obsidian 桌面插件。在笔记中浏览题目、编写并提交代码，积累中文 AI 复盘、算法模式索引和题目关联。

本项目基于 [Mo Xu / moxu 的 obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode) 改造，保留原项目 MIT 许可证与版权声明。由 jie.chen 维护中国站适配和中文体验，与原项目、力扣及 Obsidian 官方无隶属关系。

> 本文沿用项目文档的 md-output 编号与修订记录规范。

[TOC]

---

## 修订记录

| 编号 | 版本 | 修订人 | 修订内容 | 日期 |
|:--:|:--|:--:|:--|:--|
| 001 | 1.0 | jie.chen | 发布中文衍生版使用说明 | 2026-10-20 |
| 002 | 1.1 | jie.chen | 补充市场要求的英文介绍与外部程序调用说明 | 2026-10-20 |

---

## 1. 功能

- 中国站账号登录、题库筛选、中文题面、运行代码、提交与历史提交查询。
- 题目文件按“题号. 中文题名.md”命名，正文使用“题目、代码、笔记”等中文章节。
- 通过后更新完成状态和主题标签；AI 可生成中文复盘、解题模式分类和关联练习建议。
- 算法模式索引保存在 patterns，通过双向链接参与 Obsidian 自带的关系图谱。
- 模拟竞赛、计时、竞赛归档和 AI 竞赛分析。
- 兼容 Alvis 等格式化插件添加的章节编号和标题层级。

个人“笔记”区域由用户维护，AI 不自动填充或覆盖。patterns 是按难度整理的题目索引，不会自动生成算法教程。默认目录使用小写；API 字段、代码标识符与历史笔记兼容标识保留原格式。源码注释和上游历史规划保留原文。

---

## 2. 安装与升级

当前可通过 [GitHub Releases](https://github.com/chenjieya/leetcode-chinese/releases) 安装。市场收录状态以 [Obsidian Community](https://community.obsidian.md/) 为准，发布 GitHub Release 不代表已上架市场。

1. 使用 Obsidian 桌面版 1.12.7 或更高版本。
2. 下载同一 Release 的 main.js、manifest.json、styles.css，或解压 leetcode-chinese.zip。
3. 将文件放入知识库配置目录下的 plugins/leetcode-chinese/；默认完整目录为 .obsidian/plugins/leetcode-chinese/。
4. 在 Obsidian 第三方插件设置中重新加载列表并启用 LeetCode Chinese。

升级时替换三个插件文件，保留现有 data.json，随后关闭再启用插件。开发态 pnpm dev 只重新构建文件，已加载的插件仍需重新启用。

从原 LeetCode 插件迁移时，请先关闭原插件，避免两者同时接管同一代码块。中文版本使用独立插件 ID 和配置目录，需要重新登录中国站、填写 AI 配置，并把题目目录设为原有笔记目录。笔记无需重建；原插件配置不会自动复制。目录、代码围栏和属性兼容不代表两款插件适合同时启用。

---

## 3. 开始刷题

1. 在设置中登录力扣中国站。无法打开内置登录窗口时，可手动填写中国站 Cookie。
2. 设置题目保存目录（默认 leetcode）和编程语言，打开题库。
3. 选择题目并开始答题，在代码区域填写解答后运行或提交。
4. 提交通过后，笔记状态更新为“已完成”。这是插件内提交触发的流程，并非对网页提交记录持续后台同步。
5. 如需 AI，配置服务地址、模型和密钥，再开启自动复盘与解题模式分类。

自动复盘生成结束前不要关闭判题弹窗；中途关闭会取消未完成的写入。AI 服务可能收费，模型输出需要自行核实。

已有英文 AI 正文不会因升级自动翻译，可在已完成题目的笔记中依次执行：

- 重新生成当前题目的知识图谱。
- 重新生成当前笔记的 AI 复盘。
- 同步模式汇总笔记。

前两项会调用 AI；第三项仅根据本地属性整理索引。旧 Patterns、Techniques、Contests 子目录会在加载时迁移为小写；如果大小写目录同时存在，插件会提示冲突并停止迁移，避免覆盖内容。

---

## 4. 网络、账号与隐私

| 功能 | 数据与服务 |
|:--|:--|
| 题库与判题 | 连接 leetcode.cn 获取题面、账号状态、提交记录，并发送运行或提交的代码及测试输入；登录和提交需要中国站账号 |
| AI 功能 | 连接用户选择的 AI 服务；按操作发送题面、解答代码、判题信息或竞赛摘要，调用前显示数据发送确认 |
| 个人笔记 | 不发送个人“笔记”区域参与 AI 调试、复盘或分类 |
| 本地配置 | Cookie、API 密钥及配置保存在插件目录的 data.json 中，属于敏感文件，不应公开或上传仓库 |
| AWS Bedrock | 使用凭据链时可能读取知识库外的 ~/.aws/credentials、~/.aws/config，支持环境变量和 credential_process 辅助命令 |
| 桌面运行环境 | 仅在 AWS credential_process 认证时读取 shell 的 PATH，为外部凭据辅助程序查找命令路径；普通插件启动不调用 shell |

支持 Anthropic、OpenAI、OpenRouter、Ollama、自定义 OpenAI 兼容服务及 AWS Bedrock；选择自定义或本地服务时，请核对地址和模型。插件自身不插入广告或客户端遥测，不会把力扣 Cookie 发送到 AI 服务。服务提供商的收费和数据政策由各自提供商决定。

默认服务地址包括 api.anthropic.com、api.openai.com、openrouter.ai、Ollama 的 localhost:11434，以及 AWS 的 bedrock-runtime.{region}.amazonaws.com。自定义 OpenAI 兼容服务连接设置中填写的地址。

### 4.1. 认证信息

Cookie 和 AI 密钥以明文保存在 data.json。力扣 Cookie 仅发送给 leetcode.cn。内置日志通过 src/shared/logger.ts 对已知敏感字段进行脱敏，分享日志前仍应自行检查内容。

### 4.2. 费用说明

AI 按服务商规则计费。设置中的每日预算和模型单价用于本地估算，默认单价可能过时，不能代替服务商账单；请核对当前价格并按需调整。

中国站未提供翻译的题目可能保留原文；编译器错误、用户代码、第三方服务原始响应和专有名词不强制翻译。

---

## 5. 开发与验证

使用 Node.js 22 和 pnpm 10.28.0。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm run check:bundle-size
```

src 为源码，tests 为测试，docs 为当前中文维护文档。.planning 是保留的上游历史规划，不作为当前版本的功能承诺；原版更新日志位于 docs/上游历史/CHANGELOG.en.md。源码注释按维护者要求保留原文。

发布流程及市场提交说明见 [发布操作手册](docs/7-发版与回滚/2026-10-20-中文插件发布操作手册.md)。问题反馈请提交到 [本项目 Issues](https://github.com/chenjieya/leetcode-chinese/issues)。

---

## 6. 许可与致谢

使用 MIT 许可证，见 [LICENSE](LICENSE)。原作者 Mo Xu / moxu 提供了插件主体实现；本项目维护者 jie.chen 负责中国站适配、中文界面、中文笔记工作流及相关修复。原作者版权声明继续保留，中文改造不改变上游代码的来源。
