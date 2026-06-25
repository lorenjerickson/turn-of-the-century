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
// Avoid
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — avoid", () => {
    it("moves directly away from the declared target", () => {
        // Mover at (200,0), target at (0,0). Avoid should push mover rightward.
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
            tickEffects: []
        });
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// Follow
// ---------------------------------------------------------------------------

describe("MovementResolver.planMovement — follow", () => {
    it("initializes the follow offset on first call", () => {
        // Follower at (100,0), target at (0,0) → initial offset = (100,0).
        const moverToken = makeToken("t1", 100, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const action = makeAction({
            id: "follow", actionId: "follow", apCost: 1, targetId: "c2",
            movementTargetX: 0, movementTargetY: 0
        });
        // First call — _followOffsetX/_followOffsetY not yet set.
        resolver.planMovement({ combatant: mover, action, tokenPositions: null, tickEffects: [] });

        // Offset should now be stamped on the action object.
        assert.ok(Number.isFinite(action._followOffsetX), "expected _followOffsetX to be initialized");
        assert.ok(Number.isFinite(action._followOffsetY), "expected _followOffsetY to be initialized");
        assert.equal(action._followOffsetX, 100);
        assert.equal(action._followOffsetY, 0);
    });

    it("mirrors the target's movement when the target moved this tick", () => {
        // Follower at (100,100), target originally at (0,100).
        // Target moved to (0,200) this tick — follower should try to reach (100,200).
        const moverToken = makeToken("t1", 100, 100);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 100);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const tickEffects = [
            { type: "movement", combatantId: "c2", tokenId: "t2", x: 0, y: 200 }
        ];
        const action = makeAction({
            id: "follow", actionId: "follow", apCost: 1, targetId: "c2",
            _followOffsetX: 100, _followOffsetY: 0  // pre-initialized offset
        });

        const result = resolver.planMovement({ combatant: mover, action, tokenPositions: null, tickEffects });
        assert.ok(result !== null, "expected follower to move");
        // Follower should move toward (100, 200).
        assert.ok(result.y > 100, `expected y > 100 (moving toward 200), got y=${result.y}`);
    });

    it("does not reinitialize the offset if already set", () => {
        const moverToken = makeToken("t1", 100, 0);
        const mover = makeCombatant("c1", moverToken);

        const targetToken = makeToken("t2", 0, 0);
        const target = makeCombatant("c2", targetToken);

        const combatants = new Map([["c1", mover], ["c2", target]]);
        const resolver = makeResolver({ combatants });

        const action = makeAction({
            id: "follow", actionId: "follow", apCost: 1, targetId: "c2",
            _followOffsetX: 50,  // pre-set to a different value
            _followOffsetY: 0
        });

        resolver.planMovement({ combatant: mover, action, tokenPositions: null, tickEffects: [] });

        // Should not have overwritten the pre-set offset.
        assert.equal(action._followOffsetX, 50);
    });
});
