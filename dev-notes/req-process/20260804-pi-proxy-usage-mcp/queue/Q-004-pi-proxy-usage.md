# Q-004 Pi Proxy Usage

State: done
Blocked by: Q-002, Q-003

## Goal

Record and display complete protocol-aware Pi proxy token and cost statistics.

## Contract

- Persist successful and failed Pi requests with `app_type=pi`, provider, request/model/API identity, source, status/error, duration, and any safely available partial usage.
- Normalize Pi's fresh input, output, cache read, cache write, optional 1h cache write, reasoning, and total tokens without double subtraction.
- Extract terminal usage from every supported stream family, including failure/abort after partial usage.
- Add Pi to frontend/backend application unions, filters, summaries, trends, tables, details, pricing configuration, cache semantics, refresh events, and data-source labels.
- Unknown/unpriced models remain visible and are not silently assigned another app's pricing.

## Targets

- Proxy usage parser/logger/calculator and statistics services/DAO.
- Usage TypeScript types/API/query/components, application metadata, pricing, and translations.

## Constraints

- No schema assumption that hard-codes Pi to one protocol.
- Preserve current token/cost semantics for every existing application.
- Request body and secret-bearing headers remain outside usage logs.

## Verification

- Golden usage fixtures for all ten text APIs plus image usage where supplied.
- Dashboard/filter/detail/pricing tests with Pi-only and mixed-app data.
- Cache-inclusive/exclusive, reasoning, partial usage, unknown price, multiplier, and rollup/recalculation tests.
