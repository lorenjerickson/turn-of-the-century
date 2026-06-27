---
name: design-patterns
description: Apply well-understood design patterns — primarily Gang of Four — to produce code with low coupling and high cohesion. Use whenever an agent designs a new module, adds a significant feature, refactors a tangled area, or evaluates a structural decision in this repository.
---

# Design Patterns

## Relationship to Design Principles

This skill is the *how* to the *why* in [design-principles](../design-principles/SKILL.md). The principles (SOLID, KISS, DRY, YAGNI, SoC, DTS) tell you what properties good code must have. The patterns here are proven structural solutions that achieve those properties in recurring situations.

Do not apply a pattern because it is elegant. Apply it because it solves a specific coupling or cohesion problem you have already diagnosed. A pattern applied to a problem that does not exist is a YAGNI violation and a code smell.

---

## Low Coupling and High Cohesion

These are the two properties all patterns below are in service of.

**Low coupling** — a module should be able to change without forcing changes in unrelated modules. Signs of high coupling: a change in one file requires edits in five others (Shotgun Surgery); a module imports things it does not directly use; concrete types are scattered through call sites.

**High cohesion** — everything inside a module belongs together and changes for the same reason. Signs of low cohesion: a module named with "and"; methods that operate on data from a different module (Feature Envy); a class that changes for unrelated reasons each sprint (Divergent Change).

When you reach for a pattern, be able to state which coupling or cohesion problem it addresses.

---

## Creational Patterns

### Factory Method / Factory Function
**Problem:** A caller needs an object but should not be coupled to its concrete constructor.
**Solution:** Delegate construction to a function or method. The caller depends on the interface, not the implementation.
**Use when:** The exact type to create depends on runtime data; you want to keep Foundry document class constructors out of logic modules.
**In this codebase:** `requireActorDocumentClass()` in `foundry-v14-runtime.mjs` is a factory that decouples feature code from the concrete Foundry `Actor` class. Injected `createActor` dependencies in controllers follow the same pattern.

### Builder
**Problem:** Constructing a complex object requires many steps, optional parts, or conditional assembly that should not burden the caller.
**Solution:** Assemble the object through a sequence of composable steps; return the finished result at the end.
**Use when:** A data structure has many optional fields; prompt composition assembles from multiple sources; a model is built from several guarded sub-sections.
**In this codebase:** `LLMService.buildComposedGenerationPrompt` assembles a prompt from the general prompt, element-type prompt, content skills, and generation context — each step optional, composed in order.

### Singleton (use sparingly)
**Problem:** Exactly one instance of a resource must exist — a registry, a coordinator, a shared cache.
**Solution:** Enforce single construction at the module boundary (a module-level const, not a class with a `getInstance` method).
**Use when:** A registry or cache must be shared across callers with no coordination overhead.
**Caution:** Singletons couple all callers to shared mutable state. Prefer injecting the instance rather than importing it directly; this preserves testability.
**In this codebase:** `WorkspacePanelRegistry` and `WorkspaceDesignActionRegistry` are effectively singleton registries within a workspace lifetime — passed by injection, not imported globally.

---

## Structural Patterns

### Adapter
**Problem:** You need to use an interface that does not match what your code expects — typically a third-party or platform API.
**Solution:** Wrap the mismatched interface behind a new one that your code controls.
**Use when:** Isolating Foundry's global API surface from logic modules; wrapping browser APIs (FilePicker, File) for testability.
**In this codebase:** `foundry-v14-runtime.mjs` is an adapter layer. It translates Foundry's namespaced globals (`foundry.documents.Actor`, `foundry.applications.apps.FilePicker`) into stable functions (`requireActorDocumentClass`, `requireFilePicker`) that the rest of the codebase depends on. When Foundry changes its API, only the adapter changes.

