---
name: ACTION_BEHAVIORS
description: Describes how each action is intended to be evaluated by the planning and resolution engines.
---

# Action Behaviors

## Global Actions

Actions available to all combatants regardless of equipment, sourced from `TOTC_ACTION_CATALOG` in [module/encounters/action-catalog.mjs](../module/encounters/action-catalog.mjs).

---

### Move

Spend 1 AP per 5 ft of movement; variable AP 1–6. Position updates each AP slot, making movement continuous rather than instantaneous.

#### Move: Planning

- Player specifies total AP to spend on movement (1–6)
- Player specifies destination grid coordinates
- Engine validates that the path is walkable and within AP budget
- Engine calculates distance in feet (AP × 5)

#### Move: Resolution / Reconciliation

- Position is updated incrementally each AP slot, not at action end
- Movement is constrainted to be aligned with the grid
- If movement is interrupted (by a reaction or interruptible flag), position updates to the furthest point reached
- Collisions with impassable terrain or other combatants halt movement at that cell
- Movement through threatened zones may trigger reactions by other combatants

---

### Pursue

Spend 1 AP per 5 ft; variable AP 1–6. Attempts to close the distance between the combatant and the target. Each AP increment re-evaluates the target's current position and advances toward it.

#### Pursue: Planning

- Player selects a target combatant
- The action consumes the remaining AP budget by default, but the player may reduce the AP budget for this action.

#### Pursue: Resolution / Reconciliation

- Each AP slot recalculates shortest walkable path to target's current position at that slot
- Movement is strictly aligned with the grid
- If target moves during the same round, the pursuing token's movement is adjusted in the same round (during reconciliation)
- Movement halts if adjacency to the target is reached or AP is exhausted
- If adjacency is reached before the APs alotted to pursue are expended, the token enters a idle state until the next action in the plan is evaluated.
- Once adjacency is achieved, if the target begins to move again and the pursuer has AP budget remaining, the pursuer resumes movement as well.
- If the target becomes invisible (leaves line of signt, issues a stealth action, etc.) the player's token will continue movement toward the last seen location of the target. 
- If the target becomes visible again the player token resumes moving towards the targets current location.

---

### Follow

Spend 1 AP per 5 ft; variable AP 1–6. Mirrors a selected target combatant while attempting to preserve the current separation distance.

#### Follow: Planning

- Player selects a target combatant
- The follow action consumes the remaining APs in the current plan, but the player may reduce the APs budgeted for this action
- Engine records the separation distance at the moment Follow is begun.

#### Follow: Resolution / Reconciliation

- Each AP slot adjusts position to maintain the declared separation distance from the target's current position
- Movement is strictly aligned with the grid
- If target does not move during the slot, follower does not move
- If target moves faster than the follower can match, follower advances as far as AP allows *(requires review)*
- Distinguish from Pursue: Follow preserves distance; Pursue closes it
- If the target stops moving, the following token stops moving and enters an idle state
- NOTE: The separation distance is calculated at the moment the Follow action begins. It is the distance between the player's current location in the plan and the target's current location in the plan.

---

### Avoid

Spend 1 AP per 5 ft; variable AP 1–6. Attempts to maintain the current distance from the target.

#### Avoid: Planning

- Player selects a target combatant to avoid
- Player specifies total AP to spend (1–6)
- Engine determines the directional vector that keeps the same distance from the target

#### Avoid: Resolution / Reconciliation

- Each AP slot moves the combatant 5 ft along the vector that maintains equal distance from the target's current position
- Movement is strictly aligned with the grid
- If the target also moves, vector is recalculated each AP slot
- Movement halts at impassable terrain or table boundary *(requires review)*
- Distinguish from Follow: Avoid maintains separation; Follow preserves it
- Distinguish from Evade: Avoid maintains separation; Evade increases it

---

### Evade

Spend 1 AP per 5 ft; variable AP 1–6. Attempts to increase the distance from the target.

#### Evade: Planning

- Player selects a target combatant to evade
- Player specifies total AP to spend (1–6)
- Engine determines the initial directional vector that increases the distance from the target

#### Evade: Resolution / Reconciliation

