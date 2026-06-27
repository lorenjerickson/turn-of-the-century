---
name: design-principles
description: Apply foundational software design principles — SOLID, KISS, DRY, YAGNI, SoC, LoD — during implementation, review, and refactoring. Use whenever an agent writes new modules, refactors existing code, designs an API surface, or evaluates a proposed structure in this repository.
---

# Design Principles

## Core Rule

Every piece of code you write or review must be defensible against these principles. When you violate one, name the violation, state why the trade-off is justified, and flag it in your response. Unjustified violations are bugs in design, not style.

---

## Principles

### SOLID

Apply at the module and function boundary level. This codebase uses ES modules and dependency injection extensively — lean into that.

**S — Single Responsibility**
Each module, class, or function does one thing. A panel model builder builds models. A controller wires handlers. A service calls an API. When a function's name requires "and" to describe it, split it.

**O — Open/Closed**
Extend behaviour by adding new functions, modules, or injected dependencies — not by adding `if` branches to existing stable code. Feature flags and caller-side switches are the exception, not the pattern.

**L — Liskov Substitution**
Any injected dependency must be substitutable in tests without breaking callers. If a mock of a dependency requires different call semantics than the real implementation, the interface is wrong.

**I — Interface Segregation**
Injected dependency objects should expose only what callers need. Do not pass the whole `game` object into a function that only needs `game.actors`. Accept the narrowest possible shape.

**D — Dependency Inversion**
Foundry globals (`game`, `canvas`, `ui`, `FilePicker`, `PIXI`) are never imported or referenced directly in logic modules. Route them through injected dependencies, `foundry-v14-runtime.mjs` adapters, or constructor parameters so they can be stubbed in tests.

---

### KISS — Keep It Simple

Prefer the simplest implementation that satisfies the stated requirement. Complexity must be earned.

- A plain function is simpler than a class.
- A class is simpler than a class hierarchy.
- Three separate `if` branches are simpler than a strategy registry when there are three strategies.
- Inline logic is simpler than a helper when the helper is only ever called once.

When you feel the pull toward an abstraction, ask: does this abstraction exist yet in the codebase, or am I creating it for one use? If one use, resist it.

---

### DRY — Don't Repeat Yourself

Every piece of knowledge has one authoritative source. Duplication of *structure* is usually fine; duplication of *rules, constraints, or domain logic* is always a defect.

- If the same derivation (e.g. slugify an actor name, build a token image prompt) appears in more than one place, extract it once.
- Configuration values, path prefixes, and magic strings that appear in more than two places belong in a named constant.
- Test helpers that repeat setup across suites belong in a shared factory function.

Do not DRY prematurely: wait until the second concrete duplication exists before extracting. Three uses justifies a shared abstraction; one does not.

---

### YAGNI — You Aren't Gonna Need It

Do not implement what has not been asked for. Specifically:

- No extension points for hypothetical future callers.
- No optional parameters that have no current consumer.
- No base classes whose only subclass is the one you are writing now.
- No feature flags around behaviour that is not yet conditional.
- No backwards-compatibility shims for callers that do not yet exist.

If a future requirement makes simplification painful, that is acceptable. The cost of unused abstraction is paid now, in every review, test, and change. The cost of missing abstraction is paid once, when the second use arrives.

---

### SoC — Separation of Concerns

Keep these concerns in separate modules and do not let them bleed into each other:

| Concern | Where it lives |
|---|---|
| Data shape / model building | Pure functions in panel or service modules |
| Rendering / HTML templates | `render*` functions, never inside controllers |
| Event wiring | `wireHandlers` / `bind` methods |
| Foundry API calls | Feature classes and runtime adapters |
| Business logic | Controllers, resolvers, and service methods |
| Persistence | Repository modules and migration files |

When a function both computes a value *and* writes to a document, split it: one function computes, another writes. The compute function is testable without Foundry; the write function is thin and boring.

---

### DTS — Don't Talk to Strangers *(Law of Demeter)*

A unit of code should only talk to its immediate collaborators — not to the collaborators of its collaborators.

- Call `actor.name` not `combat.combatants.get(id).actor.name`.
- Accept the resolved value as a parameter, not the container you have to reach into to find it.
- When you find yourself navigating three or more levels of chaining to get something, introduce an adapter or have the caller pass the pre-resolved value in.
- "Strangers" are objects you obtained by querying another object. You may use what you own, what was passed to you, and what you created — nothing else.

Exception: builder/factory functions that intentionally traverse a full data structure to produce a flat model — that traversal is their entire job.

---

## Application to This Codebase

**Dependency injection is the primary mechanism for D, DTS, and testability.** Every controller and feature class receives its Foundry dependencies through its constructor. When adding a new dependency on a Foundry global, add it as a constructor parameter with a sensible default that reads from `globalThis` — never hard-code the call site inside logic.

**Pure model functions stay pure.** `build*Model`, `render*Panel`, and `resolve*` functions must not call Foundry APIs, perform side effects, or reference `game`/`canvas`/`ui`. They are the testable core of every panel.

**Migration files are append-only.** Adding a new migration step satisfies O (open for extension) and SRP (each step has one job). Never modify an existing migration step to cover a second case — add a new step.

**Tests enforce the boundaries.** If a test requires mocking more than one Foundry surface to exercise a single function, the function has too many concerns. Refactor until the test is simple.

---

## Checklist Before Completing a Change

- [ ] Each new function or module has a name that describes exactly one thing.
- [ ] No Foundry globals are referenced directly inside logic or model modules.
- [ ] No logic is duplicated — if a rule appears twice, it has been extracted once.
- [ ] No speculative abstractions, extension points, or optional parameters without a current consumer.
- [ ] Render, model, and handler concerns live in separate functions.
- [ ] Input traversal is shallow — deeply nested access has been pushed to the edge.
- [ ] The smallest possible surface is accepted as input to each function.
