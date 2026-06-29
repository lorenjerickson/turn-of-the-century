# Refactoring Plan: Design Principles, Patterns, and Code Smells

Date: 2026-06-27  
Status: Proposed  
Framework: `design-principles`, `design-patterns`, `code-smells`

## Executive Summary

The project has already made meaningful progress toward the architecture described in earlier reviews. `WorkspaceRootApp` is no longer the 5,000-line center of gravity, encounter resolution has been split into resolver modules, compendium publication has moved into dedicated infrastructure, and the workspace has a common `WorkspaceFeature` lifecycle.

The remaining design pressure is now concentrated in four places:

1. `SceneDesignFeature` has become a large vertical feature that mixes scene model assembly, panel rendering, DOM delegation, wall editing, design issue navigation, grid calibration, canvas listeners, repository calls, and notifications.
2. Runtime access is inconsistent. Some modules use constructor ports and adapters, while others still reach directly into `globalThis.game`, `globalThis.ui`, `canvas`, `foundry`, and `Hooks`.
3. Small utility rules are copied across encounter, panel, scene, and content modules, creating DRY drift and occasional inconsistent fallback behavior.
4. Generation and content-building services still combine prompt policy, IO, API transport, parsing, and data assembly in modules that will become harder to evolve safely.

The best next move is not a broad rewrite. The best move is a sequence of small, test-backed refactors that preserve the existing feature architecture while reducing coupling inside the current hotspots.

## Design Baseline

Use this baseline when deciding whether a refactor belongs in scope:

- **SRP / SoC:** Split when one function or class has multiple change reasons, especially DOM events plus Foundry document mutation plus model building.
- **Dependency Inversion:** Logic modules receive Foundry and browser APIs through ports or adapters, not direct globals.
- **Interface Segregation:** Pass narrow capabilities such as `getCurrentUser`, `notify`, `getScenes`, or `createScene`, not broad `game` or `ui` objects.
- **DRY:** Extract duplicated rules only after the second concrete use, especially collection normalization, numeric coercion, cloning, action normalization, and user lookup.
- **KISS / YAGNI:** Prefer plain functions and small ports. Do not introduce registries, base classes, or strategy layers unless they remove a named coupling.
- **Law of Demeter:** Avoid chains like `game.scenes.contents.find(...)` or `canvas.scene.tokens.get(...)` outside repository or adapter modules.

## Findings

| Priority | Finding | Evidence | Smells / Principles |
| --- | --- | --- | --- |
| P1 | `SceneDesignFeature` has too many reasons to change. | `module/ui/workspace-v2/controllers/scene-design-feature.mjs` is ~1,446 lines. Its constructor accepts broad dependencies and owns hook registration, overlay state, wall state, grid calibration state, canvas listeners, DOM event routing, scene persistence, and panel rendering. See lines 55-130 and 213-415. | Large Class, Long Method, Divergent Change, SoC, SRP |
| P1 | Scene design still leaks through the root composition shell. | `WorkspaceRootApp` constructs `SceneWorkspaceController`, ports, grid calibration, scene actor dropping, and scene design orchestration directly in its constructor. See `module/ui/workspace-v2/workspace-root-app.mjs` lines 152-268. | Solution Sprawl, Middle Man risk, Dependency Inversion |
| P1 | Direct Foundry global access remains inside feature logic. | `RollRequestFeature` reads `globalThis.game` and `globalThis.ui` throughout context preparation and event handlers. See `module/ui/workspace-v2/controllers/roll-request-feature.mjs` lines 51-95 and 121-203. `ActorManagementFeature`, `CampaignFeature`, `MarketFeature`, and layout code have similar direct accesses. | Inappropriate Intimacy, Message Chains, Dependency Inversion |
| P2 | Encounter utilities and action normalization are duplicated. | `toArray`, `toNumber`, `clampActionCost`, `wait`, `lockedActionComparable`, and cloning appear in `combat.mjs`, `encounter-resolution-engine.mjs`, `encounter-planning-service.mjs`, and resolver modules. Some copies use `foundry.utils.deepClone`; others use `structuredClone`. | Duplicated Code, Oddball Solution, DRY |
| P2 | Encounter planning still carries a stub and local event constants. | `EncounterPlanningService.mjs` keeps local event names to avoid a circular import and `maybeAutoFinalizePlanning()` is a documented stub returning `false` at lines 151-160. | Incomplete Abstraction, Primitive Obsession, Open/Closed pressure |
| P2 | `LLMService` is a static namespace with mixed responsibilities. | `module/services/llm-service.mjs` owns content skill policy, prompt loading, OpenAI request construction, API transport, response parsing, JSON constraints, and image generation. It reads `game.settings` and `fetch` directly at lines 183-331. | Large Module, Static Service, Dependency Inversion, SoC |
| P2 | Scene wall detection is cohesive but too dense for maintenance. | `scene-wall-detection.mjs` is ~889 lines and combines wall document defaults, scene transforms, grid model creation, image luminance sampling, Sobel detection, line merging, and Foundry wall conversion. | Large Module, Long Method risk, Primitive Obsession |
| P3 | `sample-content.mjs` is now mostly an assembler, but loadout logic still lives beside export aggregation. | Lines 26-38 aggregate all sample items; lines 40-120 begin starter item keying, embedded item id creation, compatibility, and actor loadout assembly. | Divergent Change, Feature Envy |
| P3 | Repeated UI event comments describe what the code does. | `SceneDesignFeature.bind()` uses section comments such as `// map-mode-select`, `// grid-cal-start`, and `// Player roll execution`. These are symptoms that dispatch tables or handler names would communicate intent better. | Comments-as-What, Long Method |

