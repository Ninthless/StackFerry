# Q-006 Pi Provider Quota Scripts

State: done
Blocked by: Q-001

## Goal

Expose the existing provider quota/balance UsageScript workflow for Pi providers.

## Contract

- Remove the Pi-only frontend prohibition and make configure/test/run/refresh/delete actions available from Pi provider management.
- Resolve Pi base URL and credential from the same provider configuration used by switching, including supported references, without disclosing resolved secrets.
- Keep quota UsageScript output separate from request token/cost statistics while sharing refresh/cache behavior already used by other apps.
- Errors identify script/HTTP/parsing failure without including authorization or full secret-bearing output.

## Targets

- Provider action/menu/form and UsageScript modal gating.
- Pi credential resolution, script command integration, cache invalidation, translations, and tests.

## Constraints

- Do not execute unresolved Pi `!command` credential expressions merely to prefill or display the form.
- No behavior change for other app provider scripts.

## Verification

- Pi save/test/run/cache refresh/delete flows for literal and environment-referenced credentials.
- Redaction tests for logs/errors/UI and invalid/missing credential behavior.
- Regression tests for existing application UsageScripts.
