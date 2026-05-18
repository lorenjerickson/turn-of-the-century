# Enhanced Encounter Seeding System

## Overview

The **Enhanced Encounter Seeding** system provides rich metadata, NPC instantiation, faction relationships, escalation triggers, and narrative hooks for travel encounters. Instead of just generic encounter templates, seeds now include:

- **Adversary Profiles**: Detailed NPC/enemy definitions with roles, skills, and equipment
- **Faction Metadata**: Objectives, relationships, morale thresholds, and loot tables
- **Terrain Features**: Combat environment benefits/penalties and environmental hazards
- **Escalation Triggers**: How encounters escalate during combat with mechanical effects
- **Narrative Hooks**: Story beats for pre-combat tension, combat narrative, victory/defeat outcomes
- **Dynamic Loot**: Faction-specific loot tables with difficulty scaling

## Architecture

### Core Components

**1. Enhanced Seeds Module** (`module/encounters/enhanced-seeds.mjs`)
- Defines all adversary profiles, faction data, terrain, escalations, loot
- Provides instantiation functions to convert templates into combat-ready data
- Exports public helper functions for theme queries

**2. Workspace V2 Integration** (`module/ui/workspace-v2/workspace-v2-coordinator.mjs`)
- Coordinates enhanced seed usage in the replacement UI runtime
- Seeds include escalation, faction, terrain, narrative, and loot data in combat flags

**3. Public API** (`game.turnOfTheCentury.seeds`)
- Reference data for all profiles, factions, terrains, escalations, loot, narratives
- Helper methods to query and build encounter contexts

---

## Adversary Profiles

Profiles define NPC/enemy templates with standardized properties for instantiation:

```javascript
{
  name: "Bandit Rifleman",
  type: "pawn",                    // Actor type
  role: "ranged",                  // Combat role (ranged, melee, scout, etc.)
  faction: "frontier-raiders",     // Faction affiliation
  difficulty: "standard",          // Base difficulty
  equipment: ["rifle", "sidearm", "ammo-pack"],
  skills: { marksmanship: 3, tactics: 1 },
  healthBonus: 2,                  // Adds to base creature health
  notes: "Damage dealer; occupies high ground when possible"
}
```

### Available Profiles

**Frontier Profiles:**
- `banditLookout` — Scout role; escapes if alerted
- `banditRifleman` — Ranged damage dealer; high ground preference
- `mountedCutthroat` — Cavalry; harasses flanks
- `direHound` — Pack animal predator; +1 bonus in groups
- `alphaStalker` — Pack leader; coordinates attacks

**Urban Profiles:**
- `streetEnforcer` — Melee enforcer; territory control
- `lookout` — Signal specialist; calls reinforcements
- `saboteur` — Specialist with explosives
- `agitator` — Crowd control; inflames groups
- `militiaSkirmisher` — Disciplined ranged fighter

**Industrial Profiles:**
- `saboteurEngineer` — Critical objective; must reach terminal
- `guardGunner` — Defensive ranged position
- `strikebreaker` — Crowd dispersal melee
- `foremanBrute` — Boss unit; morale anchor

**Wilderness Profiles:**
- `feralStalker` — Ambush hunter; uses terrain
- `broodMatriarch` — Boss creature; defends nest
- `packHunter` — Pack scout; flees if isolated
- `trackerAlpha` — Pack coordinator; coordinates strikes

---

## Faction Metadata

Factions provide objectives, relationship data, and escalation triggers:

```javascript
{
  name: "Frontier Raiders",
  objective: "Ambush and loot caravan",
  alignment: "hostile",                      // hostile, unfriendly, neutral
  reinforcementTrigger: "alarm-horn-after-3-rounds",
  surrenderThreshold: 0.5,                   // Morale break point (0-1)
  lootProbability: 0.7,
  cruelty: "moderate"                        // low, moderate, high
}
```

