import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    getNativeCanvasEventScenePoint,
    isPrimaryPointerButton,
    listenForNativeCanvasPointerDown,
    previewNativeCanvasGrid
} from "../native-canvas-grid-calibration.mjs";
import {
    getControlledWallIds,
    getJoinableWallIds,
    addWallSegmentToScene,
    advanceWallPlacementSequence,
    buildWallEditingGrid,
    joinWallSegmentsById,
    removeWallSegmentsById,
    snapPointToGridIntersection,
    splitWallSegmentAtPoint,
    wallTypeForShortcut,
    wallDocumentId
} from "../scene-wall-editing.mjs";
import { buildSceneWallOverlayState } from "../scene-wall-detection.mjs";
import { WORKSPACE_V2_DOCK_IDS } from "../constants.mjs";

const GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS = 100;
const GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS = 500;

export class SceneDesignFeature extends WorkspaceFeature {
    constructor({
        gridCalibrationController,
        sceneWorkspaceController,
        encounterPlanningFeature = null,
        executeDesignAction = () => {},
        render = () => {},
        notifications = globalThis.ui?.notifications
    } = {}) {
        super();
        this.gridCalibrationController = gridCalibrationController;
        this.sceneWorkspaceController = sceneWorkspaceController;
        this.encounterPlanningFeature = encounterPlanningFeature;
        this.executeDesignActionCallback = executeDesignAction;
        this.renderCallback = render;
        this.notifications = notifications;

        this.detectedWallOverlayStates = new Map();
        this.mapPanelToolbarStates = new Map();
        this.selectedWallIdsByScene = new Map();
        this.joinableWallIdsByScene = new Map();
        this.wallAddSequence = null;
        this.wallCommandCanvasCleanup = null;
        this.wallCommandCanvasRef = null;
        this.gridCalibrationCanvasCleanup = null;
        this.gridCalibrationCanvasRef = null;
        this.gridCalibrationPreviewTimer = null;
        this.boundDocument = null;
        this.boundKeyDown = (event) => this.handleKeyDown(event);
    }

