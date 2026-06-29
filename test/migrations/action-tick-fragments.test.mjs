import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
    buildTickFragmentVariantUpdate,
    migrateTotcActionTickFragments
} from "../../module/migrations/action-tick-fragments.mjs";

function createItem({ id, name, type = "weapon", variants = [] }) {
    return {
        id,
        name,
        type,
        system: {
            actions: {
                variants: structuredClone(variants)
            }
        },
        updates: [],
        async update(data) {
            this.updates.push(data);
            if (data["system.actions.variants"]) {
                this.system.actions.variants = data["system.actions.variants"];
            }
        }
    };
}

function createPack(documents) {
    return {
        collection: "turn-of-the-century.test-items",
        documentName: "Item",
        metadata: { packageType: "system" },
        locked: true,
        lockStates: [],
        async configure(update) {
            this.lockStates.push(update.locked);
            this.locked = update.locked;
        },
        async getDocuments() {
            return documents;
        }
    };
}

beforeEach(() => {
    globalThis.game = {
        ready: true,
        items: { contents: [] },
        actors: { contents: [] },
        packs: []
    };
    globalThis.ui = {
        notifications: {
            info: () => {}
        }
    };
});

describe("action tick fragment migration", () => {
    it("builds a variant update without overwriting existing fragments", () => {
        const item = createItem({
            id: "weapon-1",
            name: "Service Revolver",
            variants: [
                { id: "pistolQuickShot", apCost: 2 },
                { id: "pistolAimedShot", apCost: 3, tickNarrativeFragments: ["Custom aim."] }
            ]
        });

        const quickShot = buildTickFragmentVariantUpdate(item, item.system.actions.variants[0]);
        const aimedShot = buildTickFragmentVariantUpdate(item, item.system.actions.variants[1]);

        assert.equal(quickShot.tickNarrativeFragments.length, 2);
        assert.equal(aimedShot, null);
    });

    it("updates world, actor, and system compendium item actions", async () => {
        const worldItem = createItem({
            id: "world-weapon",
            name: "Service Revolver",
            variants: [{ id: "pistolQuickShot", apCost: 2 }]
        });
        const actorItem = createItem({
            id: "actor-tool",
            name: "Locksmith Roll",
            type: "equipment",
            variants: [{ id: "unlock", apCost: 2 }]
        });
        const compendiumItem = createItem({
            id: "pack-elixir",
            name: "Aetheric Elixir",
            type: "consumable",
            variants: [{ id: "consumeBeltElixir", apCost: 2 }]
        });
        const pack = createPack([compendiumItem]);

        game.items.contents = [worldItem];
        game.actors.contents = [{ name: "Mallory", items: { contents: [actorItem] } }];
        game.packs = [pack];

        const report = await migrateTotcActionTickFragments({ notify: false });

        assert.equal(report.itemsScanned, 3);
        assert.equal(report.itemsUpdated, 3);
        assert.equal(worldItem.system.actions.variants[0].tickNarrativeFragments.length, 2);
        assert.equal(actorItem.system.actions.variants[0].tickNarrativeFragments.length, 2);
        assert.equal(compendiumItem.system.actions.variants[0].tickNarrativeFragments.length, 2);
        assert.deepEqual(pack.lockStates, [false, true]);
        assert.deepEqual(
            report.changedDocuments.map((document) => document.source),
            ["world-item", "actor:Mallory", "turn-of-the-century.test-items"]
        );
    });

    it("reports dry-run changes without mutating items or unlocking packs", async () => {
        const worldItem = createItem({
            id: "world-weapon",
            name: "Service Revolver",
            variants: [{ id: "pistolQuickShot", apCost: 2 }]
        });
        const packItem = createItem({
            id: "pack-tool",
            name: "Locksmith Roll",
            type: "equipment",
            variants: [{ id: "unlock", apCost: 2 }]
        });
        const pack = createPack([packItem]);

        game.items.contents = [worldItem];
        game.packs = [pack];

        const report = await migrateTotcActionTickFragments({ dryRun: true, notify: false });

        assert.equal(report.itemsUpdated, 2);
        assert.equal(worldItem.updates.length, 0);
        assert.equal(packItem.updates.length, 0);
        assert.deepEqual(pack.lockStates, []);
    });
});