### Facade
**Problem:** A subsystem has a complex interface. Callers need only a small slice of it, but are currently forced to understand the whole.
**Solution:** Provide a simplified interface over the subsystem. The facade handles orchestration; callers handle intent.
**Use when:** Wrapping multi-step Foundry operations (unlock pack → update documents → relock pack) behind a single call; exposing a clean public API from a feature with complex internals.
**In this codebase:** `withUnlockedCompendiumPack` in `compendium-locking.mjs` is a facade over the lock/unlock lifecycle. Migration functions call it without managing lock state.

### Proxy
**Problem:** Access to an object needs to be controlled, deferred, or guarded without changing the object.
**Solution:** Wrap the object behind a proxy that applies the guard, then delegates.
**Use when:** Lazy-loading expensive Foundry documents; caching results of repeated lookups; adding permission checks at the boundary.
**In this codebase:** `CompendiumCacheController` proxies compendium lookups — it guards against redundant network fetches and controls when documents are loaded.

### Decorator
**Problem:** You need to add behaviour to an object or function without modifying it — and the additions are combinatorial.
**Solution:** Wrap the original in a new object/function that adds the behaviour, then delegates.
**Use when:** Adding content skills (language-style, science-not-magic, art-style) to a base generation prompt without modifying the base; composing middleware around a handler.
**In this codebase:** The content skill system (`getRelevantContentSkillPrompts`) decorates the base system prompt with additional constraints depending on the generation type.

### Composite
**Problem:** A tree of objects needs to be treated uniformly — individual items and collections of items share the same interface.
**Solution:** Define a common interface; composites implement it by delegating to their children.
**Use when:** A workspace contains features, each of which may contain sub-features; a layout tree where each node has children of the same kind.
**In this codebase:** The workspace feature system (`WorkspaceFeature` base class, composed into `WorkspaceRootApp`) treats each feature uniformly through `prepareContext`, `render`, `bind`, and `dispose`.

---

## Behavioural Patterns

### Strategy
**Problem:** A family of algorithms is interchangeable at runtime. Callers should not contain conditional logic for which algorithm to use.
**Solution:** Define a common interface; inject the selected strategy; the caller never branches on algorithm identity.
**Use when:** Resolution logic varies by action type; rendering varies by panel type; generation prompts vary by element type.
**In this codebase:** The encounter action resolution engine selects resolution behaviour by action type. Panel rendering in `WorkspaceRootApp` delegates to the responsible feature — the app does not branch on content type; it asks each feature whether it handles the panel.

### Observer / Event Hook
**Problem:** One module needs to react to events in another without the two being directly coupled.
**Solution:** The source emits named events; observers subscribe. Neither knows the other's concrete type.
**Use when:** Responding to Foundry lifecycle events; notifying the workspace when world state changes; broadcasting encounter events without hard-wiring listeners.
**In this codebase:** Foundry's `Hooks` system is the Observer pattern. Workspace features subscribe to `canvas.ready`, `updateCombat`, and similar hooks rather than being called directly. Prefer hook subscription over direct coupling between features.