### Available Factions
- `frontier-raiders` — Roadside ambush specialists
- `predators` — Feral fauna hunting
- `urban-gang` — Territory-focused criminals
- `riot-mob` — Crowd-based chaos
- `militia` — Civic authority
- `industrial-saboteurs` — Infrastructure destroyers
- `rail-security` — Defensive forces
- `corp-forces` — Corporate enforcers
- `feral-fauna` — Wilderness predators

---

## Terrain Features

Terrains provide mechanical bonuses/penalties and environmental hazards:

```javascript
{
  name: "Broken Ridgeline",
  region: "frontier",
  coverBonus: 2,                   // Bonus to cover/defense
  mobilityPenalty: -1,             // Penalty to movement
  features: ["rocks", "elevation-changes", "wagon-cover"],
  hazards: []
}
```

### Available Terrains

**Frontier:**
- `ridgeline` — Cover +2, mobility -1; rocks & elevation
- `brushPass` — Cover +1, mobility -2; limited visibility

**Urban:**
- `alleyGrid` — Cover +2, mobility 0; rooftops & alleys
- `marketSquare` — Cover +1, mobility -1; crowd cover

**Industrial:**
- `railYard` — Cover +1, mobility 0; catwalks & steam
- `factoryGate` — Cover +2, mobility -1; heavy machinery

**Wilderness:**
- `rockyBasin` — Cover +2, mobility -1; unstable ledges
- `foggyTreeline` — Cover +1, mobility -2; fog & marsh

---

## Escalation Triggers

Escalations define how encounters escalate during combat:

```javascript
{
  name: "Reinforcement Horn Signal",
  triggerCondition: "round-3-if-leader-alive",
  effect: "+2 enemies spawn at battlefield edge",
  counterplay: "Silence the horn or the leader"
}
```

### Available Escalations
- `reinforcement-horn` — Reinforcements arrive round 3
- `second-pack-emerges` — Rear attack from second pack round 2
- `city-watch-arrives` — Authority faction round 4 or on alarm
- `fire-spreads` — Growing hazard each round
- `boiler-vents` — Steam hazards round 3+
- `hatch-eggs` — Creature spawn round 5+
- `loading-crane-collapse` — Structural hazard round 4+

---

## Usage: Browser Console API

### Build Full Encounter Context

```javascript
// Get seed from travel encounter
const seed = {
  id: "frontier-raiders",
  title: "Roadside Raiders",
  adversaries: ["Bandit Lookout", "Bandit Rifleman", "Mounted Cutthroat"],
  terrain: "Broken ridgeline with wagon cover.",
  escalationHint: "Reinforcement horn after 3 rounds if not silenced."
};

// Build rich context
const context = game.turnOfTheCentury.seeds.buildContext(seed, "frontier");

// Result:
{
  seed: {...},
  region: "frontier",
  escalation: {
    name: "Reinforcement Horn Signal",
    triggerCondition: "round-3-if-leader-alive",
    effect: "+2 enemies spawn at battlefield edge",
    counterplay: "Silence the horn or the leader"
  },
  terrain: {
    name: "Broken Ridgeline",
    coverBonus: 2,
    mobilityPenalty: -1,
    features: ["rocks", "elevation-changes", "wagon-cover"],
    hazards: []
  },
  faction: {
    name: "Frontier Raiders",
    objective: "Ambush and loot caravan",
    alignment: "hostile",
    cruelty: "moderate"
  },
  narrative: {
    preEncounter: "The road ahead narrows. Distant smoke rises from abandoned farmsteads.",
    combat: "A horn blast echoes through the pass—coordinated attack incoming.",
    victory: "Among their camp: a map marking several other caravans headed this way.",
    defeat: "They drag supplies eastward, laughing. One mentions 'the boss' by a river crossing."
  },
  difficulty: "standard",
  instantiatedProfiles: [ {...}, {...}, ... ],
  loot: ["5d10 gbp", "1x rifle", "ammunition", "rations"]
}
```

### Instantiate Encounter Seed

```javascript
// Convert adversary names to profiles with stats
const profiles = game.turnOfTheCentury.seeds.instantiate(seed, "hard");

// Result:
[
  {
    name: "Bandit Lookout",
    type: "pawn",
    role: "scout",
    faction: "frontier-raiders",
    equipment: ["rifle", "knife"],
    skills: { perception: 3, survival: 2 },
    healthBonus: 0  // Will be adjusted by difficulty
  },
  ...
]
```

