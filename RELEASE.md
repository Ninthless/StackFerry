# StackFerry v0.1.19

> 自 v0.1.18 发布以来的更新。

## 简体中文

### 应用内公告系统

- 新增独立公告中心，支持未读状态、全部已读、重要公告横幅和紧急公告确认弹窗。
- 侧边栏新增全局公告入口；存在未读公告时显示红点，实际打开详情后才标记已读。
- 公告支持简体中文、繁体中文、英文和日文内容，并按应用版本、系统平台、发布渠道和有效期过滤。
- 客户端通过代理感知 HTTP 获取公告，支持 ETag、Last-Modified、30 分钟缓存、响应大小限制和原子写入。
- 网络或远端清单不可用时，自动使用最后有效缓存或随应用内置的公告，不阻塞客户端启动。
- 公告操作限制为 HTTPS 外链和现有更新页面导航，远端内容不能执行脚本或任意 Tauri 命令。
- 窄屏公告页改为列表与详情主从切换，宽屏保持左右双栏，并基于工作区实际宽度响应。
- 新增 JSON Schema、静态清单校验脚本和 GitHub Pages 自动发布工作流。

## English

> Changes since the v0.1.18 release.

### In-App Announcements

- Added a dedicated announcement center with unread state, mark-all-read, important banners, and critical acknowledgement dialogs.
- Added a global sidebar entry with an unread dot that clears only after the announcement detail is opened.
- Added localized announcement content for Simplified Chinese, Traditional Chinese, English, and Japanese, filtered by app version, platform, channel, and expiry.
- Added proxy-aware fetching with ETag, Last-Modified, a 30-minute cache, response size limits, and atomic persistence.
- Added offline fallback to the last valid cache or a bundled announcement without blocking application startup.
- Restricted remote actions to HTTPS links and navigation to the existing updater page; announcements cannot execute scripts or arbitrary Tauri commands.
- Rebuilt narrow layouts as list-to-detail navigation while retaining a side-by-side workspace on wider layouts.
- Added a JSON Schema, manifest validation scripts, and a GitHub Pages publishing workflow.
