# Narrative Encounter Round Planning

## Purpose

Encounter round planning should feel like composing intent, not filling out a form. The player should build a short narrative paragraph that describes what their character intends to do during the round. The paragraph is the primary editor for the plan: each selectable phrase is a discrete decision point, and clicking that phrase edits that decision.

This document describes a complete replacement for the planning section of the player encounter planning panel. It should preserve the underlying planning, resolution, and reconciliation mechanics wherever possible.

## Design Principles

- The planning UI is sentence-first. Mechanical details should appear only where they help the player make or confirm decisions.
- AP cost is shown inline in the narrative, for example `(3 AP)`.
- Remaining AP and unused AP are shown as help/context while composing, especially inside action-selection UI.
- The player must explicitly confirm the plan, even when all AP has been allocated.
- The narrative paragraph is the only way to select or edit action-plan elements. There should not be a separate available-actions list or sidebar.
- Completed phrases remain editable until the plan is confirmed and required rolls have been resolved.
- Once required rolls have been made and stored, the plan is locked and cannot be edited.

## Narrative Paragraph

The plan is rendered as one continuous paragraph for now. This may be revisited later if stacked clauses read better.

Example:

`Horus takes careful aim at Mallory and fires (3 AP), then takes cover for 3 seconds (3 AP).`

Completed decision phrases should be visually distinct and clickable. Placeholder phrases should also be clickable.

Examples:

- `[select an action]`
- `[takes careful aim at]`
- `[select target]`
- `[Mallory]`
- `[select item]`
- `[3 seconds]`

## Editing and Truncation

Any completed phrase may be edited. The system should preserve as much of the downstream plan as remains valid.

General rule:

- If changing a previous decision does not affect AP allocation or downstream validity, preserve the following plan.
- If changing a previous decision changes AP cost, target mode, valid follow-up options, required item, required rolls, or any other downstream dependency, truncate the plan from that point and require the player to rebuild the rest.

Examples:

- Changing an attack target from Mallory to another valid target may preserve later clauses if AP cost, item choice, and required rolls remain compatible.
- Changing `Aimed Shot` to `Move` changes the action structure and AP assumptions, so downstream clauses must be discarded.
- Changing a movement destination may be allowed if the new destination fits within the AP available to that movement clause. If it changes AP allocation in a way that invalidates later clauses, truncate the invalid downstream plan.

## Selection Modes

Selection should use the interaction style that best fits the decision.

### Actions

Clicking `[select an action]` opens a searchable action selection popover. It should use the rich icon and description rows already used elsewhere in the UI. The popover should show remaining AP / unused AP context.

Player-facing action labels should include:

- Move
- Attack
- Defend
- Evade
- Close With
- Follow
- Wait
- Use Item
- Overwatch
- Reload
- Snap Shot
- Aimed Shot
- Pistol Whip

`Close and Engage` should not be shown. The current `Pursue` intent should be renamed in the UI to `Close With`. `Follow` remains separate because it represents a different intent.

### Targets

Targets must be selected on the map. Clicking a target placeholder starts map targeting mode. The narrative text may remain unchanged while the map selection is active, but the UI should show minimal helper text below the paragraph, such as:

`Choose a target on the map.`

### Movement Destinations

Plain movement destinations must be selected on the map. Clicking a movement placeholder or completed movement phrase starts the movement overlay. The narrative text may remain unchanged while the map selection is active, but the UI should show minimal helper text below the paragraph, such as:

`Choose a destination on the map.`

Movement overlays must be based on the token's projected position at that point in the plan, not simply the live token position. Editing a middle movement clause should start from the projected position after all prior clauses.

### Items and Equipment

Items and equipment should be selected from searchable rich list popovers using icon and description rows.

### Durations and Simple Values

Simple selections, such as duration, can use a plain list.

## Movement Language

Plain movement should be expressed in terms of distance, not destination.

Example:

`Horus moves 15 feet (2 AP), then...`

The destination is still chosen on the map and stored mechanically, but the narrative text describes the distance covered.

