import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSceneBackgroundSource } from "../../module/ui/workspace-v2/scene-background-source.mjs";

describe("Scene background source", () => {
    it("prefers scene.img (Foundry v14 primary field) over all fallbacks", () => {
        assert.equal(getSceneBackgroundSource({
            img: "assets/images/scenes/current.webp",
            _source: { img: "assets/images/scenes/old.webp", background: { src: "assets/images/scenes/older.webp" } }
        }), "assets/images/scenes/current.webp");
    });

    it("falls back through _source.img, _source.background.src, _source.texture.src", () => {
        assert.equal(getSceneBackgroundSource({
            _source: { img: "assets/images/scenes/raw-img.webp" }
        }), "assets/images/scenes/raw-img.webp");

        assert.equal(getSceneBackgroundSource({
            _source: { background: { src: "assets/images/scenes/raw-bg.webp" } }
        }), "assets/images/scenes/raw-bg.webp");

        assert.equal(getSceneBackgroundSource({
            _source: { texture: { src: "assets/images/scenes/raw-tex.webp" } }
        }), "assets/images/scenes/raw-tex.webp");
    });

    it("returns empty string when no background path is found", () => {
        assert.equal(getSceneBackgroundSource({}), "");
        assert.equal(getSceneBackgroundSource(null), "");
    });
});