## Plan

### Phase 1: Finish the Scene Design Boundary

Goal: turn `SceneDesignFeature` from a large controller into a mediator over focused scene design collaborators.

Steps:

1. Extract a `SceneDesignRuntime` or `SceneDesignPorts` factory from `WorkspaceRootApp`.
   - Pattern: **Adapter** and **Factory Function**.
   - Move the root's scene design wiring out of the constructor body.
   - Return narrow ports: `sceneRepository`, `wallRepository`, `canvasInteraction`, `notifications`, `confirm`, `render`.
   - Acceptance: root constructor has no direct `getGame/getCanvas/getUi/getFoundry` bundle for scene design.

2. Extract `SceneWallEditingController`.
   - Own `selectedWallIdsByScene`, `joinableWallIdsByScene`, `wallAddSequence`, wall command canvas listener, wall keyboard shortcuts, join/remove/split/add operations.
   - Keep geometry helpers pure in `scene-wall-editing.mjs`.
   - Acceptance: wall selection and wall command tests target the new controller without rendering the whole workspace.

3. Extract `GridCalibrationFeatureController`.
   - Own grid calibration DOM input handling, debounce timers, canvas calibration listener, preview flush/apply/cancel lifecycle.
   - Keep `GridCalibrationController` focused on state and persistence.
   - Acceptance: `SceneDesignFeature.bind()` no longer contains grid input selectors or input/change/focusout handlers.

4. Extract `DesignIssueNavigationController`.
   - Own design issue refresh hook registration and navigation actions.
   - Keep `buildDesignIssuesPanelModel` pure.
   - Acceptance: design issue hook family registration moves out of the scene design constructor.

5. Leave `SceneDesignFeature` as a mediator.
   - It prepares context, delegates render, binds child controllers, and exposes public commands required by design actions.
   - Acceptance: `scene-design-feature.mjs` drops below 700 lines without reducing behavior.

Tests:

- Add focused tests for each extracted controller.
- Keep existing `scene-design-feature`, `scene-wall-editing`, `scene-wall-detection`, and scene properties tests passing.

### Phase 2: Introduce Runtime Ports for Workspace Features

Goal: remove direct Foundry globals from feature logic while keeping Foundry access simple at the composition edge.

Steps:

1. Add `module/ui/workspace-v2/workspace-runtime-ports.mjs`.
   - Pattern: **Adapter**.
   - Expose small functions such as `getCurrentUser`, `getUsers`, `getMessages`, `getActors`, `getItems`, `getScenes`, `getCurrentScene`, `notifyWarn`, `notifyInfo`, and `notifyError`.

2. Refactor `RollRequestFeature` first.
   - It has a narrow surface and clear direct global usage.
   - Inject `users`, `messages`, `currentUser`, `notifications`, and `dieRollRequestManager`.
   - Acceptance: no `globalThis.game` or `globalThis.ui` references remain in `roll-request-feature.mjs`.

3. Refactor `CampaignFeature`, `MarketFeature`, and `ActorManagementFeature` next.
   - Use narrow ports rather than passing the full runtime object.
   - Acceptance: feature tests construct plain object ports instead of mutating global `game` for core behavior.

4. Keep Foundry document subclasses and runtime adapters as legitimate boundary modules.
   - Direct `foundry` use is acceptable in data models and explicit adapter/repository modules.

Tests:

- Update existing feature tests to inject ports.
- Run `npm run validate`.

### Phase 3: Consolidate Shared Utility Rules

Goal: remove duplicated low-level rules without introducing a vague utility dumping ground.

Steps:

1. Add `module/shared/collections.mjs`.
   - Functions: `toArray`, `collectionContents`.
   - Acceptance: panel and encounter modules use the same collection conversion where behavior matches.

2. Add `module/shared/numbers.mjs`.
   - Functions: `toNumber`, `positiveNumber`, `finiteNumber`, `optionalNumber`.
   - Acceptance: scene-wall and encounter modules stop carrying local numeric coercion copies unless a domain-specific version is needed.

