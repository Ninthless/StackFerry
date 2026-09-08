# StackFerry

Electron 桌面应用：管理 Codex、Claude Code、Grok Build 的供应商配置，按 CLI 做本地 failover 路由，并同步 Skills。

```bash
pnpm install
pnpm test
pnpm dev
```

需要 Node `>=22.12` 与 pnpm 11。`pnpm build` 会打包 Windows 安装包。

启用供应商后请重启对应 CLI / 终端。应用不会覆盖 Codex `auth.json`，切回官方登录时会保留 ChatGPT 登录缓存。关闭窗口会藏到托盘；退出时会把路由写回的配置还原成直连。

## 能做什么

- **供应商**：为每个 CLI 保存多套官方 / 自定义网关，启用时先备份再写入该 CLI 的配置文件。
- **本地路由**：每条 CLI 一条队列。队列非空时，请求经本机 `127.0.0.1` 代理按序尝试上游，并带熔断。官方登录不会进队列。
- **Skills**：从 GitHub 仓库或本地文件夹导入 `SKILL.md`，安装后可投影到 Claude、Codex、Grok。
- **CLI 工具**：检测、安装、更新、卸载本机上的 Codex / Claude Code / Grok Build。卸载 CLI 不会删除 StackFerry 写入的供应商配置。
- **外观**：主题、界面语言、Windows 11 Mica。

## 配置落点

| CLI | 启用时写入 |
| --- | --- |
| Codex | `%USERPROFILE%\.codex\config.toml` |
| Claude Code / Desktop | Claude Code `settings.json`，并同步 Claude Desktop |
| Grok Build | `%USERPROFILE%\.grok\config.toml` |

供应商列表、路由队列、Skills 目录缓存在应用 `userData`，不是 CLI 自己的目录。

## 目录

- `electron/main` 窗口、托盘、IPC、写盘、路由、Skills、CLI 安装
- `electron/preload` 暴露 `window.stackferry`
- `shared` 前后端共用类型、IPC 名、预设
- `src/features` 各 CLI 工作区、Skills、设置
- `src/components/ui` shadcn / Base UI 组件
- `src/lib` 无业务的小工具
- `test` Vitest
