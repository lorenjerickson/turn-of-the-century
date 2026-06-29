import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MovementResolver } from "../../module/encounters/movement-resolver.mjs";

// ---------------------------------------------------------------------------
// findGridMovementPath is imported directly by MovementResolver (pure module).
// The resolver requires no Foundry globals; only the injected ports use them.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scene / token helpers
//
// Grid size 100 px, 5 ft per square → 10 ft/AP covers 2 squares (200 px).
// Cell positions snap to multiples of 100 so arithmetic is straightforward.
// ---------------------------------------------------------------------------

/** A minimal open scene (no walls) with a predictable grid. */
const OPEN_SCENE = Object.freeze({
    grid: { size: 100, distance: 5 },
    shiftX: 0,
    shiftY: 0
});

function makeToken(id, x, y, { parent = null } = {}) {
    return { id, _id: id, x, y, parent };
}

function makeCombatant(id, token) {
    return { id, token };
}

function makeAction(overrides = {}) {
    return {
        type: "movement",
        id: "move",
        actionId: "move",
        apCost: 1,
        movementFeetPerAp: 10,
        movementTargetX: 0,
        movementTargetY: 0,
        ...overrides
    };
}

function makeResolver({
    combatants = new Map(),
    movementFeetPerAp = 10,
    scene = OPEN_SCENE
} = {}) {
    return new MovementResolver({
        resolveTokenDocument: (combatant) => combatant?.token ?? null,
        resolveDeclaredTarget: (sourceId, targetId) => {
            if (targetId) return combatants.get(targetId) ?? null;
            // If no targetId, return the first combatant that isn't source.
            for (const [id, c] of combatants) {
                if (id !== sourceId) return c;
            }
            return null;
        },
        getMovementFeetPerAp: () => movementFeetPerAp,
        getScene: () => scene
    });
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — guards", () => {
    it("returns null when combatant is null", () => {
        const resolver = makeResolver();
        const result = resolver.planMovement({ combatant: null, action: makeAction(), tokenPositions: null, tickEffects: [] });
        assert.equal(result, null);
    });

    it("returns null when action is null", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({ combatant, action: null, tokenPositions: null, tickEffects: [] });
        assert.equal(result, null);
    });

    it("returns null for a non-movement action type", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: { type: "attack", apCost: 2, movementTargetX: 500, movementTargetY: 0 },
            tokenPositions: null,
            tickEffects: []
        });
        assert.equal(result, null);
    });

    it("returns null when the token document cannot be resolved", () => {
        const combatant = makeCombatant("c1", null); // no token
        const resolver = makeResolver();
        const result = resolver.planMovement({ combatant, action: makeAction({ movementTargetX: 500 }), tokenPositions: null, tickEffects: [] });
        assert.equal(result, null);
    });

    it("returns null when start and target are the same cell (no path)", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        // Target is the same position — pathfinder returns a single-point path.
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ movementTargetX: 0, movementTargetY: 0 }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// Absolute movement
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — absolute movement", () => {
    it("returns the tokenId of the mover", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 1, movementTargetX: 200, movementTargetY: 0 }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.equal(result?.tokenId, "t1");
    });

    it("reaches the target in a single AP step when apCost=1", () => {
        // apCost=1, progress=1: stepDivisor=1, moves full path length.
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 1, _runtimeProgress: 1, movementTargetX: 200, movementTargetY: 0 }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.ok(result !== null, "expected a movement result");
        assert.ok(result.x > 0, `expected x > 0, got ${result.x}`);
    });

    it("moves only halfway for a 2-AP action on its first tick", () => {
        // apCost=2, progress=1: remainingSteps=1, stepDivisor=2.
        // Path from (0,0) to (200,0) — length 200. Distance = 200/2 = 100 → lands at (100,0).
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 2, _runtimeProgress: 1, movementTargetX: 200, movementTargetY: 0 }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.ok(result !== null, "expected a movement result");
        // Should be partway (not at the target yet).
        assert.ok(result.x > 0 && result.x < 200, `expected 0 < x < 200, got ${result.x}`);
    });

    it("keeps multi-AP movement ticks on grid waypoints", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 2, _runtimeProgress: 1, movementTargetX: 300, movementTargetY: 0 }),
            tokenPositions: null,
            tickEffects: []
        });

        assert.ok(result !== null, "expected a movement result");
        assert.notEqual(result.x, 150);
        assert.equal(result.x % 100, 0);
        assert.equal(result.y % 100, 0);
    });

    it("completes the remaining distance on the second tick of a 2-AP action", () => {
        // apCost=2, progress=2: remainingSteps=0, stepDivisor=1 → moves full remaining path.
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        // Provide tokenPositions showing position after first tick.
        const resolver = makeResolver();
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 2, _runtimeProgress: 2, movementTargetX: 200, movementTargetY: 0 }),
            tokenPositions: { t1: { x: 100, y: 0 } },
            tickEffects: []
        });
        assert.ok(result !== null, "expected a movement result on second tick");
        assert.ok(result.x > 100, `expected x > 100 on second tick, got ${result.x}`);
    });

    it("uses tokenPositions override instead of token document position", () => {
        const token = makeToken("t1", 0, 0);
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();
        // Override: token is actually at (300, 0) not (0, 0).
        const result = resolver.planMovement({
            combatant,
            action: makeAction({ apCost: 1, movementTargetX: 500, movementTargetY: 0 }),
            tokenPositions: { t1: { x: 300, y: 0 } },
            tickEffects: []
        });
        assert.ok(result !== null);
        assert.ok(result.x > 300, `expected movement from override position (300), got ${result.x}`);
    });
});

