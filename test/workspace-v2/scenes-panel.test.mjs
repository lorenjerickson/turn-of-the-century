import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildScenesPanelModel,
    renderScenesPanel
} from "../../module/ui/workspace-v2/panels/scenes-panel.mjs";

describe("Scenes panel", () => {
    it("builds entries for defined scenes and marks the current and active scene", () => {
        const scenes = [
            {
                id: "scene-a",
                name: "Station Yard",
                active: true,
                background: { src: "yard.webp" },
                grid: { type: 1 }
            },
            {
                id: "scene-b",
                name: "Hotel Cellar",
                grid: { type: 0 }
            }
        ];

        const model = buildScenesPanelModel({
            scenes,
            currentScene: scenes[0],
            viewedScene: scenes[1]
        });

        assert.equal(model.count, 2);
        assert.equal(model.entries[0].id, "scene-a");
        assert.equal(model.entries[0].name, "Station Yard");
        assert.equal(model.entries[0].active, true);
        assert.equal(model.entries[0].current, true);
        assert.equal(model.entries[0].viewed, false);
        assert.equal(model.entries[0].hasMap, true);
        assert.equal(model.entries[0].gridless, false);
        assert.equal(model.entries[1].viewed, true);
        assert.equal(model.entries[1].gridless, true);
    });

    it("marks the default scene from flags", () => {
        const model = buildScenesPanelModel({
            scenes: [{
                id: "scene-a",
                name: "Station Yard",
                flags: { "turn-of-the-century": { defaultScene: true } },
                grid: { type: 1 }
            }]
        });
        assert.equal(model.entries[0].isDefault, true);
    });

    it("recognizes a saved map when draft raw source is empty but scene background is populated", () => {
        const model = buildScenesPanelModel({
            scenes: [{
                id: "scene-draft",
                name: "Draft Map",
                _source: { background: { src: "" } },
                background: { src: "assets/images/scenes/draft-map.webp" }
            }]
        });

        assert.equal(model.entries[0].hasMap, true);
    });

    it("renders an empty state when no scenes are defined", () => {
        const html = renderScenesPanel(buildScenesPanelModel());

        assert.match(html, /data-action="scenes-create-scene"/);
        assert.match(html, /Create Scene/);
        assert.match(html, /0 scenes/);
        assert.match(html, /No scenes defined/);
    });

    it("renders scene names as map-opening controls", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "scene-a", name: "Station Yard", active: true, grid: { type: 1 } }]
        });

        const html = renderScenesPanel(model);

        assert.match(html, /data-action="open-scene-map"/);
        assert.match(html, /data-scene-id="scene-a"/);
        assert.match(html, /Station Yard/);
        assert.doesNotMatch(html, /data-action="scenes-activate-scene"/);
    });

    it("renders Gridless and No map badges", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "scene-a", name: "Empty Lot", grid: { type: 0 } }]
        });

        const html = renderScenesPanel(model);
        assert.match(html, /totc-v2-scenes-panel__badge/);
        assert.match(html, /Gridless/);
        assert.match(html, /No map/);
    });

    it("renders Default badge for the default scene", () => {
        const model = buildScenesPanelModel({
            scenes: [{
                id: "scene-a",
                name: "Station Yard",
                flags: { "turn-of-the-century": { defaultScene: true } },
                grid: { type: 1 },
                background: { src: "yard.webp" }
            }]
        });

        const html = renderScenesPanel(model);
        assert.match(html, /Default/);
    });

    it("applies a background-image gradient style when mapSrc is available", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "scene-a", name: "Station Yard", background: { src: "yard.webp" }, grid: { type: 1 } }]
        });

        const html = renderScenesPanel(model);
        assert.match(html, /background-image:linear-gradient/);
        assert.match(html, /url\('yard\.webp'\)/);
        assert.match(html, /background-size:cover/);
    });

    it("escapes scene names in rendered markup", () => {
        const model = buildScenesPanelModel({
            scenes: [{ id: "x", name: "<script>", grid: { type: 1 } }]
        });

        const html = renderScenesPanel(model, {
            escapeHTML: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        });

        assert.match(html, /&lt;script&gt;/);
        assert.doesNotMatch(html, /<script>/);
    });
});
