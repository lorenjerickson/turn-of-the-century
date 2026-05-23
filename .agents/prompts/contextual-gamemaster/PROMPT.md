---
name: contextual-gamemaster
description: Build a context-sensitive Gamemaster panel for Turn of the Century in Foundry VTT with clear models, context mapping, collapsible action groups, and measurable acceptance criteria.
---

# Context

You are a senior Foundry VTT system developer.
You produce practical, implementation-ready designs and code plans using modern JavaScript.
Your output should prioritize maintainability, explicit data contracts, and testability.

# The Task

Create a module feature for the Turn of the Century system that provides a dynamic, context-sensitive Gamemaster panel.

The panel should present data and actions that are relevant to the current game state.
Example behavior:
- If no encounter is active, show "Start Encounter" actions.
- If an encounter is active, replace those with "Manage/End Encounter" actions.

Related data and actions must be organized into collapsible groups.
Typical groups include:
- Encounter control
- Travel and location generators (towns, markets, mobs, points of interest)
- Audio/visual atmosphere controls
- Scene pacing and GM utilities

Include an "All GM Actions" searchable section that lists every available GM action, including actions not currently context-prioritized.
This section should be collapsed by default and pinned at the bottom of the panel.

Use practical tabletop GM workflow patterns to define templates/components and their visibility rules.
Arrange context-relevant groups as a vertically stacked set of collapsible sections.

# Required deliverables

Produce the following artifacts:
- Data model definitions for context blocks, actions, and group metadata.
- A context-evaluation map (rules/conditions -> active groups/actions).
- UI template/component definitions for each group.
- A prioritization strategy that orders groups by relevance.
- A state model for expanded/collapsed behavior and persisted user preference.
- Event/update strategy describing when context is recomputed.

# In scope

- Creation of required data models.
- Mapping complex game context to relevant groups and actions.
- Creation of templates/components representing each data model.
- Strategy for prioritizing context blocks within the GM panel.
- Interaction design for collapsible groups and the global action search.
- Integration notes for Foundry hooks/events used to refresh context.

# Out of scope

- Replacing the entire Workspace UI architecture.
- Migrating unrelated gameplay systems.
- Full content authoring for every possible generator table.
- Major visual redesign unrelated to panel usability.
- Module packaging/publishing pipeline work.

# Success measures

- The panel shows only context-relevant groups in the primary stack.
- Group visibility changes correctly when context changes (encounter start/end, scene changes, token selection changes).
- All groups are collapsible/expandable and preserve their state appropriately.
- The "All GM Actions" section is searchable, complete, and collapsed by default.
- Actions execute the correct underlying system behavior with no role/permission violations.
- Output includes a clear mapping table: context signal -> group visibility -> available actions.
- The design includes at least one concrete test scenario per major context type.


# Failure measures

- Context-insensitive action clutter (irrelevant groups always shown).
- Missing critical GM controls in expected contexts.
- No deterministic prioritization when multiple contexts are active.
- Unclear or implicit data contracts for groups/actions.
- Search list omits actions or cannot locate them reliably.
- No test/validation plan for context transitions.

# References

- https://www.dnd-compendium.com/dm-resources
- https://www.dandmadeeasy.com/free-ttrpg-resources
- https://www.youngdragonslayers.com/d-and-d-video-blog/best-free-dnd-resources

