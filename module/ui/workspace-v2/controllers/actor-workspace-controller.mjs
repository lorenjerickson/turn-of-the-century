export const DEFAULT_ACTOR_EDITOR_STATE = Object.freeze({
    mode: "empty",
    actorId: "",
    actorType: "pawn",
    additionalPrompt: "",
    isGenerating: false,
    formData: {},
    dirty: false,
    status: "",
    error: ""
});

export class ActorWorkspaceController {
    constructor({
        getActorById = () => null,
        createActor = async () => null,
        generate = async () => null,
        buildGeneratedActorDocumentData = (data) => data,
        buildActorUpdateDataFromFormData = () => ({}),
        openActorEditor = async () => {},
        render = () => {},
        logger = console
    } = {}) {
        this.getActorById = getActorById;
        this.createActor = createActor;
        this.generate = generate;
        this.buildGeneratedActorDocumentData = buildGeneratedActorDocumentData;
        this.buildActorUpdateDataFromFormData = buildActorUpdateDataFromFormData;
        this.openActorEditor = openActorEditor;
        this.render = render;
        this.logger = logger;
        this.searchQuery = "";
        this.typeFilter = "all";
        this.selectedActorIds = new Set();
        this.editorState = { ...DEFAULT_ACTOR_EDITOR_STATE };
    }

    get state() {
        return {
            searchQuery: this.searchQuery,
            typeFilter: this.typeFilter,
            selectedActorIds: this.selectedActorIds,
            editorState: this.editorState
        };
    }

    getSelectedActorIds() {
        return this.selectedActorIds;
    }

    getSelectedActor() {
        return this.editorState.actorId ? this.getActorById(this.editorState.actorId) : null;
    }

    setSearchQuery(value = "") {
        this.searchQuery = String(value ?? "");
    }

    setTypeFilter(value = "all") {
        this.typeFilter = String(value ?? "all").trim() || "all";
    }

    toggleSelectedActor(actorId = "", selected = false) {
        const safeActorId = String(actorId ?? "").trim();
        if (!safeActorId) return;
        if (selected) this.selectedActorIds.add(safeActorId);
        else this.selectedActorIds.delete(safeActorId);
    }

    beginCreate() {
        this.editorState = { ...DEFAULT_ACTOR_EDITOR_STATE, mode: "create" };
    }

    openDetails(actorId = "") {
        const safeActorId = String(actorId ?? "").trim();
        if (!safeActorId) return false;
        this.editorState = {
            ...this.editorState,
            mode: "edit",
            actorId: safeActorId,
            actorType: this.getActorById(safeActorId)?.type ?? "pawn",
            additionalPrompt: "",
            isGenerating: false,
            formData: {},
            dirty: false,
            status: "",
            error: ""
        };
        return true;
    }

    setCreateActorType(actorType = "pawn") {
        this.editorState = {
            ...this.editorState,
            actorType,
            error: "",
            status: ""
        };
    }

    setCreatePrompt(value = "") {
        this.editorState.additionalPrompt = String(value ?? "");
    }

    updateEditorField(path = "", value = "") {
        const safePath = String(path ?? "").trim();
        if (!safePath) return;
        this.editorState.formData = {
            ...(this.editorState.formData ?? {}),
            [safePath]: String(value ?? "")
        };
        this.editorState.dirty = true;
        this.editorState.status = "";
        this.editorState.error = "";
    }

    async generateActor() {
        if (this.editorState.isGenerating) return;
        this.editorState = {
            ...this.editorState,
            isGenerating: true,
            status: "",
            error: ""
        };
        this.render();

        try {
            const actorType = this.editorState.actorType || "pawn";
            const additionalPrompt = String(this.editorState.additionalPrompt ?? "").trim();
            const prompt = additionalPrompt || `Create a ${actorType} actor for immediate use in play.`;
            const result = await this.generate(prompt, {
                elementType: "actor",
                generationContext: { actorType }
            });
            const actor = await this.createActor(this.buildGeneratedActorDocumentData(result, actorType));
            this.editorState = {
                mode: "edit",
                actorId: actor?.id ?? actor?._id ?? "",
                actorType: actor?.type ?? actorType,
                additionalPrompt: "",
                isGenerating: false,
                formData: {},
                dirty: false,
                status: `Created ${actor?.name ?? "actor"}.`,
                error: ""
            };
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Actor generation failed", error);
            this.editorState = {
                ...this.editorState,
                isGenerating: false,
                status: "",
                error: error?.message ?? "Actor generation failed."
            };
        }

        this.render();
    }

    async saveActorForm(form) {
        const formData = new FormData(form);
        const actorId = String(formData.get("actorId") ?? this.editorState.actorId ?? "").trim();
        const actor = actorId ? this.getActorById(actorId) : null;
        if (!actor?.update) {
            this.editorState = {
                ...this.editorState,
                status: "",
                error: "Actor save is not available."
            };
            this.render();
            return;
        }

        try {
            const updateData = this.buildActorUpdateDataFromFormData(formData);
            await actor.update(updateData);
            this.editorState = {
                ...this.editorState,
                mode: "edit",
                actorId,
                actorType: actor.type ?? this.editorState.actorType,
                formData: {},
                dirty: false,
                status: "Actor saved.",
                error: ""
            };
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Actor save failed", error);
            this.editorState = {
                ...this.editorState,
                status: "",
                error: error?.message ?? "Actor save failed."
            };
        }

        this.render();
    }

    wireHandlers(root) {
        root?.querySelectorAll("[data-action='actor-list-new']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.beginCreate();
                await this.openActorEditor();
            });
        });

        root?.querySelectorAll("[data-action='actor-list-type-filter']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                event.stopPropagation();
                this.setTypeFilter(select.value);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='actor-list-toggle-selected']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", (event) => {
                event.stopPropagation();
                this.toggleSelectedActor(checkbox.dataset.actorId, checkbox.checked);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='actor-list-open-details']")?.forEach((button) => {
            button.addEventListener("dblclick", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.openDetails(button.dataset.actorId)) return;
                await this.openActorEditor();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-create-type']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                this.setCreateActorType(event.target.value);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-create-prompt']")?.forEach((textarea) => {
            textarea.addEventListener("input", () => {
                this.setCreatePrompt(textarea.value);
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-field']")?.forEach((input) => {
            input.addEventListener("input", () => {
                this.updateEditorField(input.dataset.actorField ?? input.name, input.value);
                const abilityModifier = input.closest(".totc-v2-actor-editor__ability")?.querySelector(".totc-v2-actor-editor__ability-modifier");
                if (abilityModifier) {
                    const score = Number(input.value);
                    const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
                    abilityModifier.textContent = modifier >= 0 ? `+${modifier}` : String(modifier);
                }
                input.closest("form")?.querySelector("[data-action='actor-editor-save']")?.removeAttribute("disabled");
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-generate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.generateActor();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-save-form']")?.forEach((form) => {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.saveActorForm(form);
            });
        });
    }
}
