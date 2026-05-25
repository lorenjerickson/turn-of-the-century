import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MapViewportController } from "../../module/ui/workspace-v2/map-viewport-controller.mjs";

function makeViewport({ width = 500, height = 400, mapKey = "scene-1" } = {}) {
    const classNames = new Set();
    return {
        dataset: { mapKey },
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
        classList: {
            add: (name) => classNames.add(name),
            remove: (name) => classNames.delete(name),
            contains: (name) => classNames.has(name)
        }
    };
}

function makeImage({ width = 1000, height = 800, src = "map.webp" } = {}) {
    return {
        naturalWidth: width,
        naturalHeight: height,
        currentSrc: src,
        src,
        style: {}
    };
}

describe("MapViewportController", () => {
    it("restores saved viewport state and applies the transform", () => {
        const controller = new MapViewportController({
            stateStore: {
                getUserMapViewport: () => ({ scale: 2, centerX: 300, centerY: 200 })
            }
        });
        const viewport = makeViewport();
        const image = makeImage();

        controller.syncViewport(viewport, image);

        assert.equal(controller.state.scale, 2);
        assert.equal(controller.state.offsetX, -350);
        assert.equal(controller.state.offsetY, -200);
        assert.equal(image.style.transform, "translate(-350px, -200px) scale(2)");
    });

    it("persists zoom changes through the state store", () => {
        let persisted = null;
        const controller = new MapViewportController({
            stateStore: {
                getUserMapViewport: () => null,
                setUserMapViewport: async (key, value) => {
                    persisted = { key, value };
                }
            }
        });
        const viewport = makeViewport();
        const image = makeImage();

        controller.syncViewport(viewport, image);
        controller.applyWheelZoom(viewport, image, {
            deltaY: -1,
            clientX: 250,
            clientY: 200
        });

        assert.equal(persisted.key, "scene-1");
        assert.equal(persisted.value.scale > 0.5, true);
        assert.equal(Number.isFinite(persisted.value.centerX), true);
        assert.equal(Number.isFinite(persisted.value.centerY), true);
    });

    it("tracks pan sessions and persists when panning ends", () => {
        let persisted = null;
        const controller = new MapViewportController({
            stateStore: {
                getUserMapViewport: () => null,
                setUserMapViewport: async (key, value) => {
                    persisted = { key, value };
                }
            }
        });
        const viewport = makeViewport();
        const image = makeImage();

        controller.syncViewport(viewport, image);
        controller.beginPan({ pointerId: 7, viewport, image, clientX: 20, clientY: 20 });
        assert.equal(viewport.classList.contains("is-panning"), true);
        assert.equal(controller.movePan({ pointerId: 7, clientX: 40, clientY: 35 }), true);
        controller.endPan();

        assert.equal(viewport.classList.contains("is-panning"), false);
        assert.equal(persisted.key, "scene-1");
    });
});
