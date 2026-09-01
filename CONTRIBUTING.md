# Contributing

## Verification

Use the repository verification entry points:

- `pnpm verify` runs the portable frontend, contract, architecture, Node, announcement, and renderer checks.
- `pnpm verify:full` adds the locked Rust formatting, Clippy, and test suite.
- CI may use `node scripts/verify.mjs --scope=frontend`, `--scope=rust`, or `--scope=announcements` to run the same source of truth by job.

Vitest always uses one worker to keep local and CI behavior deterministic. IPC command additions, removals, or renames must update `scripts/ipc-inventory.json` with `pnpm ipc:update`. The architecture gate enforces frontend `app`/`features`/`shared`/`platform` dependency direction, feature public boundaries, React-free query/config modules, Tauri IPC adapters, Rust capability direction, and an 800-effective-line source-file limit.

Existing architecture exceptions remain frozen in `scripts/architecture-baseline.json`. Existing oversized files are explicitly allowlisted with their current effective-line ceilings in `scripts/file-size-baseline.json`; new oversized files and growth beyond those ceilings fail validation. For an intentional reviewed exception, run `pnpm architecture:update`. The update is additive: it records current new exceptions without deleting unrelated baseline entries that may temporarily disappear during parallel migrations. Remove obsolete entries deliberately in a separate reviewed edit. Review both architecture baseline diffs before accepting them.

Install the optional tracked pre-push hook with `pnpm hooks:install`. It copies the cross-platform hook into the current checkout without changing user or repository Git configuration. The hook runs `pnpm verify`; CI remains the enforcement boundary because client hooks can be bypassed.

## Platform support

The portable verification suite runs on Windows, macOS, and Linux. Full Rust verification requires the native Tauri prerequisites for the current operating system. A passing check on one platform does not replace the CI matrix on the other two platforms, and release packaging or signing remains platform-specific.

Release tags must still pass `pnpm release:validate`. Announcement publication must still pass `pnpm announcements:validate` and its Node tests.
