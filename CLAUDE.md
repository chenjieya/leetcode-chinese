# LeetCode Chinese 项目协作说明

> 本文沿用 md-output 编号与修订记录规范。当前功能以源码、README 和 docs 发布手册为准；上游调研译文存放于 docs/上游历史/CLAUDE.zh-CN.md。

[TOC]

---

## 修订记录

| 编号 | 版本 | 修订人 | 修订内容 | 日期 |
|:--:|:--|:--:|:--|:--|
| 001 | 1.0 | jie.chen | 更新中文独立版协作约定，归档上游调研译文 | 2026-10-20 |

---

## 1. 项目定位

LeetCode Chinese 是基于 Mo Xu / moxu 的 obsidian-leetcode 开发的中国站衍生插件。插件 ID 为 leetcode-chinese，独立版本从 1.0.0 开始，仓库为 https://github.com/chenjieya/leetcode-chinese。保留上游 MIT 版权与历史记录。

面向 Obsidian 桌面版 1.12.7 及以上版本。所有力扣账号、题库、运行、提交和历史记录请求均使用 leetcode.cn。界面、生成笔记标题和 AI 分析采用简体中文；源码注释和上游规划按维护者要求保留原文。

---

## 2. 代码导航

| 路径 | 职责 |
|:--|:--|
| src/main.ts | 生命周期、命令与流程编排 |
| src/api、src/auth | 中国站 GraphQL、限流、登录与会话 |
| src/browse、src/preview | 题库筛选、预览和开始答题 |
| src/notes | 笔记创建、标题兼容、目录迁移 |
| src/widget | 独立 CodeMirror 编辑器、写入协调与冲突处理 |
| src/solve | 运行、提交、轮询与判题弹窗 |
| src/ai | 服务适配、数据披露、费用估算与复盘 |
| src/graph | 模式分类、关联题目和索引同步 |
| src/contest | 模拟竞赛、归档与竞赛分析 |
| tests | 单元与集成回归 |

---

## 3. 修改约束

- 力扣请求与 AI 网络请求分离；力扣 Cookie 不得发送至 AI 服务。
- data.json 包含登录信息和 AI 密钥，禁止提交仓库、写入日志或打进发布包。
- 界面使用中文；协议字段、命令 ID、代码语言标识和兼容所需的旧标题身份保持稳定。
- 笔记文件名采用“题号. 中文题名.md”；默认目录为 leetcode，受管子目录为 patterns、techniques、contests。
- 读取笔记需兼容旧英文标题、中文标题以及 Alvis 添加的编号和层级；写回保留个人笔记区域。
- 笔记内容修改使用 vault.process；围栏正文的权威写入复用 applyAuthoritativeBody。避免绕过 SelfWriteSuppression；计时器使用共享 TTL 常量。
- 插件主动发起的编辑器 dispatch 携带 leetcode.* userEvent 注解。事件、定时器与编辑器实例需要按生命周期清理。
- 使用 Obsidian MarkdownRenderer 渲染题面，避免 innerHTML、eval 和 new Function。
- 新增依赖前说明用途、体积影响和替代方案，并由维护者确认。
- .planning 和 docs/上游历史 为历史资料，不作为当前开发要求；不依赖旧 GSD 命令才能修改项目。

---

## 4. 开发与发布

使用 Node.js 22、pnpm 10.28.0。执行 pnpm install --frozen-lockfile 安装；pnpm dev 监听构建。重载插件后才会应用已加载模块的变更。

发布前执行 pnpm lint、pnpm test、pnpm build、pnpm run check:bundle-size。生产体积硬上限为 2,000,000 字节，预警为 1,980,000 字节。

开发时使用 .obsidian/plugins/leetcode-chinese 联接本仓库，并关闭原插件。独立版本需要重新配置中国站登录和 AI 服务，不自动复制旧凭据。

GitHub Release 标签与 manifest.json 一致且不加 v 前缀，附件包含 main.js、manifest.json、styles.css。本地保留上游版本标签，首次独立发布不得直接推送全部旧标签。

市场使用新版 Obsidian Community 提交流程，由维护者手动完成；衍生项目政策条件见 [发布操作手册](docs/7-发版与回滚/2026-10-20-中文插件发布操作手册.md)。
