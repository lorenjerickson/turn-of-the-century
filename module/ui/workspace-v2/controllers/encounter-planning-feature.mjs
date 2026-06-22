import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    buildEncounterPlanningMovementPath,
    buildEncounterMovementOverlayModel,
    findEncounterMovementOverlayCellAtPoint
} from "../encounter-movement-overlay.mjs";
import { applyLocalPlanningTokenPath } from "../../../encounters/planning-token-preview.mjs";
import {
    buildEncounterTargetingOverlayModel,
    findEncounterTargetTokenAtPoint
} from "../encounter-targeting-overlay.mjs";
import {
    buildPlayerEncounterPanelModel,
    renderPlayerEncounterPanel
} from "../panels/player-encounter-panel.mjs";
import {
    buildEncounterPlannerForCombatant
} from "../../../encounters/planner-context.mjs";
import {
    getNativeCanvasEventScenePoint,
    isPrimaryPointerButton,
    listenForNativeCanvasPointerDown
} from "../native-canvas-grid-calibration.mjs";

const ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER = "totc-encounter-movement";

export class EncounterPlanningFeature extends WorkspaceFeature {
    constructor({
        panelRegistry,
        layoutEngine,
        stateStore,
        render = () => {},
        escapeHTML = (value) => String(value ?? ""),
        getSelectedTokenIds = () => new Set()
    } = {}) {
        super();
        this.panelRegistry = panelRegistry;
        this.layoutEngine = layoutEngine;
        this.stateStore = stateStore;
        this.renderCallback = render;
        this.escapeHTML = escapeHTML;
        this.getSelectedTokenIds = getSelectedTokenIds;

        // State variables
        this.selection = null;
        this.activePlanEditSlot = null;
        this.movementInteraction = null;
        this.movementCanvasCleanup = null;
        this.movementCanvasRef = null;
        this.targetingInteraction = null;
        this.targetingCanvasCleanup = null;
        this.targetingCanvasRef = null;
        this.wiredElement = null;
    }

    /**
     * Resolve the selection and prepare context for the player encounter panel.
     */
    prepareContext(context) {
        const combat = game.combats?.active ?? game.combat ?? null;
        const viewedScene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const scene = canvas?.scene ?? game.scenes?.active ?? viewedScene;

        const selection = this.#resolveEncounterPlannerSelection({ combat, scene });
        const selectedActor = selection?.actor ?? null;
        const selectedToken = selection?.token ?? null;

        const playerEncounterPlanner = selection?.combatant?.id
            ? buildEncounterPlannerForCombatant({
                actor: selectedActor,
                tokenDocument: selectedToken,
                combat: selection.combat ?? combat,
                combatantId: selection.combatant.id
            })
            : null;

        context.playerEncounterPanel = buildPlayerEncounterPanelModel({
            actor: selectedActor,
            planner: playerEncounterPlanner,
            combat,
            activePlanEditSlot: this.activePlanEditSlot
        });

        // Store selected tokens to match WorkspaceRootApp expectations
        context.encounterPlannerSelection = selection;
        context.selectedEncounterActor = selectedActor;
        context.selectedEncounterToken = selectedToken;
    }

    render(panel, context) {
        if (String(panel?.id ?? "") !== "encounter") return undefined;
        return renderPlayerEncounterPanel(context?.playerEncounterPanel, { escapeHTML: this.escapeHTML });
    }

