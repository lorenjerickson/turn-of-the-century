---
name: ENCOUNTER_INTENT_PLANNING_NOTES
description: Brainstorming notes for making simultaneous encounter planning capture player intent rather than precise geometry.
---

# Encounter Intent Planning Notes

These notes capture design observations about planning and resolving target-dependent actions in simultaneous encounter rounds. They are not final rules. The goal is to preserve the uncertainty and drama of concurrent action while preventing planning from becoming an exercise in exact grid prediction.

## Core Concern

When combatants move concurrently, actions that depend on target distance can fail in ways that feel technically correct but dramatically unsatisfying.

Examples:

- A combatant declares a sword attack against an adjacent target, but the target moves away before the attack resolves.
- A combatant wants to attack a distant target with a melee weapon, so they use Pursue and hope they end adjacent at the right moment.
- A player may feel forced to reason about exact AP slots, grid cells, and movement timing instead of expressing the character's intent.

The planning experience should let players say, in effect, "attack that wizard with my sword," while still allowing the resolution engine to model risk, movement, failed timing, and tactical consequences.

## Design Direction

Separate player intent from spatial execution.

Players should be able to declare an intended outcome, such as:

- Close with the wizard and strike them.
- Keep pressure on the fleeing cultist.
- Strike the footpad if they remain within reach.
- Hold a blade ready if the creature comes near.

The engine can then translate that intent into movement, timing checks, engagement rules, attack windows, fallback behavior, and soft failure outcomes.

## Action Catalog Survey

The current catalog suggests that the intent layer should cover more than melee attacks. Many actions care about position, adjacency, line of sight, or target availability even when they are not weapon attacks.

### Global Actions

Global actions currently include:

- Move
- Open
- Pursue
- Follow
- Avoid
- Hunker Down
- Dodge
- Overwatch

Potential intent-layer observations:

- Move, Pursue, Follow, and Avoid already express movement intent rather than fixed geometry. They are good primitives for implied movement.
- Open requires adjacency to a stationary object, making it a natural candidate for "go to the door and open it."
- Hunker Down and Dodge are defensive timing intents. They are less about movement-to-target and more about reserving an AP window.
- Overwatch is already an intent action: "attack the first qualifying hostile during this window."
- The action behavior notes mention Evade, but the current global action catalog does not define an Evade entry. If Evade remains desirable, it should be reconciled with Avoid.

### Weapon Actions

Weapon-provided actions currently include:

- Generic weapon attack: 2 AP.
- Precision Strike: 2 AP.
- Quick Shot: 2 AP, lower accuracy.
- Aim and Fire: 3 AP, normal accuracy.
- Fire Signal: 3 AP.

Weapon ranges already create several useful intent families:

- Melee or reach attack: move into weapon range, press an engaged target, or strike if the target enters reach.
- Thrown attack: move into throwing range, then attack.
- Ranged firearm attack: maintain line of sight and range, move to line of sight if necessary, then fire.
- Aimed shot: spend more AP for a better shot, which makes movement-before-shot more expensive and more constrained.
- Quick shot: a better fit for opportunistic or moving targets because the lower AP cost leaves more room for implied repositioning.

The intent layer should probably not be "melee only." Ranged attacks can also benefit from intent such as "get a clear shot at that target" or "keep that target covered."

### Consumable Actions

Consumables currently use:

- Consume Item: 1 AP.
- Consume Belt Elixir: 2 AP.
- Acid-Wash Solution also provides Unlock: 2 AP.

Potential intent-layer observations:

- Self-use consumables usually need no implied movement.
- Medical, revival, injectable, bandage, and surgical consumables may need a nearby ally or patient. These are candidates for "reach and treat that ally."
- Apply-method consumables may target an object, surface, lock, wound, or ally. The target kind should determine whether adjacency is required.
- Belt elixir already folds retrieval into the AP cost. It is a useful reminder that item access and positioning can both consume AP.

### Equipment, Skills, and Talents

Non-weapon item actions are mostly generic Use Item actions at 1 AP, but their item tags and skill checks imply different target shapes:

