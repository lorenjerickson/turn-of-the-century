import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getCompendiumPacks,
    loadUnifiedCompendiumItems
} from "../../module/ui/workspace-v2/compendium-items.mjs";

function makePack({
    collection,
    label,
    documentName = "Item",
    entries = []
} = {}) {
    return {
        collection,
        documentName,
        metadata: { label },
        async getIndex() {
            return entries;
        }
    };
}

describe("unified compendium item loading", () => {
    it("uses starter item aggregate entries when typed static packs are absent", async () => {
        const result = await loadUnifiedCompendiumItems({
            gameReady: true,
            packs: [
                makePack({
                    collection: "turn-of-the-century.starter-items",
                    label: "Starter Library: Items",
                    entries: [{ _id: "lantern", name: "Bullseye Lantern", type: "equipment" }]
                })
            ]
        });

        assert.equal(result.ready, true);
        assert.deepEqual(result.entries, [{
            uuid: "Compendium.turn-of-the-century.starter-items.lantern",
            name: "Bullseye Lantern",
            type: "equipment",
            packLabel: "Starter Library: Items"
        }]);
    });

    it("prefers typed packs over starter aggregate duplicates", async () => {
        const result = await loadUnifiedCompendiumItems({
            gameReady: true,
            packs: [
                makePack({
                    collection: "turn-of-the-century.starter-items",
                    label: "Starter Library: Items",
                    entries: [{ _id: "starter-lantern", name: "Bullseye Lantern", type: "equipment" }]
                }),
                makePack({
                    collection: "turn-of-the-century.equipment",
                    label: "Equipment",
                    entries: [{ _id: "equipment-lantern", name: "Bullseye Lantern", type: "equipment" }]
                })
            ]
        });

        assert.equal(result.entries.length, 1);
        assert.deepEqual(result.entries[0], {
            uuid: "Compendium.turn-of-the-century.equipment.equipment-lantern",
            name: "Bullseye Lantern",
            type: "equipment",
            packLabel: "Equipment"
        });
    });

    it("reports not-ready instead of cacheable empty entries before packs hydrate", async () => {
        const result = await loadUnifiedCompendiumItems({
            gameReady: false,
            packs: []
        });

        assert.equal(result.ready, false);
        assert.deepEqual(result.entries, []);
    });

    it("reports not-ready when startup pack indexes have not populated yet", async () => {
        const result = await loadUnifiedCompendiumItems({
            gameReady: true,
            packs: [
                makePack({
                    collection: "turn-of-the-century.equipment",
                    label: "Equipment",
                    entries: []
                }),
                makePack({
                    collection: "turn-of-the-century.weapons",
                    label: "Weapons",
                    entries: []
                })
            ]
        });

        assert.equal(result.ready, false);
        assert.equal(result.itemPackCount, 2);
        assert.equal(result.loadedPackCount, 2);
        assert.equal(result.indexedEntryCount, 0);
        assert.deepEqual(result.entries, []);
    });

    it("reads pack maps as Foundry-style collection values", () => {
        const pack = makePack({ collection: "turn-of-the-century.equipment", label: "Equipment" });
        const packs = getCompendiumPacks(new Map([[pack.collection, pack]]));

        assert.deepEqual(packs, [pack]);
    });
});
