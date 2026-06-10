import {
    buildActorListDragPayload,
    parseActorListDragPayload,
    ACTOR_LIST_DRAG_MIME
} from "../panels/actor-management-panel.mjs";
import {
    buildSceneActorDropPreview,
    buildSceneActorTokenData
} from "../scene-actor-placement.mjs";

function dataTransferHasType(dataTransfer, mimeType) {
    const types = dataTransfer?.types;
    if (typeof types?.contains === "function") return types.contains(mimeType);
    return Array.from(types ?? []).includes(mimeType);
}

function tokenIconForActor(actor) {
    return String(actor?.prototypeToken?.texture?.src ?? actor?.img ?? "").trim();
}

function isElementLike(element) {
    return Boolean(element?.style && element?.classList && typeof element?.querySelector === "function");
}

export class SceneActorDropController {
    constructor({
        getRoot = () => null,
        getSelectedActorIds = () => [],
        getActorById = () => null,
        getSceneById = () => null,
        getFallbackScene = () => null,
        getImageSpacePoint = () => null,
        setScenePropertiesState = () => {},
        render = () => {},
        escapeHTML = (value) => String(value ?? ""),
        documentRef = () => globalThis.document,
        logger = console
    } = {}) {
        this.getRoot = getRoot;
        this.getSelectedActorIds = getSelectedActorIds;
        this.getActorById = getActorById;
        this.getSceneById = getSceneById;
        this.getFallbackScene = getFallbackScene;
        this.getImageSpacePoint = getImageSpacePoint;
        this.setScenePropertiesState = setScenePropertiesState;
        this.render = render;
        this.escapeHTML = escapeHTML;
        this.documentRef = documentRef;
        this.logger = logger;
        this.dragImage = null;
        this.activeDragPayload = null;
    }

