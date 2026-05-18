# Full UI Replacement Technical Design

Date: 2026-05-17
System: turn-of-the-century
Companion assessment: docs/FULL_UI_REPLACEMENT_FEASIBILITY.md

## 1. Design Goals

1. Replace all visible in-game Foundry stock UI with a system-owned Application V2 workspace.
2. Provide dockable, stackable, composable panels with floating support.
3. Preserve all existing system customizations and workflows.
4. Keep strict Application V2 architecture and class-based composition.
5. Persist layout and restore reliably across sessions and clients.

Panel organization clarification:

- The organization of user activities and data into panels is a collaborative design process with the project owner (user), not an agent-only decision.
- Final panel boundaries and taxonomy are intentionally not constrained by current Foundry VTT functional groupings.
- Existing Foundry groupings may be used only as migration references, not as the target information architecture.

## 2. Target Architecture

### 2.1 Core Components

1. WorkspaceRootApp (Application V2)
- Full-screen root host.
- Responsible for shell chrome, command palette, panel manager host, and global status.

2. LayoutEngine
- Pure state engine (class) for docks, stacks, tabs, floating windows.
- Maintains normalized layout tree.
- Computes drop zones, ghost overlays, and resize constraints.

3. PanelRegistry
- Registers available panel definitions.
- Handles role-based availability and visibility metadata.
- Maps panel id to PanelApp class and capability flags.

4. PanelManager
- Instantiates and disposes PanelApp instances.
- Connects panel lifecycle to LayoutEngine state.
- Routes focus and keyboard shortcuts.

5. UiRegionGovernor
- Enforces hiding/suppression of stock Foundry in-game regions.
- Watches render lifecycle and reapplies governance on rerender.
- Supports compatibility-safe exemptions and diagnostics.

6. WorkspaceStateStore
- Persists layout state and panel preferences.
- User-level and world-level partitions:
  - user layout and panel visibility
  - GM policy defaults
- Versioned schema with migration support.

7. InteractionController
- Pointer drag/drop orchestration.
- Drop target scoring, preview ghost rendering.
- Resize handles and split ratio updates.

8. CommandSurface
- Replacement access to actions previously in stock UI.
- Includes menu access action required by prompt.

### 2.2 Panel Base Class

PanelApp (extends Application V2)
- Required metadata:
  - panelId
  - title
  - minSize
  - roleAccess
  - contextTags
- Required lifecycle methods:
  - preparePanelContext
  - renderPanelContent
  - onPanelActivate
  - onPanelDeactivate

### 2.3 Layout Model

Normalized layout JSON:

- root
  - centerDock
  - leftDock
  - rightDock
  - topDock
  - bottomDock
  - floatingWindows

Dock node supports:
- orientation
- child stack nodes
- split ratios
- tab groups in any dock zone (center, left, right, top, bottom)

Stack node supports:
- ordered panel list
- active tab index
- panel sizes

Floating node supports:
- x, y, width, height
- zIndex
- minimized state

## 3. Panel Taxonomy (Initial)

Taxonomy governance note:

- This section defines an initial working taxonomy only.
- The final taxonomy, naming, and boundaries will be refined collaboratively with the user and may diverge significantly from Foundry's stock UI categories.

1. Map Panel (center-dock capable)
2. Turn Tracker Panel
3. Player Combat Panel
4. GM Combat Oversight Panel
5. Dice and Roll Feed Panel
6. Chat and Messages Panel
7. Actors Directory Panel
8. Items and Inventory Panel
9. Compendium Unified Search Panel
10. Journal and Notes Panel
11. Scene Navigator Panel
12. Player Presence Panel
13. Action Bar/Quick Slots Panel
14. Settings and Menu Panel
15. Existing custom panels from workspace shell contexts:
- Travel Panel
- Encounter Planner Panel
- Market Panel
- Camp Panel

## 4. Mapping Existing Customizations To New Panels

Current customizations to preserve:

1. Workspace contexts and workflows
- Source: module/ui/workspace-v2/workspace-root-app.mjs
- Migration target: dedicated panels with same command paths.

2. Encounter planning and AP workflows
- Source: module/encounters/planner-context.mjs, combat and actor sheet handlers
- Migration target: Player Combat Panel and GM Combat Oversight Panel.

3. Custom combat tracker UI behavior
- Source: module/sheets/combat-tracker.mjs
- Migration target: Turn Tracker Panel.

4. Actor and item custom sheet behavior
- Source: module/sheets/actor-sheet.mjs, module/sheets/item-sheet.mjs
- Migration target: Panelized document views with same form operations.

5. Travel seed and market flows
- Source: module/ui/workspace-v2/workspace-root-app.mjs
- Migration target: Travel and Market panels with unchanged business logic.

## 5. UI Region Governance Strategy

UiRegionGovernor responsibilities:

1. Identify stock in-game regions to suppress:
- controls
- navigation
- sidebar
- hotbar
- players
- stock chat framing

2. Apply hide strategy:
- CSS class gating on body and region roots
- defensive runtime checks on rerender hooks

3. Enforce policy during runtime:
- on ready
- on scene changes
- on application renders

4. Preserve fallback:
- emergency command to disable governor and return to design mode.

## 6. Docking, Stacking, Composing Behavior

Composition scope clarification:

