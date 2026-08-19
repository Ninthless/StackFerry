# StackFerry v0.1.20

> 自 v0.1.19 发布以来的更新。

## 简体中文

### Claude Code 与 Codex 运行环境

- 新增独立运行环境，可为同一 Provider 创建多套 Claude Code 或 Codex 环境，并分别维护名称、最近项目和启动入口。
- Claude Code 使用独立 `CLAUDE_CONFIG_DIR`，Codex 使用独立 `CODEX_HOME` 与 `CODEX_SQLITE_HOME`，配置、历史记录和本地状态不再混用。
- 运行环境 API Key 保存到系统凭据管理器，数据库仅记录引用；创建、换 Key、删除和 Provider 更新均提供失败补偿与回滚。
- Provider 菜单区分“直接启动”和“管理运行环境”，运行环境管理器支持创建、改名、换 Key、更新最近项目、启动和删除。
- Provider 更新会重新生成关联运行环境的配置，删除仍有关联运行环境的 Provider 时会阻止操作，避免留下失效环境。

### 会话、代理与凭据隔离

- Claude Code 与 Codex 会话支持按默认环境、全部环境或指定运行环境扫描，并显示运行环境身份。
- 会话读取、分页、搜索、删除、批量删除和恢复均携带运行环境维度，避免不同环境中相同会话 ID 发生冲突。
- 代理通过受校验的实例身份将会话固定到指定 Provider 和 API Key；缺少或冲突的凭据会严格失败，不回退到全局 Key 或其他 Provider。
- 实例绑定请求仍保留普通故障路由的既有语义，但凭据错误不会污染 Provider 健康状态。
- HTTP 与 Pi WebSocket 转发会移除 StackFerry 私有身份头，防止内部实例标识泄漏到上游。
- 运行环境启动会检查 Claude Code 与 Codex CLI 是否支持自定义请求头；版本过低时会给出升级提示，而不是静默失去身份隔离。

### 配置可靠性与 MCP

- 配置和设置写入改为原子持久化，并为跨数据库与 live 配置的更新增加快照、补偿和回滚。
- 拆分 Claude、Codex 和代理的 live 配置适配器，缩小共享热点并明确各应用的配置所有权。
- 新增 Claude 与 Codex 配置黄金夹具，覆盖未知字段保留、内部字段清理和无效 TOML 处理。
- Profile 应用流程拆分为计划与执行阶段，可继续处理部分失败并返回更准确的警告。
- Codex 导入会忽略临时托管的运行时 MCP Server，并清理历史错误分配，避免把 StackFerry 运行时条目写回用户配置。

### 界面与质量保障

- 集中维护应用能力注册表，侧边栏只为当前应用显示实际支持的 Provider、MCP、Skills 和 Prompts。
- 运行环境和会话范围界面已完成简体中文、繁体中文、英文和日文翻译。
- 新增运行环境生命周期、实例会话范围、代理凭据约束和配置回滚测试。
- 修复能力过滤后的导航测试、前端格式问题和严格 Rust Clippy 警告，保持跨平台 CI 通过。

## English

> Changes since the v0.1.19 release.

### Claude Code and Codex Runtime Environments

- Added isolated runtime environments so one provider can have multiple Claude Code or Codex environments with independent names, recent projects, and launch actions.
- Isolated Claude Code through `CLAUDE_CONFIG_DIR` and Codex through `CODEX_HOME` and `CODEX_SQLITE_HOME`, separating configuration, history, and local state.
- Stored runtime API keys in the operating system credential manager while keeping only references in SQLite; creation, rotation, deletion, and provider updates include compensation and rollback.
- Split provider actions into direct launch and runtime-environment management, with controls for creation, rename, key rotation, recent projects, launch, and deletion.
- Regenerated associated runtime configuration after provider updates and prevented deletion of providers that still own runtime environments.

### Sessions, Proxy, and Credential Isolation

- Added default, all-environment, and selected-environment scopes for Claude Code and Codex sessions, including runtime identity in session metadata.
- Made session reads, pagination, search, deletion, bulk deletion, and resume environment-aware so identical session IDs cannot collide across environments.
- Bound proxy sessions to a validated runtime identity and its exact provider credential; missing or conflicting credentials now fail closed without falling back to a global key or another provider.
- Preserved existing failover behavior for ordinary routing while keeping instance credential failures neutral to provider health.
- Stripped StackFerry private identity headers from HTTP and Pi WebSocket upstream requests.
- Added minimum-version checks for Claude Code and Codex custom-header support so unsupported CLI versions produce an upgrade prompt instead of silently losing isolation.

### Configuration Reliability and MCP

- Moved settings and configuration writes to atomic persistence and added snapshots, compensation, and rollback around database and live-config projections.
- Split Claude, Codex, and proxy live adapters to reduce shared hotspots and clarify configuration ownership.
- Added Claude and Codex golden fixtures covering unknown-field preservation, internal-field removal, and invalid TOML handling.
- Separated profile apply planning from execution so partial failures can continue with more accurate warnings.
- Excluded transient managed Codex runtime MCP servers during import and cleaned historical assignments to prevent StackFerry runtime entries from being written back to user configuration.

### Interface and Quality

- Centralized the application capability registry so the sidebar exposes only the Provider, MCP, Skills, and Prompts features supported by the active application.
- Localized runtime-environment and session-scope interfaces in Simplified Chinese, Traditional Chinese, English, and Japanese.
- Added coverage for runtime lifecycle operations, instance-scoped sessions, proxy credential constraints, and configuration rollback.
- Fixed capability-aware navigation tests, frontend formatting, and strict Rust Clippy warnings to keep cross-platform CI green.
