const WALL_CONTROL = "walls";
const WALL_TOOL = "walls";

function getScene(context = {}) {
    return context.scene ?? context.canvas?.scene ?? globalThis.canvas?.scene ?? null;
}

function getControls(context = {}) {
    return context.ui?.controls ?? globalThis.ui?.controls ?? null;
}

function getCanvas(context = {}) {
    return context.canvas ?? globalThis.canvas ?? null;
}

export async function activateSceneWallDesignMode(context = {}) {
    const scene = getScene(context);
    const canvas = getCanvas(context);
    const controls = getControls(context);

    if (!scene) {
        return {
            ok: false,
            level: "warn",
            message: "Open a scene before editing walls."
        };
    }

    if (canvas?.ready === false) {
        return {
            ok: false,
            level: "warn",
            message: "Wait for the canvas to finish loading before editing walls."
        };
    }

    if (typeof controls?.initialize === "function") {
        await controls.initialize({ control: WALL_CONTROL, tool: WALL_TOOL });
        return {
            ok: true,
            message: "Wall design tools activated."
        };
    }

    const wallLayer = canvas?.walls;
    if (typeof wallLayer?.activate === "function") {
        await wallLayer.activate();
        return {
            ok: true,
            message: "Wall layer activated."
        };
    }

    return {
        ok: false,
        level: "warn",
        message: "Wall design tools are not available in this Foundry session."
    };
}
