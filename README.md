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

StackFerry is in active early development. The current branch still contains inherited CC Switch product identifiers, assets, configuration paths, and update settings. Do not treat current builds as an official StackFerry release until the rebranding and release infrastructure work is complete.

The fork currently tracks CC Switch `3.18.0` as its baseline.

## Upstream Foundation

CC Switch provides the cross-platform Tauri foundation, provider configuration model, local routing capabilities, and integrations inherited by this fork. StackFerry keeps the upstream MIT license and copyright notice and will continue to document substantial upstream work.

For documentation about behavior that has not yet diverged, refer to the [CC Switch documentation](https://github.com/farion1231/cc-switch/tree/main/docs).

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

The current build still uses inherited CC Switch identifiers and updater settings. Distribution should wait until those values and signing infrastructure are replaced.

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
