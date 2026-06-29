import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    resolveTargetIconType,
    buildEncounterTargetIconsModel,
    renderEncounterTargetIconsToContainer
} from "../../module/ui/workspace-v2/encounter-target-icons.mjs";

const rootDir = new URL("../..", import.meta.url).pathname;
const iconSource = readFileSync(join(rootDir, "module/ui/workspace-v2/encounter-target-icons.mjs"), "utf8");
const featureSource = readFileSync(
    join(rootDir, "module/ui/workspace-v2/controllers/encounter-planning-feature.mjs"),
    "utf8"
);

// ---------------------------------------------------------------------------
// resolveTargetIconType
// ---------------------------------------------------------------------------

describe("resolveTargetIconType", () => {
    it("returns 'target' for attack actions", () => {
        assert.equal(resolveTargetIconType({ type: "attack", actionId: "snapshot" }), "target");
        assert.equal(resolveTargetIconType({ type: "attack", actionId: "quickDraw" }), "target");
    });

    it("returns 'shield' for defense actions", () => {
        assert.equal(resolveTargetIconType({ type: "defense", actionId: "overwatch" }), "shield");
        assert.equal(resolveTargetIconType({ type: "defense", actionId: "parry" }), "shield");
    });

    it("returns 'pursue' for pursue movement", () => {
        assert.equal(resolveTargetIconType({ type: "movement", actionId: "pursue" }), "pursue");
    });

    it("returns 'avoid' for avoid movement", () => {
        assert.equal(resolveTargetIconType({ type: "movement", actionId: "avoid" }), "avoid");
    });

    it("returns 'follow' for follow and other movement", () => {
        assert.equal(resolveTargetIconType({ type: "movement", actionId: "follow" }), "follow");
        assert.equal(resolveTargetIconType({ type: "movement", actionId: "move" }), "follow");
    });

    it("returns 'target' for unknown action types", () => {
        assert.equal(resolveTargetIconType({ type: "custom", actionId: "x" }), "target");
        assert.equal(resolveTargetIconType({}), "target");
        assert.equal(resolveTargetIconType(null), "target");
    });

    it("is case-insensitive for type and actionId", () => {
        assert.equal(resolveTargetIconType({ type: "MOVEMENT", actionId: "PURSUE" }), "pursue");
        assert.equal(resolveTargetIconType({ type: "Defense", actionId: "Overwatch" }), "shield");
    });
});

// ---------------------------------------------------------------------------
// buildEncounterTargetIconsModel
// ---------------------------------------------------------------------------

function makeScene(gridSize = 100, tokens = {}) {
    return {
        grid: { size: gridSize },
        tokens: { get: (id) => tokens[id] ?? null }
    };
}

function makeCombat(plan = [], combatants = {}) {
    return {
        getCombatantPlan: () => plan,
        combatants: { get: (id) => combatants[id] ?? null }
    };
}

