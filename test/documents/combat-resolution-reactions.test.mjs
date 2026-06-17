import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

class MockStringField { constructor(options) { this.options = options; } }
class MockNumberField { constructor(options) { this.options = options; } }
class MockBooleanField { constructor(options) { this.options = options; } }
class MockHTMLField { constructor(options) { this.options = options; } }
class MockArrayField { constructor(element, options) { this.element = element; this.options = options; } }
class MockSchemaField { constructor(fields) { this.fields = fields; } }

let rollQueue = [];
let chatCreateCalls = [];

class MockRoll {
    constructor(_formula, _data = {}) {}

    async roll() {
        return {
            total: Number(rollQueue.shift() ?? 1)
        };
    }
}

function makeActor({ id, name, health = 20, dexBonus = 0, items = [], inventory = null }) {
    const actor = {
        id,
        name,
        system: {
            resources: {
                health: { value: health },
                stamina: { value: 5 }
            },
            defenses: {
                armorClass: 10
            },
            abilities: {
                dex: { bonus: dexBonus },
                str: { bonus: 0 }
            },
            inventory: inventory ?? {
                equipment: {
                    hands: { itemIds: [] },
                    torso: { itemIds: [] },
                    belt: { itemIds: [] }
                },
                pack: { itemIds: [] }
            }
        },
        items: {
            contents: items,
            get: (itemId) => items.find((item) => item.id === itemId) ?? null
        },
        getRollData() {
            return { system: this.system };
        },
        async update(changes) {
            if (Object.hasOwn(changes, "system.resources.health.value")) {
                this.system.resources.health.value = Number(changes["system.resources.health.value"]);
            }
            if (Object.hasOwn(changes, "system.resources")) {
                this.system.resources = structuredClone(changes["system.resources"]);
            }
            return this;
        }
    };

    return actor;
}

function makeWeaponItem({ id = "weapon-1", loaded = 2, damage = "1", normalRange = 30, longRange = 60 } = {}) {
    return {
        id,
        system: {
            classification: "simpleRanged",
            damage: { formula: damage, bonus: 0 },
            physical: {
                range: { normal: normalRange, long: longRange }
            },
            ammunition: {
                loaded,
                capacity: loaded,
                consumedPerAttack: 1
            },
            actions: {
                variants: [{
                    id: "shot",
                    type: "attack",
                    label: "Shot",
                    apCost: 1,
                    requiresToHit: true,
                    toHitBonus: 0,
                    rangeType: "normal",
                    isReaction: false,
                    reactionTriggerType: "",
                    requirements: []
                }]
            }
        },
        getRollData() {
            return { system: this.system };
        },
        async executeEncounterAction({ consume = true } = {}) {
            if (consume) {
                this.system.ammunition.loaded = Math.max(0, Number(this.system.ammunition.loaded ?? 0) - 1);
            }
            return { success: true };
        },
        async update(changes) {
            if (changes?.system) {
                this.system = structuredClone(changes.system);
            }
            return this;
        }
    };
}

function makeConsumableItem({ id = "elixir-1", quantity = 1 } = {}) {
    return {
        id,
        system: {
            quantity,
            actions: {
                variants: [{
                    id: "drink",
                    type: "consumable",
                    label: "Drink Elixir",
                    apCost: 1,
                    requiresToHit: false,
                    toHitBonus: 0,
                    isReaction: false,
                    reactionTriggerType: "",
                    requirements: []
                }]
            }
        },
        async executeEncounterAction({ consume = true } = {}) {
            if (consume) {
                this.system.quantity = Math.max(0, Number(this.system.quantity ?? 0) - 1);
            }
            return { success: true };
        },
        async update(changes) {
            if (changes?.system) {
                this.system = structuredClone(changes.system);
            }
            return this;
        }
    };
}

function makeToken({ id, x = 0, y = 0 } = {}) {
    return {
        id,
        x,
        y,
        width: 1,
        height: 1,
        parent: {
            grid: {
                size: 100,
                distance: 5
            }
        },
        async update(changes) {
            this.x = Number(changes.x ?? this.x);
            this.y = Number(changes.y ?? this.y);
            return this;
        }
    };
}