### Query Faction Data

```javascript
// Get faction objectives and mechanics
const faction = game.turnOfTheCentury.seeds.getFaction("frontier-raiders");

// Get narrative hooks
const narrative = game.turnOfTheCentury.seeds.getNarrative("frontier-raiders");

// Roll loot
const loot = game.turnOfTheCentury.seeds.rollLoot("frontier-raiders", "hard");
// Result: ["10d10 gbp", "2x rifle", "ammunition", "rations", "1x horse"]

// Get escalation
const escalation = game.turnOfTheCentury.seeds.getEscalation(seed);

// Get terrain
const terrain = game.turnOfTheCentury.seeds.getTerrain("Broken Ridgeline");
```

---

## Integration with Travel Encounters

When a travel encounter is escalated to combat:

1. **Seed Picked**: Travel system selects random region-appropriate seed
2. **Context Built**: `buildEncounterContext()` creates full metadata
3. **Stored in Combat**: All metadata saved to combat flags:
   ```json
   {
     "travelEncounterSeed": {
       "template": {...},
       "context": {
         "region": "frontier",
         "difficulty": "standard",
         "factionKey": "Frontier Raiders",
         "terrain": "Broken Ridgeline",
         "escalationTrigger": "Reinforcement Horn Signal"
       },
       "escalation": {...},
       "faction": {...},
       "terrain": {...},
       "narrative": {...},
       "loot": [...]
     }
   }
   ```
4. **Narrative Posted**: Pre-encounter narrative hook posted to chat
5. **Combat Ready**: Encounter begins with rich context available to GMs

---

## Creating New Adversary Profiles

To add a new profile, edit `module/encounters/enhanced-seeds.mjs`:

```javascript
export const ADVERSARY_PROFILES = Object.freeze({
  // ... existing profiles ...
  myCustomProfile: {
    name: "My Custom Enemy",
    type: "pawn",
    role: "melee",
    faction: "my-faction",
    difficulty: "standard",
    equipment: ["sword", "armor"],
    skills: { melee: 3, intimidation: 2 },
    healthBonus: 2,
    notes: "Custom behavior notes"
  }
});
```

## Creating New Factions

To add faction metadata, edit the `FACTION_METADATA` constant:

```javascript
export const FACTION_METADATA = Object.freeze({
  // ... existing factions ...
  "my-faction": {
    name: "My Faction Name",
    objective: "Clear faction objective",
    alignment: "hostile",
    reinforcementTrigger: "custom-trigger",
    surrenderThreshold: 0.5,
    lootProbability: 0.6,
    cruelty: "moderate"
  }
});
```

## Adding Narrative Hooks

Edit `NARRATIVE_HOOKS` to add story beats:

```javascript
"my-faction": {
  preEncounter: "Story setup before combat.",
  combat: "Narrative during combat.",
  victory: "Narrative if players win.",
  defeat: "Narrative if players lose."
}
```

## Adding Escalation Triggers

Edit `ESCALATION_TRIGGERS` to define new escalation mechanics:

```javascript
"my-escalation": {
  name: "My Escalation Name",
  triggerCondition: "round-X-or-condition",
  effect: "Mechanical effect description",
  counterplay: "How players can counter this"
}
```

---

## Difficulty Scaling

Profiles scale with difficulty:

**Standard:**
- Base stats as defined

**Hard:**
- Health +25% (rounded up)
- All skills +1 (capped at 5)

Apply during instantiation:
```javascript
const hardVersion = game.turnOfTheCentury.seeds.instantiate(seed, "hard");
```

---

## Loot Generation

Each faction has difficulty-scaled loot tables:

```javascript
const loot = game.turnOfTheCentury.seeds.rollLoot("frontier-raiders", "hard");
// ["10d10 gbp", "2x rifle", "ammunition", "rations", "1x horse"]
```

