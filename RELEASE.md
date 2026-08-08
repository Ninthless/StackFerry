# StackFerry v0.1.16

## 简体中文

### MCP 与 Skills 管理

- MCP 和 Skills 列表新增本地搜索。
- 支持按应用批量启用和禁用 MCP、Skills，并正确处理部分启用状态。

### Codex 会话用量

- Codex 会话日志按最多 1000 条分批写入 SQLite，复用 prepared statement，提升大量会话导入速度。
- 批量导入失败时回滚当前批次，文件 cursor 只在全部批次成功后推进，重试不会产生重复记录。
- Codex 会话请求详情现在正确显示 `responses` API 协议。

### 稳定性与兼容性

- OAuth 配置写入改用 Windows 原子写入，降低配置文件损坏和并发覆盖风险。
- 数据库备份和恢复改用批处理与事务，提升 Windows 环境下的处理效率和一致性。
- Codex Responses 工具调用和会话 token 统计兼容性得到增强。
- 修复应用集成测试在高负载下因默认超时过短导致的级联失败。

### CI 稳定性

- 修复 Codex 会话用量批处理代码触发严格 Clippy 检查失败的问题。
- 测试专用的单条插入 helper 不再进入生产构建，避免无用代码警告。

## English

### MCP and Skills Management

- Added local search for installed MCP and Skills lists.
- Added per-application batch enable and disable actions with partial-state handling.

### Codex Session Usage

- Codex session logs are imported in batches of up to 1,000 rows with prepared statement reuse for faster large-session imports.
- Failed batches roll back, the file cursor advances only after all batches succeed, and retries avoid duplicate records.
- Codex session request details now correctly display the `responses` API protocol.

### Stability and Compatibility

- OAuth configuration writes now use atomic replacement on Windows to reduce corruption and concurrent overwrite risks.
- Database backup and restore now use batching and transactions for better Windows performance and consistency.
- Improved Codex Responses tool-call and session token accounting compatibility.
- Fixed cascading integration-test failures caused by an overly short default timeout under load.

### CI Stability

- Fixed strict Clippy failures in the Codex session-usage batching implementation.
- Test-only single-record insert helpers no longer compile into production builds, avoiding dead-code warnings.
