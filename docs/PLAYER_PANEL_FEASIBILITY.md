# Player Actor Panel Feasibility Assessment

Date: 2026-05-23
System: turn-of-the-century
Scope: In-game player-facing workspace panel only, focused on heroes, pawns, and villains

## Executive Verdict

Feasibility is favorable.

A context-sensitive player actor panel is achievable in this system using the same Foundry Application V2 workspace patterns already used elsewhere in the codebase, combined with actor-specific context evaluation and section-level visibility rules. The panel should behave like the other workspace panels with respect to docking, undocking, resizing, drag and drop, opening, and closing.

The current system already proves the key building blocks needed for a successful implementation:

- Application V2-compatible UI infrastructure already exists in the workspace runtime.
- The workspace already supports docked, stacked, floating, and closeable panel behavior.
- Hero, villain, and pawn actor sheet classes already exist, but those are not the panel itself.
- The system already uses context-driven rerendering for combat and actor-facing workflows.
- Existing actor and item data models already expose the kinds of status, inventory, equipment, effect, and encounter information the panel needs.

Based on the current source, no hard platform blocker was identified that would prevent a player workspace panel from being implemented cleanly.

## Evidence From Current Source

Current implementation already contains meaningful panel-enabling infrastructure:

- Workspace V2 panel shell and interaction behavior:
  - [module/ui/workspace-v2/workspace-root-app.mjs](module/ui/workspace-v2/workspace-root-app.mjs)
  - [module/ui/workspace-v2/workspace-v2-coordinator.mjs](module/ui/workspace-v2/workspace-v2-coordinator.mjs)
  - [module/ui/workspace-v2/ui-region-governor.mjs](module/ui/workspace-v2/ui-region-governor.mjs)
- Application V2 support in the system entrypoint:
  - [turn-of-the-century.mjs](turn-of-the-century.mjs)
- Actor document and item document data models:
  - [module/models/actor.mjs](module/models/actor.mjs)
  - [module/models/item.mjs](module/models/item.mjs)
  - [module/models/effect.mjs](module/models/effect.mjs)
- Encounter and actor workflow refresh points:
  - [turn-of-the-century.mjs](turn-of-the-century.mjs)
  - [module/sheets/actor-sheet.mjs](module/sheets/actor-sheet.mjs)
  - [module/encounters/planner-context.mjs](module/encounters/planner-context.mjs)

## Requirement-by-Requirement Feasibility

Legend:

- Met now: implemented in current source
- Feasible with work: no platform blocker, requires engineering
- Risky but feasible: achievable with non-trivial integration risk

- The panel shows actor-relevant status, actions, effects, inventory, equipment, and turn context.
  - Status: feasible with work
  - Notes: the system already exposes the underlying actor and combat data, but the dedicated panel model still needs to be built.

- The panel is context-aware and changes by game state.
  - Status: feasible with work
  - Notes: current code already rerenders actor-related surfaces on combat and document hooks and can be extended with panel context evaluation.

- The panel behaves like the other workspace panels with docking, undocking, resizing, drag/drop, and close/open actions.
  - Status: feasible with work
  - Notes: the existing workspace runtime already demonstrates those behaviors and can be reused as the interaction model. The panel can default to the right edge dock when the user has no saved preference.

- Hero, pawn, and villain contexts are handled intentionally.
  - Status: feasible with work
  - Notes: separate sheet classes and data models already exist for each actor type.

- Sections can expand, collapse, and persist user preference.
  - Status: feasible with work
  - Notes: the workspace runtime already persists layout and panel state patterns that can be reused.

- Ownership, permissions, and role-based access are respected.
  - Status: feasible with work
  - Notes: the current system already distinguishes GM-only flows from player-facing flows.

- Context signals can drive rerendering without stale UI.
  - Status: feasible with work
  - Notes: Foundry hooks and actor/combat updates already provide the event surface needed for refreshes.

- Strict Application V2 compliance.
  - Status: feasible with work
  - Notes: the workspace code already uses Application V2 where available and provides a migration path for V2-compliant panel classes.

## Workspace Panel Definition Check

For this prompt, complete replacement means the actor-facing workflow should be represented through the new workspace panel rather than through a pile of unrelated floating windows or generic sheet clutter.

### Actor-facing surfaces that can be represented in the panel

- Current status and conditions
- Turn and encounter actions
- Active effects and reactions
- Inventory and equipment summaries, with inventory meaning carried items and equipment meaning only items actively assigned to a slot
- Relevant resource and stat readouts
- Actor-specific prompts and affordances

### Context Change Highlighting

- When a new section is introduced because the current game context changes, the user needs a clear visual cue that the section is newly available.
- A one-time highlight animation using color or opacity is appropriate for the first reveal of the section.
- The animation should be subtle but noticeable, and should not repeat unless the context creates the section again later.

Conclusion: these surfaces are technically representable and can be made context sensitive.

## Key Technical Risks

- Context overreach
  - Risk: moderate
  - Mitigation: keep the panel section model explicit and signal-driven, so actor data is only rendered when relevant.

- Role-specific UI complexity
  - Risk: moderate
  - Mitigation: use a shared actor-context service with type-specific section rules for hero, pawn, and villain behavior.

- Docking and drag/drop parity
  - Risk: moderate
  - Mitigation: reuse the workspace panel layout engine and interaction controller rather than inventing a separate panel system.

- Refresh churn during combat and document changes
  - Risk: moderate
  - Mitigation: centralize context recomputation and debounce non-critical rerenders.

- Player/GM permission boundaries
  - Risk: moderate
  - Mitigation: derive visibility from actor ownership, actor type, and context-specific action gating.

- UI parity scope creep
  - Risk: moderate
  - Mitigation: define an initial milestone-based panel inventory and do not attempt to mirror unrelated GM workflows.

## Constraints and Assumptions

- Out of scope remains code implementation in this request; this document is assessment only.
- The panel is a workspace panel, not an actor sheet.
- Existing actor sheet customization remains a source of behavior to preserve, not to discard.
- Initial compatibility target is Foundry v14, consistent with current system direction.

## Feasibility Decision

Proceed with conversion.

The player actor workspace panel is viable and should move forward with a phased technical design and milestone plan focused on:

- explicit actor-context modeling,
- section-level relevance and prioritization,
- workspace panel composition with dock/undock and drag/drop behavior,
- and reliable refresh behavior across actor and combat state changes.