- Each AP slot moves the combatant 5 ft along the vector that increases the distance from the target's current position
- Movement is strictly aligned with the grid
- If the target also moves, vector is recalculated each AP slot
- Movement halts at impassable terrain or table boundary *(requires review)*
- Distinguish from Avoid: Avoid maintains separation; Evade increases it

---

### Open

Operate an adjacent, unlocked door, chest, hatch, or similar closure. Costs 1 AP; non-variable.

#### Open: Planning

- Player specifies the target object (door, chest, hatch) by clicking or naming it
- Engine validates the object is adjacent and unlocked
- No target combatant required
- During planning, players must use an Open action to open an unlocked door, or other openable item. They may not simply click on the door icon in Foundry to open it.
- During planning, opening a door will reveal the map in the space beyond according to the player's vision, but no tokens in that space will be revealed.
- Locked doors must first be unlocked, then opened, using two separate actions.

#### Open: Resolution / Reconciliation

- Object state is set to `open` at the AP slot when Open resolves
- If the object is locked, Open fails and AP is still consumed
- During evaluation, opening a door reveals the space beyond and reveals any tokens visible according to the player's vision.
- A token may move into a revealed space, but they won't see what's in that space until the next planning round begins. All movement in the revealed space is blind, and may result in collisions or reaction attacks.

---

### Hunker Down

Spend 1–6 AP crouching behind cover. Any melee or ranged attack whose effect slot falls within the hunkered AP window imposes a −3 to-hit penalty on the attacker's roll, resolved during reconciliation.

#### Hunker Down: Planning

- Player specifies total AP to spend hunkered (1–6)
- Engine records the AP window (start slot to start + duration)
- Player does not select a target; this is a positional defense

#### Hunker Down: Resolution / Reconciliation

- For each incoming melee or ranged attack, check whether its effect slot falls within the hunkered AP window
- If yes, apply a "to-hit" penalty (−3 for ranged, -1 for melee) to the attacker's to-hit roll
- Hunker Down is non-interruptible; the full AP window is consumed regardless of incoming attacks

---

### Dodge

A dexterity-based reaction. If an incoming attack's effect slot falls within the dodge's AP window, make a contested roll: defender's DEX modifier + d20 vs attacker's to-hit total. On a successful dodge, the player token is moved to a random adjacent grid cell, and the attack is negated.

#### Dodge: Planning

- Player declares Dodge as a reaction entry in the plan
- Player specifies the AP window (1–2 AP) the dodge is active
- No target selection required; applies to any incoming attack during the window
- Dodge may only trigger once per planned action. If multiple Dodge actions are planned then Dodge can trigger multiple times per round.

#### Dodge: Resolution / Reconciliation

- Monitor incoming attacks whose effect slot falls within the dodge window
- For each qualifying attack, run contested roll: attacker's to-hit total vs `defenderDex + 1d20`
- If defender wins the contest, attack is negated (damage not applied), and defender token is moved to a random adjacent grid square.
- If attacker wins, the attack resolves normally
- Dodge is non-interruptible during its window
- Unlike Hunker Down, Dodge requires no cover but is limited to a 2 AP window maximum

---

### Overwatch

Reserve AP to attack the first hostile that enters or moves within effective weapon range during the declared window. Fires using the equipped weapon's lowest-AP-cost attack variant.

#### Overwatch: Planning

- Player declares Overwatch as a reaction to movement entry in the plan
- Player specifies the AP window (1–6) to hold overwatch
- No target selected at planning time; trigger fires on first qualifying hostile

#### Overwatch: Resolution / Reconciliation

- During the declared window, monitor for any hostile combatant that moves within the effective weapon range
- First qualifying entry triggers the overwatch shot
- If remaining AP in the window is less than the weapon's lowest-AP attack cost, overwatch does not fire
- An Overwatch attack can be triggered multiple times per round as long as the AP budget accommodates the effective weapon attack AP cost
- Overwatch may be interrupted by an attack or movement-related interference (grapple, collision, etc.). Any time an attack or movement would affect the player on Overwatch, the player must make a Constitution saving throw (AC 15) to remain in Overwatch.

---

### Grapple

