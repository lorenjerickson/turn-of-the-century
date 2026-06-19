import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getNativeCanvasEventScenePoint,
    listenForNativeCanvasPointerDown,
    previewNativeCanvasGrid
} from "../../module/ui/workspace-v2/native-canvas-grid-calibration.mjs";

describe("native canvas grid calibration adapter", () => {
    it("converts a PIXI pointer event through the canvas stage transform", () => {
        const point = getNativeCanvasEventScenePoint({
            data: { global: { x: 240, y: 180 } }
        }, {
            stage: {
                worldTransform: {
                    applyInverse: ({ x, y }) => ({ x: x / 2, y: y / 2 })
                }
            }
        });

        assert.deepEqual(point, { x: 120, y: 90 });
    });

    it("uses Foundry client coordinate conversion when available", () => {
        const point = getNativeCanvasEventScenePoint({
            clientX: 320,
            clientY: 220
        }, {
            canvasCoordinatesFromClient: (x, y) => ({ x: x + 5, y: y + 7 })
        });

        assert.deepEqual(point, { x: 325, y: 227 });
    });

    it("registers and removes a PIXI stage pointer listener", () => {
        const calls = [];
        const handler = () => {};
        const stage = {
            on: (eventName, callback) => calls.push(["on", eventName, callback]),
            off: (eventName, callback) => calls.push(["off", eventName, callback])
        };

        const cleanup = listenForNativeCanvasPointerDown({ stage }, handler);
        cleanup();

        assert.deepEqual(calls, [
            ["on", "pointerdown", handler],
            ["off", "pointerdown", handler]
        ]);
    });

    it("previews grid updates through scene source data and native canvas grid redraw", async () => {
        const receivedUpdates = [];
        const drawCalls = [];
        const ok = await previewNativeCanvasGrid({
            scene: {
                updateSource: (data) => {
                    receivedUpdates.push(data);
                }
            },
            canvasRef: {
                grid: {
                    draw: async () => {
                        drawCalls.push("grid.draw");
                    }
                }
            },
            updateData: {
                "grid.size": 96,
                "grid.color": "#d8b45c",
                shiftX: -12,
                shiftY: -18
            }
        });

        assert.equal(ok, true);
        assert.deepEqual(receivedUpdates, [{
            "grid.size": 96,
            "grid.color": "#d8b45c",
            shiftX: -12,
            shiftY: -18
        }]);
        assert.deepEqual(drawCalls, ["grid.draw"]);
    });
});