- Tab composition is supported in every dock zone, not only center.
- Any docked stack in left/right/top/bottom/center can become a tab group.
- Example: multiple panels composed as tabs while docked to the left edge.

### 6.1 Drag and Drop Rules

1. Drag panel by title bar.
2. Evaluate pointer against global dock zones and local target panel zones.
3. Zone outcomes:
- edge zone: dock to that edge
- top/bottom local zone: stack above/below in same dock group
- center local zone: compose into tab group in that same dock zone (applies to center, left, right, top, and bottom docks)
4. Render ghost preview rectangle for chosen outcome.

### 6.2 Resizing Rules

1. Dock group resize handles adjust group allocation against viewport edge.
2. Internal splitters adjust sibling panel ratios.
3. Floating panel corner and edge handles provide 2D resize.

### 6.3 Z-Order and Focus

1. Floating panel activation raises z-index.
2. Focus handoff stored in state for restore.
3. Keyboard navigation supports panel cycling and tab cycling.

## 7. Persistence Model

State partitions:

1. User layout state (per user, per world)
- preferred arrangement
- hidden panels
- floating panel geometry

2. World policy state (GM controlled)
- role visibility defaults
- panel lock policy

Storage:
- Foundry flags/settings under system namespace.
- Versioned schema with migration runners.

Restore sequence:

1. Load policy
2. Load user state
3. Validate against panel registry and role permissions
4. Heal invalid nodes and persist repaired state
5. Render workspace

## 8. Role-Based Access Model

PanelDefinition includes role gate:
- gmOnly
- playerAllowed
- observerAllowed

Policy precedence:

1. hard gate from role
2. GM world policy overrides optional visibility
3. user preference for hidden/shown where allowed

## 9. Application V2 Compliance Plan

1. All new UI classes extend Application V2.
2. No new legacy Application V1 dependencies.
3. Event binding inside Application V2 lifecycle methods.
4. Shared logic extracted into class services, not ad-hoc globals.

## 10. Incremental Milestones With Verification

Milestone 1: Baseline inventory and parity map
- Deliverables:
  - Function inventory of stock UI capabilities and current custom workflows.
  - Panel-to-capability mapping.
- Verification:
  - Checklist complete with owner per capability.
  - No unmapped critical workflow.

Milestone 2: WorkspaceRootApp and UiRegionGovernor
- Deliverables:
  - Stable full-screen root app.
  - Stock region suppression with diagnostics.
- Verification:
  - Left controls, right sidebar, navigation, hotbar, players, stock chat frame not visible during play mode.
  - Emergency fallback command works.

Milestone 3: LayoutEngine v1 (dock, stack, tab compose)
- Deliverables:
  - Edge docking, top/bottom stacking, center compose into tab groups.
  - Ghost preview overlays.
- Verification:
  - Manual test matrix for all drop outcomes passes.

Milestone 4: Resizing and floating
- Deliverables:
  - Dock splitters and internal stack resizing.
  - Floating panel move and 2D resize.
- Verification:
  - Resize constraints respected and persisted.

Milestone 5: Persistence and schema migration
- Deliverables:
  - User and world state persistence with migrations.
- Verification:
  - Layout survives reload, reconnect, and role switch scenarios.

Milestone 6: Panel migration of existing custom workflows
- Deliverables:
  - Travel, Encounter, Market, Camp in dockable panel form.
  - Turn tracker panel parity with custom tracker behavior.
- Verification:
  - Existing gameplay workflows execute without regression.

Milestone 7: Full stock capability parity panels
- Deliverables:
  - Chat/messages, compendium search, scene navigation, actor/item/journal access, players list, quick actions.
  - Main menu access panel action.
- Verification:
  - Parity checklist at 100 percent for in-game capabilities.

Milestone 8: Hardening and compatibility mode
- Deliverables:
  - Conflict diagnostics and compatibility guardrails.
  - Performance tuning and accessibility pass.
- Verification:
  - Smoke tests with representative module combinations.
  - Input latency and render thresholds meet targets.

Milestone 9: Release readiness
- Deliverables:
  - Documentation, migration notes, rollback instructions.
- Verification:
  - GM acceptance walkthrough and player acceptance scenario pass.

## 11. Test Strategy

1. Functional parity tests by capability domain.
2. Multi-user role tests (GM, player, observer).
3. Layout persistence tests across browser refresh and reconnect.
4. Drag/drop interaction matrix tests.
5. Accessibility checks:
- keyboard navigation
- focus trapping
- contrast and reduced-motion support
6. Performance checks:
- panel-heavy scene
- combat rounds with frequent updates

## 12. Rollback and Safety

1. Maintain design mode as fallback.
2. Provide runtime command to disable region governor.
3. Persist previous layout snapshot before migration.
4. Support one-click reset-to-default layout.

## 13. Open Design Decisions

1. Exact schema placement between settings and flags for user layout.
2. Whether map panel is embedded canvas host or managed anchor overlay.
3. Level of module interoperability support in first release.
4. Whether chat panel is full replacement or bridged wrapper in phase one.

## 14. Definition of Done

The conversion is done when:

1. No stock Foundry in-game UI elements are visible in play mode.
2. All in-game workflows are available via dockable/stackable/composable/floating panels.
3. Role-based panel governance and panel hiding are active.
4. Layout persistence is stable and migration-safe.
5. Existing turn-of-the-century customizations are preserved and verified.
6. Application V2 compliance is maintained throughout implementation.
