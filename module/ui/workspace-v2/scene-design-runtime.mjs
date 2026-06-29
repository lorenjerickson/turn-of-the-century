import {
    createSceneDesignPanelPort,
    createSceneDesignScenePort
} from "./scene-design-ports.mjs";

export function createDefaultSceneDesignRuntimeSources({ global = globalThis } = {}) {
    return {
        getGame: () => global.game,
        getCanvas: () => global.canvas,
        getUi: () => global.ui,
        getFoundry: () => global.foundry,
        getConfirm: () => global.confirm
    };
}

export function createSceneDesignRuntime({
    sceneWorkspaceController,
    layoutEngine,
    panelRegistry,
    stateStore = null,
    runtimeSources = createDefaultSceneDesignRuntimeSources(),
    render = () => {},
    addActorsToScene = async () => {},
    centerSceneMapOnToken = async () => false,
    activityLogger = console,
    logger = console,
    notifications = null
} = {}) {
    const {
        getGame = () => globalThis.game,
        getCanvas = () => globalThis.canvas,
        getUi = () => globalThis.ui,
        getFoundry = () => globalThis.foundry,
        getConfirm = () => globalThis.confirm
    } = runtimeSources;

    const getActors = () => Array.from(getGame()?.actors?.contents ?? []);

    return {
        scenePort: createSceneDesignScenePort({
            controller: sceneWorkspaceController,
            getGame,
            getCanvas,
            getUi,
            getFoundry,
            getActors
        }),
        panelPort: createSceneDesignPanelPort({
            controller: sceneWorkspaceController,
            layoutEngine,
            panelRegistry,
            stateStore
        }),
        render,
        notifications: notifications ?? getUi()?.notifications,
        getActors,
        addActorsToScene,
        centerSceneMapOnToken,
        confirmRef: getConfirm,
        uiRef: getUi,
        foundryRef: getFoundry,
        canvasRef: getCanvas,
        activityLogger,
        logger
    };
}
