<div align="center">

# StackFerry

### Provider routing and configuration for AI coding tools

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-CC%20Switch-181717.svg)](https://github.com/farion1231/cc-switch)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#development)

</div>

StackFerry is an independent fork of [CC Switch](https://github.com/farion1231/cc-switch). It is being developed as a cleaner, more focused desktop experience for managing custom AI providers, API endpoints, credentials, and active routes across coding tools.

StackFerry is not affiliated with or endorsed by the CC Switch maintainers.

## Project Status

StackFerry is in active development. Its package, application identifier, data directory, database, Deep Link scheme, sync namespace, generated files, and release artifacts are isolated from CC Switch.

The fork currently tracks CC Switch `3.19.0` as its baseline.

Signed in-app installation is disabled until StackFerry has its own updater signing key. Version checks use the StackFerry GitHub Releases feed and direct users to the release page for manual installation.

## Upstream Foundation

CC Switch provides the cross-platform Tauri foundation, provider configuration model, local routing capabilities, and integrations inherited by this fork. StackFerry keeps the upstream MIT license and copyright notice and will continue to document substantial upstream work.

Current product documentation is maintained in this repository under [`docs`](docs).

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

## Repository Relationship

This repository is a GitHub fork of `farion1231/cc-switch`:

- Upstream: [farion1231/cc-switch](https://github.com/farion1231/cc-switch)
- Fork: [Ninthless/StackFerry](https://github.com/Ninthless/StackFerry)

Upstream changes may be synchronized selectively. StackFerry-specific product decisions, interface work, and release configuration are maintained in this repository.

## License

StackFerry is distributed under the [MIT License](LICENSE).

The original CC Switch copyright and license notice are retained as required by the MIT License:

```text
Copyright (c) 2025 Jason Young
```
