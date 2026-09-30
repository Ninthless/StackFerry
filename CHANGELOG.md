# Changelog

User-visible changes live here. GitHub Releases and in-app update notes use the section for the current `package.json` version. Write each version under `### English` and `### 中文`. Skip internal refactors, tests, and chores.

用户能感知的变化写在这里。GitHub Release 和应用内更新说明都读当前 `package.json` 版本对应的一节。每个版本先写 `### English`，再写 `### 中文`。内部重构、测试和 chore 不必写入。

## 1.1.3 - 2026-09-30

### English

#### Added

- StackFerry is submitted to AppImageHub (https://appimage.github.io). The catalog page links to GitHub Releases. On Linux, download the AppImage and run `chmod +x`. The page appears after the catalog test passes and the pull request is merged.

#### Fixed

- After Claude Code is uninstalled and installed again, an enabled custom gateway, failover routing, and egress proxy are written back to the CLI. A freshly installed CLI uses that configuration and no longer stops on the login page.
- The Linux AppImage SquashFS now uses gzip. AppImageHub can mount only zlib or zstd, so the published xz package cannot pass the catalog test.
- An AppImage checks for updates and replaces itself. A deb `package-type` left in the same build no longer makes that launch download and install the deb.

#### Upgrade notes

- After updating, open StackFerry once, then restart Claude Code.

### 中文

#### 新增

- StackFerry 收录进 AppImageHub（https://appimage.github.io）。目录页链到 GitHub Releases；Linux 上下载 AppImage 后 `chmod +x` 即可运行。目录测试通过并合并后，页面才会出现

#### 修复

- 卸载并重新安装 Claude Code 后，已启用的自定义网关、故障路由和出站代理会写回 CLI；新装的命令行会直接走这份配置，不再停在登录页
- Linux AppImage 的 SquashFS 改为 gzip。AppImageHub 只能挂载 zlib 或 zstd，当前已发布的 xz 包无法通过收录测试
- 从 AppImage 启动时，检查更新会下载并替换这个 AppImage。同一次打包留下的 deb `package-type` 不会再让它去安装 deb

#### 升级注意

- 更新后打开一次 StackFerry，再重启 Claude Code

## 1.1.2 - 2026-09-27

### English

#### Added

- When adding a provider for Claude or Grok, you can pick the XFCode preset. Its gateway address uses the same OrangeCC site as Codex.
- Settings accept an HTTP or HTTPS egress proxy, for a local or remote address. Upstream requests for custom providers go through it.

#### Fixed

- Linux packages install 16–512 icons that desktop themes can index, so the launcher and taskbar show the logo instead of a gear.
- Dragging the custom title bar on Linux no longer jumps the window to the cursor.
- Minimize, maximize, and close on Windows and Linux are in-page buttons again, so dropdowns and dialogs can cover them. macOS still uses the system traffic lights.
- Adding a skill repository no longer removes a saved repository from the UI when its directory is temporarily empty.
- When Codex uses a custom model, the context window in the panel is written as the catalog limit and is no longer clipped by the model's own window.
- An empty or invalid egress proxy address is explained in a notice, instead of leaving the internal error under the form.

#### Upgrade notes

- After changing the Codex context window, re-enable the current provider and start a new thread.
- After turning the egress proxy on or off, restart the CLI that is in use.

### 中文

#### 新增

- Claude 与 Grok 添加供应商时可直接选 XFCode 预设，网关地址与 Codex 使用同一 OrangeCC 站点
- 设置里可以填写 HTTP 或 HTTPS 出站代理，本机和远程地址都可以；自定义供应商的上游请求会经过它

#### 修复

- Linux 安装包写入桌面主题能识别的 16–512 图标，启动器和任务栏显示 logo，不再回落到齿轮
- Linux 自定义标题栏拖动时窗口不再跳到光标处
- Windows/Linux 最小化、最大化和关闭改回页面内按钮，下拉面板和对话框可以盖住它们；macOS 仍用系统红绿灯
- 添加技能仓库后若目录暂时为空，不再把已保存的仓库从界面清掉
- Codex 使用自定义模型时，面板里的上下文窗口会写入模型目录上限，不再被模型自带窗口裁掉
- 出站代理地址为空或不合法时，用提示条显示说明，不再把内部错误原文留在表单下面

#### 升级注意

- Codex 上下文窗口改完后，重新启用当前供应商，并新开一条线程
- 出站代理打开或关闭后，重新启动正在使用的 CLI

## 1.1.1 - 2026-09-15

### English

#### Fixed

- When Grok uses a custom gateway, the built-in `web_search` uses the same third-party endpoint as chat and turns on hosted search, so an empty response no longer interrupts the session.

#### Upgrade notes

- After updating, enable the current provider once so Grok's live config is rewritten.

### 中文

#### 修复

- Grok 启用自定义网关时，内置 `web_search` 跟聊天走同一套第三方端点，并打开 hosted search，避免空返回中断会话

#### 升级注意

- 更新后请启用一次当前供应商，才会改写 Grok 的 live 配置

## 1.1.0 - 2026-09-15

### English

#### Fixed

- When the Claude session window is set to 1M, Code appends `[1m]` to the model name and actually uses the 1M context.
- When Grok uses a built-in `grok-*` model, a custom context window is written into the live config.
- Grok's `/effort` menu includes xhigh.
- Switching back to official Grok login clears the custom table StackFerry left behind, so the login is no longer treated as a third party.

#### Upgrade notes

- After updating, enable the current provider once.
- Claude 1M, the Grok context window, and `/effort` are written into the CLI config only after you enable the provider again.

### 中文

#### 修复

- Claude 会话窗口设成 1M 时，Code 会在模型名后加 `[1m]`，真正用上 1M 上下文
- Grok 用内置 `grok-*` 模型时，自定义上下文窗口会写进 live 配置
- Grok 的 `/effort` 菜单能选到 xhigh
- 切回 Grok 官方登录后会清掉 StackFerry 留下的自定义表，不再被认成第三方

#### 升级注意

- 更新后请启用一次当前供应商
- Claude 1M、Grok 上下文或 `/effort` 都要重新启用才会写进 CLI 配置

## 1.0.9 - 2026-09-12

### English

#### Fixed

- After switching providers or toggling failover routing, existing third-party sessions for Codex, Grok, and Claude follow along.
- Failover routing and a single API share one session, so the same conversation can switch back and forth.

#### Upgrade notes

- After updating, enable the current provider once, or toggle failover routing once.
- Official-login sessions stay in their official drawer and are not mixed in.

### 中文

#### 修复

- 换供应商或开关故障路由后，Codex / Grok / Claude 的旧第三方会话会跟着走
- 故障路由与单个 API 共用同一会话，同一对话可来回切换

#### 升级注意

- 更新后请启用一次当前供应商，或开关一次故障路由
- 官方登录的会话仍留在原来的官方抽屉，不会混进来

## 1.0.8 - 2026-09-12

### English

#### Fixed

- After switching Codex or Grok providers, old sessions no longer report provider not found.
- Switching the Claude Desktop gateway no longer overwrites the same profile.
- Claude Code no longer fills the compaction window with 90% of the context automatically, which was compacting often and burning quota.

#### Upgrade notes

- If Claude session fields were used, enable the current provider once to clear the wrong compaction window.

### 中文

#### 修复

- 换 Codex / Grok 供应商后，旧会话不再报 provider not found
- Claude Desktop 换网关时不再覆盖同一份 profile
- Claude Code 不再把压缩窗口自动填成上下文的 90%，避免频繁压缩刷额度

#### 升级注意

- 用过 Claude 会话字段的，启用一次当前供应商即可清掉错误的压缩窗口