describe("buildEncounterTargetIconsModel", () => {
    it("returns empty array when combat is null", () => {
        const result = buildEncounterTargetIconsModel({
            combat: null,
            combatantId: "c1",
            scene: makeScene()
        });
        assert.deepEqual(result, []);
    });

    it("returns empty array when combatantId is missing", () => {
        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(),
            combatantId: "",
            scene: makeScene()
        });
        assert.deepEqual(result, []);
    });

    it("returns empty array when plan has no targeted actions", () => {
        const combat = makeCombat([
            { type: "movement", actionId: "move" },
            { type: "defense", actionId: "hunkDown" }
        ]);
        const result = buildEncounterTargetIconsModel({
            combat,
            combatantId: "c1",
            scene: makeScene()
        });
        assert.deepEqual(result, []);
    });

    it("returns an icon spec for an attack action with targetId", () => {
        const tokens = {
            "tok-1": { x: 200, y: 300, width: 1, height: 1 }
        };
        const combatants = {
            "target-c": { tokenId: "tok-1" }
        };
        const plan = [{
            type: "attack",
            actionId: "snapshot",
            targetId: "target-c"
        }];

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene: makeScene(100, tokens)
        });

        assert.equal(result.length, 1);
        assert.equal(result[0].tokenId, "tok-1");
        assert.equal(result[0].iconType, "target");
        assert.equal(result[0].x, 200);
        assert.equal(result[0].y, 300);
        assert.equal(result[0].tileWidth, 100);
        assert.equal(result[0].tileHeight, 100);
    });

    it("resolves target tokens from array-backed scene token collections", () => {
        const combatants = {
            "target-c": { tokenId: "tok-1" }
        };
        const plan = [{
            type: "attack",
            actionId: "snapshot",
            targetId: "target-c"
        }];
        const scene = {
            grid: { size: 100 },
            tokens: [{ id: "tok-1", x: 200, y: 300, width: 1, height: 1 }]
        };

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene
        });

        assert.equal(result.length, 1);
        assert.equal(result[0].tokenId, "tok-1");
        assert.equal(result[0].iconType, "target");
    });

    it("resolves target tokens through combatant token document references", () => {
        const combatants = {
            "target-c": { token: { document: { id: "tok-doc" } } }
        };
        const plan = [{
            type: "attack",
            actionId: "snapshot",
            targetId: "target-c"
        }];
        const scene = {
            grid: { size: 100 },
            tokens: [{ id: "tok-placeable", document: { id: "tok-doc", x: 200, y: 300, width: 1, height: 1 } }]
        };

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene
        });

        assert.equal(result.length, 1);
        assert.equal(result[0].tokenId, "tok-doc");
        assert.equal(result[0].iconType, "target");
    });

    it("scales tileWidth/tileHeight by gridSize and token width", () => {
        const tokens = {
            "tok-big": { x: 0, y: 0, width: 2, height: 2 }
        };
        const combatants = { "c-big": { tokenId: "tok-big" } };
        const plan = [{ type: "movement", actionId: "pursue", targetId: "c-big" }];

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene: makeScene(150, tokens)
        });

        assert.equal(result[0].tileWidth, 300);
        assert.equal(result[0].tileHeight, 300);
        assert.equal(result[0].iconType, "pursue");
    });

    it("maps all movement variants correctly", () => {
        const tokens = {
            "tok-a": { x: 0, y: 0, width: 1, height: 1 },
            "tok-b": { x: 0, y: 0, width: 1, height: 1 },
            "tok-c": { x: 0, y: 0, width: 1, height: 1 }
        };
        const combatants = {
            "c-pursue": { tokenId: "tok-a" },
            "c-follow": { tokenId: "tok-b" },
            "c-avoid":  { tokenId: "tok-c" }
        };
        const plan = [
            { type: "movement", actionId: "pursue", targetId: "c-pursue" },
            { type: "movement", actionId: "follow", targetId: "c-follow" },
            { type: "movement", actionId: "avoid",  targetId: "c-avoid" }
        ];

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene: makeScene(100, tokens)
        });

        assert.equal(result.length, 3);
        assert.equal(result.find((i) => i.tokenId === "tok-a")?.iconType, "pursue");
        assert.equal(result.find((i) => i.tokenId === "tok-b")?.iconType, "follow");
        assert.equal(result.find((i) => i.tokenId === "tok-c")?.iconType, "avoid");
    });

    it("deduplicates when the same token is targeted by multiple actions", () => {
        const tokens = { "tok-1": { x: 0, y: 0, width: 1, height: 1 } };
        const combatants = { "c-target": { tokenId: "tok-1" } };
        const plan = [
            { type: "attack", actionId: "snapshot", targetId: "c-target" },
            { type: "attack", actionId: "snapshot", targetId: "c-target" }
        ];

        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene: makeScene(100, tokens)
        });

        assert.equal(result.length, 1);
    });

    it("skips actions where the target combatant is not found", () => {
        const plan = [{ type: "attack", actionId: "snapshot", targetId: "missing-combatant" }];
        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, {}),
            combatantId: "c1",
            scene: makeScene()
        });
        assert.deepEqual(result, []);
    });

    it("skips combatants with no resolvable token", () => {
        const combatants = { "c-notokenid": { tokenId: "" } };
        const plan = [{ type: "attack", actionId: "snapshot", targetId: "c-notokenid" }];
        const result = buildEncounterTargetIconsModel({
            combat: makeCombat(plan, combatants),
            combatantId: "c1",
            scene: makeScene(100, {})
        });
        assert.deepEqual(result, []);
    });
});

// ---------------------------------------------------------------------------
// renderEncounterTargetIconsToContainer
// ---------------------------------------------------------------------------

class FakeLegacyGraphics {
    constructor() {
        this.calls = [];
        FakeLegacyGraphics.instances.push(this);
    }

    beginFill(...args) { this.calls.push(["beginFill", ...args]); return this; }
    endFill(...args) { this.calls.push(["endFill", ...args]); return this; }
    lineStyle(...args) { this.calls.push(["lineStyle", ...args]); return this; }
    drawCircle(...args) { this.calls.push(["drawCircle", ...args]); return this; }
    drawPolygon(...args) { this.calls.push(["drawPolygon", ...args]); return this; }
    moveTo(...args) { this.calls.push(["moveTo", ...args]); return this; }
    lineTo(...args) { this.calls.push(["lineTo", ...args]); return this; }
    destroy(...args) { this.calls.push(["destroy", ...args]); return this; }
}

FakeLegacyGraphics.instances = [];

class FakeContainer {
    constructor(children = []) {
        this.children = [...children];
    }

    addChild(child) {
        this.children.push(child);
        return child;
    }

    removeChildAt(index) {
        return this.children.splice(index, 1)[0] ?? null;
    }
}

