# StackFerry v0.1.21

> 自 v0.1.20 发布以来的更新。

## 简体中文

### 同步安全

- WebDAV 密码和 S3 Secret Access Key 迁移到系统凭据管理器，旧版 `settings.json` 中的明文凭据会在迁移成功后清除。
- 远程 WebDAV 与自定义 S3 端点必须使用 HTTPS；HTTP 仅允许本机回环地址。
- 同步协议升级到 v3，并使用 HMAC-SHA256 对远程快照清单进行来源认证，避免远端文件与哈希同时被替换后仍通过校验。

### 配置恢复与一致性

- 数据库备份恢复、SQL 导入以及 WebDAV/S3 快照下载后会重新投影当前 Provider 到各工具的 live 配置。
- 后置投影失败不会撤销已成功的数据库恢复，但会返回明确警告，方便用户重新同步。
- Provider 切换前读取 live 配置失败时会记录错误，同时保持既有 Profile 警告契约和切换流程。

### 发布与质量保障

- macOS 正式发布流程改为 Developer ID 签名、Apple 公证、staple 和 Gatekeeper 校验。
- CI 新增 renderer 生产构建和前后端 IPC 契约检查，并在 Linux、macOS、Windows 上继续执行 Rustfmt、Clippy 和完整测试。
- 发布版本校验现在同时检查 `package.json`、Tauri 配置、`Cargo.toml` 与 `Cargo.lock`。
- 统一 Node.js、pnpm 与 Rust 开发和发布工具链说明，并修正支持工具能力矩阵。

## English

> Changes since the v0.1.20 release.

### Synchronization Security

- Moved WebDAV passwords and S3 secret access keys into the operating system credential manager and removed legacy plaintext values from `settings.json` after a successful migration.
- Required HTTPS for remote WebDAV and custom S3 endpoints, while allowing HTTP only for loopback addresses.
- Upgraded the synchronization protocol to v3 and added HMAC-SHA256 authentication for remote snapshot manifests so replacing both artifacts and hashes no longer bypasses verification.

### Restore and Live-State Consistency

- Reprojected current providers into each tool's live configuration after database backup restore, SQL import, and WebDAV or S3 snapshot download.
- Kept successful database restores intact when post-restore projection fails while returning an explicit warning for manual resynchronization.
- Logged live-configuration read failures before provider switches without changing the established profile warning contract.

### Release and Quality

- Added Developer ID signing, Apple notarization, stapling, and Gatekeeper verification to the official macOS release workflow.
- Added production renderer builds and frontend-to-Tauri IPC contract validation to CI while retaining cross-platform Rustfmt, Clippy, and full test coverage.
- Extended release version validation to cover `package.json`, Tauri configuration, `Cargo.toml`, and `Cargo.lock`.
- Aligned Node.js, pnpm, and Rust development and release requirements and corrected the supported-tool capability matrix.
