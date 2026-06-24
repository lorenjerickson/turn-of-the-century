# Modularization and Separation of Concerns Review

Date: 2026-06-21  
Status: Recommended architecture direction  
Related review: [JavaScript Architecture Review](./JAVASCRIPT_ARCHITECTURE_REVIEW.md)

## Implementation Status

As of 2026-06-21, implementation has begun with the first recommended vertical extraction:

| Plan area | Current state |
| --- | --- |
| Workspace feature contract | Implemented. The root routes context preparation, binding, panel rendering, and disposal through registered `WorkspaceFeature` instances. |
| Encounter planning | Implemented. `EncounterPlanningFeature` is registered by default and owns the player-planner context, rendering, DOM handlers, movement/targeting sessions, canvas listeners, overlays, and disposal. The former root implementation has been removed. |
| Workspace root cleanup | In progress. Removing the obsolete encounter-planning implementation reduced `WorkspaceRootApp` by roughly 950 lines. `RollRequestFeature` is fully extracted: `diceRollFeedPanel` context assembly, `dieRollRequestPanel` context assembly, DOM event binding, roll-lock guard, and `dispose` all live in the feature; `#getWorkspaceUsers` and `buildDiceRollFeedPanelModel` have been removed from the root. The module-level compendium preflight side-effect has been moved to `module/bootstrap.mjs` and is now invoked from the system `ready` hook. Remaining orchestration (market, actor management, layout) is yet to be extracted. |
| Scene design consolidation | Substantially complete. `SceneDesignFeature` now owns wall selection and joinability, toolbar state, detection overlays, wall-placement session state, keyboard binding, grid-calibration input listeners, wall-command canvas listeners, design issue panel context, design-issue hook family (17 Foundry hooks), design issue navigation, design action dispatch (`executeDesignAction`), and disposal. The feature exposes `openScenePropertiesPanel`, `openSceneGridConfiguration`, and `createSceneDesignScene` so design-action implementations can call back through the feature rather than the root. Root delegates all design-action button clicks and navigate-design-issue clicks to the feature. Remaining gap: repository boundary extraction (scene-repository, wall-repository, canvas-interaction-adapter) described in Opportunity 3 is not yet started. |
| Layout feature | Complete. `WorkspaceLayoutFeature` owns dock/stack/floating-window rendering (`renderShell`), drag-and-drop, resize sessions, design lens toggle state, command palette state and wiring, shell menu buttons, and all dock/panel DOM event handlers. Root's `_renderHTML` delegates entirely to `workspaceLayoutFeature.renderShell(context)`. Root's `_onRender` no longer wires any layout DOM handlers (they are bound via the feature loop). ~22 private rendering and interaction methods, 6 state variables, 3 imports, and 5 module-level constants were removed from `workspace-root-app.mjs`. Three source-text test assertions were updated to reference the layout feature source. |
| Pure encounter resolution engine | Not started. `combat.mjs` remains a combined Foundry adapter and domain engine. |
| Content/publication split | Not started. `sample-content.mjs` remains monolithic. |

The next implementation slice should introduce repository boundaries for scene and wall persistence (scene-repository, wall-repository), extract the canvas-interaction adapter, and then begin extracting market and actor-management features to further reduce `WorkspaceRootApp`.

## Purpose

This document records the highest-value opportunities to make the system easier to understand, test, and extend. The priorities are:

1. Separation of concerns.
2. Low coupling.
3. High cohesion.
4. Lower context, analysis, and verification cost during continued agentic development.

Implementation effort is deliberately not used to discount an opportunity. The goal is to describe the architecture that best supports the system over time.

## Current Pressure Points

At the time of review, the largest executable source files were:

| File | Lines | Primary concern |
| --- | ---: | --- |
| `module/ui/workspace-v2/workspace-root-app.mjs` | 5,684 | Application shell owns many unrelated feature workflows |
| `module/sample-content.mjs` | 3,977 | Content definitions, migration, validation, and publishing are combined |
| `module/documents/combat.mjs` | 3,269 | Foundry document adapter and encounter domain engine are combined |
| `module/ui/workspace-v2/scene-wall-detection.mjs` | 889 | Large scene-design algorithm inside a fragmented feature set |

`WorkspaceRootApp` is the largest immediate concern. It has approximately 48 import declarations and 184 private methods. Its responsibilities include startup repair, context aggregation, panel rendering, encounter planning, campaigns, markets, GM tools, layout interaction, scene design, wall editing, grid calibration, actors, and media.

The size of these files has a direct agentic cost:

- More unrelated source must be loaded before a change can be understood.
- Search results include many irrelevant methods and dependencies.
- Changes have a larger accidental regression surface.
- Tests increasingly assert against source text because behavior is difficult to reach through narrow interfaces.
- Foundry globals must be mocked across broad modules even when testing pure domain behavior.
- Architectural ownership is unclear when a feature is spread across panels, controllers, services, and the workspace root.

## Opportunity 1: Make `WorkspaceRootApp` a Composition Shell

### Current condition