// ---------------------------------------------------------------------------
// Pursue
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — pursue", () => {
    it("moves toward the declared target's current position", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 400, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "pursue", actionId: "pursue", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.ok(result !== null, "expected pursuit movement");
        assert.ok(result.x > 0, `expected pursuit to move right, got x=${result.x}`);
    });

    it("does not move farther than the per-AP step when pursuing a distant token", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 800, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "pursue", actionId: "pursue", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: []
        });

        assert.ok(result !== null, "expected pursuit movement");
        assert.equal(result.x, 200);
        assert.equal(result.y, 0);
    });

    it("stops when it becomes adjacent to the pursued token", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 200, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "pursue", actionId: "pursue", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: []
        });

        assert.deepEqual(result, { tokenId: "t1", x: 100, y: 0 });
    });

    it("pursues the target's updated position from tokenPositions", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 100, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        // Target has moved to (300,0) during this tick.
        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "pursue", actionId: "pursue", apCost: 1, targetId: "c2" }),
            tokenPositions: { t2: { x: 300, y: 0 } },
            tickEffects: []
        });
        assert.ok(result !== null);
        assert.ok(result.x > 0, `expected pursuit toward updated target at x=300, got x=${result.x}`);
    });

    it("returns null when the declared target cannot be found", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const resolver = makeResolver({ combatants: new Map([["c1", mover]]) });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "pursue", actionId: "pursue", targetId: "missing" }),
            tokenPositions: null,
            tickEffects: []
        });
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// Implied order positioning
// ---------------------------------------------------------------------------

describe("MovementResolver.evaluateOrderPositioning — implied location movement", () => {
    it("builds a movement step toward a location-backed interaction target", () => {
        const token = makeToken("t1", 0, 0, { parent: OPEN_SCENE });
        const combatant = makeCombatant("c1", token);
        const resolver = makeResolver();

        const result = resolver.evaluateOrderPositioning({
            combatant,
            action: {
                id: "open",
                actionId: "open",
                type: "utility",
                label: "Open Door",
                intentType: "interactWithObject",
                apCost: 3,
                movementFeetPerAp: 10,
                targetX: 500,
                targetY: 0,
                apEnvelope: { positioningAp: 2, effectAp: 1, maxAp: 3 }
            },
            tokenPositions: null,
            tickEffects: []
        });

        assert.equal(result.applies, true);
        assert.equal(result.satisfied, false);
        assert.equal(result.movementAction.type, "movement");
        assert.equal(result.movementAction.actionId, "impliedMove");
        assert.equal(result.movementAction.movementTargetX, 500);
        assert.equal(result.movementAction.movementTargetY, 0);
        assert.equal(result.movementEffect.tokenId, "t1");
        assert.ok(result.movementEffect.x > 0, `expected movement toward target, got x=${result.movementEffect.x}`);
    });
});

