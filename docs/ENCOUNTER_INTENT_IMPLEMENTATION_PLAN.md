---
name: ENCOUNTER_INTENT_IMPLEMENTATION_PLAN
description: Phased implementation plan for replacing simple AP-slot planning with intent-based encounter orders and resolution support.
---

# Encounter Intent Implementation Plan

This plan turns the encounter intent design notes into an incremental implementation path. The goal is to evolve the current action queue and tick resolver into a player-facing order system without breaking existing movement, targeting, reactions, roll locking, or round replay behavior.

## Current Baseline

The existing implementation is centered on action queue entries:

- `EncounterPlanningService` normalizes actions into a flat `plan` array and rejects total `apCost` above the round AP budget.
- `planner-context.mjs` builds `planSlots` and `queue` data from the flat plan.
- `player-encounter-panel.mjs` renders a tick-based AP strip with segments and an action picker popup.
- `EncounterPlanningFeature` selects an action, writes it directly into the plan, then optionally begins movement or targeting interactions.
- `EncounterResolutionEngine` resolves one current action per combatant using `pointer`, `progress`, `remainingAp`, and `apCost`.
- Timeline entries already contain enough structure to drive history rows and narration, but they do not yet expose order clauses or current-clause highlighting.

The first implementation goal is not to remove this machinery. The first goal is to introduce intent/order data alongside it, then gradually let the resolver consume the richer representation.

## Target Shape

Players define orders, not raw AP segments.

Example:

> Spend up to 4 AP to close on Elias Vane and attack with the Clockmaker's Stiletto. Use any leftover AP to enter Overwatch.

An order should preserve:

- A plain-language summary.
- A primary action or item variant.
- A target, object, location, or self target.
- An AP envelope: positioning AP, effect AP, maximum total AP.
- A positioning requirement: adjacent, weapon range, line of sight, object reach, ally reach, cover, or safe distance.
- Follow-through behavior, including the ability to choose another action if AP remains.
- Failure behavior if the requirement never becomes true.
- Optional sustained-intent metadata for round-boundary continuation.
- Clause metadata for GM resolution highlighting.

## Phase 1: Add Order Data Model And Compatibility Layer

Objective: define the new data shape without changing player workflow.

Implementation:

- Add a pure encounter module for order normalization, such as `module/encounters/encounter-order-model.mjs`.
- Define helpers that can normalize both legacy actions and new configured orders.
- Keep `apCost` available as a compatibility field equal to the order's maximum AP envelope.
- Add derived fields for:
  - `orderId`
  - `intentType`
  - `summary`
  - `clauses`
  - `apEnvelope`
  - `positioningRequirement`
  - `followThrough`
  - `failureOutcome`
  - `sourceAction`
- Update `EncounterPlanningService` to preserve these fields when normalizing plan entries.
- Add tests proving legacy action plans still normalize, lock, resize, remove, and budget-check exactly as before.

Test focus:

- `test/encounters/encounter-order-model.test.mjs`
- `test/encounters/encounter-planning-service.test.mjs`
- Legacy action normalization remains backward compatible.
- New order entries are rejected when their maximum AP envelope exceeds the AP budget.

Exit criteria:

- Existing AP plans still work.
- New order-shaped plan entries can be stored, loaded, locked, and budgeted.

## Phase 2: Generate Narrative Summaries For Existing Actions

Objective: make the panel display orders before changing how orders are authored.

Implementation:

- Add a pure summary builder, likely near the order model.
- Generate narrative summaries for current action entries:
  - Move: "Spend N AP to move toward the selected location."
  - Pursue: "Spend up to N AP pursuing [target]."
  - Attack: "Spend N AP to attack [target] with [item/action]."
  - Overwatch: "Hold Overwatch for up to N AP."
  - Use Item: "Spend N AP to use [item]."
- Update `planner-context.mjs` so each planned action exposes `summary`, `apEnvelope`, and `clauses`.
- Update `player-encounter-panel.mjs` to render a narrative order list as the primary display.
- Keep the AP strip as a secondary timing/accounting preview.

Test focus:

- `test/encounters/planner-context.test.mjs`
- `test/workspace-v2/player-encounter-panel.test.mjs`
- Summary text is escaped and stable.
- The old AP segment strip still renders.

Exit criteria:

- The player can use the old workflow, but the plan is displayed as readable orders.
- GM and player views can see summaries before any resolver behavior changes.

## Phase 3: Replace The Action Picker With Configure-Then-Add

Status: Implemented as an inline configuration view shown below the action plan. The action picker still appears as the selection surface, but choosing an action now opens a configurable order editor instead of immediately committing the action.

Objective: turn action selection into a two-step order builder.

Implementation:

- Replace the current "select popup action and immediately add it" behavior with:
  - Choose Action.
  - Configure Intent.
  - Add To Plan.
- Introduce a transient configuration state in `EncounterPlanningFeature`.
- Keep the existing action list but route selected actions into a configuration panel.
- Support minimum useful configuration fields:
  - Target selection mode.
  - Positioning AP allowance.
  - Effect AP.
  - Follow-through.
  - Failure outcome.