Clicking a completed movement phrase such as `moves 15 feet` should reopen the movement overlay. The player may choose a new destination within the AP available to that movement clause. If surrounding actions constrain that AP budget, the overlay must respect those constraints.

## Positioning Intent

Positioning intent should be expressed explicitly when it matters. An out-of-range melee plan should not hide pursuit inside the attack clause.

Preferred:

`Horus closes with Mallory, then attacks Mallory with his grandfather's hunting knife when she is in range.`

Avoid:

`Horus attacks Mallory with his grandfather's hunting knife when he gets within reach.`

This keeps the player's movement intent legible and preserves the distinction between `Close With`, `Follow`, and other movement actions.

## Overwatch Language

Overwatch should read naturally with the weapon or means before duration.

Example:

`Mallory stands alert for threats with her stun baton for 3 seconds (3 AP).`

This ordering leaves room for follow-on actions and reads better than placing duration before the item.

## Confirmation and Rolls

The player is required to confirm the composed plan. Full AP allocation does not auto-commit the plan.

Required rolls are prompted only after the player confirms the full plan. Once the rolls have been made and stored, the player may not change the plan.

The narrative sentence should remain clean while rolls are pending or being resolved. A separate minimal roll UI should appear below the plan after confirmation. It should show the required to-hit and damage rolls and their status.

## Wait and Idle

`Wait` is an intentional selectable action. It should be available at any point during composition so the player can explicitly express waiting as intent. `Wait` requires a duration.

When `Wait` is followed by another action, the duration should remain visible in the narrative because it establishes when the next action begins.

Example:

`Horus waits for 2 seconds (2 AP), then attacks Mallory with his knife (2 AP).`

When `Wait` is the final action in the plan, the duration may be omitted from the narrative text so the sentence ends cleanly.

Example:

`Horus attacks Mallory with his knife (2 AP), then waits.`

If the player confirms with unused AP, the system should add an automatic `Idle` action to fill the remaining AP. The confirmed narrative may render this as:

`...and waits.`

`Wait` and `Idle` may behave the same mechanically for now, but they must remain distinct action IDs so future rules can distinguish intentional waiting from unplanned idle time.

During composition, unused AP should be shown as help/context, not automatically rendered as prose.

## Narrative Color Text

Narrative phrasing should be data-driven with reasonable defaults.

Actions can provide color text or narrative templates. Items can also provide color text or display phrasing. Both may be needed to produce a satisfying sentence.

Example progression:

`Mallory attacks Horus with [select item]`

After selecting a galvanic carbine, the final phrase might become:

`Mallory levels her galvanic carbine at Horus and fires (2 AP).`

Even when rendered as rich prose, the underlying decisions must remain discrete and addressable. If a colored phrase combines multiple decisions, clicking it should edit the earliest/root decision it represents. In many cases that means returning to the action choice and truncating downstream dependent choices.

## Example 1 - The Duel

Imagine an encounter involving two player characters, Horus and Mallory. Horus is a war veteran with a worn service pistol. Mallory is a scientist specializing in galvanic studies. They face off across a combat arena large enough to require movement for the two parties to engage.

### Planning - Horus

Initial state:

`Horus [select an action]`

Horus chooses `Aimed Shot`:

`Horus [takes careful aim at] [select target]`

The player clicks `[select target]`, then selects Mallory on the map:

`Horus [takes careful aim at] [Mallory] and fires (3 AP), then [select an action]`

The player chooses to take cover:

`Horus [takes careful aim at] [Mallory] and fires (3 AP), then [takes cover] for [select duration]`

The player uses the remaining 3 AP:

`Horus [takes careful aim at] [Mallory] and fires (3 AP), then [takes cover] for 3 seconds (3 AP).`

The player confirms the plan. The required to-hit and damage rolls are prompted in the minimal roll UI below the paragraph. Once those rolls are stored, the plan is locked.

### Planning - Mallory

Initial state:

`Mallory [select an action]`

Mallory chooses `Attack`:

`Mallory [attacks] [select target]`

The player selects Horus on the map:

`Mallory [attacks] [Horus] with [select item]`

The player selects a galvanic carbine:

