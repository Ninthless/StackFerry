# Q-002 Independent Prompt Application

State: done

## Goal

Give Prompt management a visible, persisted application scope independent of Provider Routing.

## Contract

- Use a compact page-local supported-application selector, not the route `AppSwitcher`.
- Route all Prompt queries, mutations, imports, previews, and live-file writes through the Prompt selection.
- Close/reset editing state on application change and prevent an in-flight action from changing target.
- Prompt title/context reflects its own selection.

## Targets

- Prompt panel/actions, shell page identity, localization, and Prompt tests.

## Constraints

- Claude Desktop remains unsupported.
- A missing/invalid/hidden preference falls back locally without changing route state.

## Verification

- Tests cover independent persistence, every Prompt API argument, hidden-value fallback, and editor reset.
- Switching route application/provider does not change Prompt selection or records.
