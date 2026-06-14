# UI Replacement Milestone 1: Capability Inventory

Date: 2026-05-17
Status: Complete
Scope: In-game runtime capability inventory for full UI replacement

## Purpose

This inventory enumerates the capability surface that must be represented in the replacement panel UI. It is derived from current source behavior, but legacy workspace artifacts are treated as migration references only, not as authoritative architecture.

## Inventory Principles

1. Do not assume robustness of removed legacy workspace modules.
2. Treat source as evidence of required workflow coverage, not implementation quality.
3. Use this as the baseline for parity mapping and implementation ownership.

## Capability Domains

### A. System Bootstrap and Registration

1. Actor, Item, and Combat document class registration.
2. Custom combat tracker registration.
3. Custom actor and item sheet registration.
4. Data model registration for actor and item types.

Primary evidence:
- turn-of-the-century.mjs

### B. UI Mode and Context Control

1. Workspace replacement enable/disable policy.
2. Root shell lifecycle.
3. Region governance auditing/enforcement surface.
4. User layout persistence lifecycle.

Primary evidence:
- turn-of-the-century.mjs
- module/ui/workspace-v2/workspace-v2-coordinator.mjs
- module/ui/workspace-v2/workspace-root-app.mjs

### C. Window Governance

1. Block non-allowed floating windows in play mode.
2. Allowlist shell and dialogs.
3. Runtime enforcement on application render lifecycle.
4. Manual enforcement/audit entry points.

Primary evidence:
- module/ui/workspace-v2/ui-region-governor.mjs

### D. Encounter Planning and Round Flow

1. Initialize round.
2. Start AP round planning.
3. Resolve round.
4. Mark combatant planning readiness.
5. Add/remove/clear planned actions.
6. Toggle combatant ready state.
7. AP-bound action planning and target assignment.

Primary evidence:
- module/encounters/planner-context.mjs
- module/sheets/combat-tracker.mjs
- module/sheets/actor-sheet.mjs

### E. Travel Workflow

1. Pace controls.
2. Region selection.
3. Miles tracking.
4. Watch/day advancement with time advance.
5. Weather cycling.
6. Scout checks and travel events.
7. Encounter seeding and launch handoff to combat.

Primary evidence:
- module/ui/workspace-v2/workspace-root-app.mjs

### F. Market and Economy Workflow

1. Merchant tagging and removal.
2. Merchant/item/quantity/modifier selection.
3. Funding split modes and treasury adjustments.
4. Buy and sell flows with wallet and treasury updates.
5. GM-only wallet and treasury admin controls.

Primary evidence:
- module/ui/workspace-v2/workspace-root-app.mjs

### G. Communication and Event Emission

1. Chat message posting for major user actions.
2. Hook emissions for travel event and seeded encounter lifecycle.

Primary evidence:
- module/ui/workspace-v2/workspace-v2-coordinator.mjs

### H. Data Persistence and World State

1. Scene flag persistence for workspace state.
2. World settings for UI mode and policy.
3. Derived state restoration on render.

Primary evidence:
- module/ui/workspace-v2/workspace-state-store.mjs
- turn-of-the-century.mjs

### I. Access and Role Constraints

1. GM-only operations in encounter and market admin surfaces.
2. Player-safe operations and contextual controls.

Primary evidence:
- module/ui/workspace-v2/workspace-root-app.mjs

### J. Existing UI Surface Areas To Replace

1. Controls region.
2. Navigation region.
3. Sidebar region.
4. Hotbar region.
5. Players region.
6. Stock chat framing and stock launch paths.

Primary evidence:
- design requirements
- existing window governance implementation in module/ui/workspace-v2/ui-region-governor.mjs

## Critical Workflow Coverage Checklist

1. Start and run encounter rounds with AP planning.
2. Complete travel loop through event roll and encounter escalation.
3. Execute buy/sell market loop with split funding.
4. Access actor/item data and custom sheet-equivalent editing paths.
5. Maintain GM authority controls and player restrictions.
6. Preserve chat/event observability.
7. Maintain layout/state continuity in session.

Result: No critical workflow is currently unmapped at inventory level.

## Milestone 1 Output Validation

1. Capability inventory produced: yes.
2. Legacy module robustness assumption avoided: yes.
3. Inventory is implementation-neutral and migration-safe: yes.
