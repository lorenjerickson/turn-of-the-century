import { WorkspaceFeature } from "../workspace-feature.mjs";
import { ActorWorkspaceController } from "./actor-workspace-controller.mjs";
import {
    buildActorEditorPanelModel,
    buildActorListPanelModel,
    buildActorUpdateDataFromFormData,
    buildGeneratedActorDocumentData,
    renderActorEditorPanel,
    renderActorListPanel
} from "../panels/actor-management-panel.mjs";
import { LLMService, buildActorTokenImagePrompt } from "../../../services/llm-service.mjs";
import { requireActorDocumentClass, requireFilePicker, getFileConstructor } from "../../../foundry-v14-runtime.mjs";

function slugifyActorName(name) {
    return String(name ?? "")
        .toLowerCase()
        .replace(/['']/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

const TOKEN_IMAGE_DIR = "assets/images/tokens";

function base64ToBytes(b64Data) {
    const binary = globalThis.atob?.(b64Data) ?? "";
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return globalThis.btoa?.(binary) ?? "";
}

export function applyCircularTokenAlphaMask(imageData, { paddingRatio = 0.012 } = {}) {
    const width = Number(imageData?.width ?? 0);
    const height = Number(imageData?.height ?? 0);
    const data = imageData?.data;
    if (!width || !height || !data) return imageData;

    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    const padding = paddingRatio > 0 ? Math.max(1, Math.min(width, height) * paddingRatio) : 0;
    const radius = (Math.min(width, height) / 2) - padding;
    const radiusSquared = radius * radius;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const dx = x - centerX;
            const dy = y - centerY;
            if ((dx * dx) + (dy * dy) <= radiusSquared) continue;

            const index = ((y * width) + x) * 4;
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 0;
        }
    }

    return imageData;
}

async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
}

async function normalizeActorTokenImageBase64(b64Data, {
    ImageClass = globalThis.Image,
    documentRef = globalThis.document,
    URLRef = globalThis.URL
} = {}) {
    if (!ImageClass || !documentRef?.createElement || !URLRef?.createObjectURL) return b64Data;

    const blob = new Blob([base64ToBytes(b64Data)], { type: "image/png" });
    const objectUrl = URLRef.createObjectURL(blob);
    try {
        const image = new ImageClass();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("Generated token image could not be decoded."));
            image.src = objectUrl;
        });

        const canvas = documentRef.createElement("canvas");
        canvas.width = image.naturalWidth || image.width || 1024;
        canvas.height = image.naturalHeight || image.height || 1024;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context?.drawImage || !context?.getImageData || !context?.putImageData) return b64Data;

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        context.putImageData(applyCircularTokenAlphaMask(imageData), 0, 0);

        if (typeof canvas.toBlob !== "function") return b64Data;
        const normalizedBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!normalizedBlob) return b64Data;
        return await blobToBase64(normalizedBlob);
    } catch (_error) {
        return b64Data;
    } finally {
        URLRef.revokeObjectURL?.(objectUrl);
    }
}

async function saveActorTokenImageToWorld(actorName, b64Data) {
    const slug = slugifyActorName(actorName) || "actor-token";
    const fileName = `${slug}.png`;
    const normalizedB64 = await normalizeActorTokenImageBase64(b64Data);
    const bytes = base64ToBytes(normalizedB64);
    const blob = new Blob([bytes], { type: "image/png" });
    const FileClass = getFileConstructor();
    const file = FileClass ? new FileClass([blob], fileName, { type: "image/png" }) : null;
    if (!file) throw new Error("File API is not available.");

    const fp = requireFilePicker();
    let current = "";
    for (const segment of TOKEN_IMAGE_DIR.split("/").filter(Boolean)) {
        current = current ? `${current}/${segment}` : segment;
        try {
            await fp.createDirectory?.("data", current, {});
        } catch (error) {
            if (!/exist|EEXIST|already/i.test(String(error?.message ?? ""))) throw error;
        }
    }

    const result = await fp.upload?.("data", TOKEN_IMAGE_DIR, file, { notify: false });
    return String(result?.path ?? "");
}

const ActorDocumentClass = requireActorDocumentClass();

export class ActorManagementFeature extends WorkspaceFeature {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        render = () => {},
        getSelectedTokenIds = () => new Set()
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.renderCallback = render;
        this.getSelectedTokenIds = getSelectedTokenIds;