- Tools: lockpicking, breach, repair, medical, climbing, pressure, rail maintenance, boiler inspection.
- Instruments: navigation, survey, optical signalling, altitude, forensic timing.
- Documents and ledgers: investigation, records, maps, ciphers, almanacs.
- Social skills and talents: negotiation, interviewing, cold reading, morale.
- Defensive or mobility talents: counter-snare reflex, railway legs, measured breathing, nerves of iron.

Potential intent-layer observations:

- The generic Use Item action may be too broad for planning. The UI may need intent labels derived from item category, tags, and use method.
- Many equipment actions imply an object or location target: "secure that rope," "inspect that boiler," "tap that telegraph line," "light that area," "repair that mechanism."
- Many skill and talent actions are self-directed or abstract and may not need movement.
- Some talents behave like reactions or preparation, even though their current item action shape is a generic utility action.

## Simplifying Assumptions For Conditional Planning

The system probably does not need a general-purpose conditional scripting model. Most planning cases can be expressed as constrained intent resolution.

Recommended simplifying assumptions:

- Every target-dependent intent has one primary target.
- Every target-dependent intent has one positioning requirement: adjacent, weapon range, line of sight, object reach, ally reach, cover, or safe distance.
- The player chooses how much AP they are willing to spend satisfying that positioning requirement.
- The base action AP is paid only when the requirement becomes true.
- If the requirement never becomes true, the actor spends only the declared positioning AP actually used and receives a soft failure outcome.
- The default soft failure is "end in the best reachable position toward the intent."
- Optional fallbacks should be selected from a small list tied to the intent, not authored as arbitrary if/then rules.

This means the player is not programming a plan. They are declaring a goal and a willingness to spend effort reaching the moment where the goal can happen.

## Action Intent Configuration Step

The current AP planning UI may need a secondary configuration step after the player selects an action. The first click should remain simple: choose the natural action. The second step should clarify the player's intent only when the action has meaningful ambiguity.

Basic flow:

- Choose Action: Attack, Unlock, Open, Use Item, Treat, Move, Overwatch, or another available action.
- Configure Intent: select the target, positioning allowance, follow-through, and any action-specific parameters.
- Add To Plan: commit the configured intent envelope to the round plan.

The configuration step should be contextual. It should not ask every question for every action.

### Attack Configuration

Possible parameters:

- Target combatant.
- Weapon and action variant.
- Intent: strike, close and strike, press, hold at reach, get clear shot.
- Positioning AP allowance.
- Commitment level: opportunistic, committed, reckless.
- Follow-through: hold position, maintain engagement, press target, or choose another action if AP remains.

Examples:

- If the target is already in reach, default to Strike and hide the movement allowance unless the player expands advanced options.
- If the target is outside melee range, offer Close and Strike with a visible positioning AP allowance.
- If the target is visible but behind partial obstruction, offer Get Clear Shot for ranged weapons.

### Object Interaction Configuration

Possible parameters:

- Target object or location.
- Tool, item, or global action to use.
- Positioning AP allowance.
- Follow-through: hold position, open after unlock, clear the passage, or choose another action if AP remains.

Examples:

- Unlock that door with a Locksmith Roll.
- Open that hatch.
- Secure that rope to the selected anchor point.
- Repair that mechanism with a Pocket Tool Roll.

### Item And Treatment Configuration

Possible parameters:

- Target: self, ally, enemy, object, or location.
- Item or talent to use.
- Positioning AP allowance if the target is not already reachable.
- Follow-through: remain with target, guard target, withdraw, or choose another action if AP remains.

Examples:

- Use a tonic on self: no movement prompt needed.
- Administer Vital Saline Infusion to an adjacent ally: target plus item only.
- Treat a downed ally across the room: movement allowance plus treatment action.

### Reaction And Window Configuration

Possible parameters:

- AP window duration.
- Trigger type.
- Weapon or defensive response, where applicable.
- Target filter: any hostile, selected target, ally threatened, object approached.
- Follow-through after trigger: end reaction, guard, or choose another action if AP remains.

