export {
    getNativeCanvasEventScenePoint,
    isPrimaryPointerButton,
    listenForNativeCanvasPointerDown,
    previewNativeCanvasGrid
} from "./native-canvas-grid-calibration.mjs";

export async function deactivateWallControls({
    uiRef = () => globalThis.ui,
    canvasRef = () => globalThis.canvas
} = {}) {
    try {
        const ui = uiRef();
        if (typeof ui?.controls?.activate === "function") {
            await ui.controls.activate({ control: "tokens", tool: "select" });
            return;
        }
        if (typeof ui?.controls?.initialize === "function") {
            await ui.controls.initialize({ control: "tokens", tool: "select" });
            return;
        }
        await canvasRef()?.tokens?.activate?.();
    } catch (error) {
        console.warn("[turn-of-the-century] Failed to deactivate native wall controls", error);
    }
}
