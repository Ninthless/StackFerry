## 简体中文

### Codex 供应商兼容性

- 修复自定义供应商切换时认证配置、模型目录和思考等级被覆盖或收窄的问题。
- 完善 XFcode API 的 Codex 模型预设、请求头和能力信息，保留用户手动配置的认证字段。
- 加强供应商保存、深链导入与代理切换之间的配置一致性。

### Pi Agent 供应商兼容性

- 为所有 Pi 预设和新建、编辑流程补全兼容的 `User-Agent` 请求头，修复部分 API 服务返回 403 的问题。
- 启动时自动迁移已有 Pi 供应商配置，同时保留用户自定义请求头并继续将 API Key 独立存储在 `auth.json`。

### 桌面体验

- 侧栏版本号改为读取当前应用版本，升级后会自动显示最新版本。
- 移除已停用的项目切换器设置，简化设置页面。

## English

### Codex Provider Compatibility

- Fixed custom provider switches overwriting or narrowing authentication settings, model catalogs, and reasoning levels.
- Expanded XFcode API Codex presets, request headers, and capability metadata while preserving manually configured authentication fields.
- Kept provider saves, deep-link imports, and proxy switching aligned on the same configuration contract.

### Pi Agent Provider Compatibility

- Added a compatible `User-Agent` header to every Pi preset and add/edit flow, resolving 403 responses from affected API services.
- Existing Pi providers are migrated on startup without replacing custom headers, while API keys remain isolated in `auth.json`.

### Desktop Experience

- The sidebar now reads the running application version and updates automatically after an upgrade.
- Removed the retired project switcher preference from Settings.
