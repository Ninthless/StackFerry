# Q-001 Pi Takeover Lifecycle

State: done
Blocked by: none

## Goal

Make Pi proxy takeover visibly enable/disable and survive provider switches, restart, and failed writes without losing the user's Pi configuration.

## Contract

- Add Pi to takeover status and controls; remove the current hard-coded false/hidden behavior.
- Use a Pi-namespaced local base URL while retaining provider/model IDs and API type.
- Treat takeover as an overlay. Snapshot only files/values that will be changed; do not replace OAuth or normalize credential sources.
- Respect `PI_CODING_AGENT_DIR`, Pi defaults, file permissions, unknown JSON fields, and concurrent writers.
- Provider switching during takeover updates the intended upstream/failover state while the live Pi route remains local.
- Startup reconciliation distinguishes active, cleanly disabled, interrupted enable, and interrupted restore states.

## Targets

- Pi config/provider persistence and tests.
- Proxy takeover service/commands/status and frontend Pi controls.
- Atomic JSON mutation/backup/recovery helpers already used by other applications where compatible.

## Constraints

- Do not mutate `auth.json` merely to route requests.
- Do not rename Pi provider/model IDs or force one API type.
- Preserve unrelated dirty-worktree changes and other application behavior.

## Verification

- Round-trip semantic equality tests for populated/empty/custom Pi configs and credential references.
- Failure injection at snapshot, live write, marker update, restore, and restart boundaries.
- Custom agent-dir, permissions, provider-switch-under-takeover, and UI status/control tests.