        this.actorWorkspaceController = new ActorWorkspaceController({
            getActorById: (id) => globalThis.game.actors?.get?.(id) ?? null,
            createActor: (data) => ActorDocumentClass.create(data),
            generate: (prompt, options) => LLMService.generate(prompt, options),
            buildGeneratedActorDocumentData,
            buildActorUpdateDataFromFormData,
            openActorEditor: () => this.#openActorEditorPanel(),
            generateActorTokenImage: (actor) => LLMService.generateActorTokenImage(buildActorTokenImagePrompt(actor)),
            saveActorTokenImage: (name, b64) => saveActorTokenImageToWorld(name, b64),
            updateSceneTokensByActorId: async (actorId, path) => {
                for (const scene of Array.from(globalThis.game?.scenes?.contents ?? [])) {
                    const matching = Array.from(scene.tokens?.contents ?? [])
                        .filter(t => String(t.actorId ?? "") === actorId);
                    for (const token of matching) {
                        await token.update({ "texture.src": path });
                    }
                }
            },
            render: () => this.renderCallback({ force: false }),
            logger: console
        });
    }

    getSelectedActorIds() {
        return this.actorWorkspaceController.getSelectedActorIds();
    }

    async prepareContext(context) {
        const scene = canvas?.scene ?? globalThis.game.scenes?.active ?? null;
        this.#syncActorDetailsToTokenSelection(scene);

        const worldActors = Array.from(globalThis.game.actors?.contents ?? []);
        const actorWorkspaceState = this.actorWorkspaceController.state;
        const selectedActor = this.actorWorkspaceController.getSelectedActor();
        const isGMUser = Boolean(globalThis.game.user?.isGM);

        context.actorListPanel = buildActorListPanelModel({
            actors: worldActors,
            query: actorWorkspaceState.searchQuery,
            typeFilter: actorWorkspaceState.typeFilter,
            selectedActorId: actorWorkspaceState.editorState.actorId,
            selectedActorIds: actorWorkspaceState.selectedActorIds,
            showCreate: actorWorkspaceState.editorState.mode === "create"
        });

        context.actorEditorPanel = buildActorEditorPanelModel({
            actor: selectedActor,
            state: actorWorkspaceState.editorState,
            users: globalThis.game.users,
            isGM: isGMUser
        });
    }

    render(panel, context) {
        if (panel?.id === "actors") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-actor-list-panel"><p class="totc-v2-actor-list-panel__empty">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderActorListPanel(context.actorListPanel ?? {}, {
                escapeHTML: (value) => String(value ?? "")
            });
        }
        if (panel?.id === "actor-editor") {
            return renderActorEditorPanel(context.actorEditorPanel ?? {}, {
                escapeHTML: (value) => String(value ?? "")
            });
        }
        return undefined;
    }

    bind(rootElement) {
        this.actorWorkspaceController.wireHandlers(rootElement);
    }

    dispose() {
        // no-op, resources are handled by gc
    }

    async #openActorEditorPanel() {
        const panelDef = this.panelRegistry.get("actor-editor");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });

        await this.stateStore?.setUserLayout?.(nextLayout);
        this.renderCallback({ force: false });
    }

    #resolveActorFromSelectedSceneTokens(scene) {
        const selectedTokenIds = this.getSelectedTokenIds();
        if (selectedTokenIds.size !== 1) return null;
        const tokenId = [...selectedTokenIds][0];
        const tokenDoc = scene?.tokens?.get?.(tokenId) ?? null;
        const actor = tokenDoc?.actor ?? globalThis.game.actors?.get?.(tokenDoc?.actorId) ?? null;
        if (!actor) return null;
        if (globalThis.game.user?.isGM || actor.isOwner) return actor;
        return null;
    }

    #syncActorDetailsToTokenSelection(scene) {
        if (this.actorWorkspaceController.state.editorState.mode === "create") return;
        const selectedTokenIds = this.getSelectedTokenIds();
        if (!selectedTokenIds.size) return;
        const actor = this.#resolveActorFromSelectedSceneTokens(scene);
        if (actor?.id) {
            this.actorWorkspaceController.openDetails(actor.id);
        } else {
            this.actorWorkspaceController.clearDetails();
        }
    }
}
