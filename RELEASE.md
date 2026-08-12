# StackFerry v0.1.18

> 自 v0.1.17 发布以来的更新。

## 简体中文

### Pi 扩展管理

- 新增完整的 Pi 扩展工作台，可查看扩展、Packages、运行时状态、来源、版本、启用状态和异常信息。
- 支持安装和移除 npm、Git 与本地 Pi Packages，注册和取消注册本地扩展，并可直接启用或禁用单个扩展。
- 新增 npm Package 发现页，支持搜索、查看 Manifest、识别已安装状态并选择安装目标。
- Pi MCP Adapter 改为由用户明确安装；安装完成后，StackFerry 可通过该 Adapter 管理 Pi MCP。
- 新增 Adapter 缺失、安装中、可用、失效和部分成功等状态，并提供恢复与重试操作。
- 安装前静态检测扩展注册的 Tool、Command 和 Flag；发现名称冲突时阻止危险启用或自动禁用冲突扩展，避免 Pi 启动失败。
- 扩展详情改为独立全屏页面，集中展示路径、Package、资源、冲突和可执行操作。

### Pi 全局与项目作用域

- Pi 扩展、Packages 和本地资源现在同时支持全局作用域与项目作用域。
- 新增项目目录选择、最近项目持久化、项目信任确认、作用域筛选和目标明确的安装操作。
- 未信任项目不会读取或修改项目 `.pi` 内容；所有项目写操作都会重新校验规范化路径和信任状态。
- 对齐 Pi 的 Package 去重、项目覆盖、`autoload: false` delta、Manifest Pattern、Package Filter 和资源优先级规则。
- 补齐 extensions、skills、prompts、themes 的递归发现、glob、ignore 文件和目录入口规则。
- 改进 Windows、macOS 与 Linux 的 Pi CLI 和路径兼容性，包括 Windows `.cmd` 调用、Unix 可执行文件以及 macOS Homebrew 常见路径。

### MCP 管理与导入

- “导入已有”扩展到 Claude、Codex、Gemini、GrokBuild、OpenCode、Hermes、Pi 和 Cursor。
- 新增 Cursor MCP 配置读取与导入。
- 改进 Codex 远程 MCP、OpenCode V2 配置结构、环境变量和不同 Agent 配置格式的兼容性。
- 相同 MCP 已存在时合并应用启用状态，不覆盖已有定义；导入数量只统计真正新增的服务器。
- Pi MCP 导入会检测与 StackFerry 中同 ID 服务器的配置冲突，避免静默覆盖。
- MCP 管理页改为统一工作台，优化长路径截断、应用状态、批量操作、导入反馈和窄屏布局。

### Provider 导入与路由

- Provider Routing 支持从 CC Switch 扫描并导入多个 Agent 的 Provider。
- 新增导入预览、按 Agent 或 Provider 选择、来源与端点展示、冲突提示和重新扫描；预览不会显示密钥。
- Agent 选择器移至侧边栏并优化尺寸，使路由页面在常规和窄屏窗口中保持稳定。
- 修复 Codex 故障转移到 DeepSeek 等第三方 Provider 时，Codex 模型目录覆盖真实上游模型的问题。
- 故障转移现在保留 Provider 配置的上游模型，同时继续支持第三方 Provider 自身的多模型目录选择。

### 管理页面重新设计

- 重新设计 MCP、Pi 扩展、Skills、Prompts、Sessions 和 Provider 导入工作区，统一工具栏、列表、筛选、空状态和详情导航。
- Skills 恢复仓库管理入口，发现页使用更易浏览的大卡片，Skill 详情改为独立全屏页面。
- Prompt 新建和编辑改为独立页面，移除重复入口，并修复保存或取消后页面未关闭的问题。
- Session Manager 重构列表、消息目录和阅读区域，修复滚轮不可用、窄屏头部异常以及调整窗口时布局跳动。
- 统一响应式布局规则，修复中窄屏下按钮、计数、徽标、路径和工具栏溢出。

### 思考强度与请求日志

- 新增跨协议思考强度识别与记录，兼容 `reasoning.effort`、thinking budget 及不同 Agent 的对应字段。
- 请求日志和详情页现在显示思考强度及其来源。
- 修正请求用时和首字时间的采集与显示，统一毫秒和秒的格式。
- 无法从会话文件获得网络时序时显示为不可用，不再将未知值误显示为 `0`。
- 优化请求日志表格、详情面板和用量概览的响应式布局与长内容展示。

### 稳定性与测试