function buildCombatHarness({ apBudget = 1, plans = {}, attackerDex = 0, targetDex = 2, withWeapon = true }) {
    const attackerItem = withWeapon ? makeWeaponItem({ id: "weapon-1", loaded: 2, damage: "5" }) : null;
    const attacker = makeActor({
        id: "actor-a",
        name: "Attacker",
        health: 20,
        dexBonus: attackerDex,
        items: attackerItem ? [attackerItem] : []
    });
    const target = makeActor({
        id: "actor-b",
        name: "Target",
        health: 20,
        dexBonus: targetDex,
        items: []
    });

    const tokenA = makeToken({ id: "token-a", x: 0, y: 0 });
    const tokenB = makeToken({ id: "token-b", x: 0, y: 0 });

    const combatants = [
        {
            id: "c-a",
            name: "Attacker",
            actor: attacker,
            tokenId: "token-a",
            initiative: 20
        },
        {
            id: "c-b",
            name: "Target",
            actor: target,
            tokenId: "token-b",
            initiative: 10
        }
    ];

    const combatantsCollection = {
        contents: combatants,
        get: (id) => combatants.find((combatant) => combatant.id === id) ?? null
    };

    const scene = {
        tokens: {
            get: (tokenId) => {
                if (tokenId === "token-a") return tokenA;
                if (tokenId === "token-b") return tokenB;
                return null;
            }
        }
    };

    globalThis.canvas.scene.tokens.get = scene.tokens.get;
    globalThis.game.scenes.contents = [scene];

    let encounterState = {
        initialized: true,
        phase: "planning",
        apBudget,
        actionCatalog: {},
        timeline: [],
        roundHistory: [],
        currentEvaluationTick: 0,
        planningStartedAt: Date.now(),
        round: 1,
        perCombatant: {
            "c-a": {
                spentAp: 0,
                remainingAp: apBudget,
                plan: plans["c-a"] ?? [],
                pointer: 0,
                progress: 0,
                ready: true,
                committedAt: Date.now()
            },
            "c-b": {
                spentAp: 0,
                remainingAp: apBudget,
                plan: plans["c-b"] ?? [],
                pointer: 0,
                progress: 0,
                ready: true,
                committedAt: Date.now()
            }
        },
        resolution: {
            status: "idle",
            currentTick: 0,
            totalTicks: apBudget,
            snapshots: [],
            tickNarratives: []
        }
    };

    const combat = {
        id: "combat-1",
        round: 1,
        combatants: combatantsCollection,
        getFlag: () => encounterState,
        async setFlag(_scope, _key, value) {
            encounterState = structuredClone(value);
            return encounterState;
        },
        async updateEmbeddedDocuments() {
            return [];
        }
    };

    return {
        combat,
        attacker,
        target,
        attackerItem,
        getState: () => encounterState
    };
}

function buildMultiCombatHarness({ apBudget = 1, combatants = [], plans = {} }) {
    const sceneTokens = new Map();

    const mappedCombatants = combatants.map((entry) => {
        const token = makeToken({ id: entry.tokenId, x: entry.x ?? 0, y: entry.y ?? 0 });
        sceneTokens.set(entry.tokenId, token);

        const actor = makeActor({
            id: entry.actorId,
            name: entry.name,
            health: entry.health ?? 20,
            dexBonus: entry.dexBonus ?? 0,
            items: entry.items ?? [],
            inventory: entry.inventory ?? null
        });

        return {
            id: entry.id,
            name: entry.name,
            actor,
            tokenId: entry.tokenId,
            initiative: entry.initiative ?? 10
        };
    });

    const combatantsCollection = {
        contents: mappedCombatants,
        get: (id) => mappedCombatants.find((combatant) => combatant.id === id) ?? null
    };

    const scene = {
        tokens: {
            get: (tokenId) => sceneTokens.get(tokenId) ?? null
        }
    };

    globalThis.canvas.scene.tokens.get = scene.tokens.get;
    globalThis.game.scenes.contents = [scene];

    const perCombatant = {};
    for (const combatant of mappedCombatants) {
        perCombatant[combatant.id] = {
            spentAp: 0,
            remainingAp: apBudget,
            plan: plans[combatant.id] ?? [],
            pointer: 0,
            progress: 0,
            ready: true,
            committedAt: Date.now()
        };
    }

    let encounterState = {
        initialized: true,
        phase: "planning",
        apBudget,
        actionCatalog: {},
        timeline: [],
        roundHistory: [],
        currentEvaluationTick: 0,
        planningStartedAt: Date.now(),
        round: 1,
        perCombatant,
        resolution: {
            status: "idle",
            currentTick: 0,
            totalTicks: apBudget,
            snapshots: [],
            tickNarratives: []
        }
    };

    const combat = {
        id: "combat-multi",
        round: 1,
        combatants: combatantsCollection,
        getFlag: () => encounterState,
        async setFlag(_scope, _key, value) {
            encounterState = structuredClone(value);
            return encounterState;
        },
        async updateEmbeddedDocuments() {
            return [];
        }
    };

    return {
        combat,
        combatants: mappedCombatants,
        getState: () => encounterState
    };
}

