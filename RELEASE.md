# StackFerry v0.1.7

## 简体中文

### 本次发布

- 增加从 cc-switch 导入 Codex 供应商的事务化流程，支持幂等合并、来源追踪和跨平台数据库发现。
- 重构会话管理的供应商隔离、元数据缓存、虚拟列表和分页预览，超大消息改为按需加载，显著降低大历史记录的打开开销。
- 修复 Linux、Windows 和 macOS 的自启动状态保存与代理开关持久化，并补齐跨平台窗口和更新相关的兼容处理。
- 补充供应商使用统计入口、会话供应商切换、导入流程和性能回归测试，保持普通 CI 的多平台校验。

### 故障转移与恢复

- 新增故障转移卡片的手动恢复熔断按钮；熔断通道无需等待冷却时间即可立即恢复，并在恢复高优先级通道时按后端规则自动切回。
- 手动恢复提供明确的加载、成功和失败状态，健康缓存会先行更新，随后刷新供应商列表与代理目标。
- 健康状态轮询仅在代理接管、自动故障转移和队列成员同时成立时运行，减少无效后台请求。

### 使用统计与数据库性能

- 将使用统计查询移出 Tauri 命令主线程，避免打开使用统计时阻塞前端和代理服务。
- 优化 SQLite 查询规划与会话/代理日志去重路径，保留 Pi 响应 ID 和 Token 指纹两种匹配策略。
- 合并供应商卡片中的使用统计查询，避免同一供应商重复创建查询订阅。

### 前端作用域与缓存生命周期

- Prompt 应用选择移动到页面标题栏，移除重复的页面级供应商选择和无效文件读取。
- Skills 的安装、ZIP 导入和备份恢复改为操作级目标应用选择，不再被供应商路由切换影响。
- 删除失效的 Agents/Universal 独立路由，持久化视图与当前应用不兼容时自动回到供应商页面。
- 收敛数据库恢复、深链导入和同步后的缓存失效范围，避免重复刷新和无关查询。

### 代理、故障转移与供应商兼容性

- 修正故障转移通道的加入顺序：先加入的供应商始终优先，并保持保存、重载和切换后的顺序一致。
- 熔断供应商会在冷却后进入半开探测并自动恢复，不再永久停留在不可用状态。
- 完善 Codex 联网搜索、生图及流式响应代理，避免工具调用和供应商响应在转换过程中丢失。
- 加强自定义供应商的认证配置、模型目录、思考等级、深链导入与代理切换一致性。

### Pi Agent 完整支持

- 增加 Pi HTTP、SSE 与 WebSocket 代理链路，支持供应商路由、故障转移、请求转换和响应处理。
- 增加 Pi 请求与会话使用统计、Token 解析、费用计算、供应商用量脚本以及详情展示。
- 增加 Pi MCP 配置适配器，可在应用内管理并同步 Pi MCP 服务。
- 完善 Pi 配置迁移、请求头和 API Key 隔离，保留用户自定义字段并兼容受限 API 服务。

### 独立功能配置

- Prompt、Skills、会话和 MCP 现在分别保存自己的目标应用，不再跟随供应商路由页面的动态切换。
- MCP 在切换目标应用后会重新投影对应配置，同时通过数据库约束保护各应用配置矩阵。
- 移除已废弃的共享应用上下文，补齐跨页面、重启和供应商切换回归测试。

### 自动更新与发布

- 修复 Linux 与 Windows 下载更新后无法正确交给安装器完成自更新的问题。
- Linux Release 同时签名并发布 AppImage、DEB 和 RPM；Windows 分别生成 x64 与 ARM64 更新资产。
- 重构 `latest.json` 生成器，严格校验六个平台映射、签名和下载地址，并纳入 CI 测试。
- Release 工作流补齐多架构构建、签名验证、资产收集和双语发布说明。

### 桌面与开发体验

