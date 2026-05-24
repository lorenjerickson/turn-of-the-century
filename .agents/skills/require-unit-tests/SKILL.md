---
name: require-unit-tests
description: Require focused unit tests for new or changed Turn of the Century code, data transformations, Foundry-facing services, and bug fixes. Use whenever Codex modifies source files, adds behavior, refactors logic, creates panels, changes migrations, or touches testable compendium/content generation code in this repository; also use to add opportunistic coverage for nearby existing code when practical.
---

# Require Unit Tests

## Core Rule

For every code change, add or update focused unit tests that prove the behavior changed as intended.

If no unit test is practical for a change, state the reason clearly in the final response and run the strongest available alternative verification. Acceptable exceptions include pure documentation edits, static asset additions, manifest-only metadata changes, and changes that require an unmockable Foundry runtime surface before a test harness exists.

## Workflow

1. Identify the behavior being changed before editing.
2. Locate existing tests and test tooling. If none exists, recommend or create the smallest appropriate harness for the task.
3. Prefer tests around pure logic, adapters, data normalization, schema migration helpers, layout/state services, and command handlers.
4. For Foundry-dependent code, isolate the testable unit by mocking the smallest practical surface: `foundry.utils`, `game`, `ui`, `Hooks`, document instances, or DOM APIs.
5. Add regression tests for bug fixes before or alongside the fix whenever feasible.
6. Run the relevant test command after implementation. If dependencies or tooling are missing, install or scaffold them when the user has permitted it for the repo.
7. Report exactly what tests were added and what command was run.

## Opportunistic Coverage

When touching legacy code that lacks coverage, add a nearby test if it is low-friction and reduces future risk. Favor high-value coverage over broad snapshots:

- normalization and validation branches
- migration behavior
- layout engine transitions
- permission or role gates
- derived model calculations
- error handling and fallback paths
- content-generation constraints that protect the setting tone

Do not expand scope into unrelated refactors solely to make code easier to test unless the user approved or the maintainability gain is obvious and tightly bounded.

## Foundry VTT Guidance

Keep tests independent of a running Foundry world when possible. Wrap Foundry globals behind local setup/mocks instead of depending on browser state.

For Application V2 panels and workspace UI, test the state and rendering helpers that can run headlessly. Use DOM-capable tests only when behavior depends on event wiring, selectors, drag/drop, resizing, or rendered markup.

For game-system content, tests may validate JSON shape, required fields, references, semantic constraints, and project-specific no-magic/science-grounded language rules when those are relevant to the change.

## Final Response Requirements

Include a concise verification line:

- `Tests: <command>` when tests ran successfully.
- `Tests: not run (<reason>)` when they could not be run.
- `Tests: not applicable (<reason>)` only for changes with no meaningful test surface.

If the change adds meaningful behavior without tests, call that out as residual risk rather than burying it.