describe("renderEncounterTargetIconsToContainer", () => {
    it("renders target icons using legacy PIXI Graphics methods", () => {
        const originalPixi = globalThis.PIXI;
        FakeLegacyGraphics.instances = [];
        globalThis.PIXI = { Graphics: FakeLegacyGraphics };

        try {
            const staleChild = { destroyCalled: false, destroy() { this.destroyCalled = true; } };
            const container = new FakeContainer([staleChild]);

            renderEncounterTargetIconsToContainer(container, [{
                x: 100,
                y: 200,
                tileWidth: 100,
                tileHeight: 100,
                iconType: "follow"
            }]);

            assert.equal(staleChild.destroyCalled, true);
            assert.equal(container.children.length, 1);
            assert.equal(FakeLegacyGraphics.instances.length, 1);

            const calls = FakeLegacyGraphics.instances[0].calls.map(([name]) => name);
            assert.ok(calls.includes("drawCircle"));
            assert.ok(calls.includes("drawPolygon"));
            assert.ok(calls.includes("beginFill"));
            assert.ok(calls.includes("lineStyle"));
            assert.ok(!calls.includes("circle"));
            assert.ok(!calls.includes("poly"));
        } finally {
            globalThis.PIXI = originalPixi;
        }
    });
});

// ---------------------------------------------------------------------------
// Source-text assertions: PIXI rendering structure
// ---------------------------------------------------------------------------

describe("encounter target icons rendering structure", () => {
    it("guards PIXI rendering with typeof check to avoid errors in non-canvas contexts", () => {
        assert.match(iconSource, /typeof PIXI === "undefined"/);
    });

    it("places each icon at the top-left corner of the token bounding box", () => {
        assert.match(iconSource, /cx = x \+ r \+ 2/);
        assert.match(iconSource, /cy = y \+ r \+ 2/);
    });

    it("draws a dark background disc for icon legibility over token images", () => {
        assert.match(iconSource, /0x0f172a/);
    });

    it("uses red for attack targets, blue for shield, amber/green/purple for movement", () => {
        assert.match(iconSource, /0xef4444/); // red bullseye
        assert.match(iconSource, /0x60a5fa/); // blue shield
        assert.match(iconSource, /0xfbbf24/); // amber pursue
        assert.match(iconSource, /0x4ade80/); // green follow
        assert.match(iconSource, /0xa78bfa/); // purple avoid
    });

    it("draws a bullseye with concentric circles and crosshairs for attack targets", () => {
        assert.match(iconSource, /drawBullseye/);
        assert.match(iconSource, /moveTo.*lineTo/s); // crosshair lines
    });

    it("draws a pentagon shield shape for defense actions", () => {
        assert.match(iconSource, /drawShield/);
        assert.match(iconSource, /strokePolygon\(g, pts/);
    });

    it("draws directional arrows for all three movement variants", () => {
        assert.match(iconSource, /drawArrow/);
        // pursue = dir 1 (right), avoid = dir -1 (left)
        assert.match(iconSource, /drawArrow\(g, cx, cy, r, 0xfbbf24, 1\)/);
        assert.match(iconSource, /drawArrow\(g, cx, cy, r, 0x4ade80, 1\)/);
        assert.match(iconSource, /drawArrow\(g, cx, cy, r, 0xa78bfa, -1\)/);
    });
});

// ---------------------------------------------------------------------------
// Source-text assertions: planning feature integration
// ---------------------------------------------------------------------------

describe("encounter planning feature target icon integration", () => {
    it("imports buildEncounterTargetIconsModel and renderEncounterTargetIconsToContainer", () => {
        assert.match(featureSource, /buildEncounterTargetIconsModel/);
        assert.match(featureSource, /renderEncounterTargetIconsToContainer/);
    });

    it("tracks targetIconsContainer and lastTargetIconsHash on the instance", () => {
        assert.match(featureSource, /this\.targetIconsContainer = null/);
        assert.match(featureSource, /this\.lastTargetIconsHash = ""/);
    });

    it("syncs target icons from prepareContext using the resolved selection", () => {
        assert.match(featureSource, /#syncEncounterTargetIconsOverlay/);
        assert.match(featureSource, /this\.#syncEncounterTargetIconsOverlay\(/);
        assert.match(featureSource, /selection\?\.combat/);
        assert.match(featureSource, /selection\?\.combatant\?\.id/);
    });

    it("uses a hash and child count to skip PIXI redraws only when the icon set is unchanged", () => {
        assert.match(featureSource, /hash === this\.lastTargetIconsHash/);
        assert.match(featureSource, /children\?\.length === icons\.length/);
        assert.match(featureSource, /i\.x.*i\.y.*i\.tileWidth.*i\.tileHeight/s);
    });

    it("adds the icon container to a world-space canvas layer", () => {
        assert.match(featureSource, /canvas\?\.tokens \?\? canvas\?\.primary \?\? canvas\?\.stage \?\? canvas\?\.interface/);
        assert.match(featureSource, /targetIconLayer\.addChild\(this\.targetIconsContainer\)/);
    });

    it("recreates the container if it has been destroyed or reparented", () => {
        assert.match(featureSource, /targetIconsContainer\.destroyed/);
        assert.match(featureSource, /targetIconsContainer\.parent !== targetIconLayer/);
    });
});
