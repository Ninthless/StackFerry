# RQ-001 Pi MCP Adapter

Checked: 2026-08-04

## Spec

- Goal: identify a valid, bounded way for StackFerry unified MCP management to target Pi.
- Constraints: Pi 0.80.7 has no built-in MCP; user files and project trust must remain authoritative.
- Output: package, config location/schema, lifecycle boundary, and adoption risk.

## RQ

- RQ-001A: Does Pi expose a native `mcpServers` setting?
- RQ-001B: Is there a maintained Pi package with a stable file contract StackFerry can project to?

## Evidence

- Fact: the inspected Pi docs say MCP is not built in and direct users to extensions/packages: [Pi usage documentation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/usage.md).
- Fact: Pi global packages are declared in the agent-dir `settings.json`; package manifests expose `pi.extensions`: [Pi packages documentation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/packages.md) and [settings documentation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/settings.md).
- Fact: `pi-mcp-adapter` installs with `pi install npm:pi-mcp-adapter`, reads standard shared files plus `<Pi agent dir>/mcp.json`, and uses `mcpServers` there. It supports stdio and Streamable HTTP with SSE fallback, env/cwd/headers/auth, lifecycle, timeout, disabled state, tool filters, and direct tools: [adapter README](https://github.com/nicobailon/pi-mcp-adapter#readme).
- Fact: the checked package manifest is version `2.19.0`, declares a Pi extension, Node >=20, and optional `@earendil-works` Pi peers: [adapter package manifest](https://github.com/nicobailon/pi-mcp-adapter/blob/main/package.json).
- Fact: adapter config precedence allows project files to override global Pi files; global StackFerry state therefore cannot promise the effective project runtime without detecting that override.

## Options

- A: pin and manage `pi-mcp-adapter`, projecting StackFerry servers into the Pi global override file.
- B: implement and distribute a new StackFerry Pi extension and private config schema.
- C: write MCP fields directly into Pi settings or rely on imports from another host.

## Pick

Pick A. It is the smallest implementation that satisfies the user-visible MCP requirement while honoring Pi's real extension boundary. Q-007 must keep the package/config boundary replaceable and must not call it a Pi-native feature.

## Risk

- Third-party version and supply-chain risk: pin and test a reviewed version; do not auto-track `latest`.
- Node/keyring/OS differences: report install/runtime status and cover supported platforms.
- Project override precedence: display conflict/override state and leave project files untouched.
- Command-valued secrets: copy expressions as data only; StackFerry must never evaluate them.