beforeEach(() => {
    rollQueue = [];
    chatCreateCalls = [];

    globalThis.foundry = {
        documents: {
            Combat: class {},
            ChatMessage: {
                getWhisperRecipients: () => [],
                create: async (payload) => {
                    chatCreateCalls.push(payload);
                    return {};
                }
            }
        },
        utils: {
            deepClone: (value) => structuredClone(value)
        },
        data: {
            fields: {
                StringField: MockStringField,
                NumberField: MockNumberField,
                BooleanField: MockBooleanField,
                HTMLField: MockHTMLField,
                ArrayField: MockArrayField,
                SchemaField: MockSchemaField
            }
        }
    };

    globalThis.game = {
        user: { isGM: true },
        settings: {
            get: (_scope, key) => {
                if (key === "encounterActionPointBudget") return 1;
                if (key === "encounterMovementFeetPerAp") return 10;
                if (key === "encounterReplayNarrationStyle") return "concise";
                return undefined;
            }
        },
        i18n: {
            localize: (key) => key,
            format: (_key, data) => `Round ${data.round} summary (${data.actionCount})`
        },
        scenes: {
            contents: []
        }
    };

    globalThis.Hooks = { callAll: () => {} };
    globalThis.ChatMessage = globalThis.foundry.documents.ChatMessage;
    globalThis.Combat = globalThis.foundry.documents.Combat;
    globalThis.Roll = MockRoll;
    globalThis.canvas = {
        scene: {
            grid: {
                size: 100,
                distance: 5
            },
            tokens: {
                get: () => null
            }
        }
    };
});

