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

        assert.deepEqual(actions.map((action) => action.id), ["move", "open", "pursue", "follow", "avoid", "hunkDown", "dodge", "overwatch"]);
        assert.deepEqual(actions.map((action) => action.label), ["Move", "Open", "Pursue", "Follow", "Avoid", "Hunker Down", "Dodge", "Overwatch"]);
        assert.equal(actions.every((action) => action.itemId === null), true);
        assert.equal(actions.find((action) => action.id === "move").movementFeetPerAp, 10);
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

        assert.deepEqual(actions.map((action) => action.id), ["move", "open", "pursue", "follow", "avoid", "hunkDown", "dodge", "overwatch"]);
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
});
