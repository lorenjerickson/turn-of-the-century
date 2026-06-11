import { WORKSPACE_V2_DOCK_IDS } from "../constants.mjs";
import { getDefaultScene, setDefaultScene, clearDefaultScene } from "../../../seeded-scenes.mjs";
import { getSceneBackgroundSource } from "../scene-background-source.mjs";
import {
    applySceneBackgroundUpdate,
    buildSceneBackgroundUploadTarget,
    buildSceneBackgroundUpdateData,
    resolveScenePropertiesMapPanelScene
} from "../panels/scene-properties-panel.mjs";
import {
    createSceneDesignScene,
    uploadSceneBackgroundFile
} from "../design-actions/scene-actions.mjs";

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
        getActors = () => [],
        addActorsToScene = async () => {},
        centerSceneMapOnToken = async () => false,
        executeDesignAction = async () => {},
        render = () => {},
        foundryRef = () => globalThis.foundry,
        uiRef = () => globalThis.ui,
        confirmRef = () => globalThis.confirm,
        logger = console,
        activityLogger = console
    } = {}) {
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.sceneResolver = sceneResolver;
        this.scenesCollection = scenesCollection;
        this.getCurrentScene = getCurrentScene;
        this.getViewedScene = getViewedScene;
        this.getActivePanel = getActivePanel;
        this.getActors = getActors;
        this.addActorsToScene = addActorsToScene;
        this.centerSceneMapOnToken = centerSceneMapOnToken;
        this.executeDesignAction = executeDesignAction;
        this.render = render;
        this.foundryRef = foundryRef;
        this.uiRef = uiRef;
        this.confirmRef = confirmRef;
        this.logger = logger;
        this.activityLogger = activityLogger;
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

    getSceneMapSource(scene) {
        return getSceneBackgroundSource(scene);
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
        const fallbackMapSrc = String(fallback.mapSrc ?? "").trim();

        return {
            id: scene?.id ?? scene?._id ?? fallback.id ?? null,
            name: scene?.name ?? fallback.name ?? "Current Scene",
            mapSrc: fallbackMapSrc || this.getSceneMapSource(scene) || "",
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

    async activateScene(scene) {
        const ui = this.uiRef();
        if (!scene) {
            ui?.notifications?.warn("No scene is available to activate.");
            return false;
        }

        try {
            if (typeof scene.activate === "function") {
                await scene.activate();
            } else if (typeof scene.update === "function") {
                await scene.update({ active: true });
            } else {
                throw new Error("Scene activation is not available.");
            }
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Scene activation failed", error);
            ui?.notifications?.error("Scene activation failed - see console for details.");
            return false;
        }

        ui?.notifications?.info?.(`Activated ${scene.name ?? "scene"}.`);
        this.render();
        return true;
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

    async saveSceneName(value = "") {
        const scene = this.getScenePropertiesScene();
        const trimmedName = String(value ?? "").trim();
        if (scene && trimmedName) {
            try {
                this.activityLogger.info?.("[scene-name] Auto-saving scene name", { sceneId: scene.id, oldName: scene.name, newName: trimmedName });
                await scene.update({ name: trimmedName });
                this.activityLogger.info?.("[scene-name] Name saved OK", { sceneId: scene.id, name: scene.name });
            } catch (err) {
                this.logger?.error?.("[turn-of-the-century] Scene name auto-save failed", err);
                this.activityLogger.error?.("[scene-name] scene.update() FAILED", { sceneId: scene?.id, error: err?.message ?? String(err) });
                this.patchState({ error: "Scene name save failed." });
            }
        }
        this.render();
    }

    wireSceneListHandlers(root) {
        root?.querySelectorAll("[data-action='open-scene-map']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const sceneId = String(button.dataset.sceneId ?? "").trim();
                if (!sceneId) return;

                if (event.detail > 1) {
                    await this.activateScene(this.getSceneDocumentById(sceneId));
                    return;
                }

                const nextLayout = this.openSceneMapPanel(sceneId);
                this.bindScene(sceneId);

                const openedScene = this.getSceneDocumentById(sceneId);
                this.activityLogger.info?.("[open-scene-map] Map panel opened", {
                    sceneId,
                    sceneName: openedScene?.name ?? null,
                    "scene.img": openedScene?.img ?? null,
                    "_source.img": openedScene?._source?.img ?? null,
                    "_source.background.src": openedScene?._source?.background?.src ?? null,
                    "_source.texture.src": openedScene?._source?.texture?.src ?? null,
                    "getSceneBackgroundSource()": getSceneBackgroundSource(openedScene)
                });

                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='scenes-create-scene']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.executeDesignAction("scene.create", { panelId: "scenes" });
            });
        });
    }

    wireScenePropertiesHandlers(root) {
        root?.querySelectorAll("[data-action='scene-properties-background-upload']")?.forEach((input) => {
            input.addEventListener("change", async () => {
                await this.#handleBackgroundUpload(input);
            });
        });

        root?.querySelectorAll("[data-action='scene-properties-delete']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#handleDeleteScene();
            });
        });

        root?.querySelectorAll("[data-action='scene-properties-set-default']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", async (event) => {
                event.preventDefault();
                await this.#handleDefaultSceneToggle(checkbox);
            });
        });

        root?.querySelectorAll("[data-action='scene-properties-activate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.activateScene(this.getScenePropertiesScene());
            });
        });

        root?.querySelectorAll("[data-action='scene-actors-add-heroes']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const heroes = Array.from(this.getActors() ?? []).filter((actor) => actor?.type === "hero");
                await this.addActorsToScene(heroes);
            });
        });

        root?.querySelectorAll("[data-action='scene-actors-add-selected']")?.forEach((form) => {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const formData = new FormData(form);
                const actorIds = new Set(formData.getAll("actorId").map((id) => String(id ?? "").trim()).filter(Boolean));
                const actors = Array.from(actorIds)
                    .map((id) => this.getActors()?.find?.((actor) => String(actor?.id ?? actor?._id ?? "") === id))
                    .filter(Boolean);
                await this.addActorsToScene(actors);
            });
        });

        root?.querySelectorAll("[data-action='scene-token-center']")?.forEach((entry) => {
            entry.addEventListener("dblclick", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const sceneId = String(entry.dataset.sceneId ?? "").trim();
                const x = Number(entry.dataset.tokenCenterX);
                const y = Number(entry.dataset.tokenCenterY);
                if (!sceneId || !Number.isFinite(x) || !Number.isFinite(y)) return;
                await this.centerSceneMapOnToken({ sceneId, x, y });
            });
        });
    }

    async #handleBackgroundUpload(input) {
        const file = input.files?.[0] ?? null;
        if (!file) return;

        const foundry = this.foundryRef();
        const ui = this.uiRef();
        const scene = this.getScenePropertiesScene();
        const sceneName = String(scene?.name ?? "").trim();
        const target = buildSceneBackgroundUploadTarget({ sceneName, filename: file.name });

        this.activityLogger.info?.("[bg-upload] File selected", {
            filename: file.name,
            size: file.size,
            sceneId: scene?.id ?? null,
            sceneName,
            targetValid: target.valid,
            targetPath: target.path || null,
            "scene.img (before)": scene?.img ?? null,
            "_source.img (before)": scene?._source?.img ?? null,
            "_source.background.src (before)": scene?._source?.background?.src ?? null
        });

        this.patchState({
            status: target.valid ? `Uploading ${target.filename}...` : "",
            error: target.valid ? "" : "Choose a supported image after entering a scene name."
        });
        this.render();

        if (!target.valid) {
            this.activityLogger.warn?.("[bg-upload] Upload target invalid - aborting", { target });
            return;
        }

        this.activityLogger.info?.("[bg-upload] Uploading file to server", { targetPath: target.path });
        const result = await uploadSceneBackgroundFile({
            file,
            target,
            overwrite: true,
            foundry,
            ui
        });

        this.activityLogger.info?.("[bg-upload] Upload result", {
            ok: result?.ok,
            path: result?.path ?? null,
            filename: result?.filename ?? null,
            message: result?.message ?? null
        });

        if (!result?.ok) {
            this.activityLogger.error?.("[bg-upload] Upload FAILED", { result });
            this.patchState({
                status: "",
                error: result?.message ?? "Scene background upload failed."
            });
            this.render();
            return;
        }

        if (scene) {
            try {
                const updateData = buildSceneBackgroundUpdateData(result.path);
                this.activityLogger.info?.("[bg-upload] Applying scene background update", {
                    sceneId: scene.id,
                    sceneName: scene.name,
                    legacySceneUpdateData: updateData,
                    levelCount: scene?.levels?.size ?? scene?.levels?.contents?.length ?? scene?._source?.levels?.length ?? null,
                    "scene.img (pre-update)": scene?.img ?? null,
                    "_source.img (pre-update)": scene?._source?.img ?? null,
                    "_source.background.src (pre-update)": scene?._source?.background?.src ?? null,
                    "_source.levels[0].background.src (pre-update)": scene?._source?.levels?.[0]?.background?.src ?? null
                });
                const saveResult = await applySceneBackgroundUpdate(scene, result.path);
                this.activityLogger.info?.("[bg-upload] Background update resolved - reading back scene state", {
                    sceneId: scene.id,
                    saveMode: saveResult.mode,
                    savedDocumentId: saveResult.document?.id ?? saveResult.document?._id ?? null,
                    "scene.img (post-update)": scene?.img ?? null,
                    "_source.img (post-update)": scene?._source?.img ?? null,
                    "_source.background.src (post-update)": scene?._source?.background?.src ?? null,
                    "_source.texture.src (post-update)": scene?._source?.texture?.src ?? null,
                    "_source.levels[0].background.src (post-update)": scene?._source?.levels?.[0]?.background?.src ?? null,
                    "getSceneBackgroundSource() (post-update)": getSceneBackgroundSource(scene)
                });
                this.patchState({
                    status: `Background saved: ${result.filename}.`,
                    error: ""
                });
            } catch (err) {
                this.logger?.error?.("[turn-of-the-century] Scene background auto-save failed", err);
                this.activityLogger.error?.("[bg-upload] scene.update() THREW AN ERROR", {
                    sceneId: scene?.id,
                    error: err?.message ?? String(err)
                });
                this.patchState({
                    status: "",
                    error: "Background uploaded but scene save failed - see console."
                });
            }
        } else {
            this.activityLogger.warn?.("[bg-upload] No scene available - upload saved to server but not applied to any scene");
            this.patchState({
                status: `Uploaded ${result.filename}. Open a scene map to apply.`,
                error: ""
            });
        }
        this.render();
    }

    async #handleDeleteScene() {
        const scene = this.getScenePropertiesScene();
        if (!scene) {
            this.patchState({ status: "", error: "No scene is available to delete." });
            this.render();
            return;
        }

        const sceneName = String(scene.name ?? "this scene");
        const confirm = this.confirmRef?.();
        const confirmed = confirm?.(`Delete scene "${sceneName}"? This cannot be undone.`) ?? false;
        if (!confirmed) return;

        try {
            if (typeof scene.delete !== "function") throw new Error("Scene deletion is not available.");
            await scene.delete();
            await this.removeDeletedSceneMapPanel(scene);
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Scene delete failed", error);
            this.patchState({ status: "", error: "Scene delete failed - see console." });
            this.render();
            return;
        }

        this.state = { sceneId: "", status: `Deleted ${sceneName}.`, error: "" };
        this.render();
    }

    async #handleDefaultSceneToggle(checkbox) {
        const scene = this.getScenePropertiesScene();
        if (!scene) return;
        try {
            this.activityLogger.info?.("[default-scene] Setting default scene", { sceneId: scene.id, sceneName: scene.name, checked: checkbox.checked });
            if (checkbox.checked) {
                await setDefaultScene(scene, this.scenesCollection());
            } else {
                await clearDefaultScene(scene);
            }
            this.activityLogger.info?.("[default-scene] Default scene updated OK", { sceneId: scene.id, isDefault: checkbox.checked });
        } catch (err) {
            this.logger?.error?.("[turn-of-the-century] Default scene update failed", err);
            this.activityLogger.error?.("[default-scene] FAILED", { sceneId: scene?.id, error: err?.message ?? String(err) });
        }
        this.render();
    }
}
