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
</p>

Desktop provider manager and local failover router for Codex, Claude Code, and Grok.

StackFerry is a local Electron desktop app. It stores official and custom gateways per CLI, writes the enabled provider into that CLI’s config (after a backup), optionally fronts traffic with a per-CLI failover queue on `127.0.0.1`, and keeps Skills plus MCP servers in one place so you can project them onto the tools you actually run.

## Table of Contents

- [Why](#why)
- [Install](#install)
- [Usage](#usage)
- [macOS](#macos)
- [Configuration](#configuration)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Why

Coding CLIs each have their own config files, auth files, and MCP/Skills layouts. StackFerry does not replace those tools. It is the control plane next to them:

- **Providers** — official login or custom gateways for Codex, Claude Code, and Grok. Enable one, and StackFerry backs up then writes the live CLI config. Gateways can ship a `stackferry://` import link; see [docs/provider-import.md](docs/provider-import.md).
- **Local routing** — one failover queue per CLI. When the queue is non-empty, requests go through a loopback proxy with circuit breaking. Official login stays out of the queue.
- **Skills** — import `SKILL.md` from a GitHub repo or a local folder, keep an app-owned copy, then project it to Claude, Codex, and Grok.
- **MCP** — add stdio/HTTP servers, import definitions already in the CLIs, and apply them to Claude, Codex, and/or Grok.
- **CLI tools** — detect, install, update, or uninstall the local Codex / Claude Code / Grok Build binaries. Uninstalling a CLI does not delete StackFerry provider data.
- **Desktop** — English / 简体中文 UI, theme, Windows 11 Mica, first-launch tour, tray (closing the window hides; Quit restores routed configs to direct).

Packaged Windows and Linux builds check [GitHub Releases](https://github.com/Ninthless/StackFerry/releases) for updates. macOS builds are ad-hoc signed, so in-app update is unavailable — redownload the DMG.

## Install

Download the latest build from **[Releases](https://github.com/Ninthless/StackFerry/releases/latest)**.

| Platform | Artifact | In-app update |
| --- | --- | --- |
| Windows | NSIS `*-Setup.exe` (`x64` / `arm64`) | Yes. SmartScreen may warn on an unsigned installer; choose **Run anyway**. |
| Linux | AppImage and deb (`x64` / `arm64`) | Yes. `chmod +x` the AppImage first. deb updates may ask for a system password. |
| macOS | ad-hoc signed DMG (`arm64` / `x64`) | No. Follow [macOS](#macos). |

After enabling a provider, restart that CLI or its terminal.

## Usage

1. Open StackFerry and pick Codex, Claude, or Grok.
2. Add a custom gateway or keep official login.
3. Enable the provider you want. StackFerry writes the CLI config; Codex `auth.json` is left untouched so a ChatGPT login survives switching back to official.
4. Optionally order a routing queue. Official login never enters the queue.
5. Import Skills / MCP and apply them to the CLIs you use.

Closing the window hides to the tray. **Quit** restores routing-written configs to direct.

Gateway vendors can deep-link users in with:

```text
stackferry://import/providers?v=1&data=<base64url(JSON)>
```

The app confirms before adding a custom provider. It does not enable the provider or overwrite an existing name. Protocol fields: [docs/provider-import.md](docs/provider-import.md).

## macOS

CI produces an **ad-hoc signed DMG**, not a notarized Developer ID build. Gatekeeper often says the app is “damaged”. That is the quarantine flag, not a corrupt download.

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

Provider lists, routing queues, Skills, and MCP live under the app `userData` directory, not inside those CLI homes.

## Development

Requires Node `>=22.12` and pnpm 11.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm build` packages the current machine only.

```bash
pnpm build:win     # NSIS
pnpm build:mac     # ad-hoc DMG (macOS or CI)
pnpm build:linux   # AppImage + deb
```

To ship all three platforms, bump `package.json` `version` and push a matching `v*` tag (for `1.0.6`, push `v1.0.6`). GitHub Actions builds Windows / macOS / Linux, publishes a Latest GitHub Release, and writes `latest.yml` / `latest-linux.yml` for Windows and Linux auto-update. You can also run the `Release` workflow by hand to upload artifacts without publishing.

Layout:

- `electron/main` — window, tray, IPC; per-CLI writers, routing, Skills, MCP, CLI install
- `electron/preload` — `window.stackferry`
- `shared` — types, IPC names, presets
- `src/features` — CLI workspaces, Skills, MCP, settings
- `test` — Vitest

## Contributing

Questions and bugs: [GitHub Issues](https://github.com/Ninthless/StackFerry/issues). Pull requests are welcome; please open an issue first for larger changes.

## License

[GPL-3.0](./LICENSE)
