import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    buildCampaignBuilderPanelModel,
    renderCampaignBuilderPanel
} from "../panels/campaign-builder-panel.mjs";
import {
    buildScenarioBuilderPanelModel,
    renderScenarioBuilderPanel
} from "../panels/scenario-builder-panel.mjs";
import {
    buildCampaignViewDeletePlan,
    buildCampaignViewMovePlan,
    buildCampaignViewPanelModel,
    getCampaignViewDropMode,
    renderCampaignViewPanel
} from "../panels/campaign-view-panel.mjs";
import {
    buildGMAssistantDocumentSystemData,
    buildGMAssistantPanelModel,
    renderGMAssistantPanel
} from "../panels/gm-assistant-panel.mjs";
import { LLMService } from "../../../services/llm-service.mjs";
import {
    requireActorDocumentClass,
    requireItemDocumentClass
} from "../../../foundry-v14-runtime.mjs";
import { focusWorkspaceTextInputAtEnd } from "../workspace-text-inputs.mjs";

const ActorDocumentClass = requireActorDocumentClass();
const ItemDocumentClass = requireItemDocumentClass();

export class CampaignFeature extends WorkspaceFeature {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        render = () => {},
        announce = async () => {}
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.renderCallback = render;
        this.announceCallback = announce;

        this.campaignViewState = {
            selectedId: "",
            expandedIds: new Set(),
            editingDetail: false,
            editingItemId: "",
            detailEdits: {}
        };

        this.gmAssistantState = {
            elementType: "campaign",
            actorType: "pawn",
            prompt: "",
            promptTextareaHeight: 0,
            parentLocationId: "",
            campaignId: "",
            scenarioId: "",
            isGenerating: false,
            result: null,
            error: null
        };