    bind(rootElement) {
        const ownerDocument = rootElement?.ownerDocument ?? globalThis.document;
        if (this.boundDocument !== ownerDocument) {
            this.boundDocument?.removeEventListener?.("keydown", this.boundKeyDown);
            this.boundDocument = ownerDocument;
            this.boundDocument?.addEventListener?.("keydown", this.boundKeyDown);
        }

        if (this.wiredElement === rootElement) {
            this.syncWallCommandCanvasListener();
            this.syncGridCalibrationCanvasListener();
            return;
        }
        this.wiredElement = rootElement;

        if (typeof rootElement?.addEventListener === "function") {
            // Clicks delegation
            rootElement.addEventListener("click", async (event) => {
                const target = event.target;
                
                // map-mode-select
                const modeSelectBtn = target?.closest("[data-action='map-mode-select']");
                if (modeSelectBtn && globalThis.game?.user?.isGM) {
                    event.preventDefault();
                    event.stopPropagation();
                    const panelId = String(modeSelectBtn.dataset.mapPanelId ?? "").trim();
                    const mode = String(modeSelectBtn.dataset.mode ?? "").trim();
                    const current = this.getMapPanelToolbarState(this.sceneWorkspaceController.panelRegistry?.get?.(panelId) ?? { id: panelId });
                    const nextMode = current.mode === mode ? null : mode;
                    this.patchMapPanelToolbarState(panelId, {
                        mode: nextMode,
                        ...(nextMode === "walls" ? { wallCommand: "add" } : {})
                    });
                    if (nextMode === "walls") {
                        await this.executeDesignActionCallback("scene.walls", { panelId });
                    } else if (mode === "walls") {
                        await this.deactivateWallModeForPanel(panelId);
                    }
                    this.syncWallCommandCanvasListener();
                    this.renderCallback({ force: false });
                    return;
                }

                // map-wall-command
                const wallCmdBtn = target?.closest("[data-action='map-wall-command']");
                if (wallCmdBtn && globalThis.game?.user?.isGM) {
                    event.preventDefault();
                    event.stopPropagation();
                    const panelId = String(wallCmdBtn.dataset.mapPanelId ?? "").trim();
                    const command = String(wallCmdBtn.dataset.command ?? "").trim();
                    this.cancelWallAddSequence({ notify: false });
                    if (command === "remove") {
                        this.patchMapPanelToolbarState(panelId, { wallCommand: "add" });
                        this.syncWallCommandCanvasListener();
                        await this.deleteSelectedWallsForPanel(panelId);
                        return;
                    }
                    if (command === "join") {
                        this.patchMapPanelToolbarState(panelId, { wallCommand: "add" });
                        this.syncWallCommandCanvasListener();
                        await this.joinSelectedWallsForPanel(panelId);
                        return;
                    }
                    this.patchMapPanelToolbarState(panelId, { wallCommand: command });
                    if (command === "detect") {
                        await this.executeDesignActionCallback("scene.detectWalls", { panelId });
                        this.patchMapPanelToolbarState(panelId, { wallCommand: "add" });
                    }
                    this.syncWallCommandCanvasListener();
                    this.renderCallback({ force: false });
                    return;
                }

                // map-wall-type
                const wallTypeBtn = target?.closest("[data-action='map-wall-type']");
                if (wallTypeBtn && globalThis.game?.user?.isGM) {
                    event.preventDefault();
                    event.stopPropagation();
                    const panelId = String(wallTypeBtn.dataset.mapPanelId ?? "").trim();
                    const wallType = String(wallTypeBtn.dataset.wallType ?? "").trim();
                    this.patchMapPanelToolbarState(panelId, { wallType, wallCommand: "add" });
                    this.syncWallCommandCanvasListener();
                    this.renderCallback({ force: false });
                    return;
                }

                // grid-cal-start
                const gridCalStartBtn = target?.closest("[data-action='grid-cal-start']");
                if (gridCalStartBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    await this.startGridCalibrationFromSceneProperties();
                    return;
                }

                // grid-cal-cancel
                const gridCalCancelBtn = target?.closest("[data-action='grid-cal-cancel']");
                if (gridCalCancelBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.gridCalibrationController.close();
                    this.clearGridCalibrationPreviewTimer();
                    this.clearGridCalibrationCanvasListener();
                    this.renderCallback({ force: false });
                    return;
                }

                // grid-cal-reset
                const gridCalResetBtn = target?.closest("[data-action='grid-cal-reset']");
                if (gridCalResetBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.gridCalibrationController.resetCorners();
                    this.renderCallback({ force: false });
                    return;
                }

                // grid-cal-confirm
                const gridCalConfirmBtn = target?.closest("[data-action='grid-cal-confirm']");
                if (gridCalConfirmBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.syncGridCalibrationStateFromInputs(rootElement);
                    await this.flushGridCalibrationPreview();
                    const result = await this.gridCalibrationController.apply();
                    if (result?.ok) {
                        this.clearGridCalibrationPreviewTimer();
                        this.clearGridCalibrationCanvasListener();
                    }
                    this.renderCallback({ force: false });
                    return;
                }
            });

            // Grid Calibration Inputs delegation
            const gridCalInputSelector = "[data-action='grid-cal-cell-w'], [data-action='grid-cal-cell-h'], [data-action='grid-cal-offset-x'], [data-action='grid-cal-offset-y'], [data-action='grid-cal-color']";
            
            rootElement.addEventListener("keydown", async (event) => {
                const input = event.target;
                if (input?.matches?.(gridCalInputSelector)) {
                    event.stopPropagation();
                    if (event.key === "Tab" || event.key === "Enter") {
                        this.syncGridCalibrationStateFromInputs(rootElement);
                        await this.flushGridCalibrationPreview();
                    }
                    if (event.key === "Tab") {
                        event.preventDefault();
                        this.focusAdjacentGridCalibrationInput(input, { backwards: event.shiftKey }, rootElement);
                    }
                }
            }, { capture: true });

            rootElement.addEventListener("keyup", (event) => {
                const input = event.target;
                if (input?.matches?.(gridCalInputSelector)) {
                    event.stopPropagation();
                }
            }, { capture: true });

            rootElement.addEventListener("input", async (event) => {
                const input = event.target;
                if (input?.matches?.(gridCalInputSelector)) {
                    this.syncGridCalibrationStateFromInputs(rootElement);
                    this.scheduleGridCalibrationPreview({ geometry: input.dataset.action !== "grid-cal-color" });
                }
            });

            rootElement.addEventListener("change", async (event) => {
                const input = event.target;
                if (input?.matches?.(gridCalInputSelector)) {
                    this.syncGridCalibrationStateFromInputs(rootElement);
                    await this.flushGridCalibrationPreview();
                    this.renderCallback({ force: false });
                }
            });

            rootElement.addEventListener("focusout", async (event) => {
                const input = event.target;
                if (input?.matches?.(gridCalInputSelector)) {
                    this.syncGridCalibrationStateFromInputs(rootElement);
                    await this.flushGridCalibrationPreview();
                }
            });
        }

        this.syncWallCommandCanvasListener();
        this.syncGridCalibrationCanvasListener();
    }

