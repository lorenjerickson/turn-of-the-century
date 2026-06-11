import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

before(() => {
    class MockDocument {
        static called = null;
        static _addDataFieldMigration(data, oldKey, newKey, apply) {
            this.called = { data, oldKey, newKey, apply };
            return true;
        }
    }
    globalThis.foundry = {
        documents: {
            Item: class extends MockDocument {},
            Actor: class extends MockDocument {}
        }
    };
});

describe("Document migration overrides", async () => {
    const { TurnOfTheCenturyItem } = await import("../module/documents/item.mjs");
    const { TurnOfTheCenturyActor } = await import("../module/documents/actor.mjs");

    it("suppresses flags.exportSource migration on items", () => {
        TurnOfTheCenturyItem.called = null;
        const data = { flags: { exportSource: {} } };
        const result = TurnOfTheCenturyItem._addDataFieldMigration(data, "flags.exportSource", "_stats.exportSource");
        assert.equal(result, false);
        assert.equal(TurnOfTheCenturyItem.called, null);
    });

    it("passes through other field migrations on items", () => {
        TurnOfTheCenturyItem.called = null;
        const data = { flags: { other: {} } };
        const result = TurnOfTheCenturyItem._addDataFieldMigration(data, "flags.other", "flags.newOther");
        assert.equal(result, true);
        assert.deepEqual(TurnOfTheCenturyItem.called, {
            data,
            oldKey: "flags.other",
            newKey: "flags.newOther",
            apply: undefined
        });
    });

    it("suppresses flags.exportSource migration on actors", () => {
        TurnOfTheCenturyActor.called = null;
        const data = { flags: { exportSource: {} } };
        const result = TurnOfTheCenturyActor._addDataFieldMigration(data, "flags.exportSource", "_stats.exportSource");
        assert.equal(result, false);
        assert.equal(TurnOfTheCenturyActor.called, null);
    });

    it("passes through other field migrations on actors", () => {
        TurnOfTheCenturyActor.called = null;
        const data = { flags: { other: {} } };
        const result = TurnOfTheCenturyActor._addDataFieldMigration(data, "flags.other", "flags.newOther");
        assert.equal(result, true);
        assert.deepEqual(TurnOfTheCenturyActor.called, {
            data,
            oldKey: "flags.other",
            newKey: "flags.newOther",
            apply: undefined
        });
    });
});
