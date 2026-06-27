---
name: code-smells
description: Detect and avoid code smells during implementation, review, and refactoring. Use whenever an agent writes new modules, modifies existing code, evaluates a proposed structure, or reviews a pull request in this repository.
---

# Code Smells

## Core Rule

Before marking any implementation complete, scan the code you wrote or touched for the smells listed below. If you introduced one, refactor it out. If an existing smell was already present and you cannot safely remove it in scope, name it, explain why it was left, and flag it as technical debt.

A smell is not a bug, but it is a signal that the design is under stress. Address the signal, not just the symptom.

---

## Smells Within a Unit (function, module, class)

**Comments that describe *what* the code does**
Comments should explain *why* — a hidden constraint, a non-obvious invariant, a workaround. If a comment is needed to explain what the code does, rename the identifiers or restructure the logic until the comment is unnecessary.

**Long Method / Function**
A function that requires scrolling to read is too long. Extract sub-operations into named functions. If you cannot name the extraction without using "and," split it further.

**Long Parameter List**
More than three or four parameters is a signal the caller is doing assembly work that belongs inside the function, or that the function has too many responsibilities. Consolidate related parameters into a single options object; move invariant data into the constructor.

**Duplicated Code**
Any logic that appears in more than one place is a defect waiting to diverge. Extract once. The second concrete duplication is the trigger — not the first.

**Conditional Complexity**
A deeply nested or frequently extended conditional block is a sign the branching is carrying domain logic that belongs in data or in separate functions. Apply a lookup table, a strategy object, or early returns before the nesting exceeds two levels.

**Combinatorial Explosion**
Similar functions that differ only in a parameter, type, or minor behaviour variation should be collapsed into one parameterised function. If you are copying a function and changing one word, that is the smell.

**Large Class / Module**
A module that handles multiple distinct concerns is too large. Evaluate its responsibilities; if the name requires "and" to describe them, split it.

**Type Embedded in Name**
`actorString`, `idArray`, `countNumber` — encoding a type in a name is noise. Names describe role and intent; type information belongs in a type annotation or is obvious from context.

**Uncommunicative Name**
`data`, `result`, `temp`, `val`, `x` — a name that forces the reader to trace execution to understand meaning is a smell. Name the *role*, not the *kind*. A reader should understand what a variable holds without reading the body.

**Inconsistent Names**
If `create` is used in one place and `make` in another for the same concept, pick one. Paired operations must use paired names: `open`/`close`, `add`/`remove`, `build`/`destroy`.

**Dead Code**
Commented-out blocks, unused exports, unreachable branches — delete them. Source control holds the history. Dead code misleads every reader who has to decide whether it matters.

**Speculative Generality**
Extension points, optional parameters, abstract base classes, or configurability with no current consumer are premature. Write for today's requirement. The second use case earns the abstraction.

**Oddball Solution**
The same problem solved two different ways in the same codebase. Pick one approach and apply it consistently. If both are necessary, make the inconsistency explicit with an adapter or bridge.

**Temporary Field**
An object property that is only meaningful in some states or only set in certain code paths. If a field is not always valid, it should not be on the object — move it into the function that needs it, or restructure the state model.

---

## Smells Between Units (modules, classes, layers)

**Alternative Classes with Different Interfaces**
Two modules that do the same job with different function signatures. Align them under a shared interface or eliminate one.

**Primitive Obsession**
Using a raw string or number to represent a concept that has rules, constraints, or behaviour. When the same primitive appears everywhere with the same validation or formatting applied around it, introduce a named type or helper.

**Data Class / Anemic Module**
A module that only holds data and exposes no behaviour related to that data is doing half a job. Either add the behaviour it is missing or treat it as a plain data transfer shape and own that decision explicitly.

**Data Clumps**
The same group of three or four parameters always appearing together is a sign they belong in a single named object. If you see `name, type, id` passed as a triplet in five places, make it `{ name, type, id }` with a clear name.

**Refused Bequest**
A subclass that inherits methods it ignores or overrides to do nothing. Inheritance is a strong claim — if the subclass cannot honour the parent's contract, prefer composition.

**Inappropriate Intimacy**
Two modules that know too much about each other's internals. Access to private state, deep property traversal across module boundaries, or circular imports are all signs. Modules should communicate through declared interfaces, not by reaching in.

**Indecent Exposure**
Every public function, export, or property is a promise to the world. Minimise the public surface. If it does not need to be exported, do not export it. Require a reason to make something public; require no reason to keep it private.

**Feature Envy**
A function that spends most of its body working with another module's data belongs in that other module. Move it.

**Lazy Class / Module**
A module too thin to justify its existence as a separate file. Inline it into its only caller, or merge it with a sibling that is too small on its own.

**Message Chains**
`a.b().c().d()` — each dot is a dependency on the internal structure of a stranger. Violates DTS (Don't Talk to Strangers). Resolve the value you actually need and pass it in, or introduce a method that encapsulates the traversal.

**Middle Man**
A module whose only job is to delegate to another. One level of indirection can be valuable; a module that is purely a pass-through adds cost without value. Remove it or give it a real responsibility.

**Divergent Change**
A module that changes for unrelated reasons on every sprint contains more than one responsibility. Unrelated change triggers are the diagnostic signal for SRP violations.

**Shotgun Surgery**
A single logical change requires edits in five different files. The knowledge about that concept is scattered. Consolidate it so that the change has one home.

**Parallel Inheritance Hierarchies**
Every time you add a subclass of X, you must add a matching subclass of Y. The hierarchies are coupled. Collapse them or break the coupling.

**Incomplete Library Class / Module**
A utility needed from a dependency that does not provide it, patched onto an unrelated module. Isolate the extension in a dedicated adapter or utility module rather than polluting an existing one.

**Solution Sprawl**
A single concept requiring five modules to collaborate before anything useful happens. If bootstrapping a feature requires assembling too many moving parts, simplify the boundaries.

---

## Application to This Codebase

The following smells are most commonly introduced during feature work here — watch for them specifically:

| Smell | Common trigger in this repo |
|---|---|
| Long Parameter List | Adding fields to `build*Model` functions over time |
| Feature Envy | Controller methods that do model computation |
| Inappropriate Intimacy | Features reaching into another feature's state directly |
| Message Chains | Traversing `combat.combatants.get(id).actor.system.…` in logic modules |
| Speculative Generality | Adding registry infrastructure for a single item type |
| Dead Code | Leaving old render branches after a panel refactor |
| Duplicated Code | Prompt-building or slugify logic split between scripts and modules |
| Indecent Exposure | Exporting helpers that are only used within the same file |

---

## Checklist Before Completing a Change

- [ ] Every function name describes exactly one thing without "and."
- [ ] No parameter list exceeds four items without a consolidating object.
- [ ] No logic is copied from another location in the codebase.
- [ ] No conditional nesting exceeds two levels without extraction.
- [ ] No dead code, commented-out blocks, or unused exports remain.
- [ ] No speculative abstractions with zero current callers.
- [ ] No module traverses another module's private internals.
- [ ] No public export exists without a reason to be public.
- [ ] No temporary or conditionally-valid fields on shared objects.
- [ ] Names are consistent with the surrounding codebase vocabulary.