3. Add `module/encounters/action-normalization.mjs`.
   - Functions: `clampActionCost`, `clampActionData`, `lockedThroughIndex`, `lockedActionComparable`.
   - Pattern: **Factory / Builder** for action command normalization.
   - Acceptance: `combat.mjs`, `EncounterPlanningService`, and `EncounterResolutionEngine` use one authoritative action-normalization module.

4. Add an injected `clone` port where Foundry clone semantics matter.
   - Do not make `foundry.utils.deepClone` a hidden dependency in pure modules.
   - Acceptance: pure encounter modules do not reference `foundry` for cloning.

Tests:

- Add direct tests for shared helpers before replacing call sites.
- Use resolver and planning service tests to confirm no behavior drift.

### Phase 4: Split LLM Service by Responsibility

Goal: keep generation policy, prompt composition, API transport, and response parsing independently testable.

Steps:

1. Extract `generation-prompt-composer.mjs`.
   - Own `CONTENT_SKILL_PROMPTS`, generation JSON constraints, prompt path resolution, and `buildComposedGenerationPrompt`.
   - Pattern: **Builder** and **Decorator** for content skill prompt composition.

2. Extract `openai-generation-client.mjs`.
   - Own API base URL, model selection, request execution, and response error mapping.
   - Inject `fetch`, `apiKeyProvider`, and `modelProvider`.
   - Pattern: **Adapter** over OpenAI HTTP API.

3. Leave `LLMService` as a facade temporarily.
   - Pattern: **Facade**.
   - Keep existing callers stable while delegating to composer/client modules.
   - Acceptance: no direct `game.settings` or global `fetch` inside the prompt composer or parser.

4. Extract response parsing helpers.
   - Keep `extractOpenAIResponseText` and JSON-cleanup tests near parser logic.

Tests:

- Move current `test/services/llm-service.test.mjs` coverage toward composer/client/parser tests.
- Add one facade compatibility test.

### Phase 5: Thin Scene Wall Detection

Goal: keep the detection algorithm intact while separating image, grid, and wall-document concerns.

Steps:

1. Extract `scene-grid-model.mjs`.
   - Own background transform, regular square grid model, and grid line coordinates.

2. Extract `wall-image-detection.mjs`.
   - Own luminance sampling, Sobel/edge detection, detected segment merging.

3. Extract `wall-document-builder.mjs`.
   - Own wall defaults and conversion of detected segments into Foundry wall update data.

4. Keep `scene-wall-detection.mjs` as a facade.
   - Acceptance: existing imports continue working during migration.

Tests:

- Preserve current wall detection tests.
- Add narrower tests for grid transform and wall document defaults, especially v13/v14 enum fallback behavior.

### Phase 6: Finish Content Assembly Separation

Goal: keep content data editing low-risk and isolate loadout assembly rules.

Steps:

1. Extract starter loadout assembly from `sample-content.mjs` into `module/content/starter-actor-loadout-builder.mjs`.
2. Keep `sample-content.mjs` as a readable public assembler that exports `TOTC_SAMPLE_ITEMS`, `TOTC_SAMPLE_ACTORS`, and related collections.
3. Move slot compatibility and embedded item id generation tests next to the new builder.

Acceptance:

- `sample-content.mjs` becomes mostly imports and export assembly.
- Existing static pack and starter loadout tests pass unchanged or with only import-path updates.

## Cross-Cutting Guardrails

- Every phase should be independently shippable.
- Do not change user-visible behavior unless a test exposes an existing bug.
- Keep compatibility facades while migrating callers, then remove them in a final cleanup step.
- Prefer pure functions for builders, normalizers, geometry, prompts, and model construction.
- Prefer small stateful classes only for lifecycle, DOM binding, canvas sessions, feature orchestration, or Foundry side effects.
- Add focused unit tests before replacing duplicated utility rules.
- Run `npm run validate` after each phase.

## Suggested Execution Order

1. Phase 2 first if the goal is safer future feature work, because runtime ports reduce test setup friction quickly.
2. Phase 1 first if the goal is reducing the largest current maintenance hotspot, because `SceneDesignFeature` is the clearest SRP violation.
3. Phase 3 should follow one of the first two phases, because utility consolidation is safest after the main ownership boundaries are clearer.
4. Phases 4-6 can proceed independently once the immediate workspace pressure is lower.

## Definition of Done

This plan is complete when:

- `SceneDesignFeature` is a mediator over focused controllers rather than a mixed-responsibility controller.
- Workspace features receive narrow runtime ports instead of reading Foundry globals directly.
- Encounter action normalization and common collection/number helpers have one authoritative home.
- `LLMService` is a facade over separately tested prompt composition and API transport.
- Scene wall detection has separate grid, image, and wall-document modules.
- `sample-content.mjs` is an assembler, not a loadout rule engine.
- `npm run validate` passes after each completed phase.
