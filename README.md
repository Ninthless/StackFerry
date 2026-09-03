# StackFerry

Electron 桌面应用：管理多套 Codex CLI 供应商配置，一键写入 `%USERPROFILE%\.codex\config.toml`。

```bash
npm install
npm test
npm run dev
```

启用供应商后请重启 Codex / 终端。应用不会覆盖 `auth.json`，切回官方登录时会保留 ChatGPT 登录缓存。

## 目录

- `electron/main` 窗口、托盘、IPC、Codex 写盘
- `electron/preload` 暴露 `window.stackferry`
- `shared` 前后端共用类型与预设
- `src/features/providers` 供应商界面与状态
- `src/components/ui` shadcn / Base UI 组件
- `src/lib` 无业务的小工具
