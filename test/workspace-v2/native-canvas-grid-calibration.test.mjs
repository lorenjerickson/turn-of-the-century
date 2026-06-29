import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getNativeCanvasEventScenePoint,
    isPrimaryPointerButton,
    listenForNativeCanvasPointerDown,
    previewNativeCanvasGrid
} from "../../module/ui/workspace-v2/native-canvas-grid-calibration.mjs";

describe("native canvas grid calibration adapter", () => {
    it("accepts only primary-button pointer events", () => {
        assert.equal(isPrimaryPointerButton({ button: 0 }), true);
        assert.equal(isPrimaryPointerButton({ data: { button: 0 } }), true);
        assert.equal(isPrimaryPointerButton({ nativeEvent: { button: 0 } }), true);
        assert.equal(isPrimaryPointerButton({ button: 1 }), false);
        assert.equal(isPrimaryPointerButton({ button: 2 }), false);
        assert.equal(isPrimaryPointerButton({}), false);
    });

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

    it("falls back to outer event coordinates when nativeEvent lacks coordinates", () => {
        const point = getNativeCanvasEventScenePoint({
            clientX: 320,
            clientY: 220,
            nativeEvent: { button: 0 }
        }, {
            canvasCoordinatesFromClient: (x, y) => ({ x: x + 5, y: y + 7 })
        });

        assert.deepEqual(point, { x: 325, y: 227 });
    });

    it("falls through when Foundry client coordinate conversion returns no point", () => {
        const point = getNativeCanvasEventScenePoint({
            clientX: 320,
            clientY: 220,
            offsetX: 150,
            offsetY: 80
        }, {
            canvasCoordinatesFromClient: () => undefined
        });

        assert.deepEqual(point, { x: 150, y: 80 });
    });

    it("falls back to DOM canvas-local coordinates for captured pointer events", () => {
        const point = getNativeCanvasEventScenePoint({
            clientX: 320,
            clientY: 220
        }, {
            app: {
                view: {
                    width: 600,
                    height: 400,
                    getBoundingClientRect: () => ({
                        left: 20,
                        top: 40,
                        width: 300,
                        height: 200
                    })
                }
            }
        });

        assert.deepEqual(point, { x: 600, y: 360 });
    });

    it("converts captured DOM pointer coordinates through stage.toLocal when available", () => {
        const point = getNativeCanvasEventScenePoint({
            x: 160,
            y: 90
        }, {
            app: {
                view: {
                    getBoundingClientRect: () => ({
                        left: 10,
                        top: 20,
                        width: 300,
                        height: 200
                    })
                }
            },
            stage: {
                toLocal: ({ x, y }) => ({ x: x - 50, y: y - 25 })
            }
        });

        assert.deepEqual(point, { x: 100, y: 45 });
    });

    it("falls back to pointer offset coordinates when client coordinates are absent", () => {
        const point = getNativeCanvasEventScenePoint({
            offsetX: 150,
            offsetY: 80
        }, {});

        assert.deepEqual(point, { x: 150, y: 80 });
    });

    it("falls back to layer coordinates when offset coordinates are absent", () => {
        const point = getNativeCanvasEventScenePoint({
            layerX: 160,
            layerY: 90
        }, {});

        assert.deepEqual(point, { x: 160, y: 90 });
    });

    it("converts page coordinates to client coordinates before canvas conversion", () => {
        const originalWindow = globalThis.window;
        globalThis.window = { scrollX: 20, scrollY: 30 };
        try {
            const point = getNativeCanvasEventScenePoint({
                pageX: 340,
                pageY: 250
            }, {
                canvasCoordinatesFromClient: (x, y) => ({ x, y })
            });

            assert.deepEqual(point, { x: 320, y: 220 });
        } finally {
            globalThis.window = originalWindow;
        }
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

    it("can intercept DOM canvas input during capture before token controls", () => {
        const calls = [];
        const handler = () => {};
        const view = {
            addEventListener: (eventName, callback, options) => calls.push(["add", eventName, callback, options]),
            removeEventListener: (eventName, callback, options) => calls.push(["remove", eventName, callback, options])
        };
        const stage = {
            on: () => calls.push(["stage-on"]),
            off: () => calls.push(["stage-off"])
        };

        const cleanup = listenForNativeCanvasPointerDown({ app: { view }, stage }, handler, {
            preferView: true,
            capture: true
        });
        cleanup();

        assert.deepEqual(calls, [
            ["add", "pointerdown", handler, { capture: true }],
            ["remove", "pointerdown", handler, { capture: true }]
        ]);
    });

    it("previews grid geometry updates through scene source data and native canvas redraw", async () => {
        const receivedUpdates = [];
        const drawCalls = [];
        const sceneDocument = {
            updateSource: (data) => {
                receivedUpdates.push(data);
            }
        };
        const ok = await previewNativeCanvasGrid({
            scene: sceneDocument,
            canvasRef: {
                draw: async (scene) => {
                    drawCalls.push(["canvas.draw", scene]);
                },
                grid: {
                    draw: async () => {
                        drawCalls.push(["grid.draw"]);
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
        assert.deepEqual(drawCalls, [["canvas.draw", sceneDocument]]);
    });

    it("previews grid color-only updates through the lightweight grid redraw", async () => {
        const receivedUpdates = [];
        const drawCalls = [];
        const ok = await previewNativeCanvasGrid({
            scene: {
                updateSource: (data) => {
                    receivedUpdates.push(data);
                }
            },
            canvasRef: {
                draw: async () => {
                    drawCalls.push(["canvas.draw"]);
                },
                grid: {
                    draw: async () => {
                        drawCalls.push(["grid.draw"]);
                    }
                }
            },
            updateData: {
                "grid.color": "#d8b45c"
            }
        });

        assert.equal(ok, true);
        assert.deepEqual(receivedUpdates, [{ "grid.color": "#d8b45c" }]);
        assert.deepEqual(drawCalls, [["grid.draw"]]);
    });

    it("falls back to a full canvas redraw when no grid layer redraw is available", async () => {
        const receivedUpdates = [];
        const drawCalls = [];
        const ok = await previewNativeCanvasGrid({
            scene: {
                updateSource: (data) => {
                    receivedUpdates.push(data);
                }
            },
            canvasRef: {
                draw: async () => {
                    drawCalls.push(["canvas.draw"]);
                }
            },
            updateData: {
                "grid.color": "#d8b45c"
            }
        });

        assert.equal(ok, true);
        assert.deepEqual(receivedUpdates, [{ "grid.color": "#d8b45c" }]);
        assert.deepEqual(drawCalls, [["canvas.draw"]]);
    });
});
