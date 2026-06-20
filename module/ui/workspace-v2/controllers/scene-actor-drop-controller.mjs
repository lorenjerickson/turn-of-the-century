import {
    buildActorListDragPayload,
    ACTOR_LIST_DRAG_MIME
} from "../panels/actor-management-panel.mjs";
import {
    buildSceneActorTokenData
} from "../scene-actor-placement.mjs";

function tokenIconForActor(actor) {
    return String(actor?.prototypeToken?.texture?.src ?? actor?.img ?? "").trim();
}

export function buildFoundryActorDragPayload(actor) {
    if (!actor) return null;
    const id = String(actor?.id ?? actor?._id ?? "").trim();
    const uuid = String(actor?.uuid ?? (id ? `Actor.${id}` : "")).trim();
    if (!uuid) return null;
    return { type: "Actor", uuid };
}

export class SceneActorDropController {
    constructor({
        getRoot = () => null,
        getSelectedActorIds = () => [],
        getActorById = () => null,
        getFallbackScene = () => null,
        setScenePropertiesState = () => {},
        render = () => {},
        documentRef = () => globalThis.document,
        logger = console
    } = {}) {
        this.getRoot = getRoot;
        this.getSelectedActorIds = getSelectedActorIds;
        this.getActorById = getActorById;
        this.getFallbackScene = getFallbackScene;
        this.setScenePropertiesState = setScenePropertiesState;
        this.render = render;
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
                const actor = this.getActorById(actorId);
                const foundryPayload = buildFoundryActorDragPayload(actor ?? { id: actorId });
                if (!foundryPayload) {
                    this.#log("warn", "Actor map drag aborted without a Foundry document reference", { actorId });
                    return;
                }
                this.activeDragPayload = payload;
                event.dataTransfer.setData(ACTOR_LIST_DRAG_MIME, JSON.stringify(payload));
                event.dataTransfer.setData("text/plain", JSON.stringify(foundryPayload));
                event.dataTransfer.effectAllowed = "copy";
                this.#setDragImage(event.dataTransfer, payload.actorIds);
                this.#log("debug", "Actor map drag started", {
                    actorId,
                    actorIds: payload.actorIds,
                    dataTransferTypes: this.#dataTransferTypes(event.dataTransfer)
                });
                row.classList.add("is-dragging");
            });
            row.addEventListener("dragend", () => {
                this.#log("debug", "Actor map drag ended", {
                    activeActorIds: this.activeDragPayload?.actorIds ?? []
                });
                row.classList.remove("is-dragging");
                this.clearDragImage();
                this.activeDragPayload = null;
            });
        });
    }

    async addActorsToScene(actors = [], { scene = null, anchorPosition = null } = {}) {
        scene ??= this.getFallbackScene();
        if (!scene) {
            this.#log("warn", "Scene actor placement aborted without scene", {
                actorCount: Array.from(actors ?? []).filter(Boolean).length,
                anchorPosition
            });
            this.#setStatus({ status: "", error: "No scene is available for actor placement." });
            this.render();
            return;
        }

        const selectedActors = Array.from(actors ?? []).filter(Boolean);
        if (!selectedActors.length) {
            this.#log("warn", "Scene actor placement aborted without resolved actors", {
                anchorPosition
            });
            this.#setStatus({ status: "", error: "Choose at least one actor to add to the scene." });
            this.render();
            return;
        }

        try {
            if (typeof scene.createEmbeddedDocuments !== "function") {
                throw new Error("Scene token creation is not available.");
            }
            const tokenData = await buildSceneActorTokenData({ actors: selectedActors, scene, anchorPosition });
            this.#log("debug", "Scene actor token data built", {
                actorIds: selectedActors.map((actor) => actor?.id ?? actor?._id ?? actor?.uuid ?? actor?.name),
                sceneId: scene?.id ?? scene?._id ?? "",
                sceneName: scene?.name ?? "",
                tokenCount: tokenData.length,
                tokens: tokenData.map((token) => ({
                    actorId: token.actorId,
                    name: token.name,
                    x: token.x,
                    y: token.y
                }))
            });
            if (!tokenData.length) {
                this.#setStatus({
                    status: "No new actors added. Named actors already present in the scene are not duplicated.",
                    error: ""
                });
                this.render();
                return;
            }
            await scene.createEmbeddedDocuments("Token", tokenData);
            this.#log("info", "Scene actor tokens created", {
                sceneId: scene?.id ?? scene?._id ?? "",
                sceneName: scene?.name ?? "",
                tokenCount: tokenData.length
            });
            this.#setStatus({
                status: `Added ${tokenData.length} actor${tokenData.length === 1 ? "" : "s"} to ${scene.name ?? "scene"}.`,
                error: ""
            });
        } catch (error) {
            this.#log("error", "Scene actor placement failed", {
                message: error?.message ?? String(error),
                stack: error?.stack ?? ""
            });
            this.logger?.error?.("[turn-of-the-century] Scene actor placement failed", error);
            this.#setStatus({ status: "", error: "Actor placement failed - see console." });
        }

        this.render();
    }

    clearDragImage() {
        this.dragImage?.remove?.();
        this.dragImage = null;
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

    #setStatus(patch = {}) {
        this.setScenePropertiesState(patch);
    }

    #dataTransferTypes(dataTransfer) {
        return Array.from(dataTransfer?.types ?? []);
    }

    #log(level, message, data = {}) {
        const logger = this.logger;
        const text = `[turn-of-the-century] ${message}`;
        const method = logger?.[level] ?? logger?.debug ?? logger?.log;
        method?.call?.(logger, text, data);
    }
}
