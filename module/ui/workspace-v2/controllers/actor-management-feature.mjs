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
import { LLMService } from "../../../services/llm-service.mjs";
import { requireActorDocumentClass } from "../../../foundry-v14-runtime.mjs";

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