    /**
     * Bind delegated click, drag, and pointer resize events on the workspace root element.
     */
    bind(element) {
        if (this.wiredElement === element) {
            return;
        }
        this.wiredElement = element;

        // Click interaction capture guard for cancelling movement/targeting
        element?.addEventListener("click", (event) => {
            if (!this.movementInteraction) return;
            if (event.target?.closest?.("[data-action='encounter-move-square']")) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            void this.#cancelEncounterMovementInteraction();
        }, { capture: true });

        element?.addEventListener("click", (event) => {
            if (!this.targetingInteraction) return;
            const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
            const overlay = this.getTargetOverlayState(scene);
            const tokenEl = event.target?.closest?.("[data-action='map-token']");
            const tokenId = String(tokenEl?.dataset?.tokenId ?? "").trim();
            const valid = tokenId && (overlay?.targetTokenIds ?? []).includes(tokenId);
            if (valid) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            void this.#cancelEncounterTargetingInteraction();
        }, { capture: true });

        // Delegated clicks for panel actions
        element?.addEventListener("click", async (event) => {
            const target = event.target;
            const el = event.target?.closest?.("[data-action='encounter-plan-segment'], [data-action='encounter-edit-plan-slot']");
            if (el) {
                if (event.target?.closest?.("[data-action='encounter-remove-action'], [data-action='encounter-resize-action']")) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();

                const combatantId = this.#getEncounterPanelCombatantId(el);
                const combat = this.#getEncounterCombat(el);
                if (!combatantId || !combat) return;

                const startTick = Number(el.dataset.startTick ?? 1);
                const actionIndex = Number(el.dataset.actionIndex ?? 0);
                const apBudget = Number(combat.apBudget ?? 6);
                const remainingAp = apBudget - startTick + 1;

                this.activePlanEditSlot = {
                    index: actionIndex,
                    startTick,
                    remainingAp
                };
                this.renderCallback({ force: false });
                return;
            }

            // Close popup
            const buttonClose = event.target?.closest?.("[data-action='encounter-close-popup']");
            if (buttonClose) {
                event.preventDefault();
                event.stopPropagation();
                this.activePlanEditSlot = null;
                this.renderCallback({ force: false });
                return;
            }

            // Select popup action
            const button = event.target?.closest?.("[data-action='encounter-select-popup-action']");
            if (button) {
                event.preventDefault();
                event.stopPropagation();

                const combatantId = this.#getEncounterPanelCombatantId(button);
                const combat = this.#getEncounterCombat(button);
                if (!combatantId || !combat?.setCombatantPlan) return;

                const actionData = this.#readEncounterActionData(button);
                if (!actionData) return;

                const actionIndex = Number(button.dataset.actionIndex);
                if (Number.isNaN(actionIndex)) return;

                const remainingSlotAp = Math.max(1, Math.floor(Number(this.activePlanEditSlot?.remainingAp ?? (Number(combat.apBudget ?? 6) - actionIndex)) || 1));
                const movementFeetPerAp = Math.max(1, Number(actionData.movementFeetPerAp ?? 10) || 10);
                const planAction = actionData.type === "movement"
                    ? {
                        ...actionData,
                        apCost: remainingSlotAp,
                        apMax: Math.max(Number(actionData.apMax ?? 1), remainingSlotAp),
                        movementFeet: movementFeetPerAp * remainingSlotAp,
                        movementFeetPerAp
                    }
                    : actionData;
                const currentPlan = combat.getCombatantPlan?.(combatantId) ?? [];
                const nextPlan = [...currentPlan.slice(0, actionIndex), planAction];
                await combat.setCombatantPlan(combatantId, nextPlan);

                if (planAction.requiresTarget) {
                    this.#beginEncounterTargetingInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        action: planAction
                    });
                } else if (planAction.type === "movement") {
                    this.#beginEncounterMovementInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        maxAp: remainingSlotAp,
                        feetPerAp: movementFeetPerAp
                    });
                } else if (planAction.requiresToHit && ["melee", "normal", "long"].includes(String(planAction.rangeType ?? "").toLowerCase())) {
                    this.#beginEncounterTargetingInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        action: planAction
                    });
                } else {
                    this.movementInteraction = null;
                    this.targetingInteraction = null;
                }

                this.activePlanEditSlot = null;
                this.renderCallback({ force: false });
                return;
            }

            // Remove action button on plan segments
            const buttonRemove = event.target?.closest?.("[data-action='encounter-remove-action']");
            if (buttonRemove) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonRemove);
                const actionIndex = Number(buttonRemove.dataset.actionIndex);
                const combat = this.#getEncounterCombat(buttonRemove);
                if (!combatantId || Number.isNaN(actionIndex) || !combat?.removeCombatantAction) return;
                if (this.targetingInteraction && String(this.targetingInteraction.combatantId) === String(combatantId)) {
                    this.targetingInteraction = null;
                }
                await combat.removeCombatantAction(combatantId, actionIndex);
                this.renderCallback({ force: false });
                return;
            }

            // Clear plan
            const buttonClear = event.target?.closest?.("[data-action='encounter-clear-plan']");
            if (buttonClear) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonClear);
                const combat = this.#getEncounterCombat(buttonClear);
                if (!combatantId || !combat?.clearCombatantPlan) return;
                if (this.targetingInteraction && String(this.targetingInteraction.combatantId) === String(combatantId)) {
                    this.targetingInteraction = null;
                }
                await combat.clearCombatantPlan(combatantId);
                this.renderCallback({ force: false });
                return;
            }

            // Toggle ready state
            const buttonReady = event.target?.closest?.("[data-action='encounter-toggle-ready']");
            if (buttonReady) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonReady);
                const combat = this.#getEncounterCombat(buttonReady);
                if (!combatantId || !combat?.setCombatantReady) return;
                if (this.targetingInteraction && String(this.targetingInteraction.combatantId) === String(combatantId)) {
                    this.targetingInteraction = null;
                }
                await combat.setCombatantReady(combatantId, buttonReady.dataset.ready !== "true");
                this.renderCallback({ force: false });
                return;
            }
        });

        // Delegated drag and drop events
        element?.addEventListener("dragstart", (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            if (!segment) return;
            if (!event.dataTransfer) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-totc-encounter-action-index", String(segment.dataset.actionIndex ?? ""));
        });

        element?.addEventListener("dragover", (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            const bar = event.target?.closest?.("[data-action='encounter-plan-bar']");
            if (segment || bar) {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            }
        });

        element?.addEventListener("drop", async (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            if (segment) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(segment);
                const combat = this.#getEncounterCombat(segment);
                const fromIndex = Number(event.dataTransfer?.getData("application/x-totc-encounter-action-index"));
                const toIndex = Number(segment.dataset.actionIndex);
                await this.#moveEncounterAction(combat, combatantId, fromIndex, toIndex);
                return;
            }

            const bar = event.target?.closest?.("[data-action='encounter-plan-bar']");
            if (bar) {
                event.preventDefault();
                event.stopPropagation();
                if (event.target?.closest?.("[data-action='encounter-plan-segment']")) return;
                const combatantId = this.#getEncounterPanelCombatantId(bar);
                const fromIndex = Number(event.dataTransfer?.getData("application/x-totc-encounter-action-index"));
                const combat = this.#getEncounterCombat(bar);
                const planLength = combat?.getCombatantPlan?.(combatantId)?.length ?? 0;
                await this.#moveEncounterAction(combat, combatantId, fromIndex, planLength);
                return;
            }
        });

        // Delegated resize pointers
        element?.addEventListener("pointerdown", (event) => {
            const handle = event.target?.closest?.("[data-action='encounter-resize-action']");
            if (!handle) return;

            event.preventDefault();
            event.stopPropagation();
            const segment = handle.closest("[data-action='encounter-plan-segment']");
            const bar = handle.closest("[data-action='encounter-plan-bar']");
            const combatantId = this.#getEncounterPanelCombatantId(handle);
            const actionIndex = Number(handle.dataset.actionIndex);
            const combat = this.#getEncounterCombat(handle);
            const plan = combat?.getCombatantPlan?.(combatantId) ?? [];
            const action = plan[actionIndex];
            if (!segment || !bar || !combatantId || !combat?.setCombatantActionApCost || !action) return;

            const apBudget = Math.max(1, Number(bar.dataset.apBudget ?? 1));
            const rect = bar.getBoundingClientRect();
            const cellWidth = rect.width / apBudget;
            const priorAp = plan.slice(0, actionIndex).reduce((sum, entry) => sum + Math.max(1, Number(entry.apCost ?? 1)), 0);
            const apMin = Math.max(1, Number(action.apMin ?? action.apCost ?? 1));
            const apMax = Math.max(apMin, Number(action.apMax ?? action.apCost ?? apMin));
            const remainingAfter = plan.slice(actionIndex + 1).reduce((sum, entry) => sum + Math.max(1, Number(entry.apCost ?? 1)), 0);
            const maxByBudget = Math.max(apMin, apBudget - priorAp - remainingAfter);
            const upper = Math.min(apMax, maxByBudget);
            let nextCost = Math.max(apMin, Math.min(upper, Number(action.apCost ?? apMin)));

            const onPointerMove = (moveEvent) => {
                const relativeX = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
                const endBoundary = Math.round(relativeX / cellWidth);
                nextCost = Math.max(apMin, Math.min(upper, endBoundary - priorAp));
                segment.style.gridColumn = `span ${nextCost}`;
                const detail = segment.querySelector("small");
                if (detail) detail.textContent = `${nextCost} AP`;
            };

            const onPointerUp = async () => {
                element.ownerDocument.removeEventListener("pointermove", onPointerMove);
                element.ownerDocument.removeEventListener("pointerup", onPointerUp);
                await combat.setCombatantActionApCost(combatantId, actionIndex, nextCost);
                this.renderCallback({ force: false });
            };

            element.ownerDocument.addEventListener("pointermove", onPointerMove);
            element.ownerDocument.addEventListener("pointerup", onPointerUp);
        });
    }

    /**
     * Clean up canvas listeners and overlays.
     */
    dispose() {
        this.#clearEncounterMovementNativeOverlay();
        this.#clearEncounterTargetingCanvasListener();
        this.wiredElement = null;
    }

    /**
     * Restores the encounter planner panel in the UI and registers selection.
     */
    async showEncounterPanelForToken({ combat = null, scene = null, token = null, actor = null } = {}) {
        const combatant = this.#getEncounterCombatantForToken(combat, token);
        const canView = this.#canViewEncounterToken({ token, actor, combatant });
        if (!canView) return false;

        this.selection = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatant?.id ?? ""),
            sceneId: String(scene?.id ?? scene?._id ?? ""),
            tokenId: String(token?.id ?? token?._id ?? token?.document?.id ?? ""),
            actorId: String(actor?.id ?? actor?._id ?? combatant?.actor?.id ?? ""),
            combat,
            scene,
            token,
            actor
        };
        await this.showEncounterPanel();
        return true;
    }

    async showEncounterPanel() {
        const panelDef = this.panelRegistry.get("encounter");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.renderCallback({ force: false });
    }

    /**
     * Overlay getters.
     */
    getMovementOverlayState(scene = null) {
        const interaction = this.movementInteraction;
        if (!interaction || !scene) return null;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (sceneId && interaction.sceneId && sceneId !== interaction.sceneId) return null;
        const token = this.#collectionGet(scene.tokens, interaction.tokenId);
        if (!token) return null;
        const projectedToken = this.#projectEncounterTokenForPlan({
            token,
            combat: this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat(),
            combatantId: interaction.combatantId,
            beforeActionIndex: interaction.actionIndex
        });
        return buildEncounterMovementOverlayModel({
            token: projectedToken,
            scene,
            maxAp: interaction.maxAp,
            feetPerAp: interaction.feetPerAp || 10,
            feetPerSquare: Number(scene.grid?.distance ?? 5) || 5,
            gridSize: Number(scene.grid?.size ?? 100) || 100
        });
    }

    getTargetOverlayState(scene = null) {
        const interaction = this.targetingInteraction;
        if (!interaction || !scene) return null;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (sceneId && interaction.sceneId && sceneId !== interaction.sceneId) return null;

        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        if (!combat) return null;

        const sourceToken = this.#collectionGet(scene.tokens, interaction.tokenId);
        if (!sourceToken) return null;
        const projectedSourceToken = this.#projectEncounterTokenForPlan({
            token: sourceToken,
            combat,
            combatantId: interaction.combatantId,
            beforeActionIndex: interaction.actionIndex
        });

        const targetTokens = this.#collectionContents(scene.tokens).filter((token) => {
            const tokenId = String(token?.id ?? token?._id ?? token?.document?.id ?? "").trim();
            if (!tokenId || tokenId === interaction.tokenId) return false;
            const targetCombatant = this.#getEncounterCombatantForToken(combat, token);
            if (!targetCombatant?.id) return false;
            return String(targetCombatant.id) !== String(interaction.combatantId);
        });

        return buildEncounterTargetingOverlayModel({
            scene,
            sourceToken: projectedSourceToken,
            targetTokens,
            maxRangeFeet: interaction.rangeFeet,
            rangeType: interaction.rangeType
        });
    }

    get selectedSceneId() {
        return String(this.selection?.sceneId ?? "").trim();
    }

    get hasActiveTargetingInteraction() {
        return Boolean(this.targetingInteraction);
    }

    async cancelActiveTargetingInteraction() {
        await this.#cancelEncounterTargetingInteraction();
    }

    /**
     * Private Helpers
     */
    #collectionContents(col) {
        if (!col) return [];
        if (Array.isArray(col)) return col;
        if (Array.isArray(col.contents)) return col.contents;
        if (typeof col.values === "function") return Array.from(col.values());
        if (typeof col[Symbol.iterator] === "function") return Array.from(col);
        return [];
    }

    #collectionGet(col, id) {
        return col?.get?.(id) ?? null;
    }

    #resolveTokenActor(token) {
        if (!token) return null;
        const actorId = String(token.actorId ?? token.actor?.id ?? token.document?.actorId ?? "").trim();
        return actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    }

    #getEncounterCombatById(combatId = "") {
        return this.#collectionGet(game.combats, combatId)
            || (String(game.combats?.active?.id ?? "") === String(combatId ?? "") ? game.combats.active : null)
            || (String(game.combat?.id ?? "") === String(combatId ?? "") ? game.combat : null)
            || (String(ui.combat?.viewed?.id ?? "") === String(combatId ?? "") ? ui.combat.viewed : null);
    }

    #getEncounterCombat(element = null) {
        const combatId = String(element?.closest?.(".totc-v2-encounter-panel")?.dataset?.combatId ?? "").trim();
        if (combatId) return this.#getEncounterCombatById(combatId) ?? ui.combat?.viewed ?? game.combat ?? game.combats?.active ?? null;
        return ui.combat?.viewed ?? game.combat ?? game.combats?.active ?? null;
    }

    #getEncounterCombatant(combat = null, combatantId = "") {
        return combat?.combatants?.get?.(combatantId) ?? null;
    }

    #getEncounterCombatantForToken(combat = null, token = null) {
        if (!combat || !token) return null;
        const tokenId = String(token.id ?? token._id ?? token.document?.id ?? "").trim();
        return this.#collectionContents(combat.combatants).find((c) => (
            String(c.tokenId ?? c.token?.id ?? "").trim() === tokenId
        )) ?? null;
    }

    #canViewEncounterToken({ token, actor, combatant }) {
        if (!token) return false;
        if (game.user?.isGM) return true;
        if (actor?.testUserPermission?.(game.user, "OBSERVER")) return true;
        return false;
    }

    #canPlanEncounterToken({ combat, token, actor }) {
        if (!combat || !token) return false;
        if (game.user?.isGM) return true;
        if (actor?.testUserPermission?.(game.user, "OWNER")) return true;
        return false;
    }

    #buildEncounterPlannerSelectionForToken({ combat = null, token = null, actor = null, source = "" } = {}) {
        if (!token) return null;
        const selectedCombat = combat ?? this.#getEncounterCombat();
        const combatant = selectedCombat ? this.#getEncounterCombatantForToken(selectedCombat, token) : null;
        const resolvedActor = actor ?? combatant?.actor ?? this.#resolveTokenActor(token);
        if (!this.#canViewEncounterToken({ token, actor: resolvedActor, combatant })) return null;
        return {
            actor: resolvedActor ?? null,
            token,
            combat: selectedCombat,
            combatant,
            source
        };
    }

    #resolveEncounterPlannerSelection({ combat = null, scene = null } = {}) {
        const selection = this.selection;
        if (selection) {
            const selectedCombat = this.#collectionGet(game.combats, selection.combatId) ?? selection.combat ?? combat;
            const selectedScene = this.#collectionGet(game.scenes, selection.sceneId) ?? selection.scene ?? scene;
            const token = selection.token ?? this.#collectionGet(selectedScene?.tokens, selection.tokenId);
            const resolved = this.#buildEncounterPlannerSelectionForToken({
                combat: selectedCombat,
                token,
                actor: selection.actor ?? this.#resolveTokenActor(token),
                source: "pinned"
            });
            if (resolved) return resolved;
            this.selection = null;
        }

        const selectedToken = this.#getSelectedEncounterToken(scene);
        const resolved = this.#buildEncounterPlannerSelectionForToken({
            combat,
            token: selectedToken,
            actor: this.#resolveTokenActor(selectedToken),
            source: "selected-token"
        });
        if (resolved) return resolved;

        return null;
    }

    #getSelectedEncounterToken(scene = null) {
        const controlled = canvas?.tokens?.controlled ?? [];
        const sceneTokens = this.#collectionContents(scene?.tokens);
        if (controlled.length === 1) {
            const id = String(controlled[0]?.id ?? "").trim();
            const token = sceneTokens.find((t) => String(t.id ?? t._id ?? "").trim() === id);
            if (token) return token;
        }
        const selectedTokenIds = this.getSelectedTokenIds?.() ?? new Set();
        if (selectedTokenIds.size === 1) {
            const [id] = selectedTokenIds;
            return sceneTokens.find((token) => String(token?.id ?? token?._id ?? "").trim() === String(id ?? "").trim()) ?? null;
        }
        return null;
    }

    #getEncounterPanelCombatantId(element = null) {
        return String(element?.closest?.(".totc-v2-encounter-panel")?.dataset?.combatantId ?? "").trim();
    }

    #readEncounterActionData(element = null) {
        if (!element) return null;
        const apMin = Math.max(1, Number(element.dataset.apMin ?? element.dataset.apCost ?? 1));
        const apMax = Math.max(apMin, Number(element.dataset.apMax ?? element.dataset.apCost ?? apMin));
        const apCost = Math.max(apMin, Math.min(apMax, Number(element.dataset.apCost ?? apMin)));
        return {
            id: String(element.dataset.id ?? element.dataset.actionId ?? "").trim(),
            actionId: String(element.dataset.actionId ?? element.dataset.id ?? "").trim(),
            type: String(element.dataset.type ?? "action").trim(),
            label: String(element.dataset.label ?? element.value ?? "Action").trim(),
            apCost,
            apMin,
            apMax,
            variableAp: element.dataset.variableAp === "true",
            requiresToHit: element.dataset.requiresToHit === "true",
            requiresTarget: element.dataset.requiresTarget === "true",
            rangeType: String(element.dataset.rangeType ?? "melee").trim().toLowerCase(),
            toHitBonus: Number(element.dataset.toHitBonus ?? 0),
            targetingRangeFeet: Number(element.dataset.targetingRangeFeet ?? 0),
            movementFeet: Number(element.dataset.movementFeet ?? 0),
            movementFeetPerAp: Number(element.dataset.movementFeetPerAp ?? 0),
            itemId: String(element.dataset.itemId ?? "").trim() || null,
            img: String(element.dataset.img ?? "").trim()
        };
    }

    async #moveEncounterAction(combat = null, combatantId = "", fromIndex = -1, toIndex = -1) {
        if (!combatantId || !combat?.setCombatantPlan) return;
        const plan = [...(combat.getCombatantPlan?.(combatantId) ?? [])];
        if (fromIndex < 0 || fromIndex >= plan.length) return;
        const [moved] = plan.splice(fromIndex, 1);
        const target = Math.max(0, Math.min(plan.length, toIndex));
        plan.splice(target, 0, moved);
        await combat.setCombatantPlan(combatantId, plan);
        this.renderCallback({ force: false });
    }

    #beginEncounterMovementInteraction({ combat = null, combatantId = "", actionIndex = -1, maxAp = 0, feetPerAp = 10 } = {}) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#getEncounterMovementToken({ combat, combatantId, scene });
        if (!scene || !token || Number(maxAp) <= 0) {
            this.movementInteraction = null;
            this.#clearEncounterMovementNativeOverlay();
            return;
        }

        this.movementInteraction = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatantId ?? ""),
            actionIndex: Number(actionIndex),
            sceneId: String(scene.id ?? scene._id ?? ""),
            tokenId: String(token.id ?? token._id ?? token.document?.id ?? ""),
            maxAp: Math.max(1, Math.floor(Number(maxAp) || 1)),
            feetPerAp: Math.max(1, Number(feetPerAp) || 10)
        };
        this.targetingInteraction = null;
        this.#syncEncounterMovementNativeOverlay();
        this.#syncEncounterMovementCanvasListener();
    }

    #getNativeGridHighlightLayer() {
        return canvas?.interface?.grid ?? canvas?.grid ?? null;
    }

    #clearEncounterMovementNativeOverlay() {
        const gridLayer = this.#getNativeGridHighlightLayer();
        gridLayer?.clearHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        this.movementCanvasCleanup?.();
        this.movementCanvasCleanup = null;
        this.movementCanvasRef = null;
    }

    #syncEncounterMovementNativeOverlay() {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const model = this.getMovementOverlayState(scene);
        const gridLayer = this.#getNativeGridHighlightLayer();
        if (!model?.active || !gridLayer) {
            this.#clearEncounterMovementNativeOverlay();
            return;
        }

        gridLayer.clearHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        gridLayer.addHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        for (const cell of model.cells ?? []) {
            gridLayer.highlightPosition?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER, {
                x: cell.left,
                y: cell.top,
                color: cell.origin ? 0x38bdf8 : 0x22c55e,
                border: cell.origin ? 0x0ea5e9 : 0x16a34a,
                alpha: cell.origin ? 0.28 : 0.18
            });
        }
    }

    #syncEncounterMovementCanvasListener() {
        if (!this.movementInteraction) {
            this.#clearEncounterMovementNativeOverlay();
            return;
        }
        if (this.movementCanvasRef === canvas && this.movementCanvasCleanup) return;

        this.movementCanvasCleanup?.();
        this.movementCanvasRef = canvas;
        this.movementCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            void this.#handleEncounterMovementCanvasPointerDown(event);
        });
    }

    async #handleEncounterMovementCanvasPointerDown(event = {}) {
        if (!this.movementInteraction) return;
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const model = this.getMovementOverlayState(scene);
        const point = getNativeCanvasEventScenePoint(event, canvas);
        const cell = findEncounterMovementOverlayCellAtPoint(model, point);
        if (!cell) {
            await this.#cancelEncounterMovementInteraction();
            return;
        }

        event?.preventDefault?.();
        event?.stopPropagation?.();
        await this.#finishEncounterMovementInteraction(cell);
    }

    #getEncounterMovementToken({ combat = null, combatantId = "", scene = canvas?.scene ?? game.scenes?.viewed ?? null } = {}) {
        const combatant = this.#getEncounterCombatant(combat, combatantId);
        const tokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? "").trim();
        const directToken = this.#collectionGet(scene?.tokens, tokenId);
        if (directToken) return directToken;

        const actorId = String(combatant?.actorId ?? combatant?.actor?.id ?? combatant?.token?.actorId ?? "").trim();
        if (!actorId) return null;
        return this.#collectionContents(scene?.tokens).find((token) => (
            String(token?.actorId ?? token?.actor?.id ?? token?.document?.actorId ?? "").trim() === actorId
        )) ?? null;
    }

    #resolveEncounterActionRangeFeet(action = null, actor = null) {
        const explicitRangeFeet = Number(action?.targetingRangeFeet ?? 0);
        if (Number.isFinite(explicitRangeFeet) && explicitRangeFeet > 0) {
            return explicitRangeFeet;
        }

        const rangeType = String(action?.rangeType ?? "melee").toLowerCase();
        const item = action?.itemId ? actor?.items?.get?.(action.itemId) : null;
        const normal = Number(item?.system?.physical?.range?.normal ?? (rangeType === "melee" ? 5 : 30));
        const long = Number(item?.system?.physical?.range?.long ?? Math.max(normal, 60));

        if (rangeType === "long") return Math.max(5, long || normal || 60);
        if (rangeType === "normal") return Math.max(5, normal || 30);
        return 5;
    }

    #beginEncounterTargetingInteraction({ combat = null, combatantId = "", actionIndex = -1, action = null } = {}) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#getEncounterMovementToken({ combat, combatantId, scene });
        const combatant = this.#getEncounterCombatant(combat, combatantId);
        const rangeFeet = this.#resolveEncounterActionRangeFeet(action, combatant?.actor ?? null);
        const rangeType = String(action?.rangeType ?? "melee").toLowerCase();

        if (!scene || !token || !combat || Number(actionIndex) < 0 || !Number.isFinite(rangeFeet) || rangeFeet <= 0) {
            this.targetingInteraction = null;
            this.#clearEncounterTargetingCanvasListener();
            return;
        }

        this.targetingInteraction = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatantId ?? ""),
            actionIndex: Number(actionIndex),
            sceneId: String(scene?.id ?? scene?._id ?? ""),
            tokenId: String(token?.id ?? token?._id ?? token?.document?.id ?? ""),
            rangeFeet: Math.max(1, Math.round(rangeFeet)),
            rangeType
        };
        this.movementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        this.#syncEncounterTargetingCanvasListener();
        ui.notifications?.info?.(`Select a target token for ${String(action?.label ?? "this movement")}. Right-click or click empty ground to cancel.`);
    }

    #clearEncounterTargetingCanvasListener() {
        this.targetingCanvasCleanup?.();
        this.targetingCanvasCleanup = null;
        this.targetingCanvasRef = null;
    }

    #syncEncounterTargetingCanvasListener() {
        if (!this.targetingInteraction) {
            this.#clearEncounterTargetingCanvasListener();
            return;
        }
        if (this.targetingCanvasRef === canvas && this.targetingCanvasCleanup) return;
        this.#clearEncounterTargetingCanvasListener();
        this.targetingCanvasRef = canvas;
        this.targetingCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            void this.#handleEncounterTargetingCanvasPointerDown(event);
        }, { preferView: true, capture: true });
    }

    async #handleEncounterTargetingCanvasPointerDown(event = {}) {
        if (!this.targetingInteraction) return;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        event?.nativeEvent?.stopImmediatePropagation?.();
        if (!isPrimaryPointerButton(event)) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const overlay = this.getTargetOverlayState(scene);
        const point = getNativeCanvasEventScenePoint(event, canvas);
        const token = findEncounterTargetTokenAtPoint({
            tokens: canvas?.tokens?.placeables ?? this.#collectionContents(scene?.tokens),
            targetTokenIds: overlay?.targetTokenIds ?? [],
            point,
            gridSize: Number(scene?.grid?.size ?? 100) || 100
        });
        const tokenId = String(token?.id ?? token?.document?.id ?? "").trim();
        if (!tokenId) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }
        await this.#finishEncounterTargetingInteraction(tokenId);
    }

    async #finishEncounterMovementInteraction(selectedCell = null) {
        const interaction = this.movementInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        const scene = game.scenes?.get?.(interaction.sceneId) ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#collectionGet(scene?.tokens, interaction.tokenId);
        this.movementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        if (!combat?.setCombatantPlan || !token) {
            this.renderCallback({ force: false });
            return;
        }

        const requiredAp = Number(selectedCell?.requiredAp ?? selectedCell);
        const cost = Math.max(1, Number.isFinite(requiredAp) ? requiredAp : 1);
        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        if (!entry) {
            this.renderCallback({ force: false });
            return;
        }

        const gridSize = Number(scene?.grid?.size ?? 100) || 100;
        const offsetX = -Number(scene?.shiftX ?? 0);
        const offsetY = -Number(scene?.shiftY ?? 0);
        const row = Number(selectedCell?.row ?? 0);
        const col = Number(selectedCell?.col ?? 0);
        const cellLeft = Number(selectedCell?.left);
        const cellTop = Number(selectedCell?.top);
        const targetX = Number.isFinite(cellLeft) ? cellLeft : (col * gridSize) + offsetX;
        const targetY = Number.isFinite(cellTop) ? cellTop : (row * gridSize) + offsetY;
        const originX = Number(token?.x ?? token?.document?.x ?? 0);
        const originY = Number(token?.y ?? token?.document?.y ?? 0);
        const projectedToken = this.#projectEncounterTokenForPlan({
            token,
            combat,
            combatantId: interaction.combatantId,
            beforeActionIndex: index
        });
        const movementPath = buildEncounterPlanningMovementPath({
            start: {
                x: Number(projectedToken?.x ?? projectedToken?.document?.x ?? originX),
                y: Number(projectedToken?.y ?? projectedToken?.document?.y ?? originY)
            },
            target: { x: targetX, y: targetY },
            scene
        });

        const movementFeetPerAp = Math.max(1, Number(entry.movementFeetPerAp ?? interaction.feetPerAp ?? 10) || 10);
        plan[index] = {
            ...entry,
            apCost: cost,
            movementFeet: movementFeetPerAp * cost,
            movementFeetPerAp,
            movementTargetRow: row,
            movementTargetCol: col,
            movementTargetX: targetX,
            movementTargetY: targetY,
            movementOriginX: Number.isFinite(originX) ? originX : null,
            movementOriginY: Number.isFinite(originY) ? originY : null
        };

        await combat.setCombatantPlan(interaction.combatantId, plan);
        await applyLocalPlanningTokenPath(token, movementPath);
        this.renderCallback({ force: false });
    }

    async #cancelEncounterMovementInteraction() {
        const interaction = this.movementInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this.movementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        if (combat?.removeCombatantAction) {
            await combat.removeCombatantAction(interaction.combatantId, interaction.actionIndex);
        }
        this.renderCallback({ force: false });
    }

    async #finishEncounterTargetingInteraction(tokenId = "") {
        const interaction = this.targetingInteraction;
        if (!interaction) return;

        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        const scene = game.scenes?.get?.(interaction.sceneId) ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#collectionGet(scene?.tokens, tokenId);
        const targetCombatant = token ? this.#getEncounterCombatantForToken(combat, token) : null;
        if (!combat || !targetCombatant?.id || String(targetCombatant.id) === String(interaction.combatantId)) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        if (!entry || (!entry.requiresToHit && !entry.requiresTarget) || !combat.setCombatantPlan) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        plan[index] = {
            ...entry,
            targetId: targetCombatant.id
        };

        this.targetingInteraction = null;
        this.#clearEncounterTargetingCanvasListener();
        await combat.setCombatantPlan(interaction.combatantId, plan);
        this.renderCallback({ force: false });
    }

    async #cancelEncounterTargetingInteraction() {
        const interaction = this.targetingInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this.targetingInteraction = null;
        this.#clearEncounterTargetingCanvasListener();
        if (combat?.removeCombatantAction) {
            await combat.removeCombatantAction(interaction.combatantId, interaction.actionIndex);
        }
        this.renderCallback({ force: false });
    }

    #projectEncounterTokenForPlan({ token = null, combat = null, combatantId = "", beforeActionIndex = Infinity } = {}) {
        if (!token || !combatantId) return token;

        const plan = this.#collectionContents(combat?.getCombatantPlan?.(combatantId));
        const limit = Number.isFinite(Number(beforeActionIndex)) ? Math.max(0, Number(beforeActionIndex)) : plan.length;
        let projectedX = Number(token?.x ?? token?.document?.x ?? 0);
        let projectedY = Number(token?.y ?? token?.document?.y ?? 0);
        let changed = false;

        for (let index = 0; index < Math.min(limit, plan.length); index += 1) {
            const action = plan[index];
            if (String(action?.type ?? "") !== "movement") continue;
            const x = Number(action?.movementTargetX);
            const y = Number(action?.movementTargetY);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            projectedX = x;
            projectedY = y;
            changed = true;
        }

        if (!changed) return token;
        return {
            ...token,
            x: projectedX,
            y: projectedY,
            document: token.document
                ? {
                    ...token.document,
                    x: projectedX,
                    y: projectedY
                }
                : token.document
        };
    }
}
