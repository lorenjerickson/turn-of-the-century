# JavaScript Architecture Review

## Summary

The current JavaScript architecture is already a hybrid of pure functions and stateful classes. That is the right broad shape for a Foundry VTT system. The codebase should not be converted wholesale from functions to classes.

The strongest recommendation is to keep pure model builders, render helpers, migrations, normalizers, and calculation routines as functions, while extracting long-lived Foundry-facing workflows from the workspace root application into focused controllers and services.

The main architectural pressure point is `module/ui/workspace-v2/workspace-root-app.mjs`. It has grown into a large application shell that owns too many unrelated responsibilities. The most valuable refactor is to reduce that file into a coordinator that delegates feature-specific state, event binding, and document mutation to smaller objects.

## Current Strengths

- The project already uses classes where state and lifecycle matter, such as `LayoutEngine`, `GridCalibrationController`, `MapViewportController`, `WorkspaceStateStore`, `WorkspaceV2Coordinator`, and Foundry document/data model classes.
- Many panel modules are highly testable because they expose pure model builders and string renderers.
- Core transformation logic, such as actor placement, scene background resolution, viewport state, campaign hierarchy planning, and design issue scanning, is already isolated well enough for focused unit tests.
- The test suite is broad and gives a useful safety net for incremental architecture work.
- Foundry v14 runtime access is partly centralized through `foundry-v14-runtime.mjs`, which is a good pattern to expand.

## Primary Code Smells

### Oversized Workspace Root App

`module/ui/workspace-v2/workspace-root-app.mjs` is the largest concern. It currently combines:

- ApplicationV2 lifecycle
- dock and floating-window rendering
- panel render dispatch
- actor list and editor workflows
- actor map drag/drop workflows
- scene properties workflows
- scene background upload and persistence
- map viewport synchronization
- grid calibration UI handling
- market state and transactions
- GM assistant generation
- compendium hydration
- media browser loading and selection
- design action execution
- design issue navigation
- hook binding and unbinding
- user scoped state persistence
- Foundry document mutation

This makes the file hard to reason about and increases the chance that unrelated changes collide.

### Mixed Rendering, State, and Persistence

Several root-app methods bind DOM events, mutate local UI state, call Foundry document APIs, emit notifications, and rerender in one block. That is expedient, but it makes behavior harder to test below the full application layer.

### Direct Foundry Global Access

The codebase still directly uses `game`, `canvas`, `ui`, `foundry`, `Hooks`, and browser globals in many workflow modules. Some modules already inject dependencies; others do not. Direct access is normal in Foundry code, but keeping it out of pure logic makes tests and future compatibility much easier.

### Static Service Classes

`LLMService` is class-shaped, but its methods are static and it directly reads settings/fetches prompts. It behaves more like a namespace than an instantiated service. This is not urgent, but it is a candidate for dependency injection if generation workflows expand.

### Panel Modules Are Doing Two Jobs

Panel modules often combine view-model construction and HTML rendering. This is acceptable today and remains testable, but TypeScript would make these boundaries clearer if panel complexity continues to grow.

## OOP Feasibility

A class-oriented refactor is feasible because the codebase already has:

- stateful controllers,
- model-building functions,
- rich unit tests,
- clear workspace feature boundaries,
- Foundry document classes and data model classes,
- explicit panel registry and design action registry concepts.

However, a blanket OOP migration would not add proportional value. It would mostly rename pure functions as methods, increase boilerplate, and make some tests more cumbersome.

The best target architecture is a functional core with an object-oriented shell.

## Where Classes Add Value

Use classes for long-lived objects that own state, dependencies, lifecycle, or Foundry side effects.

Good class candidates:

- `ActorManagementController`
  - selected actor IDs
  - actor editor state
  - actor generation/save workflows
  - actor list event binding

- `ScenePlacementController`
  - actor drag/drop payload handling
  - drag image lifecycle
  - map drop preview rendering
  - token creation orchestration

- `ScenePropertiesController`
  - background upload
  - scene deletion
  - default scene updates
  - scene activation
  - scene properties status/error state

- `MarketController`
  - market panel state
  - buy/sell workflows
  - generated offer boards
  - actor/item eligibility

- `MediaBrowserController`
  - FilePicker integration
  - media entry loading
  - selection callback state

- `CompendiumHydrationController`
  - cached item loading
  - hydration retry scheduling
  - pack mutation invalidation

- `WorkspaceHooksController`
  - bind/unbind hook families
  - prevent duplicated hook state flags in the root app

- `PanelHost` or `PanelRenderService`
  - panel body render dispatch
  - active panel context construction

## Where Functions Should Stay

Keep functions for deterministic, stateless, easily tested behavior.

Good functional areas:

