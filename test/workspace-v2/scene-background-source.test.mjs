import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getSceneBackgroundLevel,
    getSceneBackgroundSource
} from "../../module/ui/workspace-v2/scene-background-source.mjs";

describe("Scene background source", () => {
    it("prefers the viewed Foundry v14 level background source", () => {
        assert.equal(getSceneBackgroundSource({
            levels: [
                { id: "level-b", index: 1, background: { src: "assets/images/scenes/upper.webp" } },
                { id: "level-a", index: 0, isView: true, background: { src: "assets/images/scenes/ground.webp" } }
            ],
            img: "assets/images/scenes/legacy.webp"
        }), "assets/images/scenes/ground.webp");
    });

    it("falls back to raw Foundry v14 level background source", () => {
        assert.equal(getSceneBackgroundSource({
            _source: {
                levels: [
                    { _id: "level-a", background: { src: "assets/images/scenes/raw-level.webp" } }
                ]
            }
        }), "assets/images/scenes/raw-level.webp");
    });

    it("selects the lowest sorted level when no level is viewed", () => {
        const level = getSceneBackgroundLevel({
            levels: [
                { id: "level-b", sort: 2, background: { src: "assets/images/scenes/upper.webp" } },
                { id: "level-a", sort: 1, background: { src: "assets/images/scenes/ground.webp" } }
            ]
        });

        assert.equal(level.id, "level-a");
    });

    it("uses scene.img as a legacy direct-scene fallback", () => {
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