Reserve 1-6 APs to attempt to restrain a designated target. Target must be adjacent (or assumed to be adjacent, considering concurrent movement)).

#### Grapple: Planning

- Player declares Overwatch as a reaction to movement entry in the plan
- Player specifies the AP window (1–6) to hold overwatch
- No target selected at planning time; trigger fires on first qualifying hostile

#### Grapple: Resolution / Reconciliation

- During the declared window, monitor for any hostile combatant that moves within the effective weapon range
- First qualifying entry triggers the overwatch shot
- If remaining AP in the window is less than the weapon's lowest-AP attack cost, overwatch does not fire
- An Overwatch attack can be triggered multiple times per round as long as the AP budget accommodates the effective weapon attack AP cost
- Overwatch may be interrupted by an attack or movement-related interference (grapple, collision, etc.). Any time an attack or movement would affect the player on Overwatch, the player must make a Constitution saving throw (AC 15) to remain in Overwatch.

---

## Weapon Actions

Item-defined actions declared on weapon items in the Compendium. Melee and ranged attack actions share the same field schema but resolve differently based on weapon range and classification.

---

### Melee - Attack

*"A weighted baton designed for close restraint and brutal certainty."* (and similar close-quarters implements)

Generic melee **attack** variant (`weaponAttack`, type `attack`, 2 AP). Used by: Trench Truncheon, Rivet Hammer, Foundry Hammer, Clockmaker's Stiletto, Factory Cleaver, Dock Hook Pike, Wire Garrote, Galvanic Prod, Ashwood Hunting Spear.****

#### Melee - Attack: **Planning**

- Player selects a target combatant within the weapon's normal range (typically 5 ft, 10 ft for polearms)
- Engine validates target is reachable at that slot given declared movement
- The AP required to execute the melee attack are included in the plan

#### Melee - Attack: Resolution / Reconciliation

- Roll to-hit: attacker's to-hit modifier + `toHitBonus` (0 for generic attack) + 1d20 vs target's defense
- On hit: apply weapon damage formula (e.g. 1d6, 1d8) plus any relevant modifiers
- On miss: no damage; note the miss in the recap using `recapFormat`
- The attack lands at the end of the last tick consumed by the action during resolution and reconciliation.

---

### Melee - Precision Strike

*"A slender steel instrument of uncommon precision, ground for incision and, under duress, applied at close quarters with unhappy efficiency."*

Precision attack variant (`precisionStrike`, type `attack`, 2 AP, +1 to-hit). Used by: Surgeon's Lancet. Notes indicate advantage on attacks against unaware or restrained targets.

#### Melee - Precision Strike: Planning

- Player selects a target combatant within 5 ft
- Player specifies the AP slot for the attack
- Engine checks whether the target has `unaware` or `restrained` status for advantage *(requires review)*

#### Melee - Precision Strike: Resolution / Reconciliation

- Roll to-hit: modifier + `toHitBonus` (+1) + 1d20; roll twice and take the higher if target is unaware or restrained
- On hit: apply damage according to the weapon data
- On miss: standard miss recap
- Advantage condition (unaware/restrained) should be evaluated at resolution time, not planning time

---

### Ranged - Attack

*"A short rifle favored on railways and warehouse roofs."* (and similar firearms)

Generic ranged attack variant (`weaponAttack`, type `attack`, 2 AP). Used by: Ratcatcher Carbine (90/240 ft), Streetline Shotgun (30/90 ft), Clockwork Derringer (20/60 ft), Signal Flare Bomb (20/60 ft, thrown/explosive).

#### Ranged - Attack: Planning

- Player selects a target combatant within the weapon's normal or long range
- Player specifies the AP slot for the shot
- Engine validates line-of-sight from attacker to target *(requires review)*
- Note whether the target is within normal range or long range, as long range imposes disadvantage *(requires review)*

#### Ranged - Attack: Resolution / Reconciliation

- Roll to-hit: attacker's modifier + `toHitBonus` (0) + 1d20; apply long-range disadvantage if applicable
- On hit: apply weapon damage formula; Signal Flare Bomb may apply area or panic effects *(requires review)*
- On miss: note miss in recap
- Firearms require ammunition; check `ammunition.loaded` and decrement on fire *(requires review)*
- Signal Flare Bomb is consumed on use (single-use thrown weapon) *(requires review)*
- Shotgun (Streetline Shotgun) may apply scatter rules within 5 ft *(requires review)*

