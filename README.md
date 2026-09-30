# StackFerry

<p align="center">
  <img src="public/icon.png" width="96" height="96" alt="StackFerry">
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/Ninthless/StackFerry/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Ninthless/StackFerry"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/Ninthless/StackFerry"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0A0A0A">
  <a href="https://x.com/ninthless"><img alt="X @ninthless" src="https://img.shields.io/badge/X-%40ninthless-0A0A0A?logo=x&logoColor=white"></a>
</p>

Desktop control plane for coding CLIs. It keeps providers, local failover, Skills, and MCP in one place, then writes them into the CLI you enable. Codex, Claude Code, and Grok work today. More CLIs will be added the same way.

<p align="center">
  <img src="docs/media/home.png" width="796" alt="StackFerry home, with the welcome dialog in front of the Codex page">
</p>

<details>
<summary>Demo</summary>

https://github.com/user-attachments/assets/d73a89a6-6dde-4cb2-8d1f-55257e16d8b3

</details>

StackFerry does not replace those CLIs. It sits beside them: official login or a custom gateway, a backup before each write, and an optional failover queue on `127.0.0.1`.

## Contents

- [CLIs](#clis)
- [What it does](#what-it-does)
- [Install](#install)
- [Usage](#usage)
- [macOS](#macos)
- [Configuration](#configuration)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## CLIs

| | |
| --- | --- |
| Today | Codex, Claude Code, Grok |
| Later | More coding CLIs. Each one gets the same provider, routing, Skills, and MCP flow. |

## What it does

- **Providers.** Official login or a custom gateway, per CLI. Enable one and StackFerry backs up, then writes that CLI's live config. A gateway can hand the user a `stackferry://` import link; fields are in [docs/provider-import.md](docs/provider-import.md).
- **Local routing.** One failover queue per CLI. A non-empty queue sends that CLI through a loopback proxy with a circuit breaker. Official login stays out of the queue.
- **Skills.** Import `SKILL.md` from a GitHub repo or a local folder, keep StackFerry's copy, then project it onto Claude, Codex, and Grok.
- **MCP.** Add stdio or HTTP servers, or import definitions already in a CLI, and apply them to Claude, Codex, and/or Grok.
- **CLI binaries.** Detect, install, update, or uninstall the local Codex, Claude Code, and Grok Build binaries. Uninstalling a CLI does not delete StackFerry's provider data.
- **Desktop.** English and 简体中文, theme, Windows 11 Mica, a first-launch tour, and a tray. Closing the window hides the app. Quit restores routing-written configs to direct.

Windows and Linux packages check [GitHub Releases](https://github.com/Ninthless/StackFerry/releases) for updates. macOS builds are ad-hoc signed, so in-app update is unavailable. Download a new DMG.

## Install

Download the latest build from **[Releases](https://github.com/Ninthless/StackFerry/releases/latest)**.

| Platform | Artifact | In-app update |
| --- | --- | --- |
| Windows | NSIS `*-Setup.exe` (`x64` / `arm64`) | Yes. SmartScreen may warn on an unsigned installer; choose **Run anyway**. |
| Linux | AppImage and deb (`x64` / `arm64`) | Yes. `chmod +x` the AppImage first. AppImageUpdate can update the AppImage from GitHub Releases. deb updates may ask for a system password. |
| macOS | ad-hoc signed DMG (`arm64` / `x64`) | No. Follow [macOS](#macos). |

## Usage

1. Open StackFerry and pick Codex, Claude, or Grok.
2. Add a custom gateway, or keep official login.
3. Enable the provider you want. StackFerry writes that CLI's config. Codex `auth.json` is left untouched, so a ChatGPT login is still there when you switch back to official.
4. Restart that CLI or its terminal.
5. Optionally order a routing queue. Official login never enters the queue.
6. Import Skills and MCP, then apply them to the CLIs you use.

Closing the window hides StackFerry in the tray. **Quit** restores routing-written configs to direct.

A gateway can send someone straight to the import dialog:

```text
stackferry://import/providers?v=1&data=<base64url(JSON)>
```

StackFerry asks before adding a custom provider. It does not enable that provider, and it does not overwrite an existing name. Protocol fields: [docs/provider-import.md](docs/provider-import.md).

## macOS

CI produces an **ad-hoc signed DMG**, not a notarized Developer ID build. Gatekeeper often says the app is damaged. That message is the quarantine flag, not a corrupt download.

1. Download `arm64` (Apple silicon) or `x64` (Intel).
2. Open the DMG and drag `StackFerry.app` to `/Applications`. Do not run it from the DMG.
3. Clear quarantine:

```bash
xattr -dr com.apple.quarantine /Applications/StackFerry.app
```

4. In Finder, **Control-click → Open** once. If it is still blocked, use **System Settings → Privacy & Security → Open Anyway**.

Do not disable Gatekeeper with `spctl --master-disable`. Repeat steps 3–4 after each new DMG.

## Configuration

| CLI | Written on enable |
| --- | --- |
| Codex | `~/.codex/config.toml` (`%USERPROFILE%\.codex\config.toml` on Windows). `auth.json` is not overwritten. |
| Claude Code / Desktop | Claude Code `settings.json`, synced to Claude Desktop (`LOCALAPPDATA` / `~/Library/Application Support` / `XDG_CONFIG_HOME`). |
| Grok | `~/.grok/config.toml` |

Provider lists, routing queues, Skills, and MCP live in the app `userData` directory, not inside those CLI homes.

## Development

Node `>=22.12` and pnpm 11.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm build` packages the machine you are on.

```bash
pnpm build:win     # NSIS
pnpm build:mac     # ad-hoc DMG (macOS or CI)
pnpm build:linux   # AppImage + deb
```

To publish all three platforms, add a `CHANGELOG.md` section for the new version with both `### English` and `### 中文`, bump `package.json` `version`, and push a matching `v*` tag (`1.0.8` means tag `v1.0.8`). GitHub Actions builds Windows, macOS, and Linux, publishes a Latest GitHub Release from that section, and writes `latest.yml` / `latest-linux.yml` for Windows and Linux auto-update. The Linux job embeds AppImage update information and uploads a `.zsync` next to each AppImage. The app shows the notes for the current language. You can also run the `Release` workflow by hand to upload artifacts without publishing.

Layout:

- `CHANGELOG.md` — user-facing release notes
- `electron/main` — window, tray; per-CLI IPC and writers, routing, Skills, MCP, CLI install
- `electron/preload` — `window.stackferry`
- `shared` — types, IPC names, presets
- `src/features` — CLI workspaces (`codex`, `claude`, `grok`), shared provider widgets, Skills, MCP, settings
- `test` — Vitest

## Contributing

Questions and bugs: [GitHub Issues](https://github.com/Ninthless/StackFerry/issues). Pull requests are welcome. Please open an issue first for a larger change.

## License

[GPL-3.0](./LICENSE)