        this.campaignViewDragState = null;
        this.promptDebounceTimer = null;
    }

    async prepareContext(context) {
        const campaigns = Array.from(globalThis.game?.items?.contents || []).filter(i => i.type === "campaign");
        context.campaignBuilderPanel = buildCampaignBuilderPanelModel({ campaigns });

        const scenarios = Array.from(globalThis.game?.items?.contents || []).filter(i => i.type === "scenario");
        context.scenarioBuilderPanel = buildScenarioBuilderPanelModel({ scenarios });

        context.campaignViewPanel = {
            ...buildCampaignViewPanelModel({
                items: Array.from(globalThis.game?.items?.contents || []),
                selectedId: this.campaignViewState.editingDetail
                    ? (this.campaignViewState.editingItemId || this.campaignViewState.selectedId)
                    : this.campaignViewState.selectedId,
                expandedIds: this.campaignViewState.expandedIds
            }),
            editing: this.campaignViewState.editingDetail,
            detailEdits: this.campaignViewState.detailEdits
        };

        const locationOptions = Array.from(globalThis.game?.items?.contents || [])
            .filter((item) => item.type === "location")
            .map((item) => ({ value: item.id, label: item.name }))
            .sort((a, b) => a.label.localeCompare(b.label));

        context.gmAssistantPanel = buildGMAssistantPanelModel({
            ...this.gmAssistantState,
            parentLocationOptions: locationOptions
        });
    }

    render(panel, context) {
        if (panel?.id === "campaign-builder") {
            return renderCampaignBuilderPanel(context.campaignBuilderPanel ?? {}, {
                escapeHTML: (v) => String(v ?? "")
            });
        }
        if (panel?.id === "scenario-builder") {
            return renderScenarioBuilderPanel(context.scenarioBuilderPanel ?? {}, {
                escapeHTML: (v) => String(v ?? "")
            });
        }
        if (panel?.id === "campaign-view") {
            return renderCampaignViewPanel(context.campaignViewPanel ?? {}, {
                escapeHTML: (v) => String(v ?? "")
            });
        }
        if (panel?.id === "gm-assistant") {
            return renderGMAssistantPanel(context.gmAssistantPanel ?? {}, {
                escapeHTML: (v) => String(v ?? "")
            });
        }
        return undefined;
    }

    bind(rootElement) {
        this.wiredElement = rootElement;

        if (typeof rootElement?.addEventListener !== "function") return;

        // Clicks delegation
        rootElement.addEventListener("click", async (event) => {
            const target = event.target;

            // create-campaign
            const createCampaignBtn = target?.closest("[data-action='create-campaign']");
            if (createCampaignBtn) {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Campaign", type: "campaign" });
                if (item?.sheet) item.sheet.render(true);
                return;
            }

            // create-scenario
            const createScenarioBtn = target?.closest("[data-action='create-scenario']");
            if (createScenarioBtn) {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Scenario", type: "scenario" });
                if (item?.sheet) item.sheet.render(true);
                return;
            }

            // create-encounter
            const createEncounterBtn = target?.closest("[data-action='create-encounter']");
            if (createEncounterBtn) {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Encounter", type: "encounter-design" });
                if (item?.sheet) item.sheet.render(true);
                return;
            }

            // campaign-view-toggle
            const viewToggleBtn = target?.closest("[data-action='campaign-view-toggle']");
            if (viewToggleBtn) {
                event.preventDefault();
                event.stopPropagation();
                const itemId = String(viewToggleBtn.dataset.itemId ?? "").trim();
                if (!itemId) return;
                if (this.campaignViewState.expandedIds.has(itemId)) {
                    this.campaignViewState.expandedIds.delete(itemId);
                } else {
                    this.campaignViewState.expandedIds.add(itemId);
                }
                this.renderCallback({ force: false });
                return;
            }

            // campaign-view-select
            const viewSelectBtn = target?.closest("[data-action='campaign-view-select']");
            if (viewSelectBtn) {
                event.preventDefault();
                event.stopPropagation();
                this.campaignViewState.selectedId = String(viewSelectBtn.dataset.itemId ?? "").trim();
                this.campaignViewState.editingDetail = false;
                this.campaignViewState.editingItemId = "";
                this.campaignViewState.detailEdits = {};
                this.renderCallback({ force: false });
                return;
            }

            // campaign-view-edit-detail
            const editDetailBtn = target?.closest("[data-action='campaign-view-edit-detail']");
            if (editDetailBtn) {
                event.preventDefault();
                event.stopPropagation();
                this.campaignViewState.editingDetail = true;
                this.campaignViewState.editingItemId = this.campaignViewState.selectedId;
                this.campaignViewState.detailEdits = {};
                this.renderCallback({ force: false });
                return;
            }

            // campaign-view-cancel-detail
            const cancelDetailBtn = target?.closest("[data-action='campaign-view-cancel-detail']");
            if (cancelDetailBtn) {
                event.preventDefault();
                event.stopPropagation();
                this.campaignViewState.editingDetail = false;
                this.campaignViewState.editingItemId = "";
                this.campaignViewState.detailEdits = {};
                this.renderCallback({ force: false });
                return;
            }

            // campaign-view-save-detail
            const saveDetailBtn = target?.closest("[data-action='campaign-view-save-detail']");
            if (saveDetailBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#handleDetailSave(rootElement);
                return;
            }

            // campaign-view-create-root
            const viewCreateRootBtn = target?.closest("[data-action='campaign-view-create-root']");
            if (viewCreateRootBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#createCampaignViewItem({ type: "campaign" });
                return;
            }

            // campaign-view-generate-root
            const viewGenerateRootBtn = target?.closest("[data-action='campaign-view-generate-root']");
            if (viewGenerateRootBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#prepareCampaignViewGeneration({ type: "campaign" });
                return;
            }

            // campaign-view-create-child
            const viewCreateChildBtn = target?.closest("[data-action='campaign-view-create-child']");
            if (viewCreateChildBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#createCampaignViewItem({
                    type: String(viewCreateChildBtn.dataset.childType ?? "").trim(),
                    parentId: String(viewCreateChildBtn.dataset.parentId ?? "").trim()
                });
                return;
            }

            // campaign-view-generate-child
            const viewGenerateChildBtn = target?.closest("[data-action='campaign-view-generate-child']");
            if (viewGenerateChildBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#prepareCampaignViewGeneration({
                    type: String(viewGenerateChildBtn.dataset.childType ?? "").trim(),
                    parentId: String(viewGenerateChildBtn.dataset.parentId ?? "").trim()
                });
                return;
            }

            // campaign-view-delete
            const viewDeleteBtn = target?.closest("[data-action='campaign-view-delete']");
            if (viewDeleteBtn) {
                event.preventDefault();
                event.stopPropagation();
                await this.#deleteCampaignViewItem(String(viewDeleteBtn.dataset.itemId ?? "").trim());
                return;
            }

            // gm-assistant-generate / regenerate
            const generateBtn = target?.closest("[data-action='gm-assistant-generate'], [data-action='gm-assistant-regenerate']");
            if (generateBtn) {
                event.preventDefault();
                await this.#handleGenerate(rootElement);
                return;
            }

            // gm-assistant-accept
            const acceptBtn = target?.closest("[data-action='gm-assistant-accept']");
            if (acceptBtn) {
                event.preventDefault();
                await this.#handleAccept();
                return;
            }
        });

        // Change delegation
        rootElement.addEventListener("change", (event) => {
            const target = event.target;

            // gm-assistant-set-type
            if (target?.matches?.("[data-action='gm-assistant-set-type']")) {
                this.gmAssistantState.elementType = target.value;
                if (this.gmAssistantState.elementType !== "location") {
                    this.gmAssistantState.parentLocationId = "";
                }
                this.gmAssistantState.campaignId = "";
                this.gmAssistantState.scenarioId = "";
                this.gmAssistantState.result = null;
                this.gmAssistantState.error = null;
                this.renderCallback({ force: false });
            }

            // gm-assistant-set-actor-type
            if (target?.matches?.("[data-action='gm-assistant-set-actor-type']")) {
                this.gmAssistantState.actorType = target.value;
                this.gmAssistantState.result = null;
                this.gmAssistantState.error = null;
                this.renderCallback({ force: false });
            }

            // gm-assistant-set-parent-location
            if (target?.matches?.("[data-action='gm-assistant-set-parent-location']")) {
                this.gmAssistantState.parentLocationId = target.value;
                this.gmAssistantState.result = null;
                this.gmAssistantState.error = null;
                this.renderCallback({ force: false });
            }
        });

        // Input delegation
        rootElement.addEventListener("input", (event) => {
            const input = event.target;

            // Silently track detail field edits so re-renders preserve user's work
            if (this.campaignViewState.editingDetail) {
                const editField = input?.closest("[data-edit-field]");
                if (editField) {
                    const path = String(editField.dataset.editField ?? "").trim();
                    const fieldType = String(editField.dataset.fieldType ?? "").trim();
                    if (path) {
                        this.campaignViewState.detailEdits[path] = fieldType === "html"
                            ? editField.innerHTML
                            : String(editField.value ?? "");
                    }
                    return;
                }
            }

            if (input?.matches?.("[data-action='gm-assistant-set-prompt']")) {
                const value = String(input.value ?? "");
                this.gmAssistantState.prompt = value;
                this.gmAssistantState.promptTextareaHeight = input.offsetHeight || input.clientHeight || 0;

                if (this.promptDebounceTimer) clearTimeout(this.promptDebounceTimer);
                this.promptDebounceTimer = setTimeout(async () => {
                    this.promptDebounceTimer = null;
                    await this.renderCallback({ force: false });
                    focusWorkspaceTextInputAtEnd(this.wiredElement, "gm-assistant-set-prompt");
                }, 250);
            }
        });

        // Drag & Drop delegation on campaign-view rows
        rootElement.addEventListener("dragstart", (event) => {
            const row = event.target?.closest?.("[data-campaign-view-draggable='true']");
            if (!row) return;
            event.stopPropagation();
            const itemId = String(row.dataset.campaignViewItemId ?? "").trim();
            const itemType = String(row.dataset.campaignViewItemType ?? "").trim();
            if (!itemId || !itemType) return;
            this.campaignViewDragState = { itemId, itemType };
            if (event.dataTransfer) {
                event.dataTransfer.setData("application/x-totc-campaign-view-item", JSON.stringify({ itemId, itemType }));
                event.dataTransfer.setData("text/plain", itemId);
                event.dataTransfer.effectAllowed = "move";
            }
            row.classList.add("is-dragging");
        });

        rootElement.addEventListener("dragend", (event) => {
            const row = event.target?.closest?.("[data-campaign-view-draggable='true']");
            if (!row) return;
            row.classList.remove("is-dragging");
            this.campaignViewDragState = null;
            this.#clearCampaignViewDropTargets(rootElement);
        });

        rootElement.addEventListener("dragover", (event) => {
            const row = event.target?.closest?.("[data-campaign-view-draggable='true']");
            if (!row) return;
            const dragged = this.campaignViewDragState;
            if (!dragged?.itemId || dragged.itemId === row.dataset.campaignViewItemId) return;
            const rect = row.getBoundingClientRect();
            const pointerRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
            const dropMode = getCampaignViewDropMode({
                draggedType: dragged.itemType,
                targetType: String(row.dataset.campaignViewItemType ?? "").trim(),
                pointerRatio
            });
            if (!dropMode) return;
            event.preventDefault();
            event.stopPropagation();
            this.#clearCampaignViewDropTargets(rootElement, row);
            row.dataset.campaignViewDropMode = dropMode;
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        });

        rootElement.addEventListener("dragleave", (event) => {
            const row = event.target?.closest?.("[data-campaign-view-draggable='true']");
            if (!row) return;
            const related = event.relatedTarget;
            if (related && row.contains(related)) return;
            delete row.dataset.campaignViewDropMode;
        });

        rootElement.addEventListener("drop", async (event) => {
            const row = event.target?.closest?.("[data-campaign-view-draggable='true']");
            if (!row) return;
            const dragged = this.campaignViewDragState;
            if (!dragged?.itemId) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = row.getBoundingClientRect();
            const pointerRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
            const dropMode = row.dataset.campaignViewDropMode || getCampaignViewDropMode({
                draggedType: dragged.itemType,
                targetType: String(row.dataset.campaignViewItemType ?? "").trim(),
                pointerRatio
            });
            await this.#moveCampaignViewItem({
                draggedId: dragged.itemId,
                targetId: String(row.dataset.campaignViewItemId ?? "").trim(),
                dropMode
            });
            this.campaignViewDragState = null;
            this.#clearCampaignViewDropTargets(rootElement);
        });
    }

    dispose() {
        if (this.promptDebounceTimer) {
            clearTimeout(this.promptDebounceTimer);
            this.promptDebounceTimer = null;
        }
        this.wiredElement = null;
        this.campaignViewDragState = null;
    }

    async #createCampaignViewItem({ type = "", parentId = "" } = {}) {
        const safeType = String(type ?? "").trim();
        const safeParentId = String(parentId ?? "").trim();
        const parent = this.#getItemDocumentById(safeParentId);
        const isScenario = safeType === "scenario";
        const isEncounter = safeType === "encounter-design";
        const isCampaign = safeType === "campaign";
        if (!isCampaign && !isScenario && !isEncounter) return null;

        const documentData = {
            name: isCampaign ? "New Campaign" : isScenario ? "New Scenario" : "New Encounter",
            type: safeType,
            system: {}
        };
        if (isScenario && parent?.type === "campaign") {
            documentData.system.campaignId = safeParentId;
        }
        if (isEncounter && parent?.type === "scenario") {
            documentData.system.scenarioId = safeParentId;
        }

        const item = await ItemDocumentClass.create(documentData);
        const itemId = String(item?.id ?? item?._id ?? "").trim();
        if (itemId) {
            this.campaignViewState.selectedId = itemId;
            if (safeParentId) this.campaignViewState.expandedIds.add(safeParentId);
        }
        if (item?.sheet) item.sheet.render(true);
        this.renderCallback({ force: false });
        return item;
    }

    async #prepareCampaignViewGeneration({ type = "", parentId = "" } = {}) {
        const safeType = String(type ?? "").trim();
        const safeParentId = String(parentId ?? "").trim();
        const parent = this.#getItemDocumentById(safeParentId);
        const isCampaign = safeType === "campaign";
        const isScenario = safeType === "scenario";
        const isEncounter = safeType === "encounter-design";
        if (!isCampaign && !isScenario && !isEncounter) return;

        this.gmAssistantState = {
            ...this.gmAssistantState,
            elementType: safeType,
            actorType: "pawn",
            campaignId: isScenario && parent?.type === "campaign" ? safeParentId : "",
            scenarioId: isEncounter && parent?.type === "scenario" ? safeParentId : "",
            parentLocationId: "",
            result: null,
            error: null,
            prompt: isCampaign
                ? "Generate a campaign for Turn of the Century."
                : isScenario
                ? `Generate a scenario for the campaign "${parent?.name ?? "Untitled Campaign"}".`
                : `Generate an encounter for the scenario "${parent?.name ?? "Untitled Scenario"}".`
        };

        let nextLayout = this.layoutEngine.getLayout();
        const panelDef = this.panelRegistry.get("gm-assistant");
        if (panelDef) {
            nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);
        }

        if (safeParentId) this.campaignViewState.expandedIds.add(safeParentId);
        this.renderCallback({ force: false });
    }

    async #deleteCampaignViewItem(itemId = "") {
        const safeItemId = String(itemId ?? "").trim();
        if (!safeItemId) return null;

        const items = Array.from(globalThis.game?.items?.contents || []);
        const plan = buildCampaignViewDeletePlan({ items, itemId: safeItemId });
        if (!plan?.deleteIds?.length) return null;

        const childParts = [];
        if (plan.scenarioCount) childParts.push(`${plan.scenarioCount} scenario${plan.scenarioCount === 1 ? "" : "s"}`);
        if (plan.encounterCount) childParts.push(`${plan.encounterCount} encounter${plan.encounterCount === 1 ? "" : "s"}`);
        const childWarning = childParts.length
            ? `\n\nThis will also permanently delete ${childParts.join(" and ")} beneath it.`
            : "";
        const confirmed = globalThis.confirm?.(
            `Permanently delete ${plan.itemTypeLabel.toLowerCase()} "${plan.itemName}"?${childWarning}\n\nThis cannot be undone.`
        ) ?? false;
        if (!confirmed) return null;

        for (const parentUpdate of plan.parentUpdates) {
            const parent = this.#getItemDocumentById(parentUpdate.itemId);
            if (parent && typeof parent.update === "function") await parent.update(parentUpdate.update);
        }

        for (const deleteId of plan.deleteIds) {
            const item = this.#getItemDocumentById(deleteId);
            if (item && typeof item.delete === "function") await item.delete();
        }

        if (plan.deleteIds.includes(this.campaignViewState.selectedId)) {
            this.campaignViewState.selectedId = "";
        }
        for (const deleteId of plan.deleteIds) {
            this.campaignViewState.expandedIds.delete(deleteId);
        }
        this.renderCallback({ force: false });
        return plan;
    }

    async #moveCampaignViewItem({ draggedId = "", targetId = "", dropMode = "" } = {}) {
        const safeDraggedId = String(draggedId ?? "").trim();
        const safeTargetId = String(targetId ?? "").trim();
        const safeDropMode = String(dropMode ?? "").trim();
        if (!safeDraggedId || !safeTargetId || !safeDropMode) return null;

        const items = Array.from(globalThis.game?.items?.contents || []);
        const plan = buildCampaignViewMovePlan({
            items,
            draggedId: safeDraggedId,
            targetId: safeTargetId,
            dropMode: safeDropMode
        });
        if (!plan) return null;

        const movedItem = this.#getItemDocumentById(plan.itemId);
        const parent = this.#getItemDocumentById(plan.parentId);
        const previousParent = plan.previousParentId ? this.#getItemDocumentById(plan.previousParentId) : null;
        if (!movedItem || !parent) return null;

        const previousParentId = String(previousParent?.id ?? previousParent?._id ?? "").trim();
        const parentId = String(parent?.id ?? parent?._id ?? "").trim();
        if (previousParent && plan.previousParentUpdate && previousParentId !== parentId) {
            await previousParent.update(plan.previousParentUpdate);
        }
        await parent.update(plan.parentUpdate);
        await movedItem.update(plan.itemUpdate);

        this.campaignViewState.selectedId = plan.itemId;
        this.campaignViewState.expandedIds.add(plan.parentId);
        this.renderCallback({ force: false });
        return plan;
    }

    async #handleGenerate(rootElement) {
        if (this.gmAssistantState.isGenerating || !this.gmAssistantState.prompt) return;
        const promptInput = rootElement?.querySelector("[data-action='gm-assistant-set-prompt']");
        if (promptInput && (promptInput.tagName === "TEXTAREA" || promptInput.nodeName === "TEXTAREA")) {
            this.gmAssistantState.promptTextareaHeight = promptInput.offsetHeight || promptInput.clientHeight || 0;
        }
        this.gmAssistantState.isGenerating = true;
        this.gmAssistantState.error = null;
        this.gmAssistantState.result = null;
        this.renderCallback({ force: false });

        try {
            const parentLocation = this.gmAssistantState.elementType === "location" && this.gmAssistantState.parentLocationId
                ? globalThis.game?.items?.get?.(this.gmAssistantState.parentLocationId)
                : null;
            const generationContext = {};
            if (this.gmAssistantState.elementType === "actor") {
                generationContext.actorType = this.gmAssistantState.actorType;
            }
            if (parentLocation) {
                generationContext.parentLocation = {
                    id: parentLocation.id,
                    name: parentLocation.name,
                    locationType: parentLocation.system?.locationType ?? "",
                    description: parentLocation.system?.description ?? "",
                    notes: parentLocation.system?.notes ?? ""
                };
            }

            const result = await LLMService.generate(this.gmAssistantState.prompt, {
                elementType: this.gmAssistantState.elementType,
                generationContext
            });
            this.gmAssistantState.result = result;
        } catch (err) {
            this.gmAssistantState.error = err.message;
        } finally {
            this.gmAssistantState.isGenerating = false;
            this.renderCallback({ force: false });
        }
    }

    async #handleAccept() {
        const { result, elementType, actorType } = this.gmAssistantState;
        if (!result) return;

        const isActor = elementType === "actor";
        const documentData = {
            name: result.name || "Generated Element",
            type: isActor ? actorType : elementType,
            system: buildGMAssistantDocumentSystemData(result.system || {}, elementType)
        };
        if (elementType === "location" && this.gmAssistantState.parentLocationId) {
            documentData.system.parentLocationId = this.gmAssistantState.parentLocationId;
        }
        if (elementType === "scenario" && this.gmAssistantState.campaignId) {
            documentData.system.campaignId = this.gmAssistantState.campaignId;
        }
        if (elementType === "encounter-design" && this.gmAssistantState.scenarioId) {
            documentData.system.scenarioId = this.gmAssistantState.scenarioId;
        }

        const doc = await (isActor ? ActorDocumentClass : ItemDocumentClass).create(documentData);
        if (doc?.sheet) doc.sheet.render(true);

        const docId = String(doc?.id ?? doc?._id ?? "").trim();
        if (docId && (elementType === "scenario" || elementType === "encounter-design")) {
            this.campaignViewState.selectedId = docId;
        }
        if (this.gmAssistantState.campaignId) this.campaignViewState.expandedIds.add(this.gmAssistantState.campaignId);
        if (this.gmAssistantState.scenarioId) this.campaignViewState.expandedIds.add(this.gmAssistantState.scenarioId);

        // Send chat message announcement
        const lines = [
            `Type: ${elementType}${actorType ? ` (${actorType})` : ""}`,
            result.description || ""
        ].filter(Boolean);
        await this.announceCallback({
            title: `Generated ${result.name || "Element"}`,
            lines
        });

        this.gmAssistantState.result = null;
        this.gmAssistantState.prompt = "";
        this.gmAssistantState.campaignId = "";
        this.gmAssistantState.scenarioId = "";
        this.renderCallback({ force: false });
    }

    async #handleDetailSave(rootElement) {
        const itemId = this.campaignViewState.editingItemId || this.campaignViewState.selectedId;
        const item = this.#getItemDocumentById(itemId);
        if (!item) return;

        const editForm = rootElement?.querySelector("[data-campaign-view-edit-form='true']");
        if (!editForm) return;

        const updateData = {};
        const fields = editForm.querySelectorAll("[data-edit-field]");
        for (const field of fields) {
            const path = String(field.dataset.editField ?? "").trim();
            const fieldType = String(field.dataset.fieldType ?? "").trim();
            if (!path) continue;
            let value;
            if (fieldType === "html" && field.contentEditable === "true") {
                value = field.innerHTML;
            } else if (fieldType === "array") {
                value = String(field.value ?? "").split("\n").map(s => s.trim()).filter(Boolean);
            } else {
                value = String(field.value ?? "");
            }
            updateData[`system.${path}`] = value;
        }

        this.campaignViewState.editingDetail = false;
        this.campaignViewState.editingItemId = "";
        this.campaignViewState.detailEdits = {};

        if (Object.keys(updateData).length > 0) {
            await item.update(updateData);
        }
        this.renderCallback({ force: false });
    }

    #getItemDocumentById(itemId) {
        const id = String(itemId ?? "").trim();
        if (!id) return null;
        return globalThis.game?.items?.get?.(id)
            ?? (globalThis.game?.items?.contents || []).find((item) => String(item?.id ?? item?._id ?? "") === id)
            ?? null;
    }

    #clearCampaignViewDropTargets(rootElement, except = null) {
        rootElement?.querySelectorAll("[data-campaign-view-drop-mode]")?.forEach((row) => {
            if (row !== except) delete row.dataset.campaignViewDropMode;
        });
    }
}
