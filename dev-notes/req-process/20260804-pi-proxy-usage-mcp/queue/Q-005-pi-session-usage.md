# Q-005 Pi Session Usage

State: done
Blocked by: Q-004

## Goal

Import historical and non-proxied Pi usage from append-only session JSONL without duplicating proxy records.

## Contract

- Resolve session roots using Pi's CLI-independent precedence available to StackFerry: configured agent/session directory, environment overrides, settings, then defaults.
- Parse versioned headers and every assistant entry in the JSONL tree, including compacted history and non-current branches; ignore context estimates as accounting rows.
- Persist deterministic identities from session and message IDs with provider, model, API, stop reason, timestamp, token categories, and `data_source=pi_session`.
- Incrementally resume appended files, tolerate partial final lines, rotations/moves, malformed individual entries, and missing optional usage.
- Deduplicate exact identities first and matching proxy usage second; repeated sync is idempotent.
- Token totals reconcile with Pi `get_session_stats`; StackFerry cost follows its configured pricing and reports unpriced models honestly.

## Targets

- New Pi session importer, aggregate sync service, cursors/state, data-source summary, usage events, tests, and translations.

## Constraints

- Never modify Pi session files.
- No full rescans during routine refresh after a cursor is established.
- One bad file/entry does not abort other applications' session synchronization.

## Verification

- Version-3 branch/compaction fixtures, append-only second sync, partial line, moved/archive file, malformed row, and custom path tests.
- Proxy/session overlap and repeated import prove one logical request is counted once.
- Aggregate tokens match a fixture's Pi session stats while price-source differences remain explainable.