async function loadCombatModule() {
    const moduleUrl = new URL(`../../module/documents/combat.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

describe("TurnOfTheCenturyEncounter reactions and rewind", () => {
    it("keeps tick narration in encounter state instead of publishing chat messages", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const attackAction = {
            id: "weapon-1:shot",
            actionId: "shot",
            type: "attack",
            label: "Quick Shot",
            apCost: 1,
            itemId: "weapon-1",
            targetId: "c-b",
            requiresToHit: true,
            toHitBonus: 0,
            isReaction: false,
            reactionTriggerType: ""
        };

        const harness = buildCombatHarness({
            apBudget: 1,
            plans: {
                "c-a": [attackAction],
                "c-b": []
            },
            withWeapon: true
        });

        globalThis.canvas.scene.tokens.get = (id) => (id === "token-a"
            ? { id: "token-a", x: 0, y: 0, width: 1, height: 1, parent: { grid: { size: 100, distance: 5 } }, update: async () => ({}) }
            : { id: "token-b", x: 0, y: 0, width: 1, height: 1, parent: { grid: { size: 100, distance: 5 } }, update: async () => ({}) });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 4];

        await encounter.resolveEncounterRound({ tickDelayMs: 0 });

        const resolution = harness.getState().resolution;
        assert.equal(chatCreateCalls.length, 0);
        assert.equal(Array.isArray(resolution.tickNarratives), true);
        assert.equal(resolution.tickNarratives.length, 1);
        assert.match(String(resolution.tickNarratives[0]?.summary ?? ""), /Attacker/i);
    });

    it("clears all ready flags when the GM reopens planning", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const { combat, getState } = buildMultiCombatHarness({
            apBudget: 2,
            combatants: [
                { id: "c-a", actorId: "actor-a", tokenId: "token-a", name: "Ada", x: 0, y: 0 },
                { id: "c-b", actorId: "actor-b", tokenId: "token-b", name: "Briggs", x: 100, y: 0 }
            ]
        });

        const encounterState = getState();
        encounterState.phase = "locked";
        encounterState.planningStartedAt = 0;
        encounterState.perCombatant["c-a"].ready = true;
        encounterState.perCombatant["c-a"].committedAt = 111;
        encounterState.perCombatant["c-b"].ready = true;
        encounterState.perCombatant["c-b"].committedAt = 222;
        await combat.setFlag("turn-of-the-century", "encounter", encounterState);

        const encounter = new TurnOfTheCenturyEncounter(combat);
        await encounter.setEncounterPhase("planning");

        const reopenedState = getState();
        assert.equal(reopenedState.phase, "planning");
        assert.equal(reopenedState.perCombatant["c-a"].ready, false);
        assert.equal(reopenedState.perCombatant["c-a"].committedAt, 0);
        assert.equal(reopenedState.perCombatant["c-b"].ready, false);
        assert.equal(reopenedState.perCombatant["c-b"].committedAt, 0);
        assert.ok(reopenedState.planningStartedAt > 0);
    });

    it("allows incoming-attack reaction windows to negate a hit", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const attackAction = {
            id: "weapon-1:shot",
            actionId: "shot",
            type: "attack",
            label: "Quick Shot",
            apCost: 1,
            itemId: "weapon-1",
            targetId: "c-b",
            requiresToHit: true,
            toHitBonus: 0,
            isReaction: false,
            reactionTriggerType: ""
        };
        const dodgeAction = {
            id: "dodge",
            actionId: "dodge",
            type: "defense",
            label: "Dodge",
            apCost: 1,
            requiresToHit: false,
            toHitBonus: 0,
            isReaction: true,
            reactionTriggerType: "incomingAttack"
        };

        const harness = buildCombatHarness({
            apBudget: 1,
            plans: {
                "c-a": [attackAction],
                "c-b": [dodgeAction]
            },
            withWeapon: true
        });

        globalThis.canvas.scene.tokens.get = (id) => (id === "token-a"
            ? { id: "token-a", x: 0, y: 0, width: 1, height: 1, parent: { grid: { size: 100, distance: 5 } }, update: async () => ({}) }
            : { id: "token-b", x: 0, y: 0, width: 1, height: 1, parent: { grid: { size: 100, distance: 5 } }, update: async () => ({}) });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [12, 12];

        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const attackEntry = timeline.find((entry) => entry.combatantId === "c-a");
        assert.equal(attackEntry?.outcome?.result, "reacted");
        assert.equal(harness.target.system.resources.health.value, 20);
    });

    it("rewinds actor resources and item state when stepping snapshots backward", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const attackAction = {
            id: "weapon-1:shot",
            actionId: "shot",
            type: "attack",
            label: "Quick Shot",
            apCost: 1,
            itemId: "weapon-1",
            targetId: "c-b",
            requiresToHit: true,
            toHitBonus: 0,
            isReaction: false,
            reactionTriggerType: ""
        };

        const harness = buildCombatHarness({
            apBudget: 1,
            plans: {
                "c-a": [attackAction],
                "c-b": []
            },
            withWeapon: true
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 5];

        await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        assert.equal(harness.target.system.resources.health.value, 15);
        assert.equal(harness.attackerItem.system.ammunition.loaded, 1);

        await encounter.stepEncounterResolution(-1);
        assert.equal(harness.target.system.resources.health.value, 20);
        assert.equal(harness.attackerItem.system.ammunition.loaded, 2);
    });

    it("overwatch targets the closest hostile in range when triggered", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const overwatchWeapon = makeWeaponItem({ id: "ow-weapon", loaded: 2, damage: "3", normalRange: 30 });
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-a",
                    actorId: "actor-a",
                    name: "Mover",
                    tokenId: "token-a",
                    x: 400,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-b",
                    actorId: "actor-b",
                    name: "Closer",
                    tokenId: "token-b",
                    x: 100,
                    y: 0,
                    initiative: 10,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-o",
                    actorId: "actor-o",
                    name: "Overwatcher",
                    tokenId: "token-o",
                    x: 0,
                    y: 0,
                    initiative: 5,
                    items: [overwatchWeapon],
                    inventory: {
                        equipment: { hands: { itemIds: ["ow-weapon"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-a": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    movementTargetX: 350,
                    movementTargetY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-b": [],
                "c-o": [{
                    id: "overwatch",
                    actionId: "overwatch",
                    type: "defense",
                    label: "Overwatch",
                    apCost: 1,
                    isReaction: true,
                    reactionTriggerType: "overwatch"
                }]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 3];

        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const overwatchEntry = timeline.find((entry) => entry.combatantId === "c-o" && entry.reaction === true);
        assert.ok(overwatchEntry, "expected an overwatch reaction entry");
        assert.equal(overwatchEntry.outcome.targetCombatantId, "c-b");

        const mover = harness.combatants.find((combatant) => combatant.id === "c-a");
        const closer = harness.combatants.find((combatant) => combatant.id === "c-b");
        assert.equal(mover.actor.system.resources.health.value, 20);
        assert.equal(closer.actor.system.resources.health.value, 17);
    });

    it("overwatch range uses equipped weapon only", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const equippedShort = makeWeaponItem({ id: "equipped-short", loaded: 2, damage: "3", normalRange: 5 });
        const unequippedLong = makeWeaponItem({ id: "pack-long", loaded: 2, damage: "3", normalRange: 60 });
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-a",
                    actorId: "actor-a",
                    name: "Mover",
                    tokenId: "token-a",
                    x: 400,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-o",
                    actorId: "actor-o",
                    name: "Overwatcher",
                    tokenId: "token-o",
                    x: 0,
                    y: 0,
                    initiative: 5,
                    items: [equippedShort, unequippedLong],
                    inventory: {
                        equipment: { hands: { itemIds: ["equipped-short"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: ["pack-long"] }
                    }
                }
            ],
            plans: {
                "c-a": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    movementTargetX: 350,
                    movementTargetY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-o": [{
                    id: "overwatch",
                    actionId: "overwatch",
                    type: "defense",
                    label: "Overwatch",
                    apCost: 1,
                    isReaction: true,
                    reactionTriggerType: "overwatch"
                }]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 3];

        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const overwatchEntry = timeline.find((entry) => entry.combatantId === "c-o" && entry.reaction === true);
        assert.equal(overwatchEntry, undefined);

        const mover = harness.combatants.find((combatant) => combatant.id === "c-a");
        assert.equal(mover.actor.system.resources.health.value, 20);
        assert.equal(equippedShort.system.ammunition.loaded, 2);
        assert.equal(unequippedLong.system.ammunition.loaded, 2);
    });

    it("reconciles simultaneous lethal attacks so both combatants can die in the same tick", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const daggerA = makeWeaponItem({ id: "dagger-a", loaded: 1, damage: "6", normalRange: 5 });
        const daggerB = makeWeaponItem({ id: "dagger-b", loaded: 1, damage: "6", normalRange: 5 });
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-a",
                    actorId: "actor-a",
                    name: "Thrower",
                    tokenId: "token-a",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    health: 5,
                    items: [daggerA],
                    inventory: {
                        equipment: { hands: { itemIds: ["dagger-a"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-b",
                    actorId: "actor-b",
                    name: "Stabber",
                    tokenId: "token-b",
                    x: 0,
                    y: 0,
                    initiative: 10,
                    health: 5,
                    items: [daggerB],
                    inventory: {
                        equipment: { hands: { itemIds: ["dagger-b"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-a": [{
                    id: "dagger-a:shot",
                    actionId: "shot",
                    type: "attack",
                    label: "Throw Dagger",
                    apCost: 1,
                    itemId: "dagger-a",
                    targetId: "c-b",
                    requiresToHit: true,
                    toHitBonus: 0,
                    rangeType: "melee",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-b": [{
                    id: "dagger-b:shot",
                    actionId: "shot",
                    type: "attack",
                    label: "Heart Stab",
                    apCost: 1,
                    itemId: "dagger-b",
                    targetId: "c-a",
                    requiresToHit: true,
                    toHitBonus: 0,
                    rangeType: "melee",
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 6, 15, 6];

        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const attackA = timeline.find((entry) => entry.combatantId === "c-a" && entry.outcome?.result === "hit");
        const attackB = timeline.find((entry) => entry.combatantId === "c-b" && entry.outcome?.result === "hit");
        assert.ok(attackA, "expected first attack to resolve as hit");
        assert.ok(attackB, "expected second attack to resolve as hit");

        const thrower = harness.combatants.find((combatant) => combatant.id === "c-a");
        const stabber = harness.combatants.find((combatant) => combatant.id === "c-b");
        assert.equal(thrower.actor.system.resources.health.value, 0);
        assert.equal(stabber.actor.system.resources.health.value, 0);
    });

    it("interrupts consumable completion when same-square collision knocks actor prone at end of tick", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const elixir = makeConsumableItem({ id: "elixir-1", quantity: 1 });
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-m",
                    actorId: "actor-m",
                    name: "Mover",
                    tokenId: "token-m",
                    x: 100,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-d",
                    actorId: "actor-d",
                    name: "Drinker",
                    tokenId: "token-d",
                    x: 0,
                    y: 0,
                    initiative: 10,
                    items: [elixir],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: ["elixir-1"] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-m": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    movementTargetX: 0,
                    movementTargetY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-d": [{
                    id: "elixir-1:drink",
                    actionId: "drink",
                    type: "consumable",
                    label: "Drink Elixir",
                    apCost: 1,
                    itemId: "elixir-1",
                    requiresToHit: false,
                    toHitBonus: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });

        const drinkEntry = timeline.find((entry) => entry.combatantId === "c-d" && entry.action?.actionId === "drink");
        assert.equal(drinkEntry?.outcome?.result, "interrupted");
        assert.equal(elixir.system.quantity, 1);

        const proneEntries = timeline.filter((entry) => entry.outcome?.result === "prone");
        assert.ok(proneEntries.some((entry) => entry.combatantId === "c-d"));
        assert.ok(proneEntries.some((entry) => entry.combatantId === "c-m"));
    });

    it("interrupts ranged attack at completion boundary when target moves out of range", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const rifle = makeWeaponItem({ id: "rifle-1", loaded: 2, damage: "4", normalRange: 60, longRange: 120 });
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                { id: "c-a", actorId: "actor-a", tokenId: "token-a", name: "Archer", x: 0, y: 0, initiative: 15, items: [rifle] },
                { id: "c-b", actorId: "actor-b", tokenId: "token-b", name: "Runner", x: 1000, y: 0, initiative: 10, items: [] }
            ],
            plans: {
                "c-a": [{
                    id: "rifle-1:shot",
                    actionId: "shot",
                    type: "attack",
                    label: "Rifle Shot",
                    apCost: 1,
                    itemId: "rifle-1",
                    targetId: "c-b",
                    requiresToHit: true,
                    toHitBonus: 0,
                    rangeType: "normal",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-b": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Sprint Away",
                    apCost: 1,
                    movementFeet: 10,
                    movementFeetPerAp: 10,
                    movementTargetX: 1300,
                    movementTargetY: 0
                }]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 4];

        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const shotEntry = timeline.find((entry) => entry.combatantId === "c-a" && entry.action?.actionId === "shot");
        const runner = harness.combatants.find((combatant) => combatant.id === "c-b");

        assert.equal(shotEntry?.outcome?.result, "interrupted");
        assert.match(String(shotEntry?.outcome?.detail ?? ""), /out of range/i);
        assert.equal(runner?.actor?.system?.resources?.health?.value, 20);
    });
});