`WorkspaceRootApp` combines Application V2 lifecycle with most feature orchestration and a significant amount of domain and persistence behavior. Its context builder aggregates nearly every subsystem, while feature-specific DOM handlers and Foundry canvas listeners live alongside docking and rendering code.

Major responsibility regions currently include:

- Startup and compendium repair.
- Workspace context preparation and panel rendering.
- Die-roll request handling.
- Encounter selection, planning, movement preview, and targeting.
- Campaign hierarchy editing and generation.
- Market presentation and transactions.
- Dock, stack, floating-window, drag, and resize behavior.
- Scene design, walls, overlays, and grid calibration.
- Actor, media, logging, and design-issue workflows.

### Target architecture

`WorkspaceRootApp` should own only:

- Application V2 lifecycle.
- Construction and disposal of workspace features.
- Top-level layout rendering.
- Shared context composition.
- Routing lifecycle events to registered features.

Feature behavior should be supplied through a small common contract:

```text
WorkspaceFeature
├── prepareContext(sharedContext)
├── bind(rootElement)
├── render(panel, context)
└── dispose()
```

Recommended feature modules:

```text
WorkspaceRootApp
├── WorkspaceLayoutFeature
├── EncounterPlanningFeature
├── SceneDesignFeature
├── CampaignFeature
├── MarketFeature
├── RollRequestFeature
├── ActorManagementFeature
└── MediaFeature
```

Startup compendium preflight should move into a system bootstrap service rather than execute as a side effect of importing the workspace application.

### First extraction

The best first vertical extraction is `EncounterPlanningFeature`. It should own:

- Selected encounter token and combatant state.
- Action popup state.
- Movement and target interaction sessions.
- Native canvas listeners and overlays.
- Player encounter panel event wiring.
- Projection of the selected combatant's local plan.
- Coordination with planning roll locks.

This is a cohesive, actively changing feature with clear external dependencies: combat API, canvas adapter, panel host, notifications, and render callback.

### Expected impact

- Largest immediate reduction in source-context cost.
- Far fewer imports and private methods in the root application.
- Feature tests can interact with controller APIs instead of inspecting source text.
- Encounter, scene, market, or layout work can be evaluated independently.
- Lower likelihood that unrelated workspace changes collide.

## Opportunity 2: Extract a Pure Encounter Resolution Engine

### Current condition

`module/documents/combat.mjs` currently contains both the Foundry-facing document implementation and nearly the entire encounter domain. Its responsibilities include:

- Encounter state normalization and flag persistence.
- Planning commands, ownership checks, AP budgets, and roll locks.
- Initiative and phase transitions.
- Snapshot capture, rewind, and replay state.
- Per-tick evaluation and simultaneous reconciliation.
- A* movement and relative movement.
- Consumable and damage effects.
- Reactions and overwatch.
- Collisions and contested rolls.
- Attack resolution and critical outcomes.
- Narrative generation and round history.
- A public facade on `TurnOfTheCenturyCombat`.

This forces domain tests to establish Foundry globals and document-shaped fixtures even when testing deterministic encounter rules.

### Target architecture

```text
TurnOfTheCenturyCombat
└── EncounterDocumentAdapter
    ├── EncounterPlanningService
    ├── EncounterResolutionEngine
    │   ├── MovementResolver
    │   ├── AttackResolver
    │   ├── ReactionResolver
    │   ├── CollisionResolver
    │   └── ConsumptionResolver
    ├── EncounterSnapshotStore
    └── EncounterNarrator
```

The core engine should consume plain data and explicit ports:

```text
ResolutionContext
├── combatants
├── plans
├── tokenPositions
├── actorResources
├── itemStates
├── roll(formula, data)
├── findPath(start, target)
├── applyEffects(effects)
└── now()
```

The Foundry adapter should translate Combatants, TokenDocuments, Items, flags, hooks, and `Roll` into this context. The engine should return a resolution transition containing updated state, effects, timeline entries, and pending requests.

### Recommended internal boundaries

- `EncounterPlanningService`: plan mutations, AP validation, ready state, permissions, accepted-roll locks.
- `EncounterResolutionEngine`: tick state machine and reconciliation order.
- `MovementResolver`: absolute, pursue, follow, avoid/evade, A* movement, and occupancy intents.
- `AttackResolver`: targeting, range, to-hit, damage, critical outcomes, and resistance intents.
- `ReactionResolver`: reaction windows, consumption, dodge, and overwatch.
- `EncounterSnapshotStore`: Foundry document capture/apply/rewind only.
- `EncounterNarrator`: recap formatting, tick narration, and round-history presentation.

### Expected impact

- Encounter rules become independently understandable and testable.
- Resolution changes no longer require loading a 3,000-line Foundry document module.
- Unit tests can use small plain-object fixtures rather than broad global mocks.
- New action resolvers can be added without enlarging a central conditional method.
- The very large combat resolution test can be split by resolver and state transition.

## Opportunity 3: Consolidate Scene Design into One Vertical Feature

### Current condition

Scene design has substantial code but no single owner. Behavior is distributed across:

- `scene-wall-detection.mjs`.
- `scene-wall-editing.mjs`.
- `panels/scene-properties-panel.mjs`.
- `design-actions/scene-actions.mjs`.
- `controllers/scene-workspace-controller.mjs`.
- `native-canvas-grid-calibration.mjs`.
- `WorkspaceRootApp` state and event handlers.

The current boundaries mix geometry, rendering, state, persistence, canvas input, and notifications. Some panel modules perform Foundry mutations, while `SceneDesignService` calls methods back on the workspace application. That reverses the desired dependency direction and leaves ownership ambiguous.

### Target architecture

```text
features/scene-design/
├── domain/
│   ├── wall-geometry.mjs
│   ├── wall-detection.mjs
│   ├── wall-selection.mjs
│   └── grid-calibration.mjs
├── application/
│   ├── scene-design-coordinator.mjs
│   └── scene-design-state.mjs
├── foundry/
│   ├── scene-repository.mjs
│   ├── wall-repository.mjs
│   └── canvas-interaction-adapter.mjs
└── presentation/
    ├── scene-properties-model.mjs
    ├── scene-properties-view.mjs
    └── scene-design-toolbar.mjs
```

The `SceneDesignCoordinator` should be the sole owner of:

- Current scene-design mode.
- Wall command and placement sequence.
- Selected and joinable wall IDs.
- Detection overlays.
- Grid-calibration session and preview scheduling.
- Background upload status.
- Canvas listener lifecycle.

Panels should build and render view models. Repositories should perform Foundry mutations. Domain modules should remain pure.

### Expected impact

- One obvious location for every scene-design change.
- Removes a large state machine from `WorkspaceRootApp`.
- Eliminates callbacks from scene services into application internals.
- Geometry and image-analysis algorithms remain isolated from Foundry and DOM behavior.
- Scene-design tests can be organized around domain, application, adapter, and presentation layers.

## Opportunity 4: Separate Content Definitions from Publication Infrastructure

### Current condition

`module/sample-content.mjs` combines:

- Base schema and default builders.
- Actor definitions.
- Weapons, armor, consumables, effects, professions, ethnicities, quirks, equipment, skills, and talents.
- Starter actor loadouts.
- Compendium names and routing filters.
- Legacy export-source normalization.
- Data-model preflight validation.
- World document creation.
- Compendium publication.

Consequently, a change to one item or one migration requires loading a file containing the entire starter library and its publication pipeline.

### Target architecture

```text
content/
├── builders/
│   ├── actor-builder.mjs
│   ├── item-builder.mjs
│   └── action-builder.mjs
├── actors/
├── weapons/
├── armor/
├── consumables/
├── professions/
├── traits/
└── starter-loadouts.mjs

compendiums/
├── manifest.mjs
├── plans.mjs
├── validator.mjs
├── publisher.mjs
└── legacy-normalizer.mjs
```

`sample-content.mjs` may remain temporarily as a compatibility barrel that assembles and re-exports the existing public constants.

Content definitions should be declarative and should not import Foundry runtime services. Publication infrastructure may depend on assembled content, but content modules must not depend on publication.

### Expected impact

- Content changes become narrow and inexpensive to analyze.
- Compendium migrations and publication can evolve independently from game content.
- Smaller validation scopes produce more focused failures.
- Generated packs can eventually consume a stable manifest rather than importing a monolithic runtime module.

## Recommended Implementation Order

1. Define characterization tests and narrow dependency interfaces for each extraction boundary.
2. Extract `EncounterPlanningFeature` from `WorkspaceRootApp`.
3. Consolidate the scene-design vertical slice and remove its root-app state.
4. Reduce `WorkspaceRootApp` to a feature composition shell.
5. Extract the pure encounter resolution engine one resolver at a time.
6. Split starter content definitions from compendium infrastructure.

This order is intentionally based on architectural leverage rather than implementation effort. The first two extractions shrink the main application hotspot and establish the composition pattern. The encounter engine can then be extracted against a cleaner UI/domain boundary.

## Refactoring Guardrails

- Preserve behavior through characterization tests before moving code.
- Move cohesive behavior first; avoid creating miscellaneous `utils` modules.
- Dependencies must point inward: presentation to application, application to domain, adapters toward explicit ports.
- Feature modules must own their listener lifecycle and provide `dispose()`.
- Foundry globals should be confined to adapters and composition roots where practical.
- Pure domain modules must accept plain data and return plain results.
- Do not preserve old cyclic dependencies through callback-heavy constructor interfaces.
- Keep temporary compatibility barrels only while callers are migrated; record their planned removal.
- Split tests alongside production modules so test ownership mirrors architectural ownership.

## Success Measures

The modularization should be considered successful when:

- `WorkspaceRootApp` primarily composes features and contains no feature-specific canvas state machines.
- Encounter resolution can run in unit tests without defining Foundry document globals.
- Scene-design workflows have a single application-level owner.
- Content definitions do not import publication or Foundry runtime infrastructure.
- Feature tests call public feature APIs instead of inspecting source text.
- A typical feature change can be understood by reading one feature directory and a small number of contracts.
- Large-file growth is replaced by new cohesive modules rather than additional methods in central classes.
