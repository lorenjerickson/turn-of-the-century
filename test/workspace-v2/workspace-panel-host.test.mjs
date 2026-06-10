import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkspacePanelHost } from "../../module/ui/workspace-v2/controllers/workspace-panel-host.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

describe("WorkspacePanelHost", () => {
    it("renders scene map panels with actor drop and grid overlay layers", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: {
                    contents: [
                        {
                            name: "Ada",
                            x: 200,
                            y: 300,
                            width: 1,
                            height: 1,
                            texture: { src: "tokens/ada.webp" }
                        },
                        {
                            name: "Porter",
                            document: {
                                x: 400,
                                y: 500,
                                width: 2,
                                height: 1
                            }
                        }
                    ]
                }
            }),
            getSceneGridOverlayState: () => ({ gridType: 1, cellW: 100, offsetX: 0, offsetY: 0 }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelBodyContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /<div class="totc-v2-map-panel__viewport[^"]*" data-action="map-viewport" data-map-viewport="true"\s+data-scene-actor-drop-target="true" data-scene-id="scene-1"/);
        assert.doesNotMatch(html, /<figure class="totc-v2-map-panel[^"]*"[^>]*data-scene-actor-drop-target="true"/);
        assert.match(html, /data-map-token-layer="true"/);
        assert.match(html, /class="totc-v2-map-panel__token"[^>]*src="tokens\/ada\.webp"[^>]*style="left:200px;top:300px;width:100px;height:100px"/);
        assert.match(html, /class="totc-v2-map-panel__token totc-v2-map-panel__token--fallback"[^>]*style="left:400px;top:500px;width:200px;height:100px"[^>]*>P<\/span>/);
        assert.match(html, /data-actor-drop-preview="true"/);
        assert.match(html, /data-grid-overlay="true"/);
        assert.match(html, /Rookery Yard/);
    });

    it("wraps active design lens markup around panel content", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => true,
            isDesignLensActive: () => true,
            designActionRegistry: {
                getApplicableActions: () => []
            }
        });

        const html = host.renderPanelContent({ id: "unknown", title: "Unknown" }, {});

        assert.match(html, /totc-v2-panel-with-design-lens/);
        assert.match(html, /totc-v2-panel-placeholder/);
    });

    it("keeps GM-only actor panels access-gated", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => false
        });

        const html = host.renderPanelBodyContent({ id: "actors", title: "Actors" }, { gm: { isGM: false } });

        assert.match(html, /only available to the active Gamemaster/);
    });
});
