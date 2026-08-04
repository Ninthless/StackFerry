# Q-004 Independent Session Filter

State: done

## Goal

Make Session management own and persist its existing client filter.

## Contract

- Remove the route-derived application prop and remount key.
- Default a clean profile to `all`; persist later user selections independently.
- Keep backend all-client scanning unchanged.
- Reconcile selected-session UI when search/filter excludes the selection.

## Targets

- Session manager lifecycle/filter code and component/integration tests.

## Constraints

- Session `providerId` continues to mean client type, not an API provider UUID.
- Route application visibility does not silently overwrite the Session filter.

## Verification

- Tests cover clean default, persistence across navigation/remount, invalid stored values, and route/provider switching isolation.
- Existing search, grouping, deletion, and detail tests remain green.
