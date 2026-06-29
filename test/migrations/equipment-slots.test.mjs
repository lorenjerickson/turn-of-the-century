import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

class MockField { constructor(options) { this.options = options; } }
class MockArrayField extends MockField { constructor(element, options) { super(options); this.element = element; } }
class MockSchemaField extends MockField { constructor(fields) { super(); this.fields = fields; } }

async function loadMigrationModule() {
    const moduleUrl = new URL(`../../module/migrations/equipment-slots.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

beforeEach(() => {
    globalThis.foundry = {
        abstract: { TypeDataModel: class {} },
        data: {
            fields: {
                ArrayField: MockArrayField,
                BooleanField: MockField,
                HTMLField: MockField,
                NumberField: MockField,
                SchemaField: MockSchemaField,
                StringField: MockField
            }
        },
        utils: {
            deepClone: (value) => structuredClone(value)
        }
    };
    globalThis.ui = { notifications: { info: () => {} } };
    globalThis.game = {
        ready: true,
        actors: { contents: [] },
        items: { contents: [] }
    };
});

describe("equipment-slot migration", () => {
    it("adds shared hand armor slots and moves equipped hand armor out of wield slots", async () => {
        const { migrateTotcEquipmentSlots } = await loadMigrationModule();
        const actorUpdates = [];
        const embeddedItemUpdates = [];
        const worldItemUpdates = [];
        const bracers = {
            id: "bracers",
            name: "Pneumatic Bracer Rig",
            type: "armor",
            system: { slot: "hands" },
            async update(changes) {
                embeddedItemUpdates.push(changes);
                Object.assign(this.system, { slot: changes["system.slot"] });
            }
        };
        const actor = {
            id: "actor-1",
            name: "Doctor Vale",
            type: "hero",
            system: {
                inventory: {
                    equipment: {
                        hands: {
                            label: "Hands",
                            capacity: 2,
                            quality: "standard",
                            allowedTypes: ["armor", "weapon", "tool", "equipment"],
                            itemIds: ["prod", "bracers"]
                        },
                        belt: { itemIds: [], capacity: 4, quality: "standard", allowedTypes: ["item"] }
                    }
                }
            },
            items: {
                contents: [
                    { id: "prod", name: "Galvanic Prod", type: "weapon", system: { slot: "hands" } },
                    bracers
                ]
            },
            async update(changes) {
                actorUpdates.push(changes);
            }
        };
        const worldHandArmor = {
            id: "world-bracers",
            name: "Spare Bracers",
            type: "armor",
            system: { slot: "hands" },
            async update(changes) {
                worldItemUpdates.push(changes);
            }
        };

        globalThis.game.actors.contents = [actor];
        globalThis.game.items.contents = [worldHandArmor];

        const report = await migrateTotcEquipmentSlots({ notify: false });

        assert.equal(report.actorsUpdated, 1);
        assert.equal(report.itemsUpdated, 2);
        assert.equal(actorUpdates.length, 1);
        assert.deepEqual(actorUpdates[0]["system.inventory.equipment.hands.itemIds"], ["prod"]);
        assert.deepEqual(actorUpdates[0]["system.inventory.equipment.hands.allowedTypes"], ["weapon", "tool", "equipment"]);
        assert.equal(actorUpdates[0]["system.inventory.equipment.handsArmor.label"], "Hand Armor");
        assert.deepEqual(actorUpdates[0]["system.inventory.equipment.handsArmor.allowedTypes"], ["armor"]);
        assert.deepEqual(actorUpdates[0]["system.inventory.equipment.handsArmor.itemIds"], ["bracers"]);
        assert.deepEqual(embeddedItemUpdates, [{ "system.slot": "handsArmor" }]);
        assert.deepEqual(worldItemUpdates, [{ "system.slot": "handsArmor" }]);
    });
});