- panel model builders
- panel HTML renderers
- placement math
- scene background source resolution
- migration transforms
- item/actor data normalization
- dice calculation
- campaign hierarchy move/delete planning
- grid geometry calculations
- design issue scanning rules
- string formatting and safe escaping

These functions are valuable precisely because they are small, dependency-light, and easy to unit test.

## Recommended Architecture Direction

### Target Shape

`WorkspaceRootApp` should become a thin shell:

- own ApplicationV2 lifecycle,
- instantiate controllers,
- provide shared dependencies,
- render top-level layout,
- route lifecycle calls,
- delegate feature-specific event binding and state transitions.

Feature controllers should:

- receive dependencies through constructors,
- expose `bind(rootElement)` or `wire(rootElement)` methods,
- expose state/model methods where useful,
- call back into the root app only for shared operations such as `render({ force: false })`, panel docking, or shared notification helpers.

Pure modules should remain imported by controllers and tested directly.

### Example Boundary

Actor map drag/drop should split roughly as:

- `scene-actor-placement.mjs`
  - pure placement and token data construction

- `ActorDragImageController`
  - DOM drag image lifecycle

- `SceneActorDropController`
  - event binding
  - map event to scene coordinate resolution
  - preview layer updates
  - call token placement service

- `SceneTokenPlacementService`
  - call `scene.createEmbeddedDocuments("Token", tokenData)`
  - normalize errors/status messages

This keeps geometry testable, DOM behavior isolated, and Foundry mutation behind a small service.

## TypeScript Assessment

TypeScript would add real value, especially around boundaries and Foundry document shapes. It should be introduced incrementally rather than as a rewrite prerequisite.

High-value TypeScript targets:

- workspace layout state
- dock, stack, panel, and floating-window types
- panel model return types
- design action contracts
- actor drag/drop payloads
- scene actor placement preview/token data
- Foundry document update payloads
- LLM generation result shapes
- controller constructor dependency interfaces
- user-scoped settings and flag state

Lower-value TypeScript targets:

- simple constants
- tiny one-off render modules
- static data packs
- migration scripts that are already well covered

## Suggested TypeScript Path

1. Add `tsconfig.json` with `allowJs`, `checkJs`, and `noEmit`.
2. Add JSDoc typedefs for the most important workspace contracts.
3. Enable checking on a few stable modules first, such as layout state, scene actor placement, and viewport state.
4. Introduce `@league-of-foundry-developers/foundry-vtt-types` or a local minimal Foundry shim only after confirming compatibility with the target Foundry version.
5. Convert isolated pure modules to `.ts` only when the build/release pipeline is ready for emitted `.mjs`.
6. Convert extracted controllers after their boundaries stabilize.

This path gives most of the safety benefit early without forcing an immediate build-system migration.

## Proposed Refactor Plan

### Phase 1: Stabilize Contracts

- Add JSDoc typedefs or TypeScript interfaces for workspace layout, panel definitions, panel models, design actions, and scene actor placement.
- Add type checking in no-emit mode.
- Keep runtime output unchanged.

### Phase 2: Extract One Controller

- Start with actor drag/drop and scene token placement because it is recently touched and well tested.
- Extract behavior from `WorkspaceRootApp` without changing user-facing behavior.
- Keep `scene-actor-placement.mjs` pure.

### Phase 3: Extract Scene Properties

- Move scene properties event binding and document mutation into a controller/service pair.
- Keep `scene-properties-panel.mjs` as a pure model/render module.

### Phase 4: Extract Market and Media Browser

- These features have enough state and Foundry integration to benefit from their own controllers.
- Use dependency injection for FilePicker, notifications, and item/actor collections.

### Phase 5: Reassess TypeScript Emission

- After boundaries are smaller, decide whether to continue with checked JavaScript or convert selected modules to TypeScript.
- Avoid converting files simply for consistency.

## Risks

- A broad rewrite would risk breaking Foundry lifecycle behavior, especially hook binding, ApplicationV2 rendering, and document mutation.
- Overuse of classes could make simple panel model tests more verbose.
- Introducing a TypeScript build step too early could complicate release packaging and Foundry module loading.
- Foundry type definitions may lag or differ from the exact v14 APIs used by this system, so type adoption should be wrapped with local shims where needed.

## Recommendation

Do not migrate the whole project from functions to classes.

Do refactor toward a hybrid architecture:

- functional core for pure logic,
- stateful controllers for workspace workflows,
- small services around Foundry APIs,
- incremental TypeScript or checked JavaScript for contracts.

The highest-value next step is extracting feature controllers from `WorkspaceRootApp`, beginning with actor drag/drop and scene placement, while preserving the existing pure helpers and unit tests.
