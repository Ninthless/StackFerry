# StackFerry v0.1.22

> 自 v0.1.21 发布以来的更新。

## 简体中文

### 故障路由与熔断恢复

- Codex 故障路由现在会区分真实上游错误、凭据失败与本地代理问题，避免把错误归因到无关 Provider。
- 改善 Provider 切换与失败重试的稳定性，减少错误状态导致的路由波动。
- 新增按应用配置的自动熔断恢复开关；关闭后，已熔断 Provider 会保持阻断，直到用户手动恢复。
- 故障转移队列现在直接显示 Provider 健康状态，并提供手动恢复操作。

### Codex 配置与鉴权

- Codex Provider 编辑器改为使用数据库中的已保存配置，避免 live `config.toml` 的旧内容或外部改写覆盖编辑结果。
- 手动修改 TOML 中的 `experimental_bearer_token` 时会同步更新规范凭据，确保保存、切换和代理转发使用最新 API Key。
- 修复因旧凭据覆盖 TOML Token 而导致上游缺少有效 `Authorization` 头并返回 401 的问题。

### 兼容性与质量

- 数据库 v28 迁移现在兼容不包含 `proxy_config` 的历史或精简测试 Schema，避免迁移测试和部分恢复场景失败。
- 增加 Codex 配置保存、凭据同步、熔断恢复和数据库迁移回归测试。

## English

> Changes since the v0.1.21 release.

### Failover and Circuit Recovery

- Improved Codex failover attribution so upstream errors, credential failures, and local proxy problems do not penalize unrelated providers.
- Stabilized provider switching and retry behavior to reduce routing fluctuations caused by stale failure state.
- Added a per-application automatic circuit recovery switch. When disabled, an open circuit remains blocked until the user recovers it manually.
- Added provider health indicators and manual recovery actions directly to the failover queue.

### Codex Configuration and Authentication

- Made the saved database configuration authoritative in the Codex provider editor so stale or externally rewritten live `config.toml` content cannot overwrite edits.
- Synchronized manually edited `experimental_bearer_token` values into canonical credentials so saves, switches, and proxy forwarding use the latest API key.
- Fixed 401 responses caused by stale credentials replacing the TOML token and leaving the upstream request without valid authorization.

### Compatibility and Quality

- Made the v28 database migration tolerate historical or partial schemas without `proxy_config`, preventing migration-test and partial-restore failures.
- Added regression coverage for Codex configuration persistence, credential synchronization, circuit recovery, and database migration compatibility.