`Mallory [attacks] [Horus] with [the galvanic carbine] (2 AP), then [select an action]`

The player selects overwatch:

`Mallory [attacks] [Horus] with [the galvanic carbine] (2 AP), then [stands alert for threats] with [select item] for [select duration]`

The player selects the stun baton and uses the remaining 4 AP:

`Mallory [attacks] [Horus] with [the galvanic carbine] (2 AP), then [stands alert for threats] with [her stun baton] for 4 seconds (4 AP).`

The player confirms the plan and resolves the required rolls.

### Resolution

This hypothetical example could play out a number of ways, but Mallory will always attack first because her attack resolves before Horus' aimed shot. Possible outcomes include:

- Mallory fires but misses, and Horus gets a critical hit, causing double damage to Mallory.
- Mallory fires and hits, interrupting Horus' attack because Aimed Shot takes 3 AP.
- Mallory misses, but Horus critically fails and shoots himself in the foot, literally.

### Reconciliation

Since action plans are resolved simultaneously, both players could hit, both could miss, or one could hit while the other misses. If Mallory interrupts Horus' attack, Horus' rolled hit and damage may be present in the plan, but they do not apply because the action is interrupted during reconciliation.

## Example 2 - The Chase

Same characters, but no ranged weapons this time. Horus has a hunting knife and Mallory has a stun baton.

### Planning - Horus

Compressed buildup:

`Horus [select an action]`

`Horus [closes with] [select target]`

`Horus [closes with] [Mallory], then [select action]`

`Horus [closes with] [Mallory], then [attacks] [Mallory] with [select weapon]`

`Horus [closes with] [Mallory], then [attacks] [Mallory] with [his grandfather's hunting knife] when she is in range.`

After confirmation, required rolls are prompted.

### Planning - Mallory

Compressed buildup:

`Mallory [select action]`

`Mallory [evades] [select target]`

`Mallory [evades] [Horus] for [select duration]`

`Mallory [evades] [Horus] for 3 seconds (3 AP), then [select action]`

`Mallory [evades] [Horus] for 3 seconds (3 AP), then [stands alert for threats] with [select weapon] for [select duration]`

`Mallory [evades] [Horus] for 3 seconds (3 AP), then [stands alert for threats] with [her stun baton] for 3 seconds (3 AP).`

After confirmation, required rolls are prompted.

### Resolution

- In tick 1, Mallory begins moving away from Horus, and Horus moves toward her.
- In tick 2, the same thing happens.
- In tick 3, the same thing happens.
- In tick 4, Horus closes with Mallory, who enters overwatch.
- In tick 5, Horus closes the final distance to Mallory, who remains in overwatch.
- In tick 6, Horus and Mallory both attack: one from overwatch, one from an attack action.

### Reconciliation

Horus and Mallory have contested simultaneous attack outcomes. Each attack is evaluated against the target's AC. Possible outcomes:

- Both miss, and they are left staring stupidly at each other.
- One critical hits and the other normal hits; the critical hit interrupts the normal hit.
- One normal hits and the other misses; evaluate as usual.
- Both critically hit; both hits land simultaneously, and double damage may produce a double kill.
- Both critically miss; they each do normal damage to themselves.

## Implementation Addendum

This work replaces the planning section of the player encounter planner while preserving the underlying encounter planning, resolution, and reconciliation mechanics wherever possible. The scope includes both the Player Encounter Planner panel and the GM Encounter Manager panel.

### Goals

- Replace the current formal planning form with a narrative action composer.
- Keep each narrative phrase backed by discrete structured action-plan data.
- Preserve existing planning, targeting, movement, resolution, and reconciliation behavior unless the narrative model requires a deliberate change.
- Let the GM watch player plans as they are being composed, not only after confirmation.
- Keep confirmed plans locked once required rolls have been resolved.

### Phase 1 - Planning Model and Draft State

Introduce a draft planning model that can represent incomplete and complete narrative clauses.

Required capabilities:

- Store each planned clause as structured data with action id, target references, item references, movement destination, duration, AP cost, roll requirements, and narrative token metadata.
- Represent incomplete placeholders such as `select action`, `select target`, `select item`, and `select duration`.
- Track the projected position after each movement-affecting clause.
- Track AP spent, AP remaining, and AP reserved by surrounding clauses.
- Support distinct action ids for `Wait` and automatic `Idle`.
- Preserve an explicit plan lifecycle: drafting, confirmed awaiting rolls, locked, resolving, resolved.

Implementation notes:

- The draft state should update as the player composes the plan, before confirmation.
- The draft state should be serializable so the GM panel can observe it.
- Existing confirmed action-plan records should remain the source used by resolution. Draft plans become resolvable only after confirmation and roll completion.

Acceptance criteria:

- A draft can contain partial clauses without being treated as a confirmed encounter plan.
- AP totals can be calculated for partial and complete drafts.
- Editing an earlier phrase can preserve or truncate downstream clauses according to the rules in this document.
- `Wait` can be selected at any point and requires duration mechanically.
- Unused AP becomes automatic `Idle` only on confirmation.

### Phase 2 - Narrative Rendering Service

Create a narrative rendering layer that converts structured plan data into interactive prose.

Required capabilities:

- Render one continuous paragraph for the current plan.
- Render selectable placeholders and completed phrases.
- Include inline AP costs for planned actions.
- Hide terminal `Wait` duration in prose when it is the final action.
- Render automatic terminal `Idle` as `and waits.` after confirmation.
- Support action-level and item-level color text with safe defaults.
- Preserve phrase metadata so clicks can map back to the underlying structured decision.

Implementation notes:

- Narrative rendering should be deterministic and testable without the Foundry canvas.
- Color text should not erase decision boundaries. A rich phrase may display as one natural sentence fragment while still mapping to an action, target, item, duration, or movement decision.
- If a rendered phrase combines several decisions, clicking it should edit the earliest/root decision represented by that phrase.

Acceptance criteria:

- Existing action plans can be rendered as narrative paragraphs.
- Partial drafts render useful placeholders.
- Clicking phrase metadata identifies the correct edit point.
- Narrative text remains clean while roll prompts are pending.

### Phase 3 - Player Encounter Planner Replacement

Replace the player panel's planning section with the narrative composer.

Required capabilities:

- Show the current narrative paragraph as the primary and only action-plan editor.
- Provide remaining AP and unused AP help text during composition.
- Open searchable rich selection popovers for action and item choices.
- Use plain lists for simple choices such as duration.
- Start map targeting mode for target placeholders and completed target phrases.
- Start movement overlay mode for movement placeholders and completed movement phrases.
- Let the player confirm the plan even when no AP remains.
- Prevent confirmation while required decisions are incomplete.

Implementation notes:

- The existing action and item list styling should be reused where practical.
- Search should be supported for action and item lists.
- The player should not need a separate action summary list to edit the plan; the narrative paragraph is the editing surface.
- Help text below the paragraph should guide map interactions, for example `Choose a target on the map.` or `Choose a destination on the map.`

Acceptance criteria:

- The player can build a complete plan entirely through narrative phrase selection and map interactions.
- The player can edit completed phrases before confirmation.
- Editing a prior AP-affecting phrase truncates invalid downstream clauses.
- Editing a non-AP-affecting target can preserve downstream clauses when still valid.
- The player can select `Wait` at any point and choose a duration.

### Phase 4 - Map Targeting and Movement Integration

Adapt target and movement interactions to the narrative composer.

Required capabilities:

- Selecting a target on the map updates the active narrative target phrase.
- Selecting a movement destination on the map updates the active movement phrase and AP cost.
- Movement overlays are sized by AP available to the movement clause.
- Movement overlays are anchored to the projected position at that point in the draft plan.
- Completed movement phrases can be reopened and changed within the AP budget available to that clause.

Implementation notes:

- Plain movement narrative should show distance, not destination, for example `Horus moves 15 feet`.
- The destination remains stored mechanically for resolution.
- If a changed movement destination changes AP cost and invalidates following clauses, truncate the invalid downstream plan.

Acceptance criteria:

- Movement selected after a prior movement starts from the projected position, not the live token position.
- The move overlay respects AP already consumed by earlier clauses and AP required by later preserved clauses.
- Target selection still shows appropriate map feedback, including target icons where applicable.

### Phase 5 - Confirmation, Rolls, and Locking

Implement confirmation and roll workflow for narrative plans.

Required capabilities:

- Confirmation converts a complete draft into a confirmed plan.
- Confirmation inserts automatic `Idle` for unused AP.
- Required player rolls are prompted after confirmation, before resolution.
- A minimal roll UI appears below the narrative paragraph.
- Once required rolls are made and stored, the plan is locked.
- The engine must not roll for player-controlled combatants during encounter resolution.
- The GM may allow system rolls for GM-controlled combatants.

Implementation notes:

- Roll status should be visible without cluttering the narrative sentence.
- Confirmed but unrolled plans should be visibly different from locked plans.
- Locked plans should remain readable in the same narrative form.

Acceptance criteria:

- A confirmed player plan cannot resolve until required rolls are present.
- A player cannot edit a plan after required rolls are stored.
- Resolution consumes stored roll results rather than generating player rolls.

### Phase 6 - GM Encounter Manager Draft Visibility

Update the GM encounter manager so the GM can watch plan composition as it happens.

Required capabilities:

- Show each combatant's current draft narrative while the player is composing it.
- Distinguish draft, confirmed awaiting rolls, locked, and resolved states.
- Update the GM view as draft choices are made, including incomplete placeholders.
- Preserve GM visibility into AP spent, AP remaining, and missing requirements.
- Show confirmed and locked plans in the same narrative language used by the player.

Implementation notes:

- The GM view should be observational for player-owned drafts unless existing GM authority explicitly permits intervention.
- Draft updates should be lightweight and should not imply the player has committed their intent.
- The GM should have enough context to answer questions while a player is composing: current intended action, selected target, selected item, projected movement, AP state, and missing decisions.
- GM-controlled combatants may use the same composer model, with GM-only affordances for system-resolved rolls if that option is enabled.

Acceptance criteria:

- The GM can see a player draft before it is confirmed.
- The GM view updates when the player selects an action, target, item, duration, movement destination, or edit point.
- The GM can tell whether a visible plan is merely a draft or has been confirmed.
- The GM can tell whether confirmed plans are still waiting for rolls.

### Phase 6a - GM Tick Narrative Flavor

Enhance the combined tick narrative on the GM Encounter Manager panel so the unfolding round reads as a sequence of small fictional beats, not only mechanical action summaries.

Required capabilities:

- Generate per-tick narrative fragments from confirmed action plans using the same action-level and item-level flavor text used to compose the player's order expression.
- Allow item definitions to provide tick-fragment text for the preparation, aiming, use, release, recovery, or other beats of an action.
- Allow action definitions to provide reasonable default tick-fragment text when an item does not provide a more specific phrase.
- Combine fragments from multiple combatants into the GM Encounter Manager tick narrative for the current AP tick.
- Preserve mechanical clarity: tick fragments should supplement, not replace, existing resolution outcomes such as hit, miss, interrupted, moved, or damage dealt.

Implementation notes:

- Flavor fragments may be encoded on item action definitions or related item metadata. For example, a galvanic rifle can provide staged text for raising the rifle, settling the cheek weld, taking careful aim, and firing.
- Action-level defaults should be generic but still readable, such as preparing, aiming, moving, waiting, bracing, or recovering.
- Fragment selection should account for the action's AP span. A three-AP attack such as `Mallory takes careful aim at Horus with the galvanic rifle and fires` might produce:
  - AP 1: `Mallory raises the galvanic rifle to her cheek.`
  - AP 2: `Mallory takes careful aim at Horus.`
  - AP 3: `Mallory fires.`
- The GM-facing combined narrative should remain concise when several combatants act on the same tick.
- This phase should not change player plan composition; it only enriches GM observation and round playback text.

Acceptance criteria:

- The GM Encounter Manager tick narrative includes flavor fragments for multi-AP actions before the final resolution outcome is known.
- Item-provided fragments override or enrich action-level defaults.
- Missing flavor text falls back to clear generic fragments.
- Existing mechanical round summaries remain available and accurate.
- Tests cover at least one item-specific multi-tick example and one fallback/default example.

### Phase 7 - Resolution Compatibility and Reconciliation

Connect narrative-confirmed plans to existing resolution and reconciliation behavior.

Required capabilities:

- Convert locked narrative plans into the action structures expected by the resolution engine.
- Preserve existing action timing, AP cost, movement, targeting, and roll semantics.
- Ensure `Close With`, `Follow`, `Move`, `Evade`, `Wait`, and `Idle` retain distinct intent where represented by the model.
- Ensure automatic `Idle` is resolvable and reconcilable.

Implementation notes:

- `Pursue` may remain as an internal legacy action id only if compatibility requires it, but player-facing text should use `Close With`.
- `Close and Engage` should be removed from player-facing choices.
- `Wait` and `Idle` can behave the same mechanically at first but should not collapse into the same action id.

Acceptance criteria:

- Existing resolution tests continue to pass or are intentionally updated for the narrative model.
- Movement and attack interactions resolve using the same stored target and destination data created during composition.
- Round summaries accurately reflect whether attacks happened, missed, hit, were interrupted, or dealt damage.

### Phase 7a - Plannable Action Tick Fragment Distillation

Distil round tick summary fragments for every existing plannable item action and universal action so GM tick narration has complete coverage across the currently available action set.

Required capabilities:

- Inventory all actions that can appear in the player encounter planner, including universal actions and item-backed actions from existing content.
- Determine the number of tick fragments needed from each action's AP cost or AP span.
- Add concise tick fragments for each AP of each plannable action.
- Keep fragments compatible with the same template variables used by order recap text, such as `{{Owner.name}}`, `{{Item.name}}`, `{{Target.name}}`, and tick/progress values where useful.
- Ensure fragments read cleanly when combined with other combatants' fragments in the GM Encounter Manager tick summary.
- Preserve action-specific tone without making the fragments so ornate that repeated ticks become noisy.

Implementation notes:

- A fixed 1 AP action needs one fragment.
- A fixed 2 AP action needs two fragments.
- A fixed 3 AP action needs three fragments.
- Variable-duration actions should provide a small repeatable sequence or generic fallback that remains sensible for any selected duration.
- Item-backed fragments should live on the item action variant when the item has a distinct physical or fictional procedure.
- Universal action fragments should live on the action definition or fallback narrative rules.
- Distillation should favor short, observable beats: raises, aims, braces, moves, waits, opens, reloads, strikes, fires, drinks, applies, steadies, recovers.
- If an action's final AP also produces a mechanical resolution outcome, the fragment should not obscure the hit, miss, interruption, movement, or damage summary.

Acceptance criteria:

- Every currently plannable action has item-specific fragments, action-specific fragments, or an intentional documented generic fallback.
- Fragment counts match fixed AP costs for fixed-cost actions.
- Variable-duration actions have fragments that remain readable at minimum and maximum supported durations.
- GM tick summaries for representative attacks, movement, waits, defensive actions, consumables, and utility actions include useful fictional beats.
- Tests or content audits cover fragment completeness for existing plannable actions.

### Phase 8 - Tests and Cleanup

Add focused tests around the new narrative planning behavior and remove obsolete planner UI paths.

Required test coverage:

- Narrative rendering of partial, complete, confirmed, and locked plans.
- Phrase click mapping and edit point selection.
- Downstream truncation after AP-affecting edits.
- Downstream preservation after compatible target edits.
- `Wait` duration behavior, including terminal prose omission.
- Automatic `Idle` insertion on confirmation.
- Movement overlay AP budget from projected position.
- Player roll requirement and plan locking.
- GM draft visibility and status transitions.

Cleanup:

- Remove or retire obsolete action detail editor code once the narrative composer replaces it.
- Keep reusable rich action/item list components.
- Keep map targeting and movement overlay services reusable between player and GM workflows.
- Update related planning notes once the implementation stabilizes.