Examples:

- Overwatch the first hostile that enters range.
- Dodge during a two-AP danger window.
- Use a defensive talent if a trap triggers.

### UI Principle

The action list should stay readable. Complexity should appear only when the selected action needs it.

Suggested defaults:

- Self-use actions skip movement configuration.
- Already-valid adjacent or in-range actions default to immediate effect.
- Out-of-range target-dependent actions show implied movement.
- Ambiguous Use Item actions derive labels from item category, tags, and use method.
- Advanced options remain available but collapsed unless needed.

This keeps planning expressive without turning every action declaration into a long form.

## Narrative Plan Representation

The planning UI may need to move away from a simple tick-based representation. A six-slot AP strip is useful for accounting, but it may be the wrong primary representation once plans become intent envelopes with implied movement, follow-through, and optional flow-forward behavior.

The primary plan display should describe what the player actually defined.

Examples:

- Spend up to 4 AP to close on Elias Vane and attack with the Clockmaker's Stiletto. Use any leftover AP to enter Overwatch.
- Spend up to 3 AP to reach the locked cellar door, then spend 2 AP to unlock it with the Locksmith Roll. If it opens early, hold position at the doorway.
- Use 1 AP to administer Vital Saline Infusion to Ada Kingsley. If she moves out of reach, spend up to 2 AP to reach her first.
- Hold Overwatch for up to 4 AP and fire the Service Revolver at the first hostile who enters the alley.

The AP strip can remain as a secondary preview or accounting aid, but the main artifact should read like declared orders.

Suggested display layers:

- Summary sentence: a plain-language description of the intent.
- AP envelope: positioning AP, effect AP, and maximum total AP.
- Follow-through: what happens if the intent resolves early.
- Failure outcome: what happens if the requirement is never satisfied.
- Timing preview: optional visual AP strip showing the earliest, latest, and uncertain portions of the plan.

This representation helps players verify the thing that matters: "Did I express what my character is trying to do?"

It also gives the GM a readable record of locked plans during resolution. Instead of interpreting grid ticks, the table can see declared orders and then watch the engine reconcile them against everyone else's movement.

### GM Resolution Highlighting

During round resolution, the GM view should highlight the parts of each order that are relevant to the current tick.

The goal is not just debugging. The highlight should help the GM build a composite narrative for the players as simultaneous actions unfold.

Examples:

- On a movement tick, highlight "close on Elias Vane" in one actor's order and "retreat toward the cellar stairs" in Elias's order.
- On an effect tick, highlight "attack with the Clockmaker's Stiletto" and any defensive reaction window that overlaps it.
- On an early-completion tick, highlight "use any leftover AP to enter Overwatch" as the actor transitions into follow-through.
- On a failed-requirement tick, highlight the failure outcome such as "end in the best reachable position toward the door."

Useful GM display details:

- Current tick marker.
- Active order clause for each actor.
- Pending order clauses that may trigger later.
- Completed clauses dimmed or checked off.
- Conflicting or interacting clauses visually grouped, such as pursuit against retreat or attack against dodge.
- Short generated recap text per tick, derived from the highlighted clauses and actual resolution result.

This lets the GM narrate from structured intent rather than reverse-engineering events from token positions alone.

## AP Budget And Implied Movement

Implied movement should never be free. It should consume the same round AP budget as explicit movement.

A useful model is an intent envelope:

- Positioning AP: the maximum AP the actor may spend getting into position.
- Effect AP: the normal AP cost of the action once requirements are satisfied.
- Total envelope AP: positioning AP plus effect AP.

Example:

- "Unlock that door" with a Locksmith Roll might reserve up to 3 AP to reach the door and 2 AP to unlock it.
- If the actor reaches adjacency after 2 AP, the unlock can begin early and the unused positioning AP may become idle time.
- If the actor cannot reach adjacency within 3 AP, the unlock does not happen and the actor ends as close as possible.

This keeps AP budgeting visible. The player is really saying, "I will spend up to 5 AP trying to get that lock open."

Open questions:

