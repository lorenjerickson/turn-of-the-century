import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
    buildUnlockActionMigrationUpdate,
    migrateTotcUnlockActions
} from "../../module/migrations/unlock-actions.mjs";

function item(name, { id = name, variants = [] } = {}) {
    return {
        id,
        name,
        type: name === "Acid-Wash Solution" ? "consumable" : "equipment",
        system: { actions: { defaultActionId: variants[0]?.id ?? "", variants: structuredClone(variants) } },
        updates: [],
        async update(changes) {
            this.updates.push(changes);
            this.system.actions.defaultActionId = changes["system.actions.defaultActionId"];
            this.system.actions.variants = structuredClone(changes["system.actions.variants"]);
        }
    };
}

beforeEach(() => {
    globalThis.game = {
        ready: true,
        items: { contents: [] },
        actors: { contents: [] },
        packs: { filter: () => [] }
    };
    globalThis.ui = { notifications: { info: () => {} } };
});

describe("unlock-action migration", () => {
    it("preserves existing actions and adds Unlock to compatible item identities", () => {
        const useItem = { id: "useItem", label: "Use Item", type: "utility", apCost: 1 };
        const update = buildUnlockActionMigrationUpdate(item("Locksmith Roll", { variants: [useItem] }));

        assert.equal(update["system.actions.defaultActionId"], "useItem");
        assert.deepEqual(update["system.actions.variants"][0], useItem);
        assert.equal(update["system.actions.variants"][1].id, "unlock");
        assert.equal(update["system.actions.variants"][1].apCost, 2);
        assert.equal(buildUnlockActionMigrationUpdate(item("Pocket Tool Roll", { variants: [useItem] })), null);
    });

    it("updates standalone and actor-embedded compatible items and is idempotent", async () => {
        const useItem = { id: "useItem", label: "Use Item", type: "utility", apCost: 1 };
        const worldItem = item("Folding Pry Hook", { variants: [useItem] });
        const equippedActorItem = item("Locksmith Roll", { variants: [useItem] });
        const actor = {
            name: "Existing Investigator",
            system: { inventory: { equipment: { belt: { itemIds: [equippedActorItem.id] } } } },
            items: { contents: [equippedActorItem] }
        };
        game.items.contents = [worldItem];
        game.actors.contents = [actor];

        const first = await migrateTotcUnlockActions({ notify: false, includeCompendiums: false });
        const second = await migrateTotcUnlockActions({ notify: false, includeCompendiums: false });

        assert.equal(first.itemsUpdated, 2);
        assert.equal(second.itemsUpdated, 0);
        assert.equal(worldItem.system.actions.variants.some((action) => action.id === "unlock"), true);
        assert.equal(equippedActorItem.system.actions.variants.some((action) => action.id === "unlock"), true);
        assert.equal(equippedActorItem.updates.length, 1);
    });
});
