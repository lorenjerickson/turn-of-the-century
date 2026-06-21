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

function makeActor({ id, name, health = 20, dexBonus = 0, strength = 10, items = [], inventory = null }) {
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
                str: { value: strength, bonus: 0 }
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
        statuses: new Set(),
        async toggleStatusEffect(statusId, { active = true } = {}) {
            if (active) this.statuses.add(statusId);
            else this.statuses.delete(statusId);
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
                        recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
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
                        recapFormat: "{{Owner.name}} uses {{Item.name}}.",
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
            strength: entry.strength ?? 10,
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
    it("does not auto-resolve planning solely because time expired when combatants are not all ready", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        let encounterState = {
            initialized: true,
            phase: "planning",
            apBudget: 2,
            actionCatalog: {},
            perCombatant: {
                "c-a": { spentAp: 0, remainingAp: 2, plan: [], pointer: 0, progress: 0, ready: true, committedAt: 1 },
                "c-b": { spentAp: 0, remainingAp: 2, plan: [], pointer: 0, progress: 0, ready: false, committedAt: 0 }
            },
            timeline: [],
            roundHistory: [],
            currentEvaluationTick: 0,
            resolution: { status: "idle", currentTick: 0, totalTicks: 2, snapshots: [], tickNarratives: [] },
            planningStartedAt: Date.now() - 120000,
            round: 1
        };

        const combat = {
            id: "combat-ready-gate",
            round: 1,
            combatants: {
                contents: [{ id: "c-a" }, { id: "c-b" }],
                get: (id) => ({ id })
            },
            getFlag: () => encounterState,
            async setFlag(_scope, _key, value) {
                encounterState = structuredClone(value);
                return encounterState;
            }
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        let resolveCalls = 0;
        encounter.resolveEncounterRound = async () => {
            resolveCalls += 1;
            return [];
        };

        const triggered = await encounter.maybeAutoFinalizePlanning();

        assert.equal(triggered, false);
        assert.equal(resolveCalls, 0);
    });

    it("does not auto-resolve planning when every combatant is ready", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        let encounterState = {
            initialized: true,
            phase: "planning",
            apBudget: 2,
            actionCatalog: {},
            perCombatant: {
                "c-a": { spentAp: 0, remainingAp: 2, plan: [], pointer: 0, progress: 0, ready: true, committedAt: 1 },
                "c-b": { spentAp: 0, remainingAp: 2, plan: [], pointer: 0, progress: 0, ready: true, committedAt: 1 }
            },
            timeline: [],
            roundHistory: [],
            currentEvaluationTick: 0,
            resolution: { status: "idle", currentTick: 0, totalTicks: 2, snapshots: [], tickNarratives: [] },
            planningStartedAt: Date.now() - 120000,
            round: 1
        };

        const combat = {
            id: "combat-ready-all",
            round: 1,
            combatants: {
                contents: [{ id: "c-a" }, { id: "c-b" }],
                get: (id) => ({ id })
            },
            getFlag: () => encounterState,
            async setFlag(_scope, _key, value) {
                encounterState = structuredClone(value);
                return encounterState;
            }
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        let resolveCalls = 0;
        encounter.resolveEncounterRound = async () => {
            resolveCalls += 1;
            return [];
        };

        const triggered = await encounter.maybeAutoFinalizePlanning();

        assert.equal(triggered, false);
        assert.equal(resolveCalls, 0);
        assert.equal(encounter.phase, "planning");
    });

    it("adds scene token actors as combatants when starting an encounter round", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const sceneTokens = [
            { id: "token-1", actorId: "actor-1", hidden: false },
            { id: "token-2", actorId: "actor-2", hidden: true }
        ];
        const combatants = [];
        let encounterState = null;
        const createCalls = [];

        const combat = {
            id: "combat-1",
            round: 2,
            sceneId: "scene-1",
            scene: {
                id: "scene-1",
                tokens: { contents: sceneTokens }
            },
            combatants: {
                contents: combatants,
                get: (id) => combatants.find((combatant) => combatant.id === id) ?? null
            },
            getFlag: () => encounterState,
            async setFlag(_scope, _key, value) {
                encounterState = structuredClone(value);
                return encounterState;
            },
            async createEmbeddedDocuments(type, docs) {
                assert.equal(type, "Combatant");
                createCalls.push(structuredClone(docs));
                for (const doc of docs) {
                    combatants.push({
                        id: `combatant-${doc.tokenId}`,
                        tokenId: doc.tokenId,
                        actorId: doc.actorId,
                        actor: { id: doc.actorId },
                        initiative: null
                    });
                }
                return docs;
            },
            async updateEmbeddedDocuments() {
                return [];
            }
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        const nextState = await encounter.initializeEncounterRound();

        assert.equal(createCalls.length, 1);
        assert.deepEqual(createCalls[0], [
            { tokenId: "token-1", actorId: "actor-1", sceneId: "scene-1", hidden: false },
            { tokenId: "token-2", actorId: "actor-2", sceneId: "scene-1", hidden: true }
        ]);
        assert.ok(nextState.perCombatant["combatant-token-1"]);
        assert.ok(nextState.perCombatant["combatant-token-2"]);
    });

    it("syncs only missing scoped tokens while an encounter is active", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const sceneTokens = [
            { id: "token-1", actorId: "actor-1", hidden: false },
            { id: "token-2", actorId: "actor-2", hidden: false }
        ];
        const combatants = [
            { id: "combatant-token-1", tokenId: "token-1", actorId: "actor-1", actor: { id: "actor-1" }, initiative: null }
        ];
        const createCalls = [];

        const combat = {
            id: "combat-1",
            round: 2,
            sceneId: "scene-1",
            scene: {
                id: "scene-1",
                tokens: { contents: sceneTokens }
            },
            combatants: {
                contents: combatants,
                get: (id) => combatants.find((combatant) => combatant.id === id) ?? null
            },
            getFlag: () => ({ initialized: true, apBudget: 1, actionCatalog: {}, perCombatant: {}, timeline: [], roundHistory: [] }),
            async setFlag() {
                return {};
            },
            async createEmbeddedDocuments(type, docs) {
                assert.equal(type, "Combatant");
                createCalls.push(structuredClone(docs));
                for (const doc of docs) {
                    combatants.push({
                        id: `combatant-${doc.tokenId}`,
                        tokenId: doc.tokenId,
                        actorId: doc.actorId,
                        actor: { id: doc.actorId },
                        initiative: null
                    });
                }
                return docs;
            }
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        await encounter.syncSceneCombatants({ tokenDocuments: [{ id: "token-2", actorId: "actor-2", hidden: true }] });

        assert.equal(createCalls.length, 1);
        assert.deepEqual(createCalls[0], [
            { tokenId: "token-2", actorId: "actor-2", sceneId: "scene-1", hidden: true }
        ]);
        assert.equal(combatants.length, 2);
    });

    it("uses one-second default pacing between AP ticks during resolution", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildCombatHarness({
            apBudget: 2,
            plans: {
                "c-a": [],
                "c-b": []
            },
            withWeapon: false
        });

        const delays = [];
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = (callback, delay, ...args) => {
            delays.push(Number(delay));
            callback(...args);
            return { ref: () => {}, unref: () => {} };
        };

        try {
            const encounter = new TurnOfTheCenturyEncounter(harness.combat);
            await encounter.resolveEncounterRound();
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }

        assert.equal(delays.includes(1000), true);
    });

    it("begins round resolution in a paused state until the GM steps", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildCombatHarness({
            apBudget: 2,
            plans: {
                "c-a": [],
                "c-b": []
            },
            withWeapon: false
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.beginEncounterResolution();

        const startedState = harness.getState();
        assert.equal(startedState.phase, "resolving");
        assert.equal(startedState.currentEvaluationTick, 0);
        assert.equal(startedState.resolution.status, "paused");
        assert.equal(startedState.resolution.currentTick, 0);

        await encounter.stepEncounterResolution(1);

        const steppedState = harness.getState();
        assert.equal(steppedState.currentEvaluationTick, 1);
        assert.equal(steppedState.resolution.currentTick, 1);
        assert.equal(steppedState.resolution.status, "paused");
        assert.equal(Array.isArray(steppedState.resolution.tickNarratives), true);
        assert.equal(steppedState.resolution.tickNarratives.length, 1);
    });

    it("finalizes round state and history from the last stepped reconciliation", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildCombatHarness({
            apBudget: 1,
            plans: {
                "c-a": [],
                "c-b": []
            },
            withWeapon: false
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);

        const finalState = harness.getState();
        assert.equal(finalState.phase, "roundComplete");
        assert.equal(finalState.currentEvaluationTick, 1);
        assert.equal(finalState.resolution.status, "complete");
        assert.equal(finalState.roundHistory.length, 1);
        assert.equal(finalState.roundHistory[0].round, 1);
        assert.deepEqual(finalState.roundHistory[0].timeline, finalState.timeline);
    });

    it("does not choose a fallback target for an untargeted attack", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const attackAction = {
            id: "weapon-1:shot",
            actionId: "shot",
            type: "attack",
            label: "Quick Shot",
            apCost: 1,
            itemId: "weapon-1",
            targetId: null,
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
        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });
        const attackEntry = timeline.find((entry) => entry.combatantId === "c-a");

        assert.equal(attackEntry?.outcome?.result, "failed");
        assert.match(String(attackEntry?.outcome?.detail ?? ""), /no target/i);
        assert.equal(harness.target.system.resources.health.value, 20);
    });

    it("preserves consumed reaction windows across step-by-step resolution", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();

        const firstPistol = makeWeaponItem({ id: "pistol-a", loaded: 2, damage: "3", normalRange: 30 });
        const secondPistol = makeWeaponItem({ id: "pistol-c", loaded: 2, damage: "3", normalRange: 30 });
        const dodgeAction = {
            id: "dodge",
            actionId: "dodge",
            type: "defense",
            label: "Dodge",
            apCost: 2,
            requiresToHit: false,
            toHitBonus: 0,
            isReaction: true,
            reactionTriggerType: "incomingAttack"
        };
        const harness = buildMultiCombatHarness({
            apBudget: 2,
            combatants: [
                {
                    id: "c-a",
                    actorId: "actor-a",
                    name: "First Shooter",
                    tokenId: "token-a",
                    x: 0,
                    y: 0,
                    initiative: 30,
                    items: [firstPistol],
                    inventory: {
                        equipment: { hands: { itemIds: ["pistol-a"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-c",
                    actorId: "actor-c",
                    name: "Second Shooter",
                    tokenId: "token-c",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [secondPistol],
                    inventory: {
                        equipment: { hands: { itemIds: ["pistol-c"] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-b",
                    actorId: "actor-b",
                    name: "Target",
                    tokenId: "token-b",
                    x: 0,
                    y: 0,
                    initiative: 10,
                    dexBonus: 5,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-a": [{
                    id: "pistol-a:shot",
                    actionId: "shot",
                    type: "attack",
                    label: "First Shot",
                    apCost: 1,
                    itemId: "pistol-a",
                    targetId: "c-b",
                    requiresToHit: true,
                    toHitBonus: 0,
                    rangeType: "normal",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-c": [
                    {
                        id: "hunkDown",
                        actionId: "hunkDown",
                        type: "defense",
                        label: "Hunker Down",
                        apCost: 1,
                        requiresToHit: false,
                        isReaction: false,
                        reactionTriggerType: ""
                    },
                    {
                        id: "pistol-c:shot",
                        actionId: "shot",
                        type: "attack",
                        label: "Second Shot",
                        apCost: 1,
                        itemId: "pistol-c",
                        targetId: "c-b",
                        requiresToHit: true,
                        toHitBonus: 0,
                        rangeType: "normal",
                        isReaction: false,
                        reactionTriggerType: ""
                    }
                ],
                "c-b": [dodgeAction]
            }
        });

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        rollQueue = [15, 20, 15, 20];

        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);
        await encounter.stepEncounterResolution(1);

        const finalState = harness.getState();
        const secondShot = finalState.timeline.find((entry) => entry.combatantId === "c-c" && entry.action?.label === "Second Shot");
        const target = harness.combatants.find((combatant) => combatant.id === "c-b");

        assert.equal(secondShot?.outcome?.result, "hit");
        assert.deepEqual(finalState.resolution.reactionConsumedKeys, ["c-b:0:1"]);
        assert.equal(target.actor.system.resources.health.value, 0);
    });

    it("moves the live token when stepping a movement tick forward", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-p",
                    actorId: "actor-p",
                    name: "Pursuer",
                    tokenId: "token-p",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-t",
                    actorId: "actor-t",
                    name: "Target",
                    tokenId: "token-t",
                    x: 200,
                    y: 0,
                    initiative: 10,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-p": [{
                    id: "pursue",
                    actionId: "pursue",
                    type: "movement",
                    label: "Pursue",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    requiresTarget: true,
                    targetId: "c-t",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-t": []
            }
        });

        const pursuerToken = globalThis.canvas.scene.tokens.get("token-p");
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);

        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);

        assert.equal(Number(pursuerToken?.x ?? 0), 200);
        assert.match(String(harness.getState().resolution.tickNarratives[0]?.summary ?? ""), /Pursuer moved 10 feet\./);
    });

    it("updates TokenDocument positions when the canvas lookup returns Token objects during stepping", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-m",
                    actorId: "actor-m",
                    name: "Mover",
                    tokenId: "token-m",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
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
                    movementTargetX: 300,
                    movementTargetY: 100,
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const tokenDocument = {
            id: "token-m",
            x: 0,
            y: 0,
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
        globalThis.canvas.scene.tokens.get = (tokenId) => tokenId === "token-m"
            ? { id: "token-m", document: tokenDocument }
            : null;
        globalThis.game.scenes.contents = [];

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);

        assert.equal(tokenDocument.x, 300);
        assert.equal(tokenDocument.y, 100);
    });

    it("applies every movement tick through the TokenDocument owned by the Foundry Combatant", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 3,
            combatants: [
                {
                    id: "c-m",
                    actorId: "actor-m",
                    name: "Mover",
                    tokenId: "token-m",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: { "c-m": [] }
        });

        const appliedPositions = [];
        const tokenDocument = {
            id: "token-m",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            parent: { grid: { size: 100, distance: 5 } },
            async update(changes) {
                this.x = Number(changes.x ?? this.x);
                this.y = Number(changes.y ?? this.y);
                appliedPositions.push({ x: this.x, y: this.y });
                return this;
            }
        };
        harness.combatants[0].token = tokenDocument;
        globalThis.canvas.scene.tokens.get = () => null;
        globalThis.canvas.tokens = { placeables: [] };
        globalThis.game.scenes.contents = [];

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        harness.getState().perCombatant["c-m"].ready = false;
        harness.getState().perCombatant["c-m"].committedAt = 0;
        await encounter.setCombatantPlan("c-m", [{
            id: "move",
            actionId: "move",
            type: "movement",
            label: "Move",
            apCost: 3,
            apMin: 1,
            apMax: 3,
            movementFeetPerAp: 10,
            movementTargetX: 300,
            movementTargetY: 0,
            isReaction: false,
            reactionTriggerType: ""
        }]);

        assert.equal(encounter.getCombatantRemainingAp("c-m"), 0);
        assert.equal(harness.getState().perCombatant["c-m"].remainingAp, 3);

        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);
        await encounter.stepEncounterResolution(1);
        await encounter.stepEncounterResolution(1);

        assert.deepEqual(appliedPositions, [
            { x: 100, y: 0 },
            { x: 200, y: 0 },
            { x: 300, y: 0 }
        ]);
        assert.equal(tokenDocument.x, 300);
        assert.equal(harness.getState().resolution.currentTick, 3);
    });

    it("routes movement ticks around blocking scene walls", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 2,
            combatants: [{
                id: "c-m",
                actorId: "actor-m",
                name: "Mover",
                tokenId: "token-m",
                x: 0,
                y: 0,
                initiative: 20,
                items: []
            }],
            plans: {
                "c-m": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 2,
                    movementFeetPerAp: 10,
                    movementTargetX: 200,
                    movementTargetY: 0
                }]
            }
        });
        globalThis.canvas.scene.width = 500;
        globalThis.canvas.scene.height = 500;
        globalThis.canvas.scene.walls = [{
            c: [100, 0, 100, 200],
            move: 20,
            door: 0,
            ds: 0
        }];

        const token = globalThis.canvas.scene.tokens.get("token-m");
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.beginEncounterResolution();
        await encounter.stepEncounterResolution(1);

        assert.notDeepEqual({ x: token.x, y: token.y }, { x: 100, y: 0 });
        assert.equal(token.y > 0, true);

        await encounter.stepEncounterResolution(1);
        assert.deepEqual({ x: token.x, y: token.y }, { x: 200, y: 0 });
    });

    it("restores a planning movement token to its origin along an A* path when the plan is marked ready", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 2,
            combatants: [
                {
                    id: "c-m",
                    actorId: "actor-m",
                    name: "Mover",
                    tokenId: "token-m",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
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
                    movementTargetX: 300,
                    movementTargetY: 100,
                    movementOriginX: 0,
                    movementOriginY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const tokenDocument = globalThis.canvas.scene.tokens.get("token-m");
        tokenDocument.x = 300;
        tokenDocument.y = 100;
        globalThis.canvas.scene.width = 500;
        globalThis.canvas.scene.height = 500;
        globalThis.canvas.scene.walls = [{ c: [200, 0, 200, 200], move: 20, door: 0 }];
        const sourceUpdates = [];
        const persistedUpdates = [];
        const persistToken = tokenDocument.update.bind(tokenDocument);
        tokenDocument.update = async (changes) => {
            persistedUpdates.push({ x: changes.x, y: changes.y });
            return persistToken(changes);
        };
        tokenDocument.updateSource = (changes) => {
            sourceUpdates.push({ x: changes.x, y: changes.y });
            Object.assign(tokenDocument, changes);
        };
        harness.getState().perCombatant["c-m"].ready = false;
        harness.getState().perCombatant["c-m"].committedAt = 0;

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.setCombatantReady("c-m", true);

        assert.equal(tokenDocument.x, 0);
        assert.equal(tokenDocument.y, 0);
        assert.equal(sourceUpdates.some((point) => point.y >= 200), true);
        assert.equal(sourceUpdates.length > 1, true);
        assert.deepEqual(persistedUpdates, []);
        assert.equal(harness.getState().perCombatant["c-m"].ready, true);
    });

    it("rebases tokens to planning origins before capturing the first resolution snapshot", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-m",
                    actorId: "actor-m",
                    name: "Mover",
                    tokenId: "token-m",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
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
                    movementTargetX: 300,
                    movementTargetY: 100,
                    movementOriginX: 0,
                    movementOriginY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const tokenDocument = globalThis.canvas.scene.tokens.get("token-m");
        tokenDocument.x = 300;
        tokenDocument.y = 100;
        tokenDocument.updateSource = (changes) => Object.assign(tokenDocument, changes);

        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        await encounter.beginEncounterResolution();

        assert.equal(tokenDocument.x, 0);
        assert.equal(tokenDocument.y, 0);
        assert.deepEqual(harness.getState().resolution.snapshots[0].tokenPositions["token-m"], { x: 0, y: 0 });

        await encounter.stepEncounterResolution(1);

        assert.equal(tokenDocument.x, 300);
        assert.equal(tokenDocument.y, 100);
    });

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
            recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
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
        assert.match(String(resolution.tickNarratives[0]?.summary ?? ""), /Attacker fires Quick Shot at Target and hits\./);
    });

    it("formats tick narration from an action recap template", async () => {
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
            recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
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
        assert.equal(Array.isArray(resolution.tickNarratives), true);
        assert.equal(resolution.tickNarratives.length, 1);
        assert.match(
            String(resolution.tickNarratives[0]?.summary ?? ""),
            /^Attacker fires Quick Shot at Target and hits\./
        );
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

    it("reconciles at tick end and forfeits a prone actor's remaining plan", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const { dieRollRequestManager } = await import("../../module/die-roll-request-manager.mjs");
        dieRollRequestManager.activeRequests.clear();
        globalThis.game.user.id = "gm";
        globalThis.game.users = { contents: [{ id: "gm", name: "GM", isGM: true, active: true }] };

        const elixir = makeConsumableItem({ id: "elixir-1", quantity: 1 });
        const harness = buildMultiCombatHarness({
            apBudget: 2,
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
                }, {
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    movementTargetX: 200,
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
        const resolution = encounter.resolveEncounterRound({ tickDelayMs: 0 });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(harness.getState().resolution.status, "awaitingContestedRolls");
        assert.equal(harness.getState().resolution.currentTick, 1);

        const requests = dieRollRequestManager.getAllRequests().filter((request) => request.id.includes("tick-1-collision"));
        assert.equal(requests.length, 2);
        rollQueue = [3];
        for (const request of requests) {
            const natural = request.actorId === "actor-m" ? 1 : 20;
            dieRollRequestManager.sendResult(request.id, "gm", {
                total: natural,
                dice: [{ value: natural, kept: true }]
            });
        }

        const timeline = await resolution;

        const drinkEntry = timeline.find((entry) => entry.combatantId === "c-d" && entry.action?.actionId === "drink");
        assert.equal(drinkEntry?.outcome?.result, "resolved");
        assert.equal(elixir.system.quantity, 0);
        assert.equal(harness.combatants.find((combatant) => combatant.id === "c-m").actor.statuses.has("prone"), true);
        assert.equal(harness.getState().perCombatant["c-m"].remainingAp, 0);
        assert.equal(harness.getState().perCombatant["c-m"].spentAp, 2);
        assert.equal(harness.getState().perCombatant["c-m"].pointer, 2);
        assert.equal(globalThis.canvas.scene.tokens.get("token-m").x, 0);
        assert.equal(timeline.some((entry) => entry.tick === 2 && entry.combatantId === "c-m" && entry.action?.type === "movement"), false);
    });

    it("pauses at tick end and applies prone plus concussive damage on a critical failure", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const { dieRollRequestManager } = await import("../../module/die-roll-request-manager.mjs");
        dieRollRequestManager.activeRequests.clear();
        globalThis.game.user.id = "gm";
        globalThis.game.users = { contents: [{ id: "gm", name: "GM", isGM: true, active: true }] };
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                { id: "c-a", actorId: "actor-a", name: "Agile", tokenId: "token-a", x: 100, y: 0, initiative: 20, dexBonus: 2 },
                { id: "c-b", actorId: "actor-b", name: "Bruiser", tokenId: "token-b", x: 0, y: 0, initiative: 10, dexBonus: 0 }
            ],
            plans: {
                "c-a": [{ id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, movementTargetX: 0, movementTargetY: 0 }],
                "c-b": []
            }
        });
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);

        const resolution = encounter.resolveEncounterRound({ tickDelayMs: 0 });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(harness.getState().resolution.status, "awaitingContestedRolls");
        const requests = dieRollRequestManager.getAllRequests().filter((request) => request.id.includes("collision"));
        assert.equal(requests.length, 2);

        rollQueue = [4];
        for (const request of requests) {
            const natural = request.actorId === "actor-a" ? 20 : 1;
            dieRollRequestManager.sendResult(request.id, "gm", {
                total: natural + (request.actorId === "actor-a" ? 2 : 0),
                dice: [{ value: natural, kept: true }]
            });
        }

        const timeline = await resolution;
        assert.equal(harness.combatants.find((combatant) => combatant.id === "c-a").actor.statuses.has("prone"), false);
        assert.equal(harness.combatants.find((combatant) => combatant.id === "c-b").actor.statuses.has("prone"), true);
        assert.equal(harness.combatants.find((combatant) => combatant.id === "c-b").actor.system.resources.health.value, 16);
        assert.ok(timeline.some((entry) => entry.combatantId === "c-a" && entry.outcome?.result === "standing"));
        assert.ok(timeline.some((entry) => entry.combatantId === "c-b" && entry.outcome?.result === "criticalFailure" && entry.outcome?.damage === 4));
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

    it("moves toward the selected target when resolving pursue", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-p",
                    actorId: "actor-p",
                    name: "Pursuer",
                    tokenId: "token-p",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-t",
                    actorId: "actor-t",
                    name: "Target",
                    tokenId: "token-t",
                    x: 200,
                    y: 0,
                    initiative: 10,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-p": [{
                    id: "pursue",
                    actionId: "pursue",
                    type: "movement",
                    label: "Pursue",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    requiresTarget: true,
                    targetId: "c-t",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-t": []
            }
        });

        const pursuerToken = globalThis.canvas.scene.tokens.get("token-p");
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });

        const pursueEntry = timeline.find((entry) => entry.combatantId === "c-p" && entry.action?.id === "pursue");
        assert.ok(pursueEntry);
        assert.equal(String(pursueEntry?.outcome?.detail ?? "").includes("pursues"), true);
        assert.equal(Number(pursuerToken?.x ?? 0), 200);
    });

    it("mirrors selected target movement while keeping distance when resolving follow", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-t",
                    actorId: "actor-t",
                    name: "Lead",
                    tokenId: "token-t",
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
                    id: "c-f",
                    actorId: "actor-f",
                    name: "Follower",
                    tokenId: "token-f",
                    x: 0,
                    y: 0,
                    initiative: 10,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-t": [{
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Advance",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    movementTargetX: 200,
                    movementTargetY: 0,
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-f": [{
                    id: "follow",
                    actionId: "follow",
                    type: "movement",
                    label: "Follow",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    requiresTarget: true,
                    targetId: "c-t",
                    isReaction: false,
                    reactionTriggerType: ""
                }]
            }
        });

        const leaderToken = globalThis.canvas.scene.tokens.get("token-t");
        const followerToken = globalThis.canvas.scene.tokens.get("token-f");
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });

        const followEntry = timeline.find((entry) => entry.combatantId === "c-f" && entry.action?.id === "follow");
        assert.ok(followEntry);
        assert.equal(String(followEntry?.outcome?.detail ?? "").includes("follows"), true);
        assert.equal(Number(leaderToken?.x ?? 0), 200);
        assert.equal(Number(followerToken?.x ?? 0), 100);
    });

    it("moves away from the selected target when resolving avoid", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const harness = buildMultiCombatHarness({
            apBudget: 1,
            combatants: [
                {
                    id: "c-a",
                    actorId: "actor-a",
                    name: "Avoider",
                    tokenId: "token-a",
                    x: 0,
                    y: 0,
                    initiative: 20,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                },
                {
                    id: "c-h",
                    actorId: "actor-h",
                    name: "Hunter",
                    tokenId: "token-h",
                    x: 100,
                    y: 0,
                    initiative: 10,
                    items: [],
                    inventory: {
                        equipment: { hands: { itemIds: [] }, torso: { itemIds: [] }, belt: { itemIds: [] } },
                        pack: { itemIds: [] }
                    }
                }
            ],
            plans: {
                "c-a": [{
                    id: "avoid",
                    actionId: "avoid",
                    type: "movement",
                    label: "Avoid",
                    apCost: 1,
                    movementFeetPerAp: 10,
                    requiresTarget: true,
                    targetId: "c-h",
                    isReaction: false,
                    reactionTriggerType: ""
                }],
                "c-h": []
            }
        });

        const avoiderToken = globalThis.canvas.scene.tokens.get("token-a");
        const encounter = new TurnOfTheCenturyEncounter(harness.combat);
        const timeline = await encounter.resolveEncounterRound({ tickDelayMs: 0 });

        const avoidEntry = timeline.find((entry) => entry.combatantId === "c-a" && entry.action?.id === "avoid");
        assert.ok(avoidEntry);
        assert.equal(String(avoidEntry?.outcome?.detail ?? "").includes("avoids"), true);
        assert.equal(Number(avoiderToken?.x ?? 0) < 0, true);
    });
});