- Default simple actions aggressively:
  - Self-use actions skip movement configuration.
  - Already-valid adjacent or in-range actions default to immediate effect.
  - Movement actions retain the current movement overlay behavior.
- Continue storing orders in the same plan array so commit, clear, lock, and ready behavior remain unchanged.

Test focus:

- `test/workspace-v2/player-encounter-panel.test.mjs`
- `test/workspace-v2/encounter-planning-targeting.test.mjs`
- New tests for configure state transitions in `EncounterPlanningFeature`.
- Regression tests for movement and targeting overlay startup.

Exit criteria:

- Adding an action requires confirming a configured order.
- Basic legacy-equivalent orders can be created without extra clicks when no ambiguity exists.

## Phase 4: Implement Implied Movement Orders

Status: Implemented for combatant range/adjacency and stationary location adjacency. Configured non-movement orders can spend positioning AP through the movement resolver, then resolve their effect once the requirement is satisfied. Wall-aware line-of-sight and richer object document lookup remain future refinements.

Objective: support "do this to that target" orders that include movement inside the AP envelope.

Implementation:

- Add order intent families:
  - `attackTarget`
  - `interactWithObject`
  - `useOnTarget`
  - `holdReactionWindow`
- Add requirement evaluation helpers:
  - Is target adjacent?
  - Is target within weapon range?
  - Is line of sight available?
  - Is object reachable?
  - Is ally reachable?
- Add order-to-runtime expansion for current compatibility:
  - A configured order may emit a movement step until its requirement is true.
  - Once the requirement is true, it resolves the effect action.
- For moving combatant targets, use Pursue-like recalculation.
- For stationary objects or locations, use ordinary pathing.
- Make implied movement spend AP from the same order envelope.
- Keep explicit Move, Pursue, Follow, and Avoid actions working as first-class orders.

Test focus:

- New `test/encounters/encounter-order-requirements.test.mjs`
- `test/encounters/movement-resolver.test.mjs`
- `test/encounters/encounter-resolution-engine.test.mjs`
- Cases:
  - Attack target starts out of range and moves into range.
  - Target moves closer and order resolves early.
  - Target moves away and positioning AP is exhausted.
  - Unlock door moves to adjacency then performs unlock.
  - Treat ally moves to adjacency then uses item.

Exit criteria:

- At least one weapon order and one object interaction order can resolve through implied movement.
- AP spending is visible and never free.

## Phase 5: Early Completion, Follow-Through, And Additional Actions

Status: Implemented for implied orders. When an order resolves before its maximum AP envelope is spent, the completed order shrinks to its actual AP cost. A following planned action can therefore start earlier, while `overwatch` and `hold` follow-through choices insert synthetic leftover-AP actions into the plan.

Objective: handle leftover AP clearly when an order resolves before its envelope is exhausted.

Implementation:

- Implement default follow-through behavior per intent family:
  - Attack Target: maintain engagement, hold reach, or press.
  - Interact With Object: hold at object, open after unlock, clear passage.
  - Use On Target: remain with target, guard, withdraw.
  - Hold Reaction Window: end reaction, guard, or continue holding if AP remains.
- Always offer "choose another action if AP remains" in the configuration UI.
- Represent follow-through as another configured order or as an embedded next action.
- In the resolver, when an order completes early:
  - compute remaining AP in the current round,
  - apply configured follow-through,
  - if another action was selected, advance to it using only remaining current-round AP.
- Avoid automatic cross-round overflow in this phase.

Test focus:

- `test/encounters/encounter-resolution-engine.test.mjs`
- `test/encounters/encounter-planning-service.test.mjs`
- `test/workspace-v2/player-encounter-panel.test.mjs`
- Cases:
  - Early attack completion enters Overwatch.
  - Early unlock completion opens the door.
  - Early treatment completion starts a second configured action.
  - No leftover AP means follow-through is not offered or not executed.

Exit criteria:

- Early success no longer causes silent idling unless the player chose a holding follow-through.
- Selecting another action on leftover AP is a normal supported path.

## Phase 6: Engagement, Reach Windows, And Soft Failure

Status: Implemented for reach-window persistence, explicit break-away suppression with `Avoid`/`Evade`, configurable soft-failure outcomes, and item-provided melee reach. Engagement is currently represented through per-order reach windows rather than a persistent engagement map; redirect-to-nearby-target remains a later refinement.

Objective: make melee and range-dependent actions feel intentional under concurrent movement.

Implementation:

- Add engagement state evaluation at tick start:
  - Adjacent hostile combatants are engaged.
  - Engagement can be maintained or broken by explicit movement/intent choices.
- Add reach-window support for attack orders:
  - Track whether the target was reachable during the attack window.
  - Allow a strike to resolve if reach was satisfied during the relevant window.
- Add soft failure outcomes:
  - End in best reachable position.
  - Maintain pressure.
  - Gain engagement.
  - Redirect to nearby target if selected.
  - Hold position and conserve remaining AP only when configured.
