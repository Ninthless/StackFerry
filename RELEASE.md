# StackFerry v0.1.4

## 简体中文

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