- 增加 Linux/Windows 自定义标题栏及平台窗口事件处理；macOS 保留原生窗口控件。
- 调整应用切换器、品牌和版本位置，扩大默认窗口尺寸，并清理设置页冗余区域。
- `pnpm dev` 现在提供一键开发启动，使用隔离的开发数据目录和稳定 Rust 工具链。
- CI 在 Ubuntu、Windows 和 macOS 上执行格式、Clippy 与测试检查，提前发现平台条件编译问题。

## English

### This Release

- Added a transactional Codex provider importer from cc-switch with idempotent reconciliation, source tracking, and cross-platform database discovery.
- Scoped session management by provider and added metadata caching, virtualization, bounded message pagination, and on-demand oversized-message loading to keep large histories responsive.
- Fixed persisted auto-launch and proxy-toggle state across Linux, Windows, and macOS, with additional cross-platform window and updater compatibility fixes.
- Added provider usage visibility, session-provider switching, import coverage, and performance regression fixtures while preserving the regular multi-platform CI checks.

### Failover Recovery

- Added a manual circuit-breaker recovery action to failover provider cards, so a circuit can be reset immediately without waiting for its cooldown; higher-priority recovery still follows the backend switch rule.
- Manual recovery now exposes loading, success, and error states, updates the health cache immediately, and refreshes providers and proxy targets.
- Health polling only runs when proxy takeover, automatic failover, and queue membership are all active, reducing unnecessary background requests.

### Usage and Database Performance

- Moved usage-statistics queries off the Tauri command thread so opening Usage does not block the renderer or proxy service.
- Optimized SQLite query planning and session/proxy log deduplication while preserving both Pi response-ID and token-fingerprint matching paths.
- Consolidated provider-card usage queries so each provider creates only one usage subscription.

### Frontend Scope and Cache Lifecycle

- Moved the Prompt application selector into the page header and removed duplicate page-level selectors and unused file reads.
- Made Skills installation, ZIP import, and backup restore choose their target application per action instead of following provider-route switching.
- Removed obsolete standalone Agents/Universal routes and normalize incompatible persisted views back to the Providers page.
- Narrowed cache invalidation after database restore, deep-link import, and sync operations to avoid duplicate refreshes and unrelated queries.

### Proxy, Failover, and Provider Compatibility

- Failover routes now preserve join order, so the first provider added remains the first route after saving, reloading, or switching.
- Circuit-broken providers enter a half-open probe after cooldown and recover automatically when they become reachable again.
- Codex web search, image generation, streaming responses, and tool calls are preserved across provider transformations.
- Custom provider authentication, model catalogs, reasoning levels, deep-link imports, and proxy switching now follow one consistent contract.

### Complete Pi Agent Support

- Added Pi HTTP, SSE, and WebSocket proxy paths with provider routing, failover, request conversion, and response processing.
- Added Pi request and session usage statistics, token parsing, cost calculation, provider usage scripts, and request details.
- Added a Pi MCP adapter so Pi MCP servers can be managed and synchronized from StackFerry.
- Improved Pi configuration migration, request headers, and API key isolation while preserving custom fields and compatibility with restricted APIs.

### Independent Feature Configuration

- Prompts, Skills, Sessions, and MCP now persist their own target applications instead of following provider-route switching.
- MCP configurations are reprojected for the selected application and protected by database constraints across the application matrix.
- Removed the obsolete shared application context and added regression coverage for navigation, restarts, and provider switches.

### Updates and Releases

- Fixed Linux and Windows self-update handoff after an installer has been downloaded.
- Linux releases now sign and publish AppImage, DEB, and RPM artifacts; Windows produces separate x64 and ARM64 updater assets.
- Reworked `latest.json` generation with strict validation for all six platform mappings, signatures, and download URLs, covered by CI tests.
- Expanded the Release workflow with multi-architecture builds, signature validation, asset collection, and bilingual release notes.

### Desktop and Development Experience

- Added custom Linux and Windows title bars with platform-aware window events while retaining native macOS controls.
- Refined application switching, branding, version placement, default window size, and Settings page density.
- `pnpm dev` now starts the complete development environment with isolated development data and a stable Rust toolchain.
- CI runs formatting, Clippy, and tests on Ubuntu, Windows, and macOS to catch platform-specific compilation issues before release.
