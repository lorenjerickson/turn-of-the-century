import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

class MockField { constructor(options) { this.options = options; } }
class MockArrayField extends MockField { constructor(element, options) { super(options); this.element = element; } }
class MockSchemaField extends MockField { constructor(fields) { super(); this.fields = fields; } }

beforeEach(() => {
    globalThis.foundry = {
        documents: {
            Combat: class {},
            ChatMessage: {
                getWhisperRecipients: () => []
            }
        },
        utils: {
            deepClone: (value) => structuredClone(value)
        },
        data: {
            fields: {
                ArrayField: MockArrayField,
                BooleanField: MockField,
                HTMLField: MockField,
                NumberField: MockField,
                SchemaField: MockSchemaField,
                StringField: MockField
            }
        }
    };
    globalThis.game = {
        settings: {
            get: (_scope, key) => {
                if (key === "encounterActionPointBudget") return 6;
                if (key === "encounterMovementFeetPerAp") return 10;
                return undefined;
            }
        }
    };
    globalThis.Hooks = { callAll: () => {} };
    globalThis.ChatMessage = globalThis.foundry.documents.ChatMessage;
    globalThis.Combat = globalThis.foundry.documents.Combat;
});

async function loadCombatModule() {
    const moduleUrl = new URL(`../../module/documents/combat.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

describe("TurnOfTheCenturyEncounter actions", () => {
    it("lists global AP actions for actors without item actions", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const combatant = {
            id: "combatant-1",
            actor: {
                items: { contents: [] },
                system: {}
            }
        };
        const combat = {
            id: "combat-1",
            round: 1,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            getFlag: () => null
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        const actions = encounter.getAvailableActionsForCombatant("combatant-1");

        assert.deepEqual(actions.map((action) => action.id), ["move", "open", "pursue", "follow", "avoid", "wait", "hunkDown", "dodge", "overwatch"]);
        assert.deepEqual(actions.map((action) => action.label), ["Move", "Open", "Close With", "Follow", "Evade", "Wait", "Hunker Down", "Dodge", "Overwatch"]);
        assert.equal(actions.every((action) => action.itemId === null), true);
        assert.equal(actions.find((action) => action.id === "move").movementFeetPerAp, 10);
        assert.equal(actions.find((action) => action.id === "wait").requiresDuration, true);
        for (const id of ["pursue", "follow", "avoid"]) {
            assert.equal(actions.find((action) => action.id === id).requiresTarget, true, `${id} should require a target token`);
        }
    });

    it("lists actions for combatants found through the combatant collection", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const combatant = {
            id: "combatant-from-turns",
            actor: {
                items: { contents: [] },
                system: {}
            }
        };
        const combat = {
            id: "combat-1",
            round: 1,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            getFlag: () => null
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        const actions = encounter.getAvailableActionsForCombatant("combatant-from-turns");

        assert.deepEqual(actions.map((action) => action.id), ["move", "open", "pursue", "follow", "avoid", "wait", "hunkDown", "dodge", "overwatch"]);
        assert.equal(encounter.getCombatantState("combatant-from-turns")?.ready, false);
    });

    it("lists stored action variants from actor items", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const items = [
            {
                id: "weapon-1",
                name: "Service Revolver",
                type: "weapon",
                system: { description: "A reliable sidearm.", actions: { variants: [{ id: "weaponAttack", label: "Attack", type: "attack", apCost: 2, requiresToHit: true, toHitBonus: 1 }] } }
            },
            {
                id: "armor-1",
                name: "Pneumatic Bracer Rig",
                type: "armor",
                system: { description: "A braced defensive rig.", actions: { variants: [{ id: "braceBlock", label: "Brace Block", type: "defense", apCost: 1, requiresToHit: false }] } }
            },
            {
                id: "consumable-1",
                name: "Combat Morphia",
                type: "consumable",
                system: { description: "A fast stimulant.", actions: { variants: [{ id: "consumeItem", label: "Consume Item", type: "consumable", apCost: 3, requiresToHit: false }] } }
            },
            {
                id: "weapon-2",
                name: "Packed Knife",
                type: "weapon",
                system: { description: "Stored away.", actions: { variants: [{ id: "weaponAttack", label: "Attack", type: "attack", apCost: 2, requiresToHit: true }] } }
            },
            {
                id: "tool-1",
                name: "Field Tool",
                type: "tool",
                system: { description: "A field tool.", actions: { variants: [{ id: "toolUse", label: "Use Tool", type: "utility", apCost: 1, requiresToHit: false }] } }
            }
        ];
        const combatant = {
            id: "combatant-1",
            actor: {
                items: { contents: items },
                system: {
                    inventory: {
                        equipment: {
                            hands: { itemIds: ["weapon-1"] },
                            torso: { itemIds: ["armor-1"] },
                            belt: { itemIds: ["consumable-1"] }
                        },
                        pack: { itemIds: ["weapon-2"] }
                    }
                }
            }
        };
        const combat = {
            id: "combat-1",
            round: 1,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            getFlag: () => null
        };

        const encounter = new TurnOfTheCenturyEncounter(combat);
        const actions = encounter.getAvailableActionsForCombatant("combatant-1");
        const itemActions = actions.filter((action) => action.itemId);

        assert.deepEqual(itemActions.map((action) => action.id), [
            "weapon-1:weaponAttack",
            "armor-1:braceBlock",
            "consumable-1:consumeItem",
            "weapon-2:weaponAttack",
            "tool-1:toolUse"
        ]);
        assert.deepEqual(itemActions.map((action) => action.label), [
            "Service Revolver: Attack",
            "Pneumatic Bracer Rig: Brace Block",
            "Combat Morphia: Consume Item",
            "Packed Knife: Attack",
            "Field Tool: Use Tool"
        ]);
        assert.equal(itemActions.find((action) => action.itemId === "consumable-1").apCost, 3);
        assert.equal(actions.some((action) => action.id === "weapon-2:weaponAttack"), true);
        assert.equal(actions.some((action) => action.id === "tool-1:toolUse"), true);
    });

    it("locks accepted roll actions and preserves their planning timeline until the GM reopens planning", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const combatant = {
            id: "combatant-1",
            initiative: 12,
            actor: { isOwner: true, items: { contents: [] }, system: {} }
        };
        let storedState = {
            phase: "planning",
            apBudget: 6,
            round: 1,
            perCombatant: {
                [combatant.id]: { plan: [], ready: false, committedAt: 0 }
            }
        };
        const combat = {
            id: "combat-1",
            round: 1,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            getFlag: () => storedState,
            setFlag: async (_scope, _key, state) => { storedState = structuredClone(state); }
        };
        globalThis.game.user = { id: "player-1", isGM: false };
        const encounter = new TurnOfTheCenturyEncounter(combat);
        await encounter.setCombatantPlan(combatant.id, [
            { id: "move", type: "movement", label: "Move", apCost: 1 },
            { id: "strike", type: "attack", label: "Strike", apCost: 2, requiresToHit: true },
            { id: "dodge", type: "defense", label: "Dodge", apCost: 1 }
        ]);
        await encounter.lockCombatantActionRoll(combatant.id, 1, { requestId: "roll-1", result: { total: 18 } });
        await encounter.lockCombatantActionRoll(combatant.id, 1, { requestId: "roll-1", result: { total: 18 } });

        assert.equal(encounter.getCombatantPlan(combatant.id)[1].planningLocked, true);
        assert.equal(encounter.getCombatantPlan(combatant.id)[1].planningRollResults.length, 1);
        await assert.rejects(() => encounter.removeCombatantAction(combatant.id, 1), /locked by an accepted roll/i);
        await assert.rejects(() => encounter.removeCombatantAction(combatant.id, 0), /locked by an accepted roll/i);
        await assert.rejects(
            () => encounter.setCombatantPlan(combatant.id, encounter.getCombatantPlan(combatant.id).slice(0, 1)),
            /lock this part/i
        );

        await encounter.clearCombatantPlan(combatant.id);
        assert.deepEqual(encounter.getCombatantPlan(combatant.id).map((action) => action.id), ["move", "strike"]);

        storedState.phase = "locked";
        globalThis.game.user.isGM = true;
        await encounter.setEncounterPhase("planning");
        assert.equal(encounter.getCombatantPlan(combatant.id)[1].planningLocked, false);
        await encounter.removeCombatantAction(combatant.id, 1);
        assert.deepEqual(encounter.getCombatantPlan(combatant.id).map((action) => action.id), ["move"]);
    });

    it("blocks encounter resolution while player-owned attack rolls are unresolved", async () => {
        const { TurnOfTheCenturyEncounter } = await loadCombatModule();
        const combatant = {
            id: "combatant-1",
            name: "Ada",
            initiative: 12,
            actor: {
                ownership: { "player-1": 3 },
                testUserPermission: (user, permission) => user?.id === "player-1" && permission === "OWNER",
                items: { contents: [] },
                system: {}
            }
        };
        let storedState = {
            phase: "planning",
            apBudget: 6,
            round: 1,
            perCombatant: {
                [combatant.id]: {
                    plan: [
                        { id: "strike", type: "attack", label: "Strike", apCost: 2, requiresToHit: true, planningRollResults: [] }
                    ],
                    ready: true,
                    committedAt: 12345
                }
            }
        };
        const combat = {
            id: "combat-1",
            round: 1,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            getFlag: () => storedState,
            setFlag: async (_scope, _key, state) => { storedState = structuredClone(state); }
        };
        globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
        globalThis.game.user = { id: "gm-1", isGM: true };
        globalThis.game.users = [
            { id: "gm-1", isGM: true, active: true },
            { id: "player-1", isGM: false, active: true }
        ];

        const encounter = new TurnOfTheCenturyEncounter(combat);

        await assert.rejects(
            () => encounter.beginEncounterResolution(),
            /Required player planning rolls/
        );
    });
});
