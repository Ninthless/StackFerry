<div align="center">

# StackFerry

Desktop configuration and routing manager for AI coding tools

[简体中文](README.zh-CN.md) | **English**

[![Release](https://img.shields.io/github/v/release/Ninthless/StackFerry)](https://github.com/Ninthless/StackFerry/releases/latest)
[![CI](https://github.com/Ninthless/StackFerry/actions/workflows/ci.yml/badge.svg)](https://github.com/Ninthless/StackFerry/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Ninthless/StackFerry/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Download](https://github.com/Ninthless/StackFerry/releases/latest) · [All releases](https://github.com/Ninthless/StackFerry/releases) · [Release notes](RELEASE.md)

</div>

StackFerry is a Tauri desktop application for managing providers, credentials, models, and active routes across AI coding tools. It combines configuration management with local request routing, failover, reusable prompts and skills, MCP configuration, session inspection, usage statistics, and remote backup.

## Product Preview

<p align="center">
  <img src="./docs/images/provider-routes.png" alt="StackFerry provider routes" width="100%">
</p>

<p align="center">
  Manage providers, credentials, models, prompts, skills, MCP servers, and coding sessions from one desktop workspace.
</p>

<p align="center">
  <img src="./docs/images/provider-editor.png" alt="StackFerry provider editor" width="49%">
  <img src="./docs/images/skills-management.png" alt="StackFerry skills management" width="49%">
</p>

<p align="center">
  <img src="./docs/images/mcp-management.png" alt="StackFerry MCP server management" width="49%">
  <img src="./docs/images/session-manager.png" alt="StackFerry session manager" width="49%">
</p>

<details>
<summary>More screenshots</summary>

<p align="center">
  <img src="./docs/images/prompts.png" alt="StackFerry prompts management" width="100%">
</p>

</details>

## Core Capabilities

- **Provider management:** Keep multiple API providers and model configurations for each supported tool, then switch the active configuration without manually editing tool files.
- **Local routing:** Route compatible requests through a local proxy with request and response conversion, streaming support, global outbound proxy settings, and per-provider options.
- **Failover:** Arrange providers in a priority queue and use health checks and circuit breakers to move traffic away from unavailable routes.
- **Prompts and Skills:** Manage prompts by target application; discover skills from repositories or skills.sh, import ZIP archives, install skills, and restore skill backups.
- **MCP servers:** Add, import, and project MCP server definitions into each tool's native configuration format.
- **Sessions and usage:** Search and inspect local sessions, remove sessions in batches, and review request, token, and cost data when the underlying tool or provider exposes it.
- **Synchronization:** Back up application data and skills to user-configured WebDAV or S3-compatible storage, with optional automatic synchronization.
- **Tool maintenance:** Detect installed CLI versions, install or update supported tools, and diagnose conflicting installations, including Windows and WSL environments.

## Supported Tools

| Tool           | Provider routing | Prompts | Skills | MCP | Sessions |
| -------------- | :--------------: | :-----: | :----: | :-: | :------: |
| Claude Code    |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| Claude Desktop |       Yes        |    -    |   -    |  -  |    -     |
| Codex          |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| Pi             |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| Gemini CLI     |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| Grok Build     |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| OpenCode       |       Yes        |   Yes   |  Yes   | Yes |   Yes    |
| OpenClaw       |       Yes        |    -    |   -    |  -  |   Yes    |
| Hermes         |       Yes        |   Yes   |  Yes   | Yes |   Yes    |

Availability varies because each tool has a different native configuration format. OpenClaw also has workspace, environment, tool-access, and agent-default views. Hermes includes memory management and a shortcut to its dashboard.

## Download and Install

Download the appropriate package from the [latest GitHub Release](https://github.com/Ninthless/StackFerry/releases/latest). Release assets cover Windows, macOS, and Linux; the exact installers and architectures are listed on each release page. Windows releases also provide portable archives when available.

StackFerry publishes signed updater artifacts for in-app updates. Check the release notes for platform-specific instructions.

## Getting Started

1. Install the AI coding tools you intend to manage.
2. Start StackFerry and choose a target tool from the application switcher.
3. Add a provider or review the configuration imported as the default provider.
4. Activate the provider to write its configuration to the target tool.
5. Enable local routing only when the provider or protocol requires it. Configure the failover queue before enabling automatic failover.
6. Configure Prompts, Skills, MCP, synchronization, and other optional features independently for their intended target applications.

StackFerry uses its own application identifier, data directory, database, deep-link scheme, synchronization namespace, and update artifacts. It does not overwrite CC Switch's application data.

## Feature Notes

### Skills

Skills can be discovered from configured Git repositories or searched through skills.sh. StackFerry validates and scans repositories before saving them, supports ZIP imports and backup restoration, and installs a selected skill into a selected target application. Master copies can live in StackFerry's data directory or in the open `~/.agents/skills` location and are projected to compatible tools.

### Sessions and Usage

The session manager covers Claude Code, Codex, Pi, Gemini CLI, Grok Build, OpenCode, OpenClaw, and Hermes. It supports search, provider and directory grouping, detail inspection, and batch deletion. Usage statistics combine available local session logs and local-routing records; token, cost, subscription, and provider-query data depend on the selected tool and upstream service.

### Imports and Synchronization

The `stackferry://` deep-link scheme can import supported provider, prompt, MCP, and skill data after an in-app confirmation. WebDAV and S3 synchronization require storage configured and trusted by the user. Review imported content and remote-storage settings before accepting them.

## Development

### Requirements

- Node.js 22.12.0 or later
- pnpm 10.12.3
- Rust 1.95.0 for the supported development and release toolchain
- Native [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system

The repository includes Tauri CLI 2 as a development dependency; a separate global Tauri installation is not required.

### Setup

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the complete Tauri application and redirects supported tool homes into `.stackferry-dev/`, keeping development changes away from real user configurations. Use `pnpm dev:renderer` only when working on the browser renderer without the native backend.

### Verification

```bash
pnpm verify
pnpm verify:full
```

`pnpm verify` is the cross-platform development gate. `pnpm verify:full` also runs locked Rust formatting, Clippy for all targets with warnings denied, and Rust tests. Full Rust verification requires the native Tauri prerequisites for Windows, macOS, or Linux; one platform does not replace the three-platform CI matrix. Release packaging and signing remain platform-specific.

Architecture validation protects the frontend capability boundaries, Rust dependency direction, direct Tauri IPC access, and source-file size ceilings. Existing exceptions are frozen in reviewed architecture and file-size baselines; `pnpm architecture:update` adds intentional exceptions without erasing unrelated entries during parallel migrations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for scoped CI verification, baseline review rules, and the optional pre-push hook.

### Build Commands

| Command            | Output                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| `pnpm build:fast`  | Faster optimized executable using the `fast-release` Rust profile, without an installer |
| `pnpm bundle:fast` | One platform-native installer: MSI, DMG, or AppImage                                    |
| `pnpm build`       | Full production bundle used as the basis for release artifacts                          |

Workspace settings place rust-analyzer output in `src-tauri/target/analyzer` so editor checks and CLI builds do not invalidate each other's caches.

## Project Structure

```text
src/                  React and TypeScript renderer
src-tauri/src/        Rust commands, services, database, routing, and adapters
scripts/              Development, fast-build, and release-manifest scripts
tests/                Frontend component and integration tests
.github/workflows/    CI and multi-platform release workflows
```

The renderer communicates with the Rust backend through Tauri commands and events. Rust owns native configuration access, SQLite persistence, proxy services, synchronization, session parsing, and system integration.

## Release Process

1. Set the same SemVer in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Update the root package entry in `src-tauri/Cargo.lock`.
2. Update `RELEASE.md` and validate the matching tag:

   ```bash
   pnpm release:validate v0.1.6
   ```

3. Commit the version changes, create a `vX.Y.Z` tag, and push it.
4. GitHub Actions validates the version, builds the platform matrix, gathers signed updater assets, generates `latest.json`, and publishes the GitHub Release.

The release workflow requires `TAURI_SIGNING_PRIVATE_KEY` as a repository secret. Never commit the signing key.

## Data and Security

- Provider credentials and application settings are stored locally in StackFerry-managed configuration and database files. Never commit real API keys or synchronized backups to source control.
- Local routing and failover change where tool requests are sent. Review provider endpoints and routing settings before enabling them, especially for official accounts.
- Third-party providers, imported deep links, skill repositories, MCP servers, scripts, and synchronization endpoints are outside StackFerry's trust boundary. Evaluate them before use.
- Back up important native tool configurations before making large changes. Synchronization is not a substitute for an independently verified backup.

## Foundation and License

StackFerry began from the [CC Switch](https://github.com/farion1231/cc-switch) 3.19.0 codebase and retains its MIT license, copyright notice, attribution, and Git history. StackFerry is maintained as an independent project and does not automatically track CC Switch.

StackFerry is distributed under the [MIT License](LICENSE). The original copyright notice remains:

```text
Copyright (c) 2025 Jason Young
```

StackFerry is not affiliated with or endorsed by the CC Switch maintainers or by the vendors of the supported AI tools. Product names and trademarks belong to their respective owners.
