<div align="center">

# StackFerry

### Provider routing and configuration for AI coding tools

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#development)

</div>

StackFerry is an independent desktop application for managing custom AI providers, API endpoints, credentials, and active routes across coding tools.

StackFerry is not affiliated with or endorsed by the CC Switch maintainers.

## Project Status

StackFerry `0.1.0` is in active development. Its package, application identifier, data directory, database, Deep Link scheme, sync namespace, generated files, and release artifacts are isolated from CC Switch.

The initial StackFerry codebase was based on CC Switch `3.19.0`.

Signed in-app installation is disabled until StackFerry has its own updater signing key. Version checks use the StackFerry GitHub Releases feed and direct users to the release page for manual installation.

## Foundation

StackFerry began from the CC Switch `3.19.0` codebase and preserves its MIT license, copyright notice, attribution, and Git history. StackFerry is maintained as a standalone project and does not automatically track CC Switch.

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

Release builds use StackFerry identifiers and artifact names. GitHub Releases remain manual-install releases until independent updater signing is configured.

## License

StackFerry is distributed under the [MIT License](LICENSE).

The original [CC Switch](https://github.com/farion1231/cc-switch) copyright and license notice are retained as required by the MIT License:

```text
Copyright (c) 2025 Jason Young
```
