# Q-003 Independent Skills Target

State: done

## Goal

Remove Provider Routing from Skills action targeting while preserving the unified Skill matrix.

## Contract

- Add a compact independent default-target control shared by installed Skills and discovery.
- Repo discovery, skills.sh, ZIP install, and backup restore use the captured Skills target.
- Existing per-Skill application toggles remain unchanged and authoritative.
- Changing the target never toggles an installed Skill automatically.

## Targets

- Unified Skills panel, discovery page, Skills query/mutation tests, and localization.

## Constraints

- Choices come from supported Skills applications; OpenClaw and Claude Desktop remain excluded.
- Pending actions cannot silently retarget after selection changes.

## Verification

- Tests exercise all install/restore entry points with a route application different from the Skills target.
- Matrix-cell toggle tests prove only the requested application changes.