---

### Ranged - Quick Shot

*"A six-shot sidearm trusted by inspectors and discreet bodyguards."*

Fast-draw pistol variant (`pistolQuickShot`, type `attack`, 2 AP, −2 to-hit). Used by: Service Revolver. "Fast draw and fire with reduced accuracy."

#### Ranged - Quick Shot: Planning

- Player selects a target combatant within 40 ft (normal) or 120 ft (long)
- Player specifies the AP slot; 2 AP cost allows earlier firing in the round than Aim and Fire
- Engine validates ammunition is loaded

#### Ranged - Quick Shot: Resolution / Reconciliation

- Roll to-hit: attacker's modifier + `toHitBonus` (−2) + 1d20 vs target's defense
- On hit: apply revolver damage *(requires review: derive damage formula from weapon data)*
- On miss: note in recap
- Decrement `ammunition.loaded` by 1 *(requires review)*
- Can be taken at an earlier AP slot than `pistolAimedShot` (2 vs 3 AP), trading accuracy for speed

---

### Ranged - Aim and Fire

*"A six-shot sidearm trusted by inspectors and discreet bodyguards."*

Deliberate pistol variant (`pistolAimedShot`, type `attack`, 3 AP, +0 to-hit). Used by: Service Revolver. "Deliberate shot with full accuracy."

#### Ranged - Aim and Fire: Planning

- Player selects a target combatant within 40 ft (normal) or 120 ft (long)
- Player specifies the AP slot (minimum AP 3 in the round)
- Engine validates ammunition is loaded

#### Ranged - Aim and Fire: Resolution / Reconciliation

- Roll to-hit: attacker's modifier + `toHitBonus` (0) + 1d20 vs target's defense
- On hit: apply revolver damage *(requires review: derive from weapon data)*
- On miss: note in recap
- Decrement `ammunition.loaded` by 1 *(requires review)*
- Full accuracy (no penalty) vs Quick Shot's −2; costs 1 additional AP

---

### Ranged - Fire Signal

*"A single-shot brass pistol firing coloured phosphor cartridges for maritime and highland signalling; seldom chosen for combat, but singularly discouraging at close range."*

Signal flare variant (`flareShot`, type `attack`, 3 AP, −1 to-hit). Used by: Signal Flare Pistol. "Single discharge; imposes Blinded on target if fired within 10 feet."

#### Ranged - Fire Signal: Planning

- Player selects a target combatant within 30 ft (normal) or 60 ft (long)
- Player specifies the AP slot
- If the target is within 5 ft, the Blinded condition will apply on hit *(requires review)*

#### Ranged - Fire Signal: Resolution / Reconciliation

- Roll to-hit: attacker's modifier + `toHitBonus` (−1) + 1d20 vs target's defense
- On hit within 5 ft: apply damage and apply `Blinded` status to target *(requires review: duration of Blinded?)*
- On hit beyond 5 ft: apply damage only, no Blinded
- On miss: note in recap
- Single-shot weapon: check ammunition loaded; this weapon is single-use per encounter unless reloaded *(requires review)*

---

## Consumable Actions

Actions defined on consumable items. Most consumables share a generic `consumeItem` variant. Items with a secondary use action also list it below.

---

### Consumable - Consume Item

Generic consumable use (`consumeItem`, type `consumable`, 1 AP). Used by all consumables as the default action: Field Bandage Roll, Combat Morphia, Antitoxin Ampoule, Coalbreaker Tonic, Ether Cough Syrup, Galvanic Stimulant, Iron Lung Draught, Ironlung Vapour Cartridge, Mercury Fever Drops, Nightwatch Tonic, Noctilucent Salts, Revival Ether, Smelling Vial, Soot Filter Paste, Vital Saline Infusion, Wound Stitch Kit.

#### Consumable - Consume Item: Planning