- Can unused positioning AP be spent on a later planned action, or does it become idle because the round plan is already locked?
- Can an intent pull AP from later planned actions if the target moves farther than expected?
- Should reckless commitment allow overrun into reserved AP at a penalty?

The conservative answer is that an intent may only spend AP inside its declared envelope. Unused AP becomes idle unless the UI supports a very small set of fallbacks.

## Early Intent Completion

Intent envelopes create an important question: what happens when the actor reaches the intent requirement earlier than expected?

Example:

- The player declares "attack that target with a dagger."
- The envelope reserves up to 4 AP for positioning and 2 AP for the dagger attack.
- The target unexpectedly moves closer.
- The actor only needs 1 AP, or perhaps no AP, to reach attack range.
- The attack resolves before the full positioning budget is spent.

Possible models:

### Model A: Unused AP Becomes Idle

The simplest model is that unused AP in the intent envelope becomes idle time.

Benefits:

- Easy to explain.
- Easy to resolve.
- Avoids hidden plan reshuffling.
- Preserves the idea that players commit to a moment under uncertainty.

Costs:

- Can feel wasteful when the player's intent succeeded efficiently.
- Encourages players to under-budget movement to avoid wasting AP.
- May make planning feel brittle in the opposite direction: success comes early, but the actor stands around.

This is the safest baseline but probably the least satisfying long-term answer.

### Model B: Unused AP Flows To The Next Intent

Unused AP may immediately advance the next intent in the plan.

Benefits:

- Makes success feel fluid.
- Rewards changing battlefield conditions.
- Supports natural chains like "close and strike, then open the door" if the first target moves closer.

Costs:

- Requires later intents to be valid earlier than their originally expected slot.
- Can create surprising changes in timing, especially for reactions and contested actions.
- Makes plan previews harder because an early success can alter the rest of the round.

If used, this should probably be limited to explicit next intents rather than arbitrary replanning.

### Model C: Overflow Queue Across Round Boundaries

Plans may overflow beyond the current six AP round. If an intent completes early, saved AP may pull later intents forward; if an intent does not complete, its remaining pursuit or setup may continue into the next round.

Benefits:

- Captures sustained character intent very well.
- Reduces artificial round-boundary behavior.
- Lets players declare goals like "keep pursuing the fleeing cultist until I reach him."

Costs:

- Makes round boundaries less clean.
- May reduce the value of a fresh planning phase.
- Can create stale intent if the battlefield changes dramatically.
- Requires clear cancellation, interruption, and reprioritization rules.

This is attractive for campaign feel but risky as a first implementation.

### Model D: Intent Follow-Through

Unused AP stays inside the current intent and is spent on a predefined follow-through behavior.

Examples:

- Attack Target: if the attack resolves early, continue pressing or maintain engagement.
- Interact With Object: if the interaction resolves early, hold position at the object or continue opening/clearing the passage.
- Treat Ally: if treatment resolves early, stay adjacent and guard the patient.
- Get Clear Shot: if the shot resolves early, maintain line of sight, keep cover, or hold aim.

Benefits:

- Avoids arbitrary idling.
- Avoids reshuffling the whole plan.
- Keeps behavior tied to the original intent.
- Easy to represent with one small follow-through choice.
- Can still allow the player to choose another action if AP remains.

Costs:

- Requires each intent family to define sensible follow-through options.
- The UI must make the "choose another action" path clear without hiding the conservative defaults.

This is likely the best middle ground.

## Recommended Early Completion Rule

Use intent follow-through as the default, and always offer another action when enough AP remains.

Suggested rule:

- Each intent has an AP envelope.
- If the effect resolves before the envelope is exhausted, remaining AP is spent on the intent's follow-through behavior.
- The default follow-through is conservative: hold position, maintain engagement, maintain line of sight, guard the object, or remain with the treated ally.
- If enough AP remains, the player may select another action as the follow-through.
- The next action may only use AP that remains in the current round unless the player declares a sustained intent.
- Unfinished intents should not automatically overflow into the next round unless they were declared as sustained intents.

