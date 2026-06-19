import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
    buildItemIconUpdate,
    migrateTotcItemIcons
} from "../../module/migrations/item-icons.mjs";

function makeItem({
    id = "item-1",
    name = "Acid-Wash Solution",
    type = "consumable",
    img = "icons/consumables/potions/potion-vial-corked-red.webp"
} = {}) {
    return {
        id,
        name,
        type,
        img,
        updates: [],
        async update(changes) {
            this.updates.push(changes);
            Object.assign(this, changes);
            return this;
        }
    };
}

describe("item icon migration", () => {
    beforeEach(() => {
        globalThis.game = {
            ready: true,
            items: { contents: [] },
            actors: { contents: [] },
            packs: { filter: () => [] }
        };
        globalThis.ui = { notifications: { info: () => {} } };
    });

    it("replaces exact legacy and temporary generic icons", () => {
        assert.deepEqual(buildItemIconUpdate(makeItem()), {
            img: "modules/game-icons-net/blackbackground/acid-tube.svg"
        });
        assert.deepEqual(buildItemIconUpdate(makeItem({ img: "icons/svg/pill.svg" })), {
            img: "modules/game-icons-net/blackbackground/acid-tube.svg"
        });
    });

    it("preserves custom artwork and rejects mismatched item types", () => {
        assert.equal(buildItemIconUpdate(makeItem({ img: "worlds/my-world/assets/images/items/acid.webp" })), null);
        assert.equal(buildItemIconUpdate(makeItem({ type: "equipment" })), null);
        assert.equal(buildItemIconUpdate(makeItem({ name: "Homemade Acid" })), null);
    });

    it("updates world, embedded, and compendium items while preserving custom artwork", async () => {
        const worldItem = makeItem();
        const customItem = makeItem({ id: "custom", img: "worlds/my-world/assets/images/items/acid.webp" });
        const actorItem = makeItem({
            id: "actor-item",
            name: "Locksmith Roll",
            type: "equipment",
            img: "icons/svg/clockwork.svg"
        });
        const packItem = makeItem({
            id: "pack-item",
            name: "Wire Garrote",
            type: "weapon",
            img: "icons/weapons/swords/sword-thin-grey.webp"
        });
        const lockStates = [];
        const pack = {
            documentName: "Item",
            metadata: { packageType: "system" },
            collection: "turn-of-the-century.starter-items",
            locked: true,
            async configure({ locked }) {
                this.locked = locked;
                lockStates.push(locked);
            },
            async getDocuments() {
                return [packItem];
            }
        };

        game.items.contents = [worldItem, customItem];
        game.actors.contents = [{ name: "Ada", items: { contents: [actorItem] } }];
        game.packs.filter = (predicate) => [pack].filter(predicate);

        const report = await migrateTotcItemIcons({ notify: false, includeCompendiums: true });

        assert.equal(report.itemsScanned, 4);
        assert.equal(report.itemsUpdated, 3);
        assert.equal(worldItem.img, "modules/game-icons-net/blackbackground/acid-tube.svg");
        assert.equal(actorItem.img, "modules/game-icons-net/blackbackground/lockpicks.svg");
        assert.equal(packItem.img, "modules/game-icons-net/blackbackground/wire-coil.svg");
        assert.equal(customItem.updates.length, 0);
        assert.deepEqual(lockStates, [false, true]);
    });
});
