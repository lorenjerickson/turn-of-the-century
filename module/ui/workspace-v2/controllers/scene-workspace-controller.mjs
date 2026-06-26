import { WORKSPACE_V2_DOCK_IDS } from "../constants.mjs";
import { getDefaultScene } from "../../../seeded-scenes.mjs";
import { resolveScenePropertiesMapPanelScene } from "../panels/scene-properties-panel.mjs";
import { createSceneDesignScene } from "../design-actions/scene-actions.mjs";

export const DEFAULT_SCENE_PROPERTIES_STATE = Object.freeze({
    sceneId: "",
    status: "",
    error: ""
});

export class SceneWorkspaceController {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        sceneResolver = () => null,
        scenesCollection = () => null,
        getCurrentScene = () => null,
        getViewedScene = () => null,
        getActivePanel = () => null,
        render = () => {},
        foundryRef = () => globalThis.foundry,
        uiRef = () => globalThis.ui
    } = {}) {
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.sceneResolver = sceneResolver;
        this.scenesCollection = scenesCollection;
        this.getCurrentScene = getCurrentScene;
        this.getViewedScene = getViewedScene;
        this.getActivePanel = getActivePanel;
        this.render = render;
        this.foundryRef = foundryRef;
        this.uiRef = uiRef;
        this.state = { ...DEFAULT_SCENE_PROPERTIES_STATE };
    }

    get propertiesState() {
        return this.state;
    }

    patchState(patch = {}) {
        this.state = { ...this.state, ...patch };
    }

    resetState() {
        this.state = { ...DEFAULT_SCENE_PROPERTIES_STATE };
    }

    bindScene(sceneId = "") {
        this.patchState({ sceneId: String(sceneId ?? "").trim(), status: "", error: "" });
    }

    isMapPanel(panel) {
        return panel?.baseId === "map" || String(panel?.id ?? "").startsWith("map:");
    }

    getSceneDocumentById(sceneId) {
        return this.sceneResolver(sceneId);
    }

    getViewedSceneDocument() {
        return this.getViewedScene() ?? this.getCurrentScene() ?? null;
    }

    getDefaultCenterScene() {
        return this.getCurrentScene() ?? this.getViewedScene() ?? getDefaultScene(this.scenesCollection()) ?? null;
    }

    getScenePropertiesScene() {
        const storedId = String(this.state?.sceneId ?? "").trim();
        if (storedId) {
            const stored = this.getSceneDocumentById(storedId);
            if (stored) return stored;
        }

        const activePanel = this.getActivePanel();
        const currentScene = this.getCurrentScene();
        const { scene } = resolveScenePropertiesMapPanelScene({
            panel: activePanel,
            currentScene,
            sceneResolver: (id) => this.getSceneDocumentById(id)
        });
        return scene ?? null;
    }

    buildSceneViewModel(scene, fallback = {}) {
        return {
            id: scene?.id ?? scene?._id ?? fallback.id ?? null,
            name: scene?.name ?? fallback.name ?? "Current Scene",
            width: Number(scene?.width ?? fallback.width ?? 0),
            height: Number(scene?.height ?? fallback.height ?? 0),
            shiftX: Number(scene?.shiftX ?? fallback.shiftX ?? 0),
            shiftY: Number(scene?.shiftY ?? fallback.shiftY ?? 0),
            grid: {
                type: Number(scene?.grid?.type ?? fallback.grid?.type ?? 1),
                size: Number(scene?.grid?.size ?? fallback.grid?.size ?? 100),
                distance: Number(scene?.grid?.distance ?? fallback.grid?.distance ?? 5),
                units: String(scene?.grid?.units ?? fallback.grid?.units ?? "ft")
            },
            tokens: scene?.tokens ?? fallback.tokens ?? []
        };
    }

    getMapPanelScene(panel, context = {}) {
        const currentScene = this.getCurrentScene();
        const { sceneId, scene } = resolveScenePropertiesMapPanelScene({
            panel,
            currentScene,
            sceneResolver: (id) => this.getSceneDocumentById(id)
        });

        if (scene) return this.buildSceneViewModel(scene, { id: sceneId });
        if (sceneId) return this.buildSceneViewModel(null, { id: sceneId, name: panel?.title ?? "Missing Scene" });
        return context.scene ?? this.buildSceneViewModel(null);
    }

    getDesignActionScene(sourcePanel = null, currentScene = null) {
        if (!this.isMapPanel(sourcePanel)) return currentScene;

        const { scene } = resolveScenePropertiesMapPanelScene({
            panel: sourcePanel,
            currentScene,
            sceneResolver: (id) => this.getSceneDocumentById(id)
        });

        return scene ?? currentScene;
    }

    getPanelSceneId(panel) {
        if (!this.isMapPanel(panel)) return "";
        const panelId = String(panel?.id ?? "");
        return String(panel?.sceneId ?? (panelId.startsWith("map:") ? panelId.slice(4) : "")).trim();
    }

    makeSceneMapPanelDef(scene) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return null;

        return {
            id: `map:${sceneId}`,
            title: scene?.name ?? "Scene Map",
            baseId: "map",
            sceneId
        };
    }

    findPanelLocation(panelId) {
        const id = String(panelId ?? "").trim();
        if (!id) return null;

        const layout = this.layoutEngine.getLayout();
        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout?.root?.[dockId];
            for (const stack of dock?.stacks ?? []) {
                if ((stack?.panels ?? []).some((panel) => panel.id === id)) {
                    return { kind: "dock", dockId, stackId: stack.id };
                }
            }
        }

        const floatingWindow = (layout?.root?.floatingWindows ?? []).find((entry) => entry?.panel?.id === id);
        return floatingWindow ? { kind: "floating", floatingId: floatingWindow.id } : null;
    }

    async removeDeletedSceneMapPanel(scene) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) {
            this.render();
            return this.layoutEngine.getLayout();
        }

        const panelId = `map:${sceneId}`;
        const location = this.findPanelLocation(panelId);
        if (!location) {
            this.render();
            return this.layoutEngine.getLayout();
        }

        const nextLayout = typeof this.layoutEngine.removePanel === "function"
            ? this.layoutEngine.removePanel(panelId)
            : this.layoutEngine.closePanel(panelId);
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render();
        return nextLayout;
    }

    openSceneMapPanel(sceneId) {
        const scene = this.getSceneDocumentById(sceneId);
        const panelDef = this.makeSceneMapPanelDef(scene);
        if (!panelDef) return this.layoutEngine.getLayout();

        const existing = this.findPanelLocation(panelDef.id);
        if (existing?.kind === "dock") {
            return this.layoutEngine.setActivePanel(existing.dockId, existing.stackId, panelDef.id);
        }
        if (existing?.kind === "floating") {
            return this.layoutEngine.getLayout();
        }

        const layout = this.layoutEngine.getLayout();
        const centerStack = layout.root?.centerDock?.stacks?.[0];
        return centerStack?.id
            ? this.layoutEngine.applyDropIntent(panelDef, {
                kind: "local",
                dockId: "centerDock",
                stackId: centerStack.id,
                zone: "local-center"
            })
            : this.layoutEngine.applyDropIntent(panelDef, { kind: "edge", dockId: "centerDock" });
    }

    async openScenePropertiesPanel() {
        const panelDef = this.panelRegistry.get("scene-properties");
        if (!panelDef) return;

        this.resetState();
        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render();
    }

    async createSceneDesignScene() {
        const foundry = this.foundryRef();
        const ui = this.uiRef();
        const result = await createSceneDesignScene({
            SceneClass: foundry?.documents?.Scene,
            foundry,
            ui
        });
        if (!result?.ok || !result.scene) return result;

        const scene = result.scene;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (!sceneId) {
            return {
                ok: false,
                level: "warn",
                message: "The new scene was created but could not be bound to the workspace."
            };
        }

        this.openSceneMapPanel(sceneId);
        const panelDef = this.panelRegistry.get("scene-properties");
        let nextLayout = this.layoutEngine.getLayout();
        if (panelDef) {
            nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        }

        this.state = {
            sceneId,
            status: "New scene created. Enter a name, then upload a background image.",
            error: ""
        };
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render();

        return {
            ok: true,
            silent: true,
            scene,
            name: result.name,
            message: "Scene draft created."
        };
    }

}