    dispose() {
        this.boundDocument?.removeEventListener?.("keydown", this.boundKeyDown);
        this.boundDocument = null;
        this.wiredElement = null;
        this.clearGridCalibrationCanvasListener();
        this.clearWallCommandCanvasListener();
        this.clearGridCalibrationPreviewTimer();
    }

    getSceneGridOverlayState() {
        return null;
    }

    getSceneDetectedWallOverlayState(scene = null) {
        const sceneId = this.#sceneId(scene);
        return sceneId ? (this.detectedWallOverlayStates.get(sceneId) ?? null) : null;
    }

    setSceneDetectedWallOverlayState(scene = null, overlayState = null) {
        const sceneId = this.#sceneId(scene);
        if (!sceneId) return;
        const segments = Array.isArray(overlayState?.segments)
            ? overlayState.segments.filter((segment) => (
                [segment?.x1, segment?.y1, segment?.x2, segment?.y2].every((value) => Number.isFinite(Number(value)))
            )).map((segment) => ({
                id: String(segment.id ?? "").trim(),
                wallKind: ["door", "window", "transparent"].includes(String(segment.wallKind ?? "").trim().toLowerCase())
                    ? String(segment.wallKind ?? "").trim().toLowerCase()
                    : "wall",
                x1: Math.round(Number(segment.x1)),
                y1: Math.round(Number(segment.y1)),
                x2: Math.round(Number(segment.x2)),
                y2: Math.round(Number(segment.y2)),
                selected: Boolean(segment.selected)
            }))
            : [];
        if (!segments.length) {
            this.detectedWallOverlayStates.delete(sceneId);
            return;
        }
        const intersections = Array.isArray(overlayState?.intersections)
            ? overlayState.intersections.filter((point) => (
                [point?.x, point?.y].every((value) => Number.isFinite(Number(value)))
            )).map((point) => ({
                x: Math.round(Number(point.x)),
                y: Math.round(Number(point.y))
            }))
            : [];
        this.detectedWallOverlayStates.set(sceneId, { segments, intersections });
    }

    getSelectedWallIds(scene = null) {
        const sceneId = this.#sceneId(scene);
        return sceneId ? (this.selectedWallIdsByScene.get(sceneId) ?? new Set()) : new Set();
    }

    setSelectedWallIds(scene = null, ids = []) {
        this.#setSceneIds(this.selectedWallIdsByScene, scene, ids);
    }

    getJoinableWallIds(scene = null) {
        const sceneId = this.#sceneId(scene);
        return sceneId ? (this.joinableWallIdsByScene.get(sceneId) ?? new Set()) : new Set();
    }

    setJoinableWallIds(scene = null, ids = []) {
        this.#setSceneIds(this.joinableWallIdsByScene, scene, ids);
    }

