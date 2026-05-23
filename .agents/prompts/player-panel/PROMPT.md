---
name: player-panel
description: Build a context-sensitive player actor panel for Turn of the Century in Foundry VTT with clear models, context mapping, collapsible sections, and measurable acceptance criteria.
---

# Context

You are a senior Foundry VTT system developer.
You produce practical, implementation-ready designs and code plans using modern JavaScript.
Your output should prioritize maintainability, explicit data contracts, and testability.

# The Task

Create a module feature for the Turn of the Century system that provides a dynamic, context-sensitive player actor panel.

The panel should present data and actions that are relevant to the currently viewed or controlled actor.
This applies to heroes, pawns, and villains, with the exact content changing based on role, ownership, and game state.

Related actor data and actions must be organized into collapsible sections.
Typical sections include:
- current status and condition summary
- available actions and choices
- active effects, conditions, and reactions
- resources, inventory, equipment, and relevant stats
- turn and encounter context when combat is active
- prompts or affordances that matter right now for that actor

Use practical tabletop player workflow patterns to define templates/components and their visibility rules.
Arrange context-relevant sections as a vertically stacked set of collapsible sections.

# Vision

The player panel should give each player a focused, context-aware view of the actor they are currently using.
It should not show every possible actor detail at once.
Instead, it should surface only the information and actions that matter for the current moment.

In combat, that means status, turn-relevant actions, effects, reactions, and resource state.
Outside combat, that means inventory, equipment, ongoing conditions, and other actor-specific information that is immediately useful.

# Purpose of this request

Your goal is assess the feasibility of creating a context-aware player actor panel as described above.
If the conversion is favorable, you will provide a detailed description of the assessment in a document under docs/.
If the assessment is favorable, you will create a detailed technical design document, also in the docs/ folder, describing the changes that need to be made and an incremental implementation plan with verifiable milestones.
If the UI conversion is not feasible, then the assessment doc should include that conclusion, along with a detailed description of the reasons why.

# What does "complete replacement" mean?

- All visual elements of the ***in-game*** player-facing actor interaction must be represented through the replacement panel.
- The replacement will provide completely custom styling.
- All player actions included in the original actor-facing workflow are replicated in the replacement UI.
- All original Foundry VTT graphical assets remain available for use in the replacement UI.
- All Foundry Application V2 API hooks and other capabilities are supported through replacement UI.
- A facility for accessing actor-relevant controls, status, and action surfaces must be present.

# Required deliverables

Produce the following artifacts:
- Data model definitions for actor context blocks, actions, and section metadata.
- A context-evaluation map (rules/conditions -> active sections/actions).
- UI template/component definitions for each section.
- A prioritization strategy that orders sections by relevance.
- A state model for expanded/collapsed behavior and persisted player preference.
- Event/update strategy describing when context is recomputed.

# In scope

- Creation of required data models.
- Mapping complex game context to relevant sections and actions.
- Creation of templates/components representing each data model.
- Strategy for prioritizing context blocks within the player panel.
- Interaction design for collapsible sections and the global actor search if present.
- Integration notes for Foundry hooks/events used to refresh the panel.
- Consideration of ownership, permissions, and role-based access.

# Out of scope

- Replacing the entire Foundry VTT UI.
- GM-only planning or command surfaces unless they are also exposed through actor-relevant context.
- Major gameplay rule rewrites.
- Full content authoring for every actor ability or item in the system.
- Broad visual redesign unrelated to actor usability.
- Module packaging/publishing pipeline work.

# Success measures

- The panel shows only actor-relevant sections in the primary view.
- Section visibility changes correctly when context changes, such as combat start/end, effect changes, inventory changes, or actor selection changes.
- Context for heroes, pawns, and villains is handled intentionally rather than generically flattened.
- Available actions are accurate for the actor and the current game state.
- Active effects and status information are visible when they matter and hidden or minimized when they do not.
- The output includes a clear mapping table: context signal -> section visibility -> available actions.
- The design includes at least one concrete test scenario per major actor context type.

# Failure measures

- Actor-insensitive clutter that always shows every possible section.
- Missing critical actor controls in expected contexts.
- No deterministic prioritization when multiple actor signals are active.
- Unclear or implicit data contracts for sections and actions.
- Search or filtering behavior omits expected actor-relevant actions.
- No test/validation plan for context transitions.

# References

- Use the existing GM panel patterns as a structural reference.
- Reuse the system's current actor sheet, encounter, inventory, effect, and workspace context conventions where appropriate.
- https://www.dnd-compendium.com/dm-resources
- https://www.dandmadeeasy.com/free-ttrpg-resources
- https://www.youngdragonslayers.com/d-and-d-video-blog/best-free-dnd-resources
