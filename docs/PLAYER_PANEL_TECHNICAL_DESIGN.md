# Player Actor Panel Technical Design

Date: 2026-05-23
System: turn-of-the-century
Companion assessment: [docs/PLAYER_PANEL_FEASIBILITY.md](docs/PLAYER_PANEL_FEASIBILITY.md)

## 1. Design Goals

- Provide a player-facing workspace panel that surfaces only the actor information that matters right now.
- Support heroes, pawns, and villains with type-aware context rules.
- Present status, actions, effects, inventory, equipment, resources, and encounter context in a single actor-centered surface.
- Behave like the other workspace panels with docking, undocking, resizing, drag and drop, opening, and closing.
- Keep strict Application V2 architecture and class-based composition.
- Persist panel state and restore it reliably across sessions where appropriate.

Panel organization clarification:

- The exact section taxonomy is a design process with the project owner, not a fixed agent-only decision.
- The panel should be centered on actor relevance, not on generic sheet duplication.
- Existing sheet and encounter groupings are references, not the final information architecture.
- The panel is a workspace panel, not an actor sheet.

## 2. Target Architecture

### 2.1 Core Components

- PlayerActorPanelRootApp
  - Full-screen or docked Application V2 panel host.
  - Responsible for shell chrome, dock state, section layout, and panel-level commands.

- ActorContextService
  - Computes actor-relevant context from actor state, combat state, effects, inventory, and ownership.
  - Produces normalized context blocks used by sections.

- PlayerPanelSectionRegistry
  - Registers available actor-facing sections.
  - Handles type-based availability and visibility metadata.
  - Maps section id to renderer class and capability flags.

- PlayerPanelManager
  - Instantiates and disposes section renderers.
  - Connects panel lifecycle to context state.
  - Routes focus and keyboard shortcuts.

- PlayerPanelStateStore
  - Persists section expansion state, dock state, and player preferences.
  - Versioned schema with migration support.

- ActorContextGovernor
  - Enforces context recalculation on relevant hooks.
  - Reapplies active context rules when actor/combat/game state changes.
  - Reasserts panel visibility and body-class governance when the panel is opened, closed, docked, or floated.

- InteractionController
  - Pointer and keyboard orchestration for section toggles and panel actions.
  - Handles drag, drop, undock, redock, stack splitters, and resize gestures.

- CommandSurface
  - Replacement access to actor-relevant actions and utilities previously spread across sheet controls.
  - Includes open, close, and undock commands that match the workspace panel model.

### 2.2 Panel Base Class

- PlayerActorPanelApp (extends Application V2)
  - Required metadata:
    - panelId
    - title
    - minSize
    - roleAccess
    - contextTags
    - dockability
    - defaultDock: rightDock
    - allowFloating
  - Required lifecycle methods:
    - preparePanelContext
    - renderPanelContent
    - onPanelActivate
    - onPanelDeactivate
    - onPanelDock
    - onPanelUndock
    - onPanelResize
    - onPanelClose

### 2.3 Context Model

Normalized actor context JSON:

- root
  - actorId
  - actorType
  - ownership
  - dockState
  - panelMode
  - encounterState
  - resourceState
  - inventoryState
  - effectState
  - availableActions
  - visibleSections
  - sectionState

Context blocks should be derived, not duplicated raw actor data.
Examples:

- status block: health, grit, wounds, fatigue, conditions
- actions block: available combat or non-combat actions
- effects block: active effects, durations, and constraints
- inventory block: carried items, including equippable items that are not currently equipped
- equipment block: items actively assigned to a slot and currently equipped
- encounter block: turn planning and ready state, if relevant
- prompt block: next useful action for the actor in the current context
- dock block: docked, floating, stacked, tabbed, or closed state

## 3. Section Taxonomy (Initial)

- Status Section
- Actions Section
- Effects Section
- Inventory Section
- Equipment Section
- Encounter Section
- Resources Section
- Prompts Section
- Actor Notes Section
- Context Debug Section for GM diagnostics only when appropriate

