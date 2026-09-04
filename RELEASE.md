# StackFerry v0.1.26

> GPT-6-Astra Codex 兼容性更新。

## 简体中文

### Codex GPT-6-Astra

- Codex 外部模型目录现在会自动包含配置中的默认模型，`gpt-6-astra` 可从 `/model` 菜单选择。
- 对齐 Astra 的推理强度、联网搜索、图片输入、原图细节、并行工具和 872K 最大上下文能力。
- 选择 Astra 后保留真实上游模型名，并支持在 Codex 中修改 `model_reasoning_effort`。

## English

> GPT-6-Astra Codex compatibility update.

### Codex GPT-6-Astra

- The external Codex model catalog now includes the configured default model, making `gpt-6-astra` selectable from `/model`.
- Added Astra reasoning levels, web search, image input, original image detail, parallel tools, and 872K maximum context metadata.
- Selecting Astra preserves the real upstream model name and supports changing `model_reasoning_effort` in Codex.

---

## Previous release

> 自 v0.1.24 发布以来的更新（并包含此前未完成发布的故障转移修复）。

## 简体中文

### 发布与 CI

- 补齐故障转移运行态控制的发布流程，生成新的跨平台安装包和自动更新清单。
- 修复 ProviderList 测试 mock 与格式检查，确保前端 CI 检查通过。

### 产品公告

- 增加 StackFerry 重构期间的维护公告，明确现有稳定版本、配置和供应商路由仍可继续使用。

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

> Changes since the v0.1.24 release, including the failover fixes whose previous release did not complete.

### Release and CI

- Completed the release path for failover runtime controls, producing new cross-platform installers and updater metadata.
- Fixed the ProviderList test mock and formatting checks so the frontend CI scope passes.

### Product Announcement

- Added a maintenance announcement for the ongoing StackFerry rebuild, clarifying that the current stable version, configuration, and provider routes remain usable.

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