Available loot is stored in combat flags for distribution after victory.

---

## Combat Flag Storage

All seed data is stored in `combat.flags["turn-of-the-century"]["travelEncounterSeed"]`:

```javascript
// Retrieve in combat hooks:
const seedData = combat.getFlag("turn-of-the-century", "travelEncounterSeed");

// Access escalation:
const escalation = seedData.escalation;

// Access faction info:
const faction = seedData.faction;

// Access loot for distribution:
const loot = seedData.loot;
```

---

## GM Reference: Using Escalation Triggers

### Reinforcement Horn (Round 3)
- **Effect**: 2 reinforcements spawn at battlefield edge
- **Counterplay**: Silence the horn signal or kill the leader

### Second Pack (Round 2+)
- **Effect**: 3 predators attack from rear
- **Counterplay**: Establish rear guard or rapid extraction

### City Watch (Round 4)
- **Effect**: Authority faction arrives (complication)
- **Counterplay**: Bribe, avoid witnesses, or negotiate

### Fire Spread (Each Round)
- **Effect**: Safe zone shrinks; cumulative damage
- **Counterplay**: Extinguish sources or rapid escape

### Boiler Vents (Round 3)
- **Effect**: Steam hazards reduce cover
- **Counterplay**: Manual vent control or avoid steam

### Egg Hatch (Round 5)
- **Effect**: 1d4 new creatures spawn
- **Counterplay**: Destroy eggs or retreat before round 5

### Crane Collapse (Round 4+)
- **Effect**: Crane falls; destroys cover, creates hazard
- **Counterplay**: Stabilize or use for tactical advantage

---

## Example Workflow

```javascript
// 1. Travel event rolls, party encounters threat
const seed = {
  id: "frontier-raiders",
  title: "Roadside Raiders",
  adversaries: ["Bandit Lookout", "Bandit Rifleman", "Mounted Cutthroat"],
  terrain: "Broken ridgeline with wagon cover.",
  escalationHint: "Reinforcement horn after 3 rounds if not silenced.",
  difficulty: "standard"
};

// 2. Escalate to combat
// Use your Workspace V2 command surface to initiate the encounter for this seed.
const combat = await startEncounterFromTravelSeed(seed, "frontier");

// 3. Access rich context in combat
const seedData = combat.getFlag("turn-of-the-century", "travelEncounterSeed");

// 4. Describe terrain to players
console.log(seedData.context.terrain);
// "Broken Ridgeline"

// 5. Post narrative hooks
console.log(seedData.narrative.combat);
// "A horn blast echoes through the pass—coordinated attack incoming."

// 6. Apply terrain modifiers to combat
const terrain = seedData.terrain;
console.log(`Cover bonus: +${terrain.coverBonus}, Mobility penalty: ${terrain.mobilityPenalty}`);

// 7. Monitor escalation trigger
// Round 3: Check if leader alive → spawn reinforcements

// 8. On victory, distribute loot
seedData.loot.forEach(lootItem => {
  console.log(`Award: ${lootItem}`);
});
```

---

## API Reference

### `game.turnOfTheCentury.seeds`

**Data:**
- `adversaryProfiles` — Reference to all NPC profiles
- `factionMetadata` — Reference to all factions
- `terrainFeatures` — Reference to all terrains
- `escalationTriggers` — Reference to all escalations
- `lootTables` — Reference to all loot
- `narrativeHooks` — Reference to all narratives

**Methods:**
- `buildContext(seed, region)` → Full encounter context
- `instantiate(seed, difficulty)` → Actor profiles
- `getEscalation(seed)` → Escalation trigger
- `getTerrain(terrainName)` → Terrain feature
- `getNarrative(factionKey)` → Story hooks
- `getFaction(factionKey)` → Faction metadata
- `rollLoot(factionKey, difficulty)` → Loot array

---

## Next Steps

1. **Test** escalation triggers in actual combat
2. **Refine** loot tables based on playtesting
3. **Expand** faction relationships and allegiances
4. **Add** region-specific narrative variations
5. **Create** faction-specific terrain adaptations