- Player selects the consumable item to use
- Player specifies the AP slot for consumption
- No target required for self-use items; some (e.g. Smelling Vial, Vital Saline Infusion) may be used on an adjacent target *(requires review)*
- Engine checks that at least one charge/unit remains

#### Consumable - Consume Item: Resolution / Reconciliation

- Decrement item quantity by 1 (`consumesCharge: true`)
- Apply the item's `effects` array to the target (self or adjacent combatant)
- Effects may restore HP, apply/remove status conditions, or grant temporary bonuses *(requires review: engine must walk item.system.effects)*
- Recap via `recapFormat`: "{{Owner.name}} uses {{Item.name}}."

---

### Consumable - Consume Belt Elixir

*"An iridescent draught rumored to steady the mind near uncanny phenomena."*

Belt-retrieve-and-consume variant (`consumeBeltElixir`, type `consumable`, 2 AP). Used by: Aetheric Elixir. "Retrieve from belt and consume under pressure."

#### Consumable - Consume Belt Elixir: Planning

- Player selects the Aetheric Elixir from belt slot
- Player specifies the AP slot; costs 2 AP (1 AP to retrieve, 1 AP to consume)
- Engine checks that at least one charge remains and the item is in the belt slot

#### Consumable - Consume Belt Elixir: Resolution / Reconciliation

- Decrement quantity by 1
- Apply elixir effects (sanity/composure stabilization near uncanny phenomena) *(requires review)*
- Higher AP cost than generic Consume Item reflects the retrieval step; engine should reflect this distinction *(requires review)*

---

## Utility Actions

Actions that interact with the environment rather than dealing damage or restoring resources.

---

### Utility - Unlock

Open a locked adjacent mechanism using a chemical dissolvent or tool. (`unlock`, type `utility`, 2 AP). Used by: Acid-Wash Solution ("apply to adjacent locked door, chest, hatch, or mechanism"), Folding Pry Hook ("lever the lock open"), Locksmith Roll ("work through the lock").

#### Utility - Unlock: Planning

- Player selects the Unlock action on the appropriate item
- Player targets an adjacent locked object (door, chest, hatch, or similar)
- Engine validates adjacency and that the object is in a locked state

#### Utility - Unlock: Resolution / Reconciliation

- Attempt to unlock the target object; success sets object state to `unlocked` *(requires review: auto-success vs. contested roll?)*
- Acid-Wash Solution consumes one charge on use
- Locksmith Roll may require a skill roll (DEX or INT) *(requires review)*
- Folding Pry Hook may succeed based on STR or a difficulty rating of the lock *(requires review)*
- If unlock succeeds, the object can subsequently be opened with the `open` global action

---

### Utility - Use Item

Generic active-use action for skills, talents, and equipment items (`useItem`, type `utility`, 1 AP). Used by all skill and talent items (Battlefield Triage, Measured Breathing, Counter-Snare Reflex, Ballistic Drill, etc.) and most equipment items (Surgeon's Field Case, Signal Mirror, Mortuary Lantern, Coiled Hemp Rope, etc.).

#### Utility - Use Item: Planning

- Player selects the item and invokes its Use Item action
- Player specifies the AP slot
- Some items may require specifying a target combatant or adjacent object *(requires review: varies by item)*

#### Utility - Use Item: Resolution / Reconciliation

- Apply the item's defined effects at the specified AP slot
- Most skills and talents grant passive modifiers or temporary bonuses rather than direct state changes *(requires review)*
- Equipment use effects vary widely by item; the engine must dispatch to item-specific logic *(requires review)*
- Recap via `recapFormat`: "{{Owner.name}} uses {{Item.name}}."
- Encounter-relevant examples requiring specific resolution logic:
  - **Battlefield Triage** — stabilize a downed combatant or restore HP in the field *(requires review)*
  - **Measured Breathing** — grant a to-hit bonus on the next ranged attack this round *(requires review)*
  - **Counter-Snare Reflex** — negate or reduce the effect of a trap triggered this round *(requires review)*
  - **Surgeon's Field Case** — perform emergency treatment restoring HP to an adjacent combatant *(requires review)*
  - **Signal Mirror / Brass Calling Whistle** — coordinate allies or signal overwatch positions *(requires review)*
