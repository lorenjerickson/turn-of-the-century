import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MarketController } from "../../module/ui/workspace-v2/controllers/market-controller.mjs";

function makeScene(flagValue = null) {
    return {
        name: "Rookery Market",
        flagValue,
        setFlags: [],
        getFlag() {
            return this.flagValue;
        },
        async setFlag(systemId, key, value) {
            this.setFlags.push({ systemId, key, value });
            this.flagValue = value;
        }
    };
}

function makeActor({ id = "actor-1", wallet = 20, items = [] } = {}) {
    return {
        id,
        name: "Ada",
        isOwner: true,
        system: { economy: { wallet: { gbp: wallet } } },
        updates: [],
        created: [],
        items: {
            contents: items,
            get: (itemId) => items.find((item) => item.id === itemId) ?? null,
            find: (predicate) => items.find(predicate)
        },
        async update(data) {
            this.updates.push(data);
            if (Object.hasOwn(data, "system.economy.wallet.gbp")) {
                this.system.economy.wallet.gbp = data["system.economy.wallet.gbp"];
            }
        },
        async createEmbeddedDocuments(type, documents) {
            this.created.push({ type, documents });
        }
    };
}

describe("MarketController", () => {
    it("builds market panel models from scene flags and selected actors", async () => {
        const actor = makeActor({ wallet: 12 });
        const scene = makeScene({
            title: "Night Market",
            summary: "Strange inventory.",
            generatedAt: 1,
            sellRate: 0.5,
            offers: [
                { id: "offer-1", name: "Lantern", type: "equipment", price: 5, stock: 3, currency: "pounds" }
            ]
        });
        const controller = new MarketController({
            getScene: () => scene,
            getActors: () => [actor],
            getUser: () => ({ isGM: true }),
            getPanelState: () => ({ selectedBuyerActorId: "" }),
            setPanelStatePatch: async (patch) => {
                assert.deepEqual(patch, { selectedBuyerActorId: "actor-1" });
            }
        });

        const model = await controller.buildPanelModel({ scene, compendiumItems: [{ id: "c" }] });

        assert.equal(model.title, "Night Market");
        assert.equal(model.walletLabel, "12 pounds");
        assert.equal(model.offers[0].maxBuyQty, 2);
        assert.equal(model.offers[0].canBuy, true);
        assert.equal(model.actors[0].selected, true);
    });

    it("generates market offer boards from compendium entries", async () => {
        const scene = makeScene();
        const announced = [];
        const controller = new MarketController({
            getScene: () => scene,
            getUser: () => ({ id: "gm", isGM: true }),
            getCompendiumItems: async () => [{ uuid: "Item.foo", name: "Lantern", type: "equipment", packLabel: "Gear" }],
            fromUuid: async () => ({ type: "equipment", system: { value: { price: 10, currency: "pounds" } } }),
            foundryRef: () => ({ utils: { randomID: () => "market-id" } }),
            random: () => 0,
            announce: async (message) => announced.push(message)
        });

        await controller.generateOfferBoard();

        assert.equal(scene.setFlags[0].key, "workspaceV2Market");
        assert.equal(scene.setFlags[0].value.offers[0].name, "Lantern");
        assert.equal(scene.setFlags[0].value.offers[0].price, 11);
        assert.equal(announced[0].title, "Market Generated");
    });

    it("buys market items and updates wallet, stock, and actor inventory", async () => {
        const actor = makeActor({ wallet: 20 });
        const scene = makeScene({
            offers: [
                { id: "offer-1", uuid: "Item.lantern", name: "Lantern", type: "equipment", price: 5, basePrice: 4, stock: 3, currency: "pounds" }
            ]
        });
        const notifications = [];
        const controller = new MarketController({
            getScene: () => scene,
            getActors: () => [actor],
            getUser: () => ({ isGM: true }),
            getPanelState: () => ({ selectedBuyerActorId: actor.id }),
            fromUuid: async () => ({
                toObject: () => ({ _id: "source", name: "Lantern", type: "equipment", system: { physical: {}, value: {} } })
            }),
            uiRef: () => ({ notifications: { info: (message) => notifications.push(message), warn: (message) => notifications.push(message) } })
        });

        await controller.handleBuy("offer-1", 2);

        assert.equal(actor.system.economy.wallet.gbp, 10);
        assert.equal(actor.created[0].type, "Item");
        assert.equal(actor.created[0].documents[0].system.physical.quantity, 2);
        assert.equal(scene.flagValue.offers[0].stock, 1);
        assert.match(notifications[0], /purchased 2 Lantern/);
    });

    it("sells actor items and adds them to market stock", async () => {
        const item = {
            id: "item-1",
            name: "Knife",
            type: "weapon",
            system: { physical: { quantity: 3 }, value: { price: 10, currency: "pounds" } },
            updates: [],
            async update(data) {
                this.updates.push(data);
                this.system.physical.quantity = data["system.physical.quantity"];
            }
        };
        const actor = makeActor({ wallet: 0, items: [item] });
        const scene = makeScene({
            sellRate: 0.5,
            buyMarkup: 1.2,
            offers: [{ id: "existing", name: "Rope", type: "equipment", price: 2, basePrice: 1, stock: 1 }]
        });
        const controller = new MarketController({
            getScene: () => scene,
            getActors: () => [actor],
            getUser: () => ({ isGM: true }),
            getPanelState: () => ({ selectedBuyerActorId: actor.id }),
            foundryRef: () => ({ utils: { randomID: () => "sold-offer" } }),
            uiRef: () => ({ notifications: { info: () => {}, warn: () => {} } })
        });

        await controller.handleSell("item-1", 2);

        assert.equal(item.system.physical.quantity, 1);
        assert.equal(actor.system.economy.wallet.gbp, 10);
        assert.equal(scene.flagValue.offers.at(-1).name, "Knife");
        assert.equal(scene.flagValue.offers.at(-1).stock, 2);
    });
});
