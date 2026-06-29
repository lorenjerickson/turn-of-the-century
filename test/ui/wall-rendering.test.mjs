import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { installWallRenderingOverrides, resolveWallPlaceableClass } from "../../module/ui/wall-rendering.mjs";

class DrawingProbe {
    constructor() {
        this.calls = [];
    }

    clear() {
        this.calls.push(["clear"]);
        return this;
    }

    lineStyle(...args) {
        this.calls.push(["lineStyle", ...args]);
        return this;
    }

    moveTo(...args) {
        this.calls.push(["moveTo", ...args]);
        return this;
    }

    lineTo(...args) {
        this.calls.push(["lineTo", ...args]);
        return this;
    }

    beginFill(...args) {
        this.calls.push(["beginFill", ...args]);
        return this;
    }

    drawCircle(...args) {
        this.calls.push(["drawCircle", ...args]);
        return this;
    }

    endFill() {
        this.calls.push(["endFill"]);
        return this;
    }
}

function createWallClass() {
    return class TestWall {
        constructor() {
            this.document = { c: [1, 2, 3, 4] };
            this.coords = [1, 2, 3, 4];
            this.layer = { highlightObjects: false };
            this.line = new DrawingProbe();
            this.endpoints = new DrawingProbe();
            this.originalLineRefreshCount = 0;
            this.originalEndpointRefreshCount = 0;
        }

        _refreshLine() {
            this.originalLineRefreshCount += 1;
        }

        _refreshEndpoints() {
            this.originalEndpointRefreshCount += 1;
        }

        _getWallColor() {
            return 0xaabbcc;
        }
    };
}

describe("wall rendering overrides", () => {
    it("resolves the v13+ namespaced Wall placeable without touching the deprecated global", () => {
        const WallClass = createWallClass();
        const root = {
            foundry: { canvas: { placeables: { Wall: WallClass } } }
        };
        Object.defineProperty(root, "Wall", {
            get() {
                throw new Error("deprecated global Wall was accessed");
            }
        });

        assert.equal(resolveWallPlaceableClass(root), WallClass);
        assert.equal(installWallRenderingOverrides(root), true);
    });

    it("does not wrap the Wall prototype more than once", () => {
        const WallClass = createWallClass();
        const root = {
            canvas: { walls: { active: false }, dimensions: { uiScale: 1 } },
            foundry: { canvas: { placeables: { Wall: WallClass } } }
        };

        assert.equal(installWallRenderingOverrides(root), true);
        const installedRefreshLine = WallClass.prototype._refreshLine;

        assert.equal(installWallRenderingOverrides(root), false);
        assert.equal(WallClass.prototype._refreshLine, installedRefreshLine);
    });

    it("keeps enlarged wall rendering active through the namespaced Wall class", () => {
        const WallClass = createWallClass();
        const root = {
            canvas: { walls: { active: true }, dimensions: { uiScale: 2 } },
            foundry: { canvas: { placeables: { Wall: WallClass } } }
        };
        installWallRenderingOverrides(root);

        const wall = new WallClass();
        wall._refreshLine();
        wall._refreshEndpoints();

        assert.equal(wall.originalLineRefreshCount, 1);
        assert.deepEqual(wall.line.calls, [
            ["clear"],
            ["lineStyle", 24, 0x000000, 1.0],
            ["moveTo", 1, 2],
            ["lineTo", 3, 4],
            ["lineStyle", 8, 0xaabbcc, 1.0],
            ["lineTo", 1, 2]
        ]);
        assert.deepEqual(wall.endpoints.calls, [
            ["clear"],
            ["lineStyle", 4, 0x000000, 1.0],
            ["beginFill", 0xaabbcc, 1.0],
            ["drawCircle", 1, 2, 30],
            ["drawCircle", 3, 4, 30],
            ["endFill"]
        ]);
    });
});