This gives the system a stable default while allowing players to express, "if that happens quickly, move on to the next thing."

## Sustained Intents And Round Overflow

Round overflow may still be useful, but it should probably be a special case rather than the default.

Candidate sustained intents:

- Keep pursuing that target.
- Keep following that ally.
- Keep avoiding that threat.
- Keep holding overwatch.
- Keep treating that patient.
- Keep forcing that door or lock.

Suggested constraints:

- A sustained intent may carry across a round boundary only if the player explicitly marks it as sustained.
- Sustained intent pauses at the next planning phase, where the player may confirm, revise, or cancel it.
- The next round should not resolve automatically from stale intent without player confirmation.
- Sustained intent should preserve intent, not exact path. The engine recalculates movement and requirements at the new round state.

This preserves the usefulness of long-running goals without taking the next planning decision away from the player.

## Intent-Based Attack Declarations

Melee attacks could be declared with an intent package rather than requiring strict range validity at declaration time.

Possible player-facing intents:

- Attack target if in reach.
- Pursue until in reach, then attack.
- Attack if the target closes.
- Hold the strike until the target enters reach.
- Abandon the attack if the target becomes unreachable.

This reframes the choice around commitment and risk, rather than exact geometry.

## Engagement Rather Than Exact Adjacency

If two combatants begin a round adjacent, melee should probably not collapse just because one token moves one grid cell away during concurrent movement.

A possible engagement rule:

- Adjacent hostile combatants are considered engaged.
- An engaged attacker may track or step with the target briefly as part of a melee intent.
- The target must use an explicit break-away, withdraw, evade, sprint, shove, or similar action to escape cleanly.
- If the target simply moves away while engaged, the attacker may still resolve the attack, force a contested break, or gain a reaction opportunity.

This preserves the feeling that close combat is sticky. Once someone is in blade range, leaving should be a tactical action rather than an automatic nullification of the attacker's plan.

## Reach Windows

Instead of checking melee range only at a single effect slot, the engine could evaluate whether the target was within reach at any point during the attack's wind-up or effect window.

Example:

- AP 1: wind-up and tracking.
- AP 2: effect.

If the target was in reach during either portion of the attack window, the strike may still resolve. A target moving away might impose a penalty, reduce damage, or trigger a contested positioning check rather than simply causing automatic failure.

## Soft Failure Outcomes

Failed target-dependent actions should not always resolve as "nothing happens."

Possible soft failures:

- The target escaped reach, but the attacker advances to the closest reachable position.
- The attack converts into pressure or threat rather than damage.
- The attacker gains engagement if they end adjacent.
- The target must spend extra movement or accept a risk to fully escape.
- The attacker may redirect to another adjacent enemy at a penalty.
- The attack misses, but the target's path or next action is constrained.

Soft failures help preserve narrative momentum and reduce the frustration of losing an entire action to timing minutiae.

## Composite Actions

Common intent patterns could be promoted into explicit actions.

### Close and Strike

Move toward a selected target for up to a declared AP budget. If weapon range is reached, immediately make the selected melee attack. If not, end as close as possible.

Possible variants:

- Cautious Advance: reduced risk from opportunity reactions, but slower or less aggressive.
- Rush: faster approach, but with attack or defense penalties.
- Press: if already engaged, follow the target and attack.
- Intercept: move toward the target's projected path rather than their current position.

This likely offers the cleanest player-facing improvement for the "attack that wizard over there with my sword" case.

## Conditional Planning

Plans could allow a small number of simple fallback choices, but the fallback should belong to the intent rather than becoming a general rule language.

Examples:

- If the target is still within reach, attack.
- If the target is not within reach, pursue.
- If the target cannot be reached, attack the nearest hostile.
- If the target retreats behind cover, stop at cover.
- If the target moves toward me, hold position and strike.

These should be selected through constrained UI controls rather than authored as freeform logic. A good default may be to offer only one fallback slot, such as:

- Continue moving toward the target.
- Stop in the best available position.
- Switch to the nearest valid target.
- Conserve remaining AP as idle.

This gives players meaningful control without asking them to write a decision tree.

