import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveActionRangeFeet, resolveActionRangeType } from "../../module/encounters/action-range.mjs";

describe("encounter action range", () => {
    it("uses explicit action targeting range, including self range", () => {
        const item = { system: { classification: "firearm", physical: { range: { normal: 40, long: 120 } } } };

        assert.equal(resolveActionRangeFeet({ targetingRangeFeet: 0, rangeType: "normal" }, item), 0);
        assert.equal(resolveActionRangeFeet({ targetingRangeFeet: 15, rangeType: "normal" }, item), 15);
    });

    it("defaults melee weapons to 5 feet even when an action is incorrectly marked normal range", () => {
        const knife = { system: { classification: "simpleMelee" } };

        assert.equal(resolveActionRangeType({ rangeType: "normal" }, knife), "normal");
        assert.equal(resolveActionRangeFeet({ rangeType: "normal" }, knife), 5);
    });

    it("uses physical range for reach and thrown melee weapons", () => {
        const spear = { system: { classification: "simpleMelee", physical: { range: { normal: 10, long: 20 } } } };

        assert.equal(resolveActionRangeFeet({ rangeType: "melee" }, spear), 10);
        assert.equal(resolveActionRangeFeet({ rangeType: "long" }, spear), 20);
    });

    it("defaults ranged weapons to normal range when the action omits range type", () => {
        const revolver = { system: { classification: "firearm", physical: { range: { normal: 40, long: 120 } } } };

        assert.equal(resolveActionRangeType({}, revolver), "normal");
        assert.equal(resolveActionRangeFeet({}, revolver), 40);
    });
});
