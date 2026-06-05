import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSceneBackgroundSource } from "../../module/ui/workspace-v2/scene-background-source.mjs";

describe("Scene background source", () => {
    it("prefers live scene background data over stale raw source data", () => {
        assert.equal(getSceneBackgroundSource({
            _source: { background: { src: "assets/images/scenes/old.webp" } },
            background: { src: "assets/images/scenes/current.webp" }
        }), "assets/images/scenes/current.webp");
    });

    it("falls back through texture and raw source background paths", () => {
        assert.equal(getSceneBackgroundSource({
            texture: { src: "assets/images/scenes/texture.webp" }
        }), "assets/images/scenes/texture.webp");
        assert.equal(getSceneBackgroundSource({
            _source: { background: { src: "assets/images/scenes/raw.webp" } }
        }), "assets/images/scenes/raw.webp");
    });
});
