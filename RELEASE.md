# StackFerry v0.1.23

> 自 v0.1.22 发布以来的更新。

## 简体中文

### 故障转移渠道控制

- 故障转移队列新增按渠道控制的启用/禁用开关。禁用渠道保留原有 P 序号，但会从所有故障转移候选中跳过。
- 渠道状态使用事务化更新，保护最后一个启用渠道，并在重新加入或清空队列时正确恢复默认启用状态。
- Provider 卡片与设置页故障转移队列使用同一套状态 mutation，避免两个入口产生不同结果。

### 实际运行渠道与状态展示

- 新增按应用隔离的运行时渠道跟踪，只在主请求完整成功后显示实际使用的 Provider。
- 修复故障转移成功后仍显示配置渠道的问题；Codex 不会因运行时切换改写持久化配置或 live 配置。
- Pi、标准路由、图片生成、联网搜索、激活选择和批量检查统一过滤禁用渠道；辅助请求不会覆盖主请求当前渠道。
- 故障转移、接管关闭、渠道移除或禁用后会立即清理失效的运行时状态，并通过事件刷新界面。

### 数据库与质量

- 数据库 schema 升级到 v30，为既有 Provider 增加故障转移渠道参与状态并兼容旧数据库。
- SQL 备份恢复、CCSwitch 导入和普通 Provider 保存不会覆盖用户手动设置的禁用状态。
- 增加队列顺序、并发切换、运行时状态、Pi/Codex 路由和辅助请求隔离等回归测试。

## English

> Changes since the v0.1.22 release.

### Failover Channel Control

- Added a per-channel enable/disable switch to the failover queue. Disabled channels keep their P-order but are skipped by every failover candidate path.
- Channel changes are transactional, protect the last enabled channel, and restore the default enabled state when a provider is re-added or the queue is cleared.
- Provider cards and the settings queue manager now share the same mutation and cache behavior.

### Runtime Provider State

- Added an app-isolated runtime route tracker that marks a provider current only after a complete successful main request.
- Fixed failover status reporting so the UI shows the provider actually serving traffic; Codex runtime failover does not rewrite persisted or live configuration.
- Pi, standard routing, image generation, web search, activation selection, and batch checks consistently skip disabled channels, while auxiliary requests cannot overwrite the main request channel.
- Runtime state is cleared immediately when failover, takeover, or channel membership changes invalidate it, with event-driven UI refreshes.

### Database and Quality

- Upgraded the database schema to v30 with backward-compatible failover participation state for existing providers.
- SQL backup/restore, CCSwitch imports, and normal provider saves preserve a user-selected disabled state.
- Added regression coverage for queue ordering, concurrent toggles, runtime state, Pi/Codex routing, and auxiliary request isolation.