    syncSelectedWallsFromCanvas(scene = null, { clearWhenEmpty = false } = {}) {
        const sceneId = this.#sceneId(scene);
        if (!sceneId) return false;
        const canvasSceneId = this.#sceneId(globalThis.canvas?.scene);
        if (canvasSceneId && canvasSceneId !== sceneId) return false;
        const selectedIds = getControlledWallIds(globalThis.canvas?.walls);
        if (selectedIds.length) {
            this.setSelectedWallIds(scene, selectedIds);
            this.setJoinableWallIds(scene, getJoinableWallIds(scene, selectedIds));
            return true;
        }
        if (clearWhenEmpty) {
            this.setSelectedWallIds(scene, []);
            this.setJoinableWallIds(scene, []);
        }
        return false;
    }

    getMapPanelToolbarState(panel = null) {
        const panelId = String(panel?.id ?? "").trim();
        const sceneId = this.sceneWorkspaceController.getPanelSceneId(panel);
        if (sceneId) this.syncSelectedWallsFromCanvas(this.sceneWorkspaceController.getSceneDocumentById(sceneId));
        const selectedWallCount = sceneId ? (this.selectedWallIdsByScene.get(sceneId)?.size ?? 0) : 0;
        const joinableWallCount = sceneId ? (this.joinableWallIdsByScene.get(sceneId)?.size ?? 0) : 0;
        const defaults = { mode: null, wallCommand: "detect", wallType: "wall", selectedWallCount, joinableWallCount };
        return panelId
            ? { ...defaults, ...(this.mapPanelToolbarStates.get(panelId) ?? {}), selectedWallCount, joinableWallCount }
            : defaults;
    }

    patchMapPanelToolbarState(panelId = "", patch = {}) {
        const current = this.mapPanelToolbarStates.get(panelId) ?? { mode: null, wallCommand: "detect", wallType: "wall" };
        this.mapPanelToolbarStates.set(panelId, { ...current, ...patch });
    }

    cancelWallAddSequence({ notify = true } = {}) {
        if (!this.wallAddSequence) return;
        this.wallAddSequence = null;
        if (notify) this.notifications?.info?.("Wall add cancelled.");
    }

    clearWallCommandCanvasListener() {
        this.wallCommandCanvasCleanup?.();
        this.wallCommandCanvasCleanup = null;
        this.wallCommandCanvasRef = null;
    }