- Reconcile `Avoid` and the documented-but-missing `Evade` before relying on break-away logic.

Test focus:

- `test/encounters/attack-resolver.test.mjs`
- `test/encounters/encounter-resolution-engine.test.mjs`
- `test/encounters/movement-resolver.test.mjs`
- Cases:
  - Adjacent target retreats but attacker can still press.
  - Explicit break-away prevents engagement follow.
  - Attack soft-fails into best reachable position.
  - Reach weapon handles 10 ft range correctly.

Exit criteria:

- Melee no longer fails solely because a target moved one square at the wrong tick.
- Movement away from melee is still possible, but it is a tactical choice with consequences.

## Phase 7: GM Resolution Orders View And Tick Highlighting

Status: Implemented for timeline order-clause metadata, snapshot preservation, clause-aware tick narration, and GM encounter manager rendering with active/pending/completed/failed clause highlighting. Linked conflicts are exposed through `relatedCombatantIds`; richer conflict-specific grouping remains a future refinement.

Objective: help the GM narrate simultaneous resolution from structured orders.

Implementation:

- Add order clause metadata to timeline entries:
  - `orderId`
  - `clauseId`
  - `clauseType`
  - `clauseText`
  - `clauseStatus`
  - `relatedCombatantIds`
- Update tick snapshots and resolution state to expose current active clauses.
- Add GM-facing order display, either in the existing GM panel or encounter manager panel.
- Highlight per actor:
  - active clause for current tick,
  - pending clauses,
  - completed clauses,
  - interrupted or failed clauses,
  - linked conflicts such as pursuit vs retreat or attack vs dodge.
- Extend `EncounterNarrator` to use order clauses when building tick recap text.

Test focus:

- `test/encounters/encounter-narrator.test.mjs`
- `test/encounters/encounter-snapshot-store.test.mjs`
- `test/workspace-v2/encounter-manager-panel.test.mjs`
- GM view render tests for current tick highlighting.

Exit criteria:

- During step resolution, the GM can see which part of each order is active.
- Tick narration can be built from order clauses and actual outcomes.

## Phase 8: Sustained Intents Across Round Boundaries

Objective: support long-running intent without stale automatic play.

Implementation:

- Add explicit sustained intent configuration.
- Persist sustained orders at round end only when marked sustained.
- At the next planning phase, present sustained orders as proposed continuations.
- Require player or GM confirmation before they resolve in the next round.
- Recalculate pathing and requirements from the new round state.
- Add cancellation and interruption rules.

Test focus:

- `test/encounters/encounter-planning-service.test.mjs`
- `test/encounters/encounter-resolution-engine.test.mjs`
- UI tests for confirming, revising, and canceling sustained intents.

Exit criteria:

- "Keep pursuing that target" can survive a round boundary without taking away the next planning decision.

## Phase 9: Cleanup And Old UI Removal

Objective: remove the old AP-first assumptions after order behavior is complete.

Implementation:

- Remove obsolete tick-first editing affordances that conflict with order configuration.
- Keep a compact AP preview for accounting and resolution timing.
- Rename internal variables where helpful:
  - `plan` may remain as persisted state, but UI-facing models should prefer `orders`.
  - `planSlots` should become secondary `timingPreview`.
- Remove compatibility-only fields only if migration risk is low; otherwise leave them as derived fields.
- Update `ACTION_BEHAVIORS.md` to reflect intent-based planning and resolution rules.

Test focus:

- Full encounter test suite.
- Workspace encounter panel tests.
- Migration or compatibility tests for saved encounters that still contain legacy action plans.

Exit criteria:

- The primary player and GM experience is order-based.
- Legacy action plans either migrate cleanly or still display and resolve correctly.

## Suggested Implementation Order

1. Order data model and normalization.
2. Narrative summaries over legacy actions.
3. Configure-then-add UI.
4. Implied movement for attack and object interaction.
5. Early completion and follow-through.
6. Engagement and soft failure.
7. GM tick highlighting.
8. Sustained intents.
9. Cleanup and docs.

This order keeps the system playable after each phase. It also gives the UI an early visible improvement before the resolver becomes more sophisticated.

## Risk Areas

- AP accounting: the engine must never let implied movement become free movement.
- Plan locking: accepted roll results currently lock action indexes; order clauses may require finer-grained lock boundaries later.
- Resolver complexity: avoid making `EncounterResolutionEngine` a large conditional hub. Prefer pure order helpers and small intent resolvers.
- Target references: object, location, token, combatant, and self targets should be normalized consistently.
- Round replay: timeline and snapshot structures must stay compatible with existing replay and history behavior.
- UI complexity: the configuration step must be contextual and defaulted so common actions remain quick.

## Minimum Viable Slice

The smallest useful end-to-end slice is:

- Add order model and summaries.
- Convert the player panel to show narrative orders.
- Configure `Attack Target` with positioning AP.
- Resolve one implied movement attack order.
- Support early completion into a selected second action when AP remains.
- Add tests around AP accounting and timeline output.

That slice proves the core idea without needing every item category, engagement rule, or GM narration feature at once.