Taxonomy governance note:

- This section defines an initial working taxonomy only.
- The final names and boundaries may diverge based on playtesting.

Inventory and equipment clarification:

- Inventory means anything the actor is carrying.
- Equipment means only items that are currently equipped to a slot.
- Equippable items that are not currently equipped remain inventory items, not equipment items.

## 4. Mapping Existing Customizations To New Sections

Current customizations to preserve:

- Type-specific hero/villain/pawn sheet behavior
  - Source: [module/sheets/actor-sheet.mjs](module/sheets/actor-sheet.mjs)
  - Migration target: actor panel sections fed by the same underlying data contracts.

- Encounter ready state and AP actions
  - Source: [module/sheets/actor-sheet.mjs](module/sheets/actor-sheet.mjs), [turn-of-the-century.mjs](turn-of-the-century.mjs)
  - Migration target: Encounter Section and Actions Section.

- Actor equipment and inventory summaries
  - Source: [module/sheets/actor-sheet.mjs](module/sheets/actor-sheet.mjs) and actor data models
  - Migration target: Inventory Section and Equipment Section.

- Actor effects and condition visibility
  - Source: actor/effect document models
  - Migration target: Effects Section and Status Section.

- Existing Application V2 workspace patterns
  - Source: [module/ui/workspace-v2/*](module/ui/workspace-v2)
  - Migration target: section rendering, persistence, dock behavior, and context refresh services.

## 5. Context Evaluation Strategy

ActorContextService responsibilities:

- Read actor data.
- Read encounter/combat data if present.
- Read dock state and open/close state from the panel shell.
- Derive context blocks rather than exposing raw data everywhere.
- Score sections by relevance.
- Produce a visible section list and ordering for the current actor.

### 5.1 Primary Context Signals

- Actor type
  - hero, pawn, villain

- Ownership and control
  - owned actor, observed actor, GM-available actor, controlled token

- Combat state
  - active combat, turn state, ready state, AP planning state

- Actor state
  - resources, inventory changes, equipment changes, active effects, conditions

- Panel state
  - docked, floating, tabbed, stacked, closed

- Permission state
  - what the current user may view or manipulate

### 5.2 Visibility Rules

- Status Section
  - visible when actor data exists

- Actions Section
  - visible when the actor has relevant available actions

- Effects Section
  - visible when active effects or conditions exist

- Inventory Section
  - visible when carried items exist, including equippable items that are not currently equipped

- Equipment Section
  - visible only when items are assigned to a slot and actively equipped

- Encounter Section
  - visible only when combat or AP planning state is active

- Prompts Section
  - visible when there is a current best next action

- Dock Controls
  - visible whenever the panel is rendered

## 6. Docking and Window Behavior

The player panel must conform to the workspace panel model rather than behaving like an actor sheet.

### 6.1 Dock, Undock, and Float

- The panel can be docked into the same edge-based layout model as the other workspace panels.
- The panel can be undocked from a docked stack into a floating window.
- The panel can be redocked from a floating window back into a docked stack.
- The panel can be closed and reopened through the same panel shell controls used by other workspace panels.
- The panel should default to the right edge dock when first opened if the user has no saved panel preference.

### 6.2 Drag and Drop

- The panel title bar should be draggable.
- Dropping near a dock edge should dock the panel to that edge.
- Dropping near the top or bottom of an existing docked panel should stack it above or below.
- Dropping over the middle of a docked panel should create a tab group.
- Ghost previews should be used to indicate the drop target.

### 6.3 Section Highlighting

- When a section appears because game context changed, it should be visually highlighted so the user notices it exists.
- Use a one-time color or opacity animation that plays on first reveal after a context change.
- The highlight should be subtle enough to avoid obscuring content but strong enough to distinguish newly added context sections from already visible sections.
- The highlight state should not persist after the first presentation unless the section is removed and reintroduced by a later context change.

### 6.4 Resizing

- Docked groups should be resizable along their edge.
- Stacked groups should preserve splitter-based resizing behavior.
- Floating panels should support two-dimensional resize.
- Resizing should persist through the workspace state store.

### 6.5 Open and Close

- The panel should expose the same open and close semantics as the other workspace panels.
- Closing the panel should not destroy its persisted state.
- Reopening the panel should restore the last known dock or float state when possible.

## 7. Rendering and Interaction Rules

### 7.1 Section Ordering

- Status and encounter-relevant sections first.
- Action surfaces next.
- Effects, inventory, and equipment after that.
- Notes and diagnostics last.

### 7.2 Collapsible Behavior

- Each section can be collapsed or expanded.
- Player preference is persisted where relevant.
- Sections that are irrelevant for the current context may be hidden entirely.

### 7.3 Refresh Rules

- Rerender on actor update.
- Rerender on item/effect updates affecting the actor.
- Rerender on combat state changes.
- Rerender on dock or open/close state changes when panel metadata changes.
- Rerender on token control changes if the active actor follows token control.
- Rerender when section visibility or priority changes.

## 8. Persistence Model

State partitions:

- Player preference state
  - section expanded/collapsed state
  - preferred default section arrangement where allowed
  - docked, floating, stacked, or tabbed panel state

- Actor-scoped context state
  - cached context snapshot if needed for fast rerendering

Storage:

- Foundry flags/settings under system namespace.
- Versioned schema with migration support.

Restore sequence:

- Load player preference state.
- Load current actor context.
- Validate against actor type and permissions.
- Heal invalid or stale state.
- Restore dock or floating placement.
- Render the panel.

## 9. Role-Based Access Model

SectionDefinition includes role and ownership gates:

- ownerOnly
- playerAllowed
- observerAllowed
- gmOnly for diagnostics or privileged actor views

Policy precedence:

- hard gate from role or ownership
- actor type rule
- user preference for hidden/shown where allowed

## 10. Application V2 Compliance Plan

- All new UI classes extend Application V2.
- No new legacy Application V1 dependencies.
- Event binding inside Application V2 lifecycle methods.
- Shared logic extracted into class services, not ad-hoc globals.
- Dock and resize behavior should reuse the workspace shell interaction model instead of inventing a separate panel API.

## 11. Incremental Milestones With Verification

- Milestone 1: Baseline actor context inventory
  - Produce a stable inventory of actor-facing sections and context signals.
  - Verify that hero, pawn, and villain contexts all map to at least one visible status/action section.

- Milestone 2: Context service and section registry
  - Implement ActorContextService and PlayerPanelSectionRegistry skeletons.
  - Verify that each section can be shown or hidden based on computed context.

- Milestone 3: Dock shell and panel lifecycle
  - Implement dock, undock, float, close, and reopen behavior.
  - Verify that the panel follows the same interaction patterns as the other workspace panels.

- Milestone 4: Status, actions, and effects sections
  - Implement the highest-priority actor sections first.
  - Verify that combat and non-combat transitions change section order correctly.

- Milestone 5: Inventory, equipment, and prompt surfaces
  - Add inventory and equipment summaries with actor-specific prompts.
  - Verify that item and effect updates rerender the panel.

- Milestone 6: Persistence and preference restoration
  - Persist section state and restore it on load.
  - Verify state survives reloads and actor switching.

- Milestone 7: Polish and diagnostics
  - Add debug context visibility for developers and GMs.
  - Verify that diagnostics reflect the current actor context and section visibility.

## 12. Constraints Applied From User Direction

- Keep the panel actor-focused, not GM-focused.
- Use the existing hero, pawn, villain, inventory, effect, and encounter models as the source of truth.
- Favor class-based Application V2 composition.
- Preserve current actor-specific workflows instead of flattening them into generic content.
