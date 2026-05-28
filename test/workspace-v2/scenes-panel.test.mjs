import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildScenesPanelModel,
    renderScenesPanel
} from "../../module/ui/workspace-v2/panels/scenes-panel.mjs";

describe("Scenes panel", () => {
    it("builds entries for defined scenes and marks the current scene", () => {
        const scenes = [
            {
                id: "scene-a",
                name: "Station Yard",
                active: true,
                width: 2400,
                height: 1800,
                grid: { type: 1, size: 100, distance: 5, units: "ft" },
                background: { src: "yard.webp" }
            },
            {
                id: "scene-b",
                name: "Hotel Cellar",
                width: 1200,
                height: 900,
                grid: { type: 0 }
            }
        ];

        const model = buildScenesPanelModel({
            scenes,
            currentScene: scenes[0],
            viewedScene: scenes[1]
        });

        assert.equal(model.count, 2);
        assert.deepEqual(model.entries[0], {
            id: "scene-a",
            name: "Station Yard",
            active: true,
            current: true,
            viewed: false,
            dimensions: "2400 x 1800",
            grid: "100px, 5 ft",
            hasMap: true
        });
        assert.equal(model.entries[1].viewed, true);
        assert.equal(model.entries[1].grid, "Gridless");
    });

    it("renders an empty state when no scenes are defined", () => {
        const html = renderScenesPanel(buildScenesPanelModel());

        assert.match(html, /data-action="scenes-create-scene"/);
        assert.match(html, /Create Scene/);
        assert.match(html, /0 defined scenes/);
        assert.match(html, /No scenes have been defined yet/);
    });

    it("renders scene names as map-opening controls", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "scene-a", name: "Station Yard", active: true, grid: { type: 1, size: 100 } }]
        });

        const html = renderScenesPanel(model);

        assert.match(html, /data-action="open-scene-map"/);
        assert.match(html, /data-scene-id="scene-a"/);
        assert.match(html, /title="Open scene map"/);
        assert.match(html, />Active</);
        assert.match(html, /Station Yard/);
    });

    it("escapes scene names in rendered markup", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "x", name: "<script>", grid: { type: 1, size: 50 } }]
        });

        const html = renderScenesPanel(model, {
            escapeHTML: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        });

        assert.match(html, /&lt;script&gt;/);
        assert.doesNotMatch(html, /<script>/);
    });
});
