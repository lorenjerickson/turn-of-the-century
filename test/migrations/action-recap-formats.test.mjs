import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

before(() => {
    globalThis.game = {
        ready: true,
        user: { isGM: true },
        items: { contents: [] },
        actors: { contents: [] },
        packs: {
            filter: () => []
        }
    };
    globalThis.ui = { notifications: { info: () => {} } };
});

describe("recap-format migration", () => {
    it("backfills missing recapFormat values on existing action variants", async () => {
        const { migrateTotcActionRecapFormats } = await import("../../module/migrations/action-recap-formats.mjs");

        const worldItemUpdates = [];
        const actorItemUpdates = [];
        const packItemUpdates = [];

        const worldItem = {
            id: "world-weapon",
            name: "Old Revolver",
            type: "weapon",
            system: {
                actions: {
                    variants: [{ id: "weaponAttack", type: "attack", label: "Attack", apCost: 2, requiresToHit: true, toHitBonus: 0, notes: "" }]
                }
            },
            async update(changes) {
                worldItemUpdates.push(changes);
                Object.assign(this.system.actions, { variants: changes["system.actions.variants"] });
            }
        };

        const actorItem = {
            id: "actor-tool",
            name: "Old Satchel",
            type: "item",
            system: {
                actions: {
                    variants: [{ id: "useItem", type: "utility", label: "Use Item", apCost: 1, requiresToHit: false, toHitBonus: 0, notes: "" }]
                }
            },
            async update(changes) {
                actorItemUpdates.push(changes);
                Object.assign(this.system.actions, { variants: changes["system.actions.variants"] });
            }
        };

        const packItem = {
            id: "pack-consumable",
            name: "Old Tonic",
            type: "consumable",
            system: {
                actions: {
                    variants: [{ id: "consumeItem", type: "consumable", label: "Consume Item", apCost: 1, requiresToHit: false, toHitBonus: 0, notes: "" }]
                }
            },
            async update(changes) {
                packItemUpdates.push(changes);
                Object.assign(this.system.actions, { variants: changes["system.actions.variants"] });
            }
        };

        globalThis.game.items.contents = [worldItem];
        globalThis.game.actors.contents = [{ items: { contents: [actorItem] }, name: "Actor" }];
        globalThis.game.packs.filter = () => [{
            documentName: "Item",
            metadata: { packageType: "system" },
            collection: "turn-of-the-century.starter-items",
            locked: false,
            getDocuments: async () => [packItem]
        }];

        const report = await migrateTotcActionRecapFormats({ dryRun: false, notify: false, includeCompendiums: true });

        assert.equal(report.itemsUpdated, 3);
        assert.equal(worldItemUpdates.length, 1);
        assert.equal(actorItemUpdates.length, 1);
        assert.equal(packItemUpdates.length, 1);
        assert.equal(worldItem.system.actions.variants[0].recapFormat, "{{Owner.name}} uses {{Item.name}} on {{Target.name}} and {{action.hitResult}}.");
        assert.equal(actorItem.system.actions.variants[0].recapFormat, "{{Owner.name}} uses {{Item.name}}.");
        assert.equal(packItem.system.actions.variants[0].recapFormat, "{{Owner.name}} uses {{Item.name}}.");
    });
});