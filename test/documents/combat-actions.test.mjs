import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

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

        assert.deepEqual(actions.map((action) => action.id), ["move", "hunkDown", "dodge", "overwatch"]);
        assert.deepEqual(actions.map((action) => action.label), ["Move", "Hunker Down", "Dodge", "Overwatch"]);
        assert.equal(actions.every((action) => action.itemId === null), true);
        assert.equal(actions.find((action) => action.id === "move").movementFeetPerAp, 10);
    });
});