## Implied Movement Intents

The intent layer can support direct declarations that compile into movement plus an effect.

Examples:

- Unlock that door: move until adjacent to the locked object, then perform the selected Unlock action.
- Open that door: move until adjacent to the unlocked object, then Open.
- Attack that token: move until the target is within weapon range, then attack.
- Treat that ally: move until adjacent to the ally, then use the selected medical consumable, tool, or talent.
- Get a clear shot: move until the target is within range and line of sight, then fire.
- Signal that ally: move until line of sight or signal range is available, then use the signalling item.
- Secure that rope: move to the selected anchor point, then use the rope.

Moving targets should translate into Pursue-like behavior when the intent requires adjacency or weapon range. Stationary targets should translate into ordinary pathing toward the target object or coordinates.

The UI should make the implied AP cost explicit before the player locks the plan:

- "Reach door: up to 3 AP. Unlock: 2 AP. Total: up to 5 AP."
- "Close with target: up to 4 AP. Attack: 2 AP. Total: up to 6 AP."
- "Reach ally: up to 2 AP. Administer infusion: 1 AP. Total: up to 3 AP."

## Commitment Levels

Target-dependent actions could ask how committed the character is to the declared intent.

Possible levels:

- Opportunistic: only act if the target is available; otherwise conserve AP or use a fallback.
- Committed: adjust, pursue, or spend planned movement to make the action happen.
- Reckless: overextend to reach the target, accepting penalties, exposure, or positional risk.

This turns uncertainty into a meaningful tactical and dramatic choice.

## Planning Preview

During planning, the UI could show likely outcomes as warnings or summaries rather than requiring exact calculation by the player.

Examples:

- Likely to reach target if they do not flee.
- May fail if target moves away.
- Will maintain pressure if target retreats up to 20 ft.
- Target can escape if they spend 3 or more AP moving away.
- Current plan risks ending outside weapon range.

This preserves uncertainty while helping players understand the character-level stakes of their choices.

## Opportunity Cost For Escaping Melee

If melee attacks fail too easily when targets move, movement may become too dominant.

Possible counterweights:

- Moving out of engagement provokes a reaction unless using Withdraw or Evade.
- Leaving engagement costs additional AP.
- A target who flees an engaged attacker grants pursuit priority.
- A target can break away cleanly only by winning a contested mobility or athletics roll.
- Turning away from an engaged opponent imposes a defense penalty against a pending strike.

The key is that escape should be possible, but it should be a declared choice with a cost.

## Player-Facing Action Language

The planning UI should prefer intent verbs over geometric descriptions.

Candidate verbs:

- Strike
- Close and Strike
- Press
- Hold at Reach
- Intercept
- Drive Back
- Break Away
- Guard
- Pursue
- Unlock
- Open
- Treat
- Revive
- Signal
- Inspect
- Repair
- Secure
- Get Clear Shot

These terms better communicate what the character is trying to accomplish.

## Strong Initial Recommendation

Add an intent layer for melee and target-dependent actions before hardening the resolution details.

The most promising starting point is a small set of melee intents:

- Strike: attack a target if they are or become reachable during the attack window.
- Close and Strike: pursue a target and attack as soon as weapon range is reached.
- Press: maintain engagement with a nearby target and attack if they attempt to withdraw.

Pair these with engagement rules and soft failure outcomes so simultaneous movement remains chaotic without making melee feel arbitrary or overly brittle.

After surveying the current action catalog, a slightly broader starting set may be better:

- Attack Target: move or track until the selected target is within weapon range, then attack.
- Use On Target: move or track until the selected ally, enemy, object, or location is within the item's required reach, then use the selected item action.
- Interact With Object: move until adjacent to a stationary object, then Open, Unlock, Repair, Inspect, Secure, or otherwise interact.
- Hold Reaction Window: reserve an AP window for Dodge, Overwatch, counter-snare, guard, or similar triggered behavior.

These four intent families cover global actions, weapons, consumables, tools, equipment, skills, and talents without requiring every item to define bespoke planning behavior immediately.
