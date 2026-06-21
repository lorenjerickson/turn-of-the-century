import assert from "node:assert/strict";
import test from "node:test";

import { applyLocalPlanningTokenPath } from "../../module/encounters/planning-token-preview.mjs";

test("animates an A* planning path locally without broadcasting document updates", async () => {
    const sourceUpdates = [];
    const animations = [];
    const renderFlags = [];
    const perceptionUpdates = [];
    const documentUpdates = [];
    const document = {
        x: 0,
        y: 0,
        update: (change) => documentUpdates.push(change),
        updateSource(change) {
            sourceUpdates.push({ ...change });
            Object.assign(this, change);
        }
    };
    const token = {
        document,
        animate: async (position) => animations.push({ ...position }),
        renderFlags: { set: (flags) => renderFlags.push(flags) }
    };

    const applied = await applyLocalPlanningTokenPath(token, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
    ], { canvas: { perception: { update: (flags) => perceptionUpdates.push(flags) } } });

    assert.equal(applied, true);
    assert.deepEqual(animations, [{ x: 100, y: 0 }, { x: 100, y: 100 }]);
    assert.deepEqual(sourceUpdates, animations);
    assert.deepEqual(renderFlags, [{ refreshPosition: true }, { refreshPosition: true }]);
    assert.deepEqual(documentUpdates, []);
    assert.deepEqual(perceptionUpdates, [{ initializeVision: true, refreshVision: true }]);
});

test("accepts a TokenDocument and uses its live placeable", async () => {
    const sourceUpdates = [];
    const document = {
        x: 0,
        y: 0,
        updateSource: (change) => sourceUpdates.push(change),
        object: { renderFlags: { set() {} } }
    };

    assert.equal(await applyLocalPlanningTokenPath(document, [{ x: 0, y: 0 }, { x: 50, y: 0 }]), true);
    assert.deepEqual(sourceUpdates, [{ x: 50, y: 0 }]);
});