    wireActorListDragHandlers(root = this.getRoot()) {
        root?.querySelectorAll("[data-actor-list-draggable='true']")?.forEach((row) => {
            row.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                const actorId = String(row.dataset.actorId ?? "").trim();
                const payload = buildActorListDragPayload({
                    actorId,
                    selectedActorIds: this.getSelectedActorIds()
                });
                if (!payload?.actorIds?.length || !event.dataTransfer) return;
                this.activeDragPayload = payload;
                event.dataTransfer.setData(ACTOR_LIST_DRAG_MIME, JSON.stringify(payload));
                event.dataTransfer.setData("text/plain", payload.actorIds.join(","));
                event.dataTransfer.effectAllowed = "copy";
                this.#setDragImage(event.dataTransfer, payload.actorIds);
                row.classList.add("is-dragging");
            });
            row.addEventListener("dragend", () => {
                row.classList.remove("is-dragging");
                this.clearDragImage();
                this.clearSceneActorDropTargets();
                this.activeDragPayload = null;
            });
        });
    }

    wireSceneActorDropHandlers(root = this.getRoot()) {
        root?.querySelectorAll("[data-scene-actor-drop-target='true']")?.forEach((target) => {
            target.addEventListener("dragover", (event) => {
                if (!this.#hasActorDragPayload(event.dataTransfer)) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
                this.clearSceneActorDropTargets(target);
                const payload = this.#payloadFromDataTransfer(event.dataTransfer);
                const actors = this.#actorsFromPayload(payload);
                const scene = this.#sceneFromDropTarget(target);
                this.renderActorDropPreview(target, { actors, scene, event });
                target.classList.add("is-actor-drop-target");
            });
            target.addEventListener("dragleave", (event) => {
                const related = event.relatedTarget;
                if (related && target.contains(related)) return;
                target.classList.remove("is-actor-drop-target");
                this.clearActorDropPreviews();
            });
            target.addEventListener("drop", async (event) => {
                if (!this.#hasActorDragPayload(event.dataTransfer)) return;
                const payload = this.#payloadFromDataTransfer(event.dataTransfer);
                if (!payload.actorIds.length) return;
                event.preventDefault();
                event.stopPropagation();
                target.classList.remove("is-actor-drop-target");
                this.clearActorDropPreviews();

                const actors = this.#actorsFromPayload(payload);
                const scene = this.#sceneFromDropTarget(target);
                const viewport = target.querySelector("[data-map-viewport='true']");
                const anchorPosition = this.getImageSpacePoint(viewport, event);
                await this.addActorsToScene(actors, { scene, anchorPosition });
                this.activeDragPayload = null;
            });
        });
    }

    syncActorDropPreviewTransforms(root = this.getRoot()) {
        const viewports = [...(root?.querySelectorAll("[data-action='map-viewport']") ?? [])];
        for (const viewport of viewports) this.syncActorDropPreviewTransform(viewport);
    }

    syncActorDropPreviewTransform(viewport) {
        const layers = [
            viewport?.querySelector?.("[data-map-token-layer='true']"),
            viewport?.querySelector?.("[data-actor-drop-preview='true']")
        ].filter(isElementLike);
        const image = viewport?.querySelector?.("[data-action='map-image']");
        if (!layers.length || !image?.style) return;
        const width = Number(image.naturalWidth);
        const height = Number(image.naturalHeight);
        for (const layer of layers) {
            if (Number.isFinite(width) && width > 0) layer.style.width = `${width}px`;
            if (Number.isFinite(height) && height > 0) layer.style.height = `${height}px`;
            layer.style.transform = image.style.transform;
        }
    }

    clearSceneActorDropTargets(except = null) {
        this.getRoot()?.querySelectorAll("[data-scene-actor-drop-target].is-actor-drop-target")?.forEach((target) => {
            if (target !== except) target.classList.remove("is-actor-drop-target");
        });
        this.clearActorDropPreviews(except?.querySelector?.("[data-actor-drop-preview='true']") ?? null);
    }

    clearActorDropPreviews(except = null) {
        this.getRoot()?.querySelectorAll("[data-actor-drop-preview='true']")?.forEach((layer) => {
            if (layer === except) return;
            layer.innerHTML = "";
            layer.classList.remove("has-preview");
        });
    }

    renderActorDropPreview(target, { actors = [], scene = null, event = null } = {}) {
        const viewport = target?.querySelector?.("[data-map-viewport='true']");
        const layer = viewport?.querySelector?.("[data-actor-drop-preview='true']");
        if (!isElementLike(viewport) || !isElementLike(layer)) return null;

        this.syncActorDropPreviewTransform(viewport);
        const anchorPosition = this.getImageSpacePoint(viewport, event);
        const previews = buildSceneActorDropPreview({ actors, scene, anchorPosition });
        layer.innerHTML = previews.map((preview) => `
            <span class="totc-v2-map-panel__actor-drop-square totc-v2-map-panel__actor-drop-square--${this.escapeHTML(preview.role)}"
                style="left:${this.escapeHTML(preview.x)}px;top:${this.escapeHTML(preview.y)}px;width:${this.escapeHTML(preview.width)}px;height:${this.escapeHTML(preview.height)}px"
                title="${this.escapeHTML(preview.actorName)}"></span>`).join("");
        layer.classList.toggle("has-preview", previews.length > 0);
        this.clearActorDropPreviews(layer);
        return anchorPosition;
    }

    async addActorsToScene(actors = [], { scene = null, anchorPosition = null } = {}) {
        scene ??= this.getFallbackScene();
        if (!scene) {
            this.#setStatus({ status: "", error: "No scene is available for actor placement." });
            this.render();
            return;
        }

        const selectedActors = Array.from(actors ?? []).filter(Boolean);
        if (!selectedActors.length) {
            this.#setStatus({ status: "", error: "Choose at least one actor to add to the scene." });
            this.render();
            return;
        }

        try {
            if (typeof scene.createEmbeddedDocuments !== "function") {
                throw new Error("Scene token creation is not available.");
            }
            const tokenData = await buildSceneActorTokenData({ actors: selectedActors, scene, anchorPosition });
            if (!tokenData.length) {
                this.#setStatus({
                    status: "No new actors added. Named actors already present in the scene are not duplicated.",
                    error: ""
                });
                this.render();
                return;
            }
            await scene.createEmbeddedDocuments("Token", tokenData);
            this.#setStatus({
                status: `Added ${tokenData.length} actor${tokenData.length === 1 ? "" : "s"} to ${scene.name ?? "scene"}.`,
                error: ""
            });
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Scene actor placement failed", error);
            this.#setStatus({ status: "", error: "Actor placement failed - see console." });
        }

        this.render();
    }

    clearDragImage() {
        this.dragImage?.remove?.();
        this.dragImage = null;
    }

    #payloadFromDataTransfer(dataTransfer) {
        const payload = parseActorListDragPayload(dataTransfer?.getData?.(ACTOR_LIST_DRAG_MIME));
        return payload.actorIds.length ? payload : (this.activeDragPayload ?? payload);
    }

    #hasActorDragPayload(dataTransfer) {
        return dataTransferHasType(dataTransfer, ACTOR_LIST_DRAG_MIME) || Boolean(this.activeDragPayload?.actorIds?.length);
    }

    #setDragImage(dataTransfer, actorIds = []) {
        const documentRef = this.documentRef();
        if (!dataTransfer || typeof dataTransfer.setDragImage !== "function" || !documentRef?.body) return;
        this.clearDragImage();

        const actors = Array.from(actorIds ?? [])
            .map((id) => this.getActorById(id))
            .filter(Boolean);
        if (!actors.length) return;

        const columns = Math.max(1, Math.ceil(Math.sqrt(actors.length)));
        const dragImage = documentRef.createElement("div");
        dragImage.className = "totc-v2-actor-drag-image";
        dragImage.style.gridTemplateColumns = `repeat(${columns}, 2.5rem)`;
        dragImage.setAttribute("aria-hidden", "true");

        for (const actor of actors) {
            const icon = tokenIconForActor(actor);
            if (icon) {
                const image = documentRef.createElement("img");
                image.src = icon;
                image.alt = "";
                image.draggable = false;
                dragImage.append(image);
            } else {
                const fallback = documentRef.createElement("span");
                fallback.textContent = String(actor?.name ?? "?").slice(0, 1).toUpperCase() || "?";
                dragImage.append(fallback);
            }
        }

        documentRef.body.append(dragImage);
        this.dragImage = dragImage;
        dataTransfer.setDragImage(dragImage, 20, 20);
    }

    #actorsFromPayload(payload = {}) {
        return payload.actorIds.map((id) => this.getActorById(id)).filter(Boolean);
    }

    #sceneFromDropTarget(target) {
        const sceneId = String(target?.dataset?.sceneId ?? "").trim();
        return sceneId ? this.getSceneById(sceneId) : null;
    }

    #setStatus(patch = {}) {
        this.setScenePropertiesState(patch);
    }
}