    syncWallCommandCanvasListener() {
        if (!this.getActiveWallCommandPanel()) {
            this.clearWallCommandCanvasListener();
            return;
        }
        const canvas = globalThis.canvas;
        if (this.wallCommandCanvasRef === canvas && this.wallCommandCanvasCleanup) return;
        this.clearWallCommandCanvasListener();
        this.wallCommandCanvasRef = canvas;
        this.wallCommandCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            void this.handleWallCommandPointerDown(event);
        });
    }

    clearGridCalibrationCanvasListener() {
        this.gridCalibrationCanvasCleanup?.();
        this.gridCalibrationCanvasCleanup = null;
        this.gridCalibrationCanvasRef = null;
    }

    syncGridCalibrationCanvasListener() {
        if (!this.gridCalibrationController?.active) {
            this.clearGridCalibrationCanvasListener();
            return;
        }
        const canvas = globalThis.canvas;
        const targetSceneId = String(this.gridCalibrationController.state?.sceneId ?? "").trim();
        const canvasSceneId = this.#sceneId(canvas?.scene);
        if (targetSceneId && canvasSceneId && targetSceneId !== canvasSceneId) return;
        if (this.gridCalibrationCanvasRef === canvas && this.gridCalibrationCanvasCleanup) return;
        this.clearGridCalibrationCanvasListener();
        this.gridCalibrationCanvasRef = canvas;
        this.gridCalibrationCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            if (!this.gridCalibrationController.active) return;
            const point = getNativeCanvasEventScenePoint(event, canvas);
            if (!point) {
                this.notifications?.warn?.("That canvas click could not be converted to scene coordinates.");
                return;
            }
            event?.stopPropagation?.();
            event?.preventDefault?.();
            const picked = this.gridCalibrationController.pickCorner({
                x: Math.round(point.x),
                y: Math.round(point.y)
            });
            if (picked.phase === "pick-second") {
                this.notifications?.info?.("First grid corner set. Click the opposite corner of the same cell.");
            }
            if (picked.phase === "adjust") {
                this.notifications?.info?.("Grid sample captured. Review the values and apply when ready.");
                void this.previewGridCalibrationOnCanvas();
            }
            this.renderCallback({ force: false });
        });
    }

    async handleKeyDown(event) {
        if (event.key === "Escape" && this.encounterPlanningFeature?.hasActiveTargetingInteraction) {
            event.preventDefault();
            await this.encounterPlanningFeature.cancelActiveTargetingInteraction();
            return;
        }

        const activeWallsPanel = this.getActiveWallsPanel();
        if (event.key === "Escape" && globalThis.game?.user?.isGM && activeWallsPanel) {
            event.preventDefault();
            event.stopPropagation();
            this.cancelWallAddSequence({ notify: false });
            this.patchMapPanelToolbarState(activeWallsPanel.panel.id, { wallCommand: "add" });
            this.syncWallCommandCanvasListener();
            this.notifications?.info?.("Wall placement reset. Click to set a new starting point.");
            this.renderCallback({ force: false });
            return;
        }

        if (!globalThis.game?.user?.isGM) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;

        const panel = this.#getPrimaryActivePanel();
        if (!this.#isMapPanel(panel)) return;

        const panelId = String(panel?.id ?? "").trim();
        if (!panelId) return;

        const state = this.getMapPanelToolbarState(panel);
        const key = String(event.key ?? "").toLowerCase();
        const wallsActive = state.mode === "walls";

        if (key === "w" && !wallsActive) {
            event.preventDefault();
            this.patchMapPanelToolbarState(panelId, { mode: "walls", wallCommand: "add" });
            await this.executeDesignActionCallback("scene.walls", { panelId });
            this.syncWallCommandCanvasListener();
            this.renderCallback({ force: false });
            return;
        }

        if (!wallsActive) return;

        if (key === "s") {
            event.preventDefault();
            this.cancelWallAddSequence();
            this.patchMapPanelToolbarState(panelId, { wallCommand: "split" });
            this.syncWallCommandCanvasListener();
            this.renderCallback({ force: false });
            return;
        }

        if (key === "j") {
            event.preventDefault();
            await this.joinSelectedWallsForPanel(panelId);
            return;
        }

        if (key === "delete") {
            if (Number(state.selectedWallCount ?? 0) <= 0) return;
            event.preventDefault();
            await this.deleteSelectedWallsForPanel(panelId);
            return;
        }

        const wallType = wallTypeForShortcut(key);
        if (!wallType) return;

        event.preventDefault();
        this.patchMapPanelToolbarState(panelId, { wallType, wallCommand: "add" });
        this.syncWallCommandCanvasListener();
        this.renderCallback({ force: false });
    }

    async deactivateWallModeForPanel(panelId = "") {
        const panel = this.sceneWorkspaceController.panelRegistry?.get?.(panelId) ?? { id: panelId };
        const scene = this.sceneWorkspaceController.getDesignActionScene(panel, globalThis.canvas?.scene ?? globalThis.game.scenes?.active ?? globalThis.game.scenes?.viewed ?? null);
        this.cancelWallAddSequence({ notify: false });
        this.clearWallCommandCanvasListener();
        if (scene) {
            this.setSelectedWallIds(scene, []);
            this.setJoinableWallIds(scene, []);
            this.setSceneDetectedWallOverlayState(scene, null);
        }

        try {
            if (typeof globalThis.ui?.controls?.activate === "function") {
                await globalThis.ui.controls.activate({ control: "tokens", tool: "select" });
                return;
            }
            if (typeof globalThis.ui?.controls?.initialize === "function") {
                await globalThis.ui.controls.initialize({ control: "tokens", tool: "select" });
                return;
            }
            await globalThis.canvas?.tokens?.activate?.();
        } catch (error) {
            console.warn("[turn-of-the-century] Failed to deactivate native wall controls", error);
        }
    }

    async deleteSelectedWallsForPanel(panelId = "") {
        const panel = this.sceneWorkspaceController.panelRegistry?.get?.(panelId) ?? { id: panelId };
        const scene = this.sceneWorkspaceController.getDesignActionScene(panel, globalThis.canvas?.scene ?? globalThis.game.scenes?.active ?? globalThis.game.scenes?.viewed ?? null);
        this.syncSelectedWallsFromCanvas(scene);
        const selectedIds = this.getSelectedWallIds(scene);
        if (!scene || !selectedIds.size) {
            this.notifications?.warn?.("Select wall segments before deleting them.");
            return;
        }

        const result = await removeWallSegmentsById({ scene, ids: selectedIds });
        if (result?.ok) {
            this.setSelectedWallIds(scene, []);
            this.setJoinableWallIds(scene, []);
            this.refreshSceneWallOverlay(scene);
        }
        this.reportWallEditResult("remove", result);
    }

    async joinSelectedWallsForPanel(panelId = "") {
        const panel = this.sceneWorkspaceController.panelRegistry?.get?.(panelId) ?? { id: panelId };
        const scene = this.sceneWorkspaceController.getDesignActionScene(panel, globalThis.canvas?.scene ?? globalThis.game.scenes?.active ?? globalThis.game.scenes?.viewed ?? null);
        this.syncSelectedWallsFromCanvas(scene);
        const joinableIds = this.getJoinableWallIds(scene);
        if (!scene || joinableIds.size < 2) {
            this.notifications?.warn?.("Select two or more aligned adjacent wall segments before joining them.");
            return;
        }

        const result = await joinWallSegmentsById({ scene, ids: joinableIds });
        if (result?.ok) {
            this.setSelectedWallIds(scene, []);
            this.setJoinableWallIds(scene, []);
            this.refreshSceneWallOverlay(scene);
        }
        this.reportWallEditResult("join", result);
    }

    getActiveWallsPanel() {
        const panels = [
            this.#getPrimaryActivePanel(),
            this.#getActiveCenterMapPanel()
        ].filter(Boolean);

        for (const panel of panels) {
            if (!this.#isMapPanel(panel)) continue;
            const state = this.getMapPanelToolbarState(panel);
            if (state.mode === "walls") return { panel, state };
        }

        return null;
    }

    getActiveWallCommandPanel() {
        const active = this.getActiveWallsPanel();
        if (!active) return null;
        const command = String(active.state.wallCommand ?? "").trim();
        return ["add", "split"].includes(command) ? { ...active, command } : null;
    }

    async handleWallCommandPointerDown(event = {}) {
        const active = this.getActiveWallCommandPanel();
        if (!active || !globalThis.game?.user?.isGM) return;
        if (!isPrimaryPointerButton(event)) return;

        const point = getNativeCanvasEventScenePoint(event, globalThis.canvas);
        if (!point) {
            this.notifications?.warn?.("That wall click could not be converted to scene coordinates.");
            return;
        }

        event?.stopPropagation?.();
        event?.preventDefault?.();

        const scene = this.sceneWorkspaceController.getDesignActionScene(active.panel, globalThis.canvas?.scene ?? globalThis.game.scenes?.active ?? globalThis.game.scenes?.viewed ?? null);
        const grid = buildWallEditingGrid(scene);
        const snapped = snapPointToGridIntersection(point, grid);
        if (!scene || !snapped) {
            this.notifications?.warn?.("Wall editing requires a calibrated square grid.");
            return;
        }

        if (active.command === "add") {
            await this.handleWallAddCanvasPoint({ scene, point: snapped, state: active.state });
            return;
        }

        if (active.command === "split") {
            const result = await splitWallSegmentAtPoint({ scene, point: snapped, grid });
            if (result?.ok) this.refreshSceneWallOverlay(scene);
            this.reportWallEditResult("split", result);
        }
    }

    async handleWallAddCanvasPoint({ scene = null, point = null, state = {} } = {}) {
        if (!scene || !point) return;

        const previousSequence = this.wallAddSequence;
        const step = advanceWallPlacementSequence(previousSequence, {
            sceneId: String(scene.id ?? scene._id ?? ""),
            point
        });
        this.wallAddSequence = step.sequence;
        if (!step.segment) {
            this.notifications?.info?.("Wall start set. Each left click adds the next segment. Press Esc to reset the origin.");
            return;
        }

        const result = await addWallSegmentToScene({
            scene,
            start: step.segment.start,
            end: step.segment.end,
            wallType: state.wallType
        });
        if (result?.ok) {
            this.refreshSceneWallOverlay(scene);
        } else {
            this.wallAddSequence = previousSequence;
        }
        this.reportWallEditResult("add", result);
    }

    reportWallEditResult(command, result = null) {
        if (result?.ok) {
            const deletedCount = Array.isArray(result.deleted) ? result.deleted.length : 0;
            const messages = {
                add: "Wall segment added.",
                remove: deletedCount > 1 ? `${deletedCount} wall segments removed.` : "Wall segment removed.",
                split: "Wall segment split.",
                join: "Wall segments joined."
            };
            this.notifications?.info?.(messages[command] ?? "Wall edit applied.");
            this.renderCallback({ force: false });
            return;
        }

        const reasonMessages = {
            "wall-not-found": "No wall segment was found near that point.",
            "join-not-found": "No aligned wall segments were found near that join point.",
            "invalid-split-point": "That wall cannot be split at the selected grid point.",
            "invalid-wall-segment": "Choose two different grid intersections for a wall segment.",
            "wall-creation-unavailable": "This scene cannot create walls in the current Foundry session.",
            "wall-deletion-unavailable": "This scene cannot delete walls in the current Foundry session.",
            "wall-update-unavailable": "This scene cannot update walls in the current Foundry session."
        };
        this.notifications?.warn?.(reasonMessages[result?.reason] ?? "Wall edit could not be applied.");
    }

    refreshSceneWallOverlay(scene = null) {
        if (!scene) return;
        const walls = scene?.walls;
        const wallDocuments = Array.isArray(walls)
            ? walls
            : Array.isArray(walls?.contents)
                ? walls.contents
                : typeof walls?.values === "function"
                    ? Array.from(walls.values())
                    : typeof walls?.[Symbol.iterator] === "function"
                        ? Array.from(walls)
                        : [];
        const existingWallIds = new Set(wallDocuments.map((wall) => wallDocumentId(wall)).filter(Boolean));
        const selectedWallIds = [...this.getSelectedWallIds(scene)].filter((id) => existingWallIds.has(id));
        const joinableWallIds = [...this.getJoinableWallIds(scene)].filter((id) => existingWallIds.has(id));
        this.setSelectedWallIds(scene, selectedWallIds);
        this.setJoinableWallIds(scene, joinableWallIds);
        this.setSceneDetectedWallOverlayState(scene, buildSceneWallOverlayState(scene, {
            selectedWallIds
        }));
    }

    async startGridCalibrationFromSceneProperties() {
        const activePanel = this.#getPrimaryActivePanel();
        const viewedScene = this.sceneWorkspaceController.getViewedSceneDocument();
        const defaultScene = globalThis.canvas?.scene ?? globalThis.game.scenes?.active ?? viewedScene ?? null;
        const scene = this.sceneWorkspaceController.getScenePropertiesScene();
        if (!scene) {
            this.notifications?.warn?.("Open a scene before calibrating its grid.");
            return;
        }

        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        const currentSceneId = String(globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? globalThis.game.scenes?.viewed?.id ?? "").trim();
        if (sceneId && currentSceneId !== sceneId && typeof scene.view === "function") {
            await scene.view();
        }

        this.gridCalibrationController.open({ scene });
        this.syncGridCalibrationCanvasListener();
        this.notifications?.info?.("Grid calibration started. Click two corners of the same visible grid cell on the scene.");
        this.renderCallback({ force: false });
    }

    syncGridCalibrationStateFromInputs(rootElement = this.boundDocument?.body ?? globalThis.document.body) {
        const root = rootElement?.querySelector("[data-grid-calibration='true']");
        if (!root) return;

        const readNumber = (action) => root.querySelector(`[data-action='${action}']`)?.value;
        const cellW = readNumber("grid-cal-cell-w");
        const cellH = readNumber("grid-cal-cell-h");
        const offsetX = readNumber("grid-cal-offset-x");
        const offsetY = readNumber("grid-cal-offset-y");
        const color = root.querySelector("[data-action='grid-cal-color']")?.value;

        if (cellW !== undefined) this.gridCalibrationController.setCellWidth(cellW);
        if (cellH !== undefined) this.gridCalibrationController.setCellHeight(cellH);
        if (offsetX !== undefined) this.gridCalibrationController.setOffsetX(offsetX);
        if (offsetY !== undefined) this.gridCalibrationController.setOffsetY(offsetY);
        if (color !== undefined) this.gridCalibrationController.setColor(color);
    }

    focusAdjacentGridCalibrationInput(currentInput, { backwards = false } = {}, rootElement = this.boundDocument?.body ?? globalThis.document.body) {
        const root = rootElement?.querySelector("[data-grid-calibration='true']");
        if (!root) return false;

        const inputs = Array.from(root.querySelectorAll("[data-action='grid-cal-cell-w'], [data-action='grid-cal-cell-h'], [data-action='grid-cal-offset-x'], [data-action='grid-cal-offset-y'], [data-action='grid-cal-color']"))
            .filter((input) => !input.disabled && input.offsetParent !== null);
        const currentIndex = inputs.indexOf(currentInput);
        if (!inputs.length || currentIndex < 0) return false;

        const delta = backwards ? -1 : 1;
        const nextInput = inputs[(currentIndex + delta + inputs.length) % inputs.length];
        nextInput?.focus?.();
        nextInput?.select?.();
        return Boolean(nextInput);
    }

    scheduleGridCalibrationPreview({ geometry = true } = {}) {
        if (this.gridCalibrationPreviewTimer) clearTimeout(this.gridCalibrationPreviewTimer);
        const delay = geometry
            ? GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS
            : GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS;
        this.gridCalibrationPreviewTimer = setTimeout(() => {
            this.gridCalibrationPreviewTimer = null;
            void this.previewGridCalibrationOnCanvas();
        }, delay);
    }

    clearGridCalibrationPreviewTimer() {
        if (!this.gridCalibrationPreviewTimer) return;
        clearTimeout(this.gridCalibrationPreviewTimer);
        this.gridCalibrationPreviewTimer = null;
    }

    async flushGridCalibrationPreview() {
        this.clearGridCalibrationPreviewTimer();
        return this.previewGridCalibrationOnCanvas();
    }

    async previewGridCalibrationOnCanvas() {
        const state = this.gridCalibrationController.state;
        const updateData = this.gridCalibrationController.buildUpdateData();
        if (!state?.active || !updateData) return false;

        const scene = state.sceneId
            ? globalThis.game.scenes?.get(state.sceneId)
            : (globalThis.canvas?.scene ?? globalThis.game.scenes?.viewed ?? null);
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        const canvasSceneId = String(globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? "").trim();
        if (!scene || (sceneId && canvasSceneId && sceneId !== canvasSceneId)) return false;

        try {
            return await previewNativeCanvasGrid({ canvasRef: globalThis.canvas, scene, updateData });
        } catch (error) {
            console.warn("[turn-of-the-century] Grid calibration preview failed", error);
            return false;
        }
    }

    #getPrimaryActivePanel(layout = this.sceneWorkspaceController?.layoutEngine?.getLayout()) {
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

    #getActiveCenterMapPanel(layout = this.sceneWorkspaceController?.layoutEngine?.getLayout()) {
        const centerDock = layout?.root?.centerDock;
        for (const stack of centerDock?.stacks ?? []) {
            const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
            if (this.#isMapPanel(activePanel)) return activePanel;
        }
        return null;
    }

    #isMapPanel(panel) {
        return this.sceneWorkspaceController?.isMapPanel?.(panel) ?? false;
    }

    #sceneId(scene) {
        return String(scene?.id ?? scene?._id ?? "").trim();
    }

    #setSceneIds(store, scene, ids) {
        const sceneId = this.#sceneId(scene);
        if (!sceneId) return;
        const values = new Set(Array.from(ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean));
        if (values.size) store.set(sceneId, values);
        else store.delete(sceneId);
    }
}