- 增加 Pi 扩展安装、Adapter 恢复、冲突处理、项目信任、双作用域和跨平台路径的回归测试。
- 增加 MCP/Provider 跨 Agent 导入、响应式管理工作台、Prompt/Skill 导航、Session 滚动和请求时序测试。
- 修复 Unix 平台 Pi 路径测试、Windows CLI 参数引用和严格 Clippy 检查问题。
- 恢复 Windows、macOS 与 Linux 后端 CI 检查的一致通过。

## English

> Changes since the v0.1.17 release.

### Pi Extension Management

- Added a complete Pi extension workspace for extensions, packages, runtime health, sources, versions, enabled states, and diagnostics.
- Added installation and removal for npm, Git, and local Pi packages, local extension registration, and per-extension enable controls.
- Added npm package discovery with search, manifest inspection, installed-state detection, and install-target selection.
- Made the Pi MCP Adapter an explicit user installation. Once installed, StackFerry can manage Pi MCP through the adapter.
- Added missing, installing, ready, invalid, and partial-success adapter states with recovery and retry actions.
- Added static detection for registered tools, commands, and flags. Conflicting extensions are blocked or disabled before they can prevent Pi from starting.
- Moved extension details into a dedicated full-page view for paths, packages, resources, conflicts, and actions.

### Global and Project Pi Scopes

- Added global and project scopes for Pi extensions, packages, and local resources.
- Added project selection, recent-project persistence, trust confirmation, scope filters, and target-aware installation.
- Untrusted projects are never read from or written to, and project mutations revalidate canonical paths and trust.
- Aligned package deduplication, project overrides, `autoload: false` deltas, manifest patterns, package filters, and resource precedence with Pi behavior.
- Added recursive discovery, glob expansion, ignore-file handling, and directory entry rules for extensions, skills, prompts, and themes.
- Improved Pi CLI and path compatibility across Windows, macOS, and Linux, including Windows `.cmd`, Unix executables, and common Homebrew locations.

### MCP Management and Import

- Expanded “Import Existing” to Claude, Codex, Gemini, GrokBuild, OpenCode, Hermes, Pi, and Cursor.
- Added Cursor MCP configuration discovery and import.
- Improved compatibility with Codex remote MCP servers, OpenCode V2 configuration, environment variables, and agent-specific formats.
- Existing MCP definitions now retain their configuration while gaining the imported app assignment; import counts include only newly inserted servers.
- Pi imports detect configuration conflicts with StackFerry servers that use the same ID instead of silently overwriting them.
- Rebuilt MCP management as a unified workspace with better long-path handling, app status, batch actions, import feedback, and narrow-screen behavior.

### Provider Import and Routing

- Provider Routing can now scan and import CC Switch providers across supported agents.
- Added import previews, agent/provider selection, source and endpoint details, warnings, and rescanning without exposing secrets.
- Moved agent selection into the sidebar and refined its size for stable desktop and narrow layouts.
- Fixed Codex failover to third-party providers such as DeepSeek when the Codex catalog model incorrectly shadowed the configured upstream model.
- Failover now preserves the provider's configured upstream model while retaining genuine multi-model catalog selection.

### Redesigned Management Workspaces

- Redesigned MCP, Pi Extensions, Skills, Prompts, Sessions, and Provider Import with consistent toolbars, lists, filters, empty states, and detail navigation.
- Restored the Skills repository-management entry, introduced larger discovery cards, and moved Skill details to a full-page view.
- Moved Prompt creation and editing to dedicated pages, removed duplicate entry points, and fixed Save or Cancel leaving the editor open.
- Rebuilt Session Manager lists, message navigation, and reading panes; fixed missing wheel scrolling, awkward narrow headers, and resize-induced layout jumping.
- Standardized responsive behavior for buttons, counts, badges, paths, and toolbars across medium and narrow windows.

### Thinking Effort and Request Logs

- Added cross-protocol thinking-effort detection and persistence for `reasoning.effort`, thinking budgets, and agent-specific equivalents.
- Request logs and details now expose the thinking level and its source.
- Corrected request duration and time-to-first-token capture and formatting with consistent millisecond and second units.
- Session records without network timing now show unavailable values instead of misleading zeroes.
- Improved responsive layouts and long-content handling across the request table, detail panel, and usage overview.

### Stability and Tests

- Added regression coverage for Pi package installation, adapter recovery, conflict handling, project trust, scoped workflows, and cross-platform paths.
- Added coverage for cross-agent MCP/provider imports, responsive management workspaces, Prompt/Skill navigation, Session scrolling, and request timing.
- Fixed Unix Pi path tests, Windows CLI argument quoting, and strict Clippy failures.
- Restored consistent backend CI coverage across Windows, macOS, and Linux.
