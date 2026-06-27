import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";

export function createSceneDesignScenePort({
    controller = null,
    getGame = () => globalThis.game,
    getCanvas = () => globalThis.canvas,
    getUi = () => globalThis.ui,
    getFoundry = () => globalThis.foundry,
    getActors = () => Array.from(getGame()?.actors?.contents ?? [])
} = {}) {
    return {
        getCurrentScene: () => getCanvas()?.scene ?? getGame()?.scenes?.active ?? controller?.getViewedSceneDocument?.() ?? null,
        getViewedScene: () => controller?.getViewedSceneDocument?.() ?? getGame()?.scenes?.viewed ?? getCanvas()?.scene ?? null,
        getSceneById: (id) => controller?.getSceneDocumentById?.(id) ?? getGame()?.scenes?.get?.(id) ?? null,
        getScenes: () => getGame()?.scenes,
        getScenePropertiesScene: () => controller?.getScenePropertiesScene?.() ?? getCanvas()?.scene ?? getGame()?.scenes?.viewed ?? null,
        getScenePropertiesState: () => controller?.propertiesState ?? {},
        patchScenePropertiesState: (patch) => controller?.patchState?.(patch),
        getDesignActionScene: (panel, fallback) => controller?.getDesignActionScene?.(panel, fallback) ?? fallback ?? null,
        getActorById: (id) => getGame()?.actors?.get?.(id) ?? null,
        getActors,
        getCombat: () => getGame()?.combats?.active ?? getGame()?.combat ?? null,
        getCanvas,
        getUi,
        getFoundry,
        isGM: () => Boolean(getGame()?.user?.isGM)
    };
}

export function createSceneDesignPanelPort({
    controller = null,
    layoutEngine = controller?.layoutEngine,
    panelRegistry = controller?.panelRegistry,
    stateStore = controller?.stateStore
} = {}) {
    const getLayout = () => layoutEngine?.getLayout?.() ?? { root: {} };
    const isMapPanel = (panel) => controller?.isMapPanel?.(panel)
        ?? (panel?.baseId === "map" || String(panel?.id ?? "").startsWith("map:"));

    return {
        getLayout,
        getPrimaryActivePanel: (layout = getLayout()) => getPrimaryActivePanel(layout),
        getActiveCenterMapPanel: (layout = getLayout()) => getActiveCenterMapPanel(layout, isMapPanel),
        getPanelDefinition: (id) => panelRegistry?.get?.(id) ?? null,
        isMapPanel,
        getPanelSceneId: (panel) => controller?.getPanelSceneId?.(panel) ?? defaultPanelSceneId(panel, isMapPanel),
        makeSceneMapPanelDef: (scene) => controller?.makeSceneMapPanelDef?.(scene) ?? defaultSceneMapPanelDef(scene),
        openSceneMapPanel: (sceneId) => controller?.openSceneMapPanel?.(sceneId) ?? getLayout(),
        bindScene: (sceneId) => controller?.bindScene?.(sceneId),
        saveUserLayout: async (layout) => stateStore?.setUserLayout?.(layout),
        removeDeletedSceneMapPanel: async (scene) => controller?.removeDeletedSceneMapPanel?.(scene) ?? getLayout(),
        openScenePropertiesPanel: async () => controller?.openScenePropertiesPanel?.(),
        createSceneDesignScene: async () => controller?.createSceneDesignScene?.()
    };
}

function getPrimaryActivePanel(layout = { root: {} }) {
    const centerDock = layout?.root?.centerDock;
    const centerStack = centerDock?.stacks?.[0];
    const activePanelId = centerStack?.activePanelId;
    const activePanel = centerStack?.panels?.find((panel) => panel.id === activePanelId) ?? centerStack?.panels?.[0];
    if (activePanel) return activePanel;

    for (const dockId of WORKSPACE_V2_DOCK_IDS) {
        const stack = layout?.root?.[dockId]?.stacks?.[0];
        const fallbackActiveId = stack?.activePanelId;
        const fallbackPanel = stack?.panels?.find((panel) => panel.id === fallbackActiveId) ?? stack?.panels?.[0];
        if (fallbackPanel) return fallbackPanel;
    }

    return null;
}

function getActiveCenterMapPanel(layout = { root: {} }, isMapPanel = () => false) {
    const centerDock = layout?.root?.centerDock;
    for (const stack of centerDock?.stacks ?? []) {
        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        if (isMapPanel(activePanel)) return activePanel;
    }
    return null;
}

function defaultPanelSceneId(panel, isMapPanel = () => false) {
    if (!isMapPanel(panel)) return "";
    const panelId = String(panel?.id ?? "");
    return String(panel?.sceneId ?? (panelId.startsWith("map:") ? panelId.slice(4) : "")).trim();
}

function defaultSceneMapPanelDef(scene) {
    const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
    if (!sceneId) return null;
    return {
        id: `map:${sceneId}`,
        title: scene?.name ?? "Scene Map",
        baseId: "map",
        sceneId
    };
}