### Command
**Problem:** A request needs to be encapsulated as an object — to queue it, log it, undo it, or parameterise it.
**Solution:** Represent each action as a data object with everything needed to execute it.
**Use when:** Representing encounter actions (each action in a combatant's plan is a command object); design actions in the command palette; queued roll requests.
**In this codebase:** Combatant action plans are arrays of command objects (`{ type, actionId, targetId, … }`). The resolution engine processes them without coupling to the UI that created them.

### Template Method
**Problem:** An algorithm's structure is fixed, but specific steps vary between implementations.
**Solution:** Define the skeleton in a base class or function; let subclasses or injected functions supply the varying steps.
**Use when:** All workspace features go through the same lifecycle (prepareContext → render → bind → dispose) but differ in what each step does.
**In this codebase:** `WorkspaceFeature` defines the template. Each concrete feature (`ActorManagementFeature`, `EncounterPlanningFeature`, etc.) implements only the steps that vary. `WorkspaceRootApp` drives the lifecycle without knowing which features are present.

### State
**Problem:** An object's behaviour changes fundamentally depending on its internal state, and that state transitions follow defined rules.
**Solution:** Represent each state as a distinct value (or object); behaviour reads from state rather than accumulating `if/else` branches across the class.
**Use when:** An editor panel has `empty`, `create`, and `edit` modes; a calibration flow has `idle`, `active`, and `confirming` states; a generation request has `idle`, `running`, and `error` states.
**In this codebase:** `ActorWorkspaceController.editorState` carries a `mode` field (`"empty"` | `"create"` | `"edit"`) that drives rendering. State transitions are explicit assignments, not scattered boolean flags.

### Repository
**Problem:** Logic modules need data from an external store (the Foundry canvas, a database, a document collection) but should not be coupled to how that store is accessed.
**Solution:** Introduce a repository interface that expresses what data the caller needs; the implementation handles how to retrieve it.
**Use when:** Scene, token, or wall data needs to be fetched in logic that must remain testable without a running Foundry canvas.
**In this codebase:** `SceneRepository` and `WallRepository` decouple encounter and scene logic from direct `canvas.scene` access. Tests stub the repository; production wires it to the live canvas.

### Mediator
**Problem:** Many objects need to communicate with each other, creating a web of direct references that is hard to change.
**Solution:** Route communication through a mediator. Objects talk to the mediator; the mediator coordinates.
**Use when:** The workspace root needs to coordinate between layout, features, panels, and state — none of which should know each other.
**In this codebase:** `WorkspaceRootApp` is the mediator between the layout engine, panel registry, feature list, and state store. Features do not hold references to each other; they signal through the app's render cycle.

---

## Patterns to Avoid Here

| Pattern | Why to avoid |
|---|---|
| **Singleton via global variable** | Breaks testability and couples all callers to shared mutable state. Pass instances by injection instead. |
| **Abstract Factory with deep hierarchies** | In a JavaScript module system, a factory function is almost always sufficient. Class hierarchies more than two levels deep are a design smell. |
| **Visitor** | Appropriate when you need to add operations to a stable type hierarchy without modifying it. In this codebase, the type hierarchy is not stable enough and Visitor adds indirection without proportionate benefit. |
| **Prototype (clone-based)** | JavaScript object spread (`{ ...obj }`) is the idiomatic clone. A formal Prototype pattern adds ceremony without value. |
| **Chain of Responsibility with implicit fallthrough** | Prefer explicit strategy dispatch over implicit chains where the handling order matters and is non-obvious. |

---

## Decision Guide

Before reaching for a pattern, answer these two questions:

1. **What coupling am I removing?** Name the two modules that should not know about each other.
2. **What cohesion am I improving?** Name the single responsibility the new structure will have.

If you cannot answer both, you do not yet have a design problem — you have an implementation task. Write the simplest code that works and return to patterns when the second use case arrives.

| Problem | Pattern |
|---|---|
| Caller coupled to a concrete constructor | Factory Method |
| Complex assembly of an object | Builder |
| Mismatched third-party interface | Adapter |
| Complex subsystem with a narrow use | Facade |
| Controlled or cached access to an object | Proxy |
| Optional, combinatorial behaviour additions | Decorator |
| Interchangeable algorithms | Strategy |
| Loose coupling between event source and handler | Observer |
| Encapsulated, replayable request | Command |
| Fixed lifecycle with variable steps | Template Method |
| Behaviour that changes with internal state | State |
| Shared data store decoupled from access details | Repository |
| Many-to-many object communication | Mediator |

---

## Checklist Before Completing a Change

- [ ] Any new structural relationship can be named as a pattern or justified as simpler than any applicable pattern.
- [ ] No module imports a concrete Foundry class directly — adapter or injection is used instead.
- [ ] Algorithms that may vary are behind a strategy or injected function, not hardcoded `if` branches.
- [ ] Lifecycle hooks are used for cross-module event notification, not direct method calls between features.
- [ ] State is a named value, not a set of scattered boolean flags.
- [ ] Repositories mediate any access to Foundry canvas or document store in logic that must be testable.
- [ ] The pattern chosen removes a specific, named coupling — not applied for its own sake.
