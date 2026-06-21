import assert from "node:assert/strict";
import test from "node:test";

import { PlanningVisibilityLock } from "../module/planning-visibility-lock.mjs";

function setup({ isGM = false, phase = "planning", tokenVision = true } = {}) {
    const visibleToken = { id: "visible", visible: true };
    const concealedToken = { id: "concealed", visible: false };
    const perceptionUpdates = [];
    const game = {
        user: { isGM },
        combat: null
    };
    const canvas = {
        ready: true,
        scene: { id: "scene-1", tokenVision },
        tokens: { placeables: [visibleToken, concealedToken] },
        perception: {
            update: (flags) => perceptionUpdates.push(flags)
        }
    };
    const combat = {
        id: "combat-1",
        scene: { id: "scene-1" },
        encounterState: { phase, round: 3 }
    };
    game.combat = combat;
    return { canvas, combat, concealedToken, game, perceptionUpdates, visibleToken };
}

test("captures tokens hidden when planning begins and conceals them after a door reveals them", () => {
    const context = setup();
    const lock = new PlanningVisibilityLock(context);

    assert.equal(lock.sync(context.combat), true);
    assert.deepEqual([...lock.concealedTokenIds], ["concealed"]);

    context.concealedToken.visible = true;
    assert.equal(lock.enforceToken(context.concealedToken), true);
    assert.equal(context.concealedToken.visible, false);
    assert.equal(context.visibleToken.visible, true);
    assert.equal(lock.enforceToken(context.visibleToken), false);
});

test("keeps the planning snapshot through the locked phase", () => {
    const context = setup();
    const lock = new PlanningVisibilityLock(context);
    lock.sync(context.combat);

    context.concealedToken.visible = true;
    context.combat.encounterState.phase = "locked";
    lock.sync(context.combat);

    assert.equal(lock.active, true);
    assert.equal(context.concealedToken.visible, false);
});

test("releases concealed tokens and requests native vision refresh when resolution begins", () => {
    const context = setup();
    const lock = new PlanningVisibilityLock(context);
    lock.sync(context.combat);

    context.combat.encounterState.phase = "resolving";
    assert.equal(lock.sync(context.combat), false);

    assert.equal(lock.active, false);
    assert.deepEqual([...lock.concealedTokenIds], []);
    assert.deepEqual(context.perceptionUpdates, [{ refreshVision: true }]);
});

test("does not conceal tokens for a gamemaster or on scenes without token vision", () => {
    for (const options of [{ isGM: true }, { tokenVision: false }]) {
        const context = setup(options);
        const lock = new PlanningVisibilityLock(context);
        assert.equal(lock.sync(context.combat), false);
        assert.equal(lock.active, false);
    }
});

test("starts a fresh visibility snapshot for a later round", () => {
    const context = setup();
    const lock = new PlanningVisibilityLock(context);
    lock.sync(context.combat);
    context.combat.encounterState.phase = "resolving";
    lock.sync(context.combat);

    context.visibleToken.visible = false;
    context.concealedToken.visible = true;
    context.combat.encounterState = { phase: "planning", round: 4 };
    lock.sync(context.combat);

    assert.deepEqual([...lock.concealedTokenIds], ["visible"]);
});

test("resolves Foundry globals lazily when constructed during system loading", () => {
    const context = setup();
    const priorGame = globalThis.game;
    const priorCanvas = globalThis.canvas;
    try {
        globalThis.game = context.game;
        globalThis.canvas = context.canvas;
        const lock = new PlanningVisibilityLock();
        assert.equal(lock.sync(), true);
        assert.deepEqual([...lock.concealedTokenIds], ["concealed"]);
    } finally {
        globalThis.game = priorGame;
        globalThis.canvas = priorCanvas;
    }
});