// ---------------------------------------------------------------------------
// Avoid
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — avoid", () => {
    it("moves directly away from the declared target", () => {
        // Mover at (200,0), target moved to (100,0). Avoid should push mover rightward.
        const moverToken = makeToken("t1", 200, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        // Use a scene that has grid info for the avoid calculation.
        const resolver = makeResolver({
            combatants,
            scene: OPEN_SCENE
        });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "avoid", actionId: "avoid", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: [{ type: "movement", combatantId: "c2", tokenId: "t2", x: 100, y: 0 }]
        });
        assert.ok(result !== null, "expected avoidance movement");
        assert.ok(result.x > 200, `expected avoidance to move right (x > 200), got x=${result.x}`);
    });

    it("moves away from a stationary declared target", () => {
        const moverToken = makeToken("t1", 200, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants, scene: OPEN_SCENE });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "avoid", actionId: "avoid", apCost: 1, targetId: "c2" }),
            tokenPositions: null,
            tickEffects: []
        });

        assert.ok(result !== null, "expected avoidance movement");
        assert.ok(result.x > 200, `expected avoidance to move right (x > 200), got x=${result.x}`);
    });

    it("returns null when mover is at exactly the same position as the target", () => {
        const moverToken = makeToken("t1", 200, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 200, 0); // same position
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants, scene: OPEN_SCENE });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "avoid", actionId: "avoid", apCost: 1, targetId: "c2" }),
            tokenPositions: null,
            tickEffects: [{ type: "movement", combatantId: "c2", tokenId: "t2", x: 200, y: 0 }]
        });
        assert.equal(result, null);
    });

    it("treats evade as a named avoid movement", () => {
        const moverToken = makeToken("t1", 200, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants, scene: OPEN_SCENE });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "evade", actionId: "evade", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: [{ type: "movement", combatantId: "c2", tokenId: "t2", x: 100, y: 0 }]
        });

        assert.ok(result !== null, "expected evade movement");
        assert.ok(result.x > 200, `expected evade to move right (x > 200), got x=${result.x}`);
    });
});

// ---------------------------------------------------------------------------
// Follow
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — follow", () => {
    it("moves toward a stationary declared target", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 500, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "follow", actionId: "follow", apCost: 1, targetId: "c2", movementFeetPerAp: 10 }),
            tokenPositions: null,
            tickEffects: []
        });

        assert.ok(result !== null, "expected follow movement");
        assert.equal(result.x, 200);
        assert.equal(result.y, 0);
    });

    it("moves toward the target's updated position when the target moved this tick", () => {
        const moverToken = makeToken("t1", 200, 100);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 100);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const tickEffects = [
            { type: "movement", combatantId: "c2", tokenId: "t2", x: 0, y: 200 }
        ];

        const result = resolver.planMovement({
            combatant: mover,
            action: makeAction({ id: "follow", actionId: "follow", apCost: 1, targetId: "c2" }),
            tokenPositions: null,
            tickEffects
        });

        assert.ok(result !== null, "expected follower to move");
        const startDistance = Math.hypot(200 - 0, 100 - 200);
        const resultDistance = Math.hypot(result.x - 0, result.y - 200);
        assert.ok(resultDistance < startDistance, `expected follow to close distance to updated target, got ${resultDistance} >= ${startDistance}`);
    });
});

// ---------------------------------------------------------------------------
// Implied order positioning
// ---------------------------------------------------------------------------

describe("MovementResolver.evaluateOrderPositioning", () => {
    it("returns satisfied for an attack order already within weapon range", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);
        const targetToken = makeToken("t2", 100, 0);
        const target = makeCombatant("c2", targetToken);
        const resolver = makeResolver({ combatants: new Map([["c1", mover], ["c2", target]]) });

        const result = resolver.evaluateOrderPositioning({
            combatant: mover,
            action: {
                type: "attack",
                intentType: "attackTarget",
                label: "Strike",
                targetId: "c2",
                targetingRangeFeet: 5
            }
        });

        assert.equal(result.applies, true);
        assert.equal(result.satisfied, true);
        assert.equal(result.movementEffect, null);
    });

    it("plans pursue-style movement for an out-of-range attack order", () => {
        const moverToken = makeToken("t1", 0, 0);
        const mover = makeCombatant("c1", moverToken);
        const targetToken = makeToken("t2", 400, 0);
        const target = makeCombatant("c2", targetToken);
        const resolver = makeResolver({ combatants: new Map([["c1", mover], ["c2", target]]) });

        const result = resolver.evaluateOrderPositioning({
            combatant: mover,
            action: {
                id: "strike",
                actionId: "strike",
                type: "attack",
                intentType: "attackTarget",
                label: "Strike",
                targetId: "c2",
                targetingRangeFeet: 5,
                apCost: 4,
                movementFeetPerAp: 10
            }
        });

        assert.equal(result.applies, true);
        assert.equal(result.satisfied, false);
        assert.equal(result.movementAction.actionId, "pursue");
        assert.equal(result.movementEffect.tokenId, "t1");
        assert.ok(result.movementEffect.x > 0);
    });
});
