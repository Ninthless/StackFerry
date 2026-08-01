<div align="center">

# StackFerry

### Provider routing and configuration for AI coding tools

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#development)

</div>

StackFerry is an independent desktop application for managing custom AI providers, API endpoints, credentials, and active routes across coding tools.

StackFerry is not affiliated with or endorsed by the CC Switch maintainers.

## Supported Tools

Provider management covers Claude Code, Claude Desktop, Codex, Pi, Gemini CLI, Grok Build, OpenCode, OpenClaw, and Hermes.

For Pi, StackFerry manages custom providers in `models.json`, API credentials in `auth.json`, defaults in `settings.json`, sessions under `sessions/`, and skills under `skills/`. It respects `PI_CODING_AGENT_DIR` and does not duplicate API keys into `models.json`.

## Project Status

StackFerry `0.1.0` is in active development. Its package, application identifier, data directory, database, Deep Link scheme, sync namespace, generated files, and release artifacts are isolated from CC Switch.

The initial StackFerry codebase was based on CC Switch `3.19.0`.

StackFerry releases include signed updater artifacts for in-app installation. The application verifies every update against the public key embedded in its Tauri configuration.

## Foundation

StackFerry began from the CC Switch `3.19.0` codebase and preserves its MIT license, copyright notice, attribution, and Git history. StackFerry is maintained as a standalone project and does not automatically track CC Switch.

The Pi badge is sourced from the official [Pi Press Kit](https://pi.dev/press-kit).

## Development

### Requirements

- Node.js 18 or later
- pnpm 8 or later
- Rust 1.85 or later
- Tauri CLI 2.8 or later

### Setup

```bash
pnpm install
pnpm dev
```

### Verification

```bash
pnpm typecheck
pnpm format:check
pnpm test:unit
```

### Production Build

```bash
pnpm build
```

Release builds use StackFerry identifiers and artifact names. Before creating a tag, set the same SemVer in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. A matching `v*` tag publishes installers, updater signatures, and `latest.json` through GitHub Releases; mismatched or invalid tags fail before platform builds begin.

The release workflow requires `TAURI_SIGNING_PRIVATE_KEY` as a repository secret. macOS builds use ad-hoc signing without Apple notarization, so first launch may require manual approval in System Settings. In-app updates remain protected by StackFerry's updater signature.

## License

StackFerry is distributed under the [MIT License](LICENSE).

The original [CC Switch](https://github.com/farion1231/cc-switch) copyright and license notice are retained as required by the MIT License:

```text
Copyright (c) 2025 Jason Young
```
