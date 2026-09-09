# StackFerry

Electron 桌面应用：管理 Codex、Claude Code、Grok Build 的供应商配置，按 CLI 做本地 failover 路由，并同步 Skills。支持 Windows、macOS 与 Linux。

```bash
pnpm install
pnpm test
pnpm dev
```

需要 Node `>=22.12` 与 pnpm 11。当前机器上 `pnpm build` 只打本机平台。没有 Mac、也没有 Apple 证书时，用 GitHub Actions 打三端包：把 `package.json` 的 `version` 改好后推送对应 `v*` 标签（例如 `1.0.0` 推 `v1.0.0`），会发布到 GitHub Releases 并成为 Latest。Windows / Linux 应用内更新读这个 Latest 上的 `latest.yml` / `latest-linux.yml`。也可在 Actions 里手动跑 `Release` 工作流，只上传构建产物、不发版。

```bash
pnpm build:win    # NSIS
pnpm build:mac    # ad-hoc 签名 DMG（须在 macOS 上，或走 CI）
pnpm build:linux  # AppImage
```

| 平台 | 安装包 | 应用内更新 |
| --- | --- | --- |
| Windows | NSIS | 可用。SmartScreen 可能拦截未签名安装包，选“仍要运行”。 |
| Linux | AppImage | 可用。先赋予可执行权限。 |
| macOS | ad-hoc 签名 DMG | 不可用。按下方步骤安装，换版本请重新下载。 |

启用供应商后请重启对应 CLI / 终端。应用不会覆盖 Codex `auth.json`，切回官方登录时会保留 ChatGPT 登录缓存。关闭窗口会藏到托盘；退出时会把路由写回的配置还原成直连。

## macOS 安装

当前没有 Apple Developer ID，不能做公证。CI 打出的是 **ad-hoc 签名 DMG**（`arm64` 或 `x64`），不是商店包，也不是 Developer ID 签名包。从浏览器或 GitHub 下载后，macOS Gatekeeper 常会显示 **“已损坏，无法打开”**。这不是文件坏了，是隔离标记（quarantine）拦住了未公证应用。

1. 下载对应芯片的 DMG：Apple 芯片用 `arm64`，Intel 用 `x64`。
2. 打开 DMG，把 `StackFerry.app` 拖到 `/Applications`。不要从 DMG 里直接运行。
3. 打开「终端」，去掉隔离属性：

```bash
xattr -dr com.apple.quarantine /Applications/StackFerry.app
```

4. 在 Finder 里对 `StackFerry.app` **按住 Control 再点按 → 打开**，确认一次。之后可以正常启动。
5. 若仍被拦：打开「系统设置 → 隐私与安全性」，在被拦截记录旁选「仍要打开」。

不要用 `spctl --master-disable` 关掉整机 Gatekeeper。换版本时重新下载 DMG，再做一次第 3、4 步；关于页的应用内更新在 macOS 上不可用。

## 能做什么

- **供应商**：为每个 CLI 保存多套官方 / 自定义网关，启用时先备份再写入该 CLI 的配置文件。
- **本地路由**：每条 CLI 一条队列。队列非空时，请求经本机 `127.0.0.1` 代理按序尝试上游，并带熔断。官方登录不会进队列。
- **Skills**：从 GitHub 仓库或本地文件夹导入 `SKILL.md`，安装后可投影到 Claude、Codex、Grok。
- **CLI 工具**：检测、安装、更新、卸载本机上的 Codex / Claude Code / Grok Build。卸载 CLI 不会删除 StackFerry 写入的供应商配置。
- **外观**：主题、界面语言、Windows 11 Mica。
- **更新与公告**：已打包的 Windows / Linux 构建可检查 GitHub Releases；macOS 请按上一节重新下载 DMG。公告走独立 HTTPS 源。

## 配置落点

| CLI | 启用时写入 |
| --- | --- |
| Codex | `~/.codex/config.toml`（Windows 即 `%USERPROFILE%\.codex\config.toml`） |
| Claude Code / Desktop | Claude Code `settings.json`，并同步 Claude Desktop（Windows `LOCALAPPDATA`，macOS `~/Library/Application Support`，Linux `XDG_CONFIG_HOME`） |
| Grok Build | `~/.grok/config.toml`（Windows 即 `%USERPROFILE%\.grok\config.toml`） |

供应商列表、路由队列、Skills 目录缓存在应用 `userData`，不是 CLI 自己的目录。

## 目录

- `electron/main` 窗口、托盘、IPC、写盘、路由、Skills、CLI 安装
- `electron/preload` 暴露 `window.stackferry`
- `shared` 前后端共用类型、IPC 名、预设
- `src/features` 各 CLI 工作区、Skills、设置
- `src/components/ui` shadcn / Base UI 组件
- `src/lib` 无业务的小工具
- `test` Vitest
