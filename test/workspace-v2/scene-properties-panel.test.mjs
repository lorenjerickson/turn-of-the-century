import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildSceneBackgroundUploadTarget,
    buildScenePropertiesPanelModel,
    renderScenePropertiesPanel,
    slugifySceneName
} from "../../module/ui/workspace-v2/panels/scene-properties-panel.mjs";

describe("Scene properties panel", () => {
    it("slugifies scene names for world asset filenames", () => {
        assert.equal(slugifySceneName("Whitechapel Alley: Night!"), "whitechapel-alley-night");
        assert.equal(slugifySceneName("  Gare d'Orleans  "), "gare-d-orleans");
    });

    it("builds scene background upload targets under assets/images/scenes", () => {
        assert.deepEqual(buildSceneBackgroundUploadTarget({
            sceneName: "Whitechapel Alley",
            filename: "My Map FINAL.webp"
        }), {
            valid: true,
            directory: "assets/images/scenes",
            filename: "whitechapel-alley.webp",
            path: "assets/images/scenes/whitechapel-alley.webp",
            slug: "whitechapel-alley",
            extension: "webp"
        });
    });

    it("requires a scene name and supported image extension before upload", () => {
        assert.equal(buildSceneBackgroundUploadTarget({ sceneName: "", filename: "map.webp" }).valid, false);
        assert.equal(buildSceneBackgroundUploadTarget({ sceneName: "Whitechapel", filename: "map.txt" }).valid, false);
    });

    it("enables upload after the scene name and enables create after upload", () => {
        const beforeUpload = buildScenePropertiesPanelModel({ sceneName: "Whitechapel" });
        assert.equal(beforeUpload.uploadEnabled, true);
        assert.equal(beforeUpload.createEnabled, false);

        const afterUpload = buildScenePropertiesPanelModel({
            sceneName: "Whitechapel",
            backgroundPath: "assets/images/scenes/whitechapel.webp"
        });
        assert.equal(afterUpload.createEnabled, true);
    });

    it("renders disabled upload and create controls until prerequisites are met", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({}));
        assert.match(html, /data-action="scene-properties-background-upload"[^>]*disabled/);
        assert.match(html, /data-action="scene-properties-create"[^>]*disabled/);
    });

    it("escapes rendered scene values", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            sceneName: "A <Scene>",
            backgroundPath: "assets/images/scenes/a-scene.webp"
        }));
        assert.match(html, /A &lt;Scene&gt;/);
    });
});
