import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    getNativeCanvasEventScenePoint,
    listenForNativeCanvasPointerDown
} from "../native-canvas-grid-calibration.mjs";
import {
    getControlledWallIds,
    getJoinableWallIds
} from "../scene-wall-editing.mjs";

export class SceneDesignFeature extends WorkspaceFeature {
    constructor({
        gridCalibrationController,
        getPanelSceneId = () => "",
        getSceneDocumentById = () => null,
        getActiveWallCommandPanel = () => null,
        handleWallCommandPointerDown = () => {},
        previewGridCalibration = () => {},
        render = () => {},
        onKeyDown = () => {},
        notifications = globalThis.ui?.notifications
    } = {}) {
        super();
        this.gridCalibrationController = gridCalibrationController;
        this.getPanelSceneId = getPanelSceneId;
        this.getSceneDocumentById = getSceneDocumentById;
        this.getActiveWallCommandPanel = getActiveWallCommandPanel;
        this.handleWallCommandPointerDown = handleWallCommandPointerDown;
        this.previewGridCalibration = previewGridCalibration;
        this.renderCallback = render;
        this.onKeyDown = onKeyDown;
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
        this.boundDocument = null;
        this.boundKeyDown = (event) => this.onKeyDown(event);
    }

    bind(rootElement) {
        const ownerDocument = rootElement?.ownerDocument ?? globalThis.document;
        if (this.boundDocument === ownerDocument) return;
        this.boundDocument?.removeEventListener?.("keydown", this.boundKeyDown);
        this.boundDocument = ownerDocument;
        this.boundDocument?.addEventListener?.("keydown", this.boundKeyDown);
    }

    dispose() {
        this.boundDocument?.removeEventListener?.("keydown", this.boundKeyDown);
        this.boundDocument = null;
        this.clearGridCalibrationCanvasListener();
        this.clearWallCommandCanvasListener();
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
        const sceneId = this.getPanelSceneId(panel);
        if (sceneId) this.syncSelectedWallsFromCanvas(this.getSceneDocumentById(sceneId));
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
                void this.previewGridCalibration();
            }
            this.renderCallback({ force: false });
        });
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
