import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    browseAssetMedia,
    buildMediaBrowserPanelModel,
    getMediaTypeFromPath,
    normalizeMediaBrowserEntries,
    renderMediaBrowserPanel
} from "../../module/ui/workspace-v2/panels/media-browser-panel.mjs";

describe("Media browser panel", () => {
    it("classifies common asset media types", () => {
        assert.equal(getMediaTypeFromPath("assets/images/scenes/alley.webp"), "image");
        assert.equal(getMediaTypeFromPath("assets/audio/ambient/rain.ogg"), "audio");
        assert.equal(getMediaTypeFromPath("assets/video/scenes/fog.webm"), "video");
        assert.equal(getMediaTypeFromPath("assets/data/readme.txt"), "other");
    });

    it("normalizes media entries from assets folders only", () => {
        const entries = normalizeMediaBrowserEntries([
            "assets/images/scenes/alley.webp",
            "worlds/totc/assets/audio/ambient/rain.ogg",
            "systems/turn-of-the-century/assets/icons/action.svg",
            "uploads/outside.png",
            "assets/images/scenes/alley.webp"
        ]);

        assert.deepEqual(entries.map((entry) => entry.path), [
            "assets/images/scenes/alley.webp",
            "worlds/totc/assets/audio/ambient/rain.ogg",
            "systems/turn-of-the-century/assets/icons/action.svg"
        ]);
        assert.equal(entries[0].filename, "alley.webp");
        assert.equal(entries[0].directory, "assets/images/scenes");
    });

    it("browses Foundry data assets recursively", async () => {
        let browseRequest = null;
        const result = await browseAssetMedia({
            FilePickerClass: {
                browse: async (source, root, options) => {
                    browseRequest = { source, root, options };
                    return {
                        files: [
                            "assets/images/scenes/alley.webp",
                            "assets/audio/effects/bell.mp3"
                        ]
                    };
                }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(browseRequest, {
            source: "data",
            root: "assets",
            options: { recursive: true }
        });
        assert.deepEqual(result.entries.map((entry) => entry.type), ["image", "audio"]);
    });

    it("filters by filename and media type, then sorts by selected column", () => {
        const model = buildMediaBrowserPanelModel({
            entries: [
                "assets/images/scenes/z-yard.webp",
                "assets/images/scenes/a-yard.png",
                "assets/audio/ambient/yard.ogg"
            ],
            state: {
                query: "yard",
                type: "image",
                sortKey: "filename",
                sortDirection: "asc",
                selectedPaths: ["assets/images/scenes/z-yard.webp"]
            }
        });

        assert.deepEqual(model.entries.map((entry) => entry.filename), ["a-yard.png", "z-yard.webp"]);
        assert.equal(model.selectedCount, 1);
        assert.equal(model.totalCount, 3);
        assert.equal(model.visibleCount, 2);
    });

    it("renders list, tile, card, and select-mode controls", () => {
        const base = {
            entries: ["assets/images/scenes/alley.webp", "assets/audio/ambient/rain.ogg"],
            state: {
                mode: "select",
                selectedPaths: ["assets/audio/ambient/rain.ogg"]
            }
        };

        const list = renderMediaBrowserPanel(buildMediaBrowserPanelModel({
            ...base,
            state: { ...base.state, view: "list" }
        }));
        assert.match(list, /data-action="media-browser-sort"/);
        assert.match(list, /data-action="media-browser-clear-selection"/);
        assert.match(list, /data-action="media-browser-confirm-selection"/);

        const tile = renderMediaBrowserPanel(buildMediaBrowserPanelModel({
            ...base,
            state: { ...base.state, view: "tile" }
        }));
        assert.match(tile, /totc-v2-media-browser__tile/);
        assert.match(tile, /<img src="assets\/images\/scenes\/alley.webp"/);
        assert.match(tile, /fa-volume-high/);

        const card = renderMediaBrowserPanel(buildMediaBrowserPanelModel({
            ...base,
            state: { ...base.state, view: "card" }
        }));
        assert.match(card, /totc-v2-media-browser__card/);
        assert.match(card, /<dt>Folder<\/dt>/);
    });
});
