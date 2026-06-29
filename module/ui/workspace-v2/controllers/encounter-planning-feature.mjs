import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    buildEncounterPlanningMovementPath,
    buildEncounterMovementOverlayModel,
    findEncounterMovementOverlayCellAtPoint
} from "../encounter-movement-overlay.mjs";
import { applyLocalPlanningTokenPath } from "../../../encounters/planning-token-preview.mjs";
import {
    collectTokenReferenceIds,
    findCombatantForToken,
    getCombatantTokenReferenceIds
} from "../../../encounters/combatant-token-matching.mjs";
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
import {
    buildEncounterTargetIconsModel,
    renderEncounterTargetIconsToContainer
} from "../encounter-target-icons.mjs";
import { dieRollRequestManager } from "../../../die-roll-request-manager.mjs";

const ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER = "totc-encounter-movement";
const ENCOUNTER_TARGETING_LOG_PREFIX = "[totc encounter targeting]";

function describeEncounterToken(token = null) {
    if (!token) return null;
    return {
        id: String(token?.id ?? ""),
        _id: String(token?._id ?? ""),
        documentId: String(token?.document?.id ?? ""),
        documentUuid: String(token?.document?.uuid ?? ""),
        actorId: String(token?.actorId ?? token?.document?.actorId ?? token?.actor?.id ?? ""),
        x: Number(token?.x ?? token?.document?.x ?? 0),
        y: Number(token?.y ?? token?.document?.y ?? 0),
        visible: token?.visible !== false
    };
}

function describeEncounterCombatant(combatant = null) {
    if (!combatant) return null;
    return {
        id: String(combatant?.id ?? ""),
        tokenId: String(combatant?.tokenId ?? ""),
        tokenDocumentId: String(combatant?.token?.document?.id ?? ""),
        actorId: String(combatant?.actorId ?? combatant?.actor?.id ?? combatant?.token?.actorId ?? combatant?.token?.document?.actorId ?? "")
    };
}

function logEncounterTargeting(message = "", details = {}, level = "info") {
    const logger = level === "warn" ? console?.warn : console?.info;
    logger?.(ENCOUNTER_TARGETING_LOG_PREFIX, message, details);
}

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
        this.targetIconsContainer = null;
        this.lastTargetIconsHash = "";
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

        // Render target icons over any tokens named in the current player's plan
        this.#syncEncounterTargetIconsOverlay(
            selection?.combat ?? null,
            selection?.combatant?.id ?? null,
            scene
        );
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

                const actionData = this.#readEncounterActionData(button);
                if (!actionData) return;

                const actionIndex = Number(button.dataset.actionIndex);
                if (Number.isNaN(actionIndex)) return;
                const combatantId = this.#getEncounterPanelCombatantId(button);
                const combat = this.#getEncounterCombat(button);
                const selectedAction = this.#configureEncounterActionDefaults(actionData);

                this.activePlanEditSlot = {
                    ...(this.activePlanEditSlot ?? {}),
                    index: actionIndex,
                    selectedAction
                };
                if (String(selectedAction.type ?? "").toLowerCase() === "movement" && !selectedAction.requiresTarget) {
                    this.#beginEncounterMovementInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        maxAp: selectedAction.apMax,
                        feetPerAp: selectedAction.movementFeetPerAp || 10,
                        pendingAction: true
                    });
                }
                this.renderCallback({ force: false });
                return;
            }

            const buttonBack = event.target?.closest?.("[data-action='encounter-config-back']");
            if (buttonBack) {
                event.preventDefault();
                event.stopPropagation();
                if (this.activePlanEditSlot) {
                    const { selectedAction, ...slot } = this.activePlanEditSlot;
                    this.activePlanEditSlot = slot;
                    this.renderCallback({ force: false });
                }
                return;
            }

            const buttonConfirm = event.target?.closest?.("[data-action='encounter-confirm-configured-action']");
            if (buttonConfirm) {
                event.preventDefault();
                event.stopPropagation();

                const combatantId = this.#getEncounterPanelCombatantId(buttonConfirm);
                const combat = this.#getEncounterCombat(buttonConfirm);
                if (!combatantId || !combat?.setCombatantPlan) return;

                const actionIndex = Number(buttonConfirm.dataset.actionIndex);
                if (Number.isNaN(actionIndex)) return;

                const actionData = this.#readConfiguredEncounterActionData(buttonConfirm);
                if (!actionData) return;

                const planAction = this.#buildConfiguredEncounterPlanAction(actionData);
                const currentPlan = combat.getCombatantPlan?.(combatantId) ?? [];
                const nextPlan = [...currentPlan.slice(0, actionIndex), planAction];
                await combat.setCombatantPlan(combatantId, nextPlan);

                this.#startEncounterActionFollowup({
                    combat,
                    combatantId,
                    actionIndex,
                    planAction
                });

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

        element?.addEventListener("change", (event) => {
            const configControl = event.target?.closest?.([
                "[data-action='encounter-config-target-mode']",
                "[data-action='encounter-config-positioning-ap']",
                "[data-action='encounter-config-effect-ap']"
            ].join(", "));
            if (!configControl || !this.activePlanEditSlot?.selectedAction) return;

            const config = configControl.closest?.(".totc-v2-encounter-config") ?? null;
            const buttonConfirm = config?.querySelector?.("[data-action='encounter-confirm-configured-action']") ?? null;
            const actionData = this.#readConfiguredEncounterActionData(buttonConfirm);
            if (!actionData) return;

            this.activePlanEditSlot = {
                ...this.activePlanEditSlot,
                selectedAction: {
                    ...this.activePlanEditSlot.selectedAction,
                    ...actionData
                }
            };
            this.renderCallback({ force: false });
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
        const key = String(id ?? "").trim();
        if (!key) return null;
        return col?.get?.(key)
            ?? this.#collectionContents(col).find((entry) => (
                String(entry?.id ?? entry?._id ?? entry?.document?.id ?? "").trim() === key
            ))
            ?? null;
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
        return findCombatantForToken({
            combatants: this.#collectionContents(combat.combatants),
            token,
            actor: token?.actor ?? null
        });
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
            targetMode: String(element.dataset.targetMode ?? "").trim(),
            positioningAp: Number(element.dataset.positioningAp ?? NaN),
            effectAp: Number(element.dataset.effectAp ?? NaN),
            movementFeet: Number(element.dataset.movementFeet ?? 0),
            movementFeetPerAp: Number(element.dataset.movementFeetPerAp ?? 0),
            movementTargetRow: Number(element.dataset.movementTargetRow ?? NaN),
            movementTargetCol: Number(element.dataset.movementTargetCol ?? NaN),
            movementTargetX: Number(element.dataset.movementTargetX ?? NaN),
            movementTargetY: Number(element.dataset.movementTargetY ?? NaN),
            movementOriginX: Number(element.dataset.movementOriginX ?? NaN),
            movementOriginY: Number(element.dataset.movementOriginY ?? NaN),
            itemId: String(element.dataset.itemId ?? "").trim() || null,
            img: String(element.dataset.img ?? "").trim()
        };
    }

    #configureEncounterActionDefaults(actionData = {}) {
        const remainingSlotAp = Math.max(1, Math.floor(Number(this.activePlanEditSlot?.remainingAp ?? actionData.apCost ?? 1)) || 1);
        const isMovement = String(actionData.type ?? "").toLowerCase() === "movement";
        const needsTarget = Boolean(actionData.requiresTarget || actionData.requiresToHit);
        const apMin = Math.max(1, Math.min(remainingSlotAp, Number(actionData.apMin ?? actionData.apCost ?? 1) || 1));
        const apMax = isMovement
            ? remainingSlotAp
            : Math.max(apMin, Math.min(remainingSlotAp, Number(actionData.apMax ?? actionData.apCost ?? apMin) || apMin));
        const defaultApCost = isMovement
            ? apMax
            : Math.max(apMin, Math.min(apMax, Number(actionData.apCost ?? apMin) || apMin));
        const defaultEffectAp = isMovement
            ? defaultApCost
            : Math.max(apMin, Math.min(apMax, Number.isFinite(Number(actionData.effectAp)) ? Number(actionData.effectAp) : defaultApCost));
        const maxPositioningAp = isMovement || !needsTarget ? 0 : Math.max(0, remainingSlotAp - defaultEffectAp);
        const defaultPositioningAp = Math.max(
            0,
            Math.min(maxPositioningAp, Number.isFinite(Number(actionData.positioningAp)) ? Number(actionData.positioningAp) : 0)
        );
        const configuredApCost = isMovement
            ? defaultEffectAp
            : Math.max(1, Math.min(remainingSlotAp, defaultEffectAp + defaultPositioningAp));
        const targetMode = String(actionData.targetMode || (isMovement ? "location" : (needsTarget ? "selectTarget" : "self"))).trim();

        return {
            ...actionData,
            apCost: configuredApCost,
            apMin,
            apMax,
            effectAp: defaultEffectAp,
            positioningAp: defaultPositioningAp,
            targetMode,
            variableAp: apMax > apMin || maxPositioningAp > 0
        };
    }

    #readConfiguredEncounterActionData(button = null) {
        const actionData = this.#readEncounterActionData(button);
        if (!actionData) return null;

        const config = button.closest?.(".totc-v2-encounter-config") ?? null;
        const isMovement = String(actionData.type ?? "").toLowerCase() === "movement";
        const needsTarget = Boolean(actionData.requiresTarget || actionData.requiresToHit);
        const remainingAp = Math.max(1, Number(config?.dataset?.remainingAp ?? this.activePlanEditSlot?.remainingAp ?? actionData.apCost ?? 1) || 1);
        const targetMode = String(config?.querySelector?.("[data-action='encounter-config-target-mode']")?.value ?? actionData.targetMode ?? (isMovement ? "location" : (needsTarget ? "selectTarget" : "self"))).trim();
        const effectAp = isMovement
            ? Math.max(1, Math.min(remainingAp, Number(actionData.apCost ?? 1) || 1))
            : Math.max(actionData.apMin, Math.min(actionData.apMax, Number(config?.querySelector?.("[data-action='encounter-config-effect-ap']")?.value ?? actionData.effectAp ?? actionData.apCost)));
        const positioningAp = isMovement || !needsTarget
            ? 0
            : Math.max(0, Math.min(Math.max(0, remainingAp - effectAp), Number(config?.querySelector?.("[data-action='encounter-config-positioning-ap']")?.value ?? actionData.positioningAp ?? 0)));
        const fallbackApCost = Number(config?.querySelector?.("[data-action='encounter-config-ap-cost']")?.value ?? actionData.apCost);
        const apCost = isMovement
            ? Math.max(1, Math.min(remainingAp, fallbackApCost || effectAp))
            : Math.max(1, Math.min(remainingAp, effectAp + positioningAp));
        const followThroughType = String(config?.querySelector?.("[data-action='encounter-config-follow-through']")?.value ?? "chooseAnotherAction").trim();
        const failureOutcomeType = String(config?.querySelector?.("[data-action='encounter-config-failure-outcome']")?.value ?? "bestReachablePosition").trim();

        return {
            ...actionData,
            apCost,
            effectAp,
            positioningAp,
            targetMode,
            followThroughType,
            failureOutcomeType
        };
    }

    #buildConfiguredEncounterPlanAction(actionData = {}) {
        const isMovement = String(actionData.type ?? "").toLowerCase() === "movement";
        const effectAp = isMovement
            ? Math.max(1, Math.floor(Number(actionData.apCost ?? actionData.effectAp ?? 1)) || 1)
            : Math.max(1, Math.floor(Number(actionData.effectAp ?? actionData.apCost ?? 1)) || 1);
        const positioningAp = isMovement
            ? 0
            : Math.max(0, Math.floor(Number(actionData.positioningAp ?? 0)) || 0);
        const apCost = isMovement
            ? effectAp
            : Math.max(1, positioningAp + effectAp);
        const movementFeetPerAp = Math.max(1, Number(actionData.movementFeetPerAp ?? 10) || 10);
        const planAction = {
            ...actionData,
            apCost,
            apMax: Math.max(apCost, Number(actionData.apMax ?? apCost) || apCost),
            targetMode: actionData.targetMode || (isMovement ? "location" : (actionData.requiresTarget || actionData.requiresToHit ? "selectTarget" : "self")),
            intentType: this.#encounterIntentTypeForAction(actionData),
            apEnvelope: {
                positioningAp,
                effectAp,
                maxAp: apCost
            },
            positioningRequirement: this.#encounterPositioningRequirementForAction(actionData),
            followThrough: {
                type: actionData.followThroughType || "chooseAnotherAction"
            },
            failureOutcome: {
                type: actionData.failureOutcomeType || "bestReachablePosition"
            },
            sourceAction: {
                id: actionData.id,
                actionId: actionData.actionId,
                type: actionData.type,
                itemId: actionData.itemId ?? null
            }
        };

        if (planAction.requiresToHit || planAction.type === "attack") {
            planAction.systemRollsAllowed = false;
        }

        delete planAction.followThroughType;
        delete planAction.failureOutcomeType;

        if (isMovement) {
            planAction.movementFeetPerAp = movementFeetPerAp;
            planAction.movementFeet = movementFeetPerAp * apCost;
            for (const key of ["movementTargetRow", "movementTargetCol", "movementTargetX", "movementTargetY", "movementOriginX", "movementOriginY"]) {
                const value = Number(actionData[key]);
                if (Number.isFinite(value)) planAction[key] = value;
            }
        }

        return planAction;
    }

    #encounterIntentTypeForAction(actionData = {}) {
        const actionType = String(actionData.type ?? "").toLowerCase();
        const actionId = String(actionData.actionId ?? actionData.id ?? "").trim();
        if (actionType === "movement") return actionId || "move";
        if (actionType === "attack" || actionData.requiresToHit) return "attackTarget";
        if (actionType === "consumable") return "useItem";
        if (actionType === "utility") return "interactWithObject";
        if (actionType === "defense" || actionData.isReaction) return "holdReaction";
        return actionId || actionType || "action";
    }

    #encounterPositioningRequirementForAction(actionData = {}) {
        const actionType = String(actionData.type ?? "").toLowerCase();
        const targetMode = String(actionData.targetMode ?? "").trim();
        if (actionType === "movement" || targetMode === "self" || !actionData.requiresTarget && !actionData.requiresToHit) return null;

        if (actionType === "attack" || actionData.requiresToHit) {
            const rangeFeet = Number(actionData.targetingRangeFeet ?? 0);
            return {
                type: "weaponRange",
                targetKind: "combatant",
                rangeFeet: Number.isFinite(rangeFeet) && rangeFeet > 0 ? rangeFeet : null
            };
        }

        return {
            type: "adjacent",
            targetKind: "combatant",
            rangeFeet: 5
        };
    }

    #startEncounterActionFollowup({ combat = null, combatantId = "", actionIndex = -1, planAction = null } = {}) {
        if (!planAction) return;

        const apCost = Math.max(1, Number(planAction.apCost ?? 1) || 1);
        const movementFeetPerAp = Math.max(1, Number(planAction.movementFeetPerAp ?? 10) || 10);
        if (planAction.requiresTarget) {
            this.#beginEncounterTargetingInteraction({
                combat,
                combatantId,
                actionIndex,
                action: planAction
            });
            return;
        }

        if (planAction.type === "movement") {
            if (Number.isFinite(Number(planAction.movementTargetX)) && Number.isFinite(Number(planAction.movementTargetY))) {
                this.movementInteraction = null;
                this.targetingInteraction = null;
                this.#clearEncounterMovementNativeOverlay();
                return;
            }
            this.#beginEncounterMovementInteraction({
                combat,
                combatantId,
                actionIndex,
                maxAp: apCost,
                feetPerAp: movementFeetPerAp
            });
            return;
        }

        if (planAction.requiresToHit && ["melee", "normal", "long"].includes(String(planAction.rangeType ?? "").toLowerCase())) {
            this.#beginEncounterTargetingInteraction({
                combat,
                combatantId,
                actionIndex,
                action: planAction
            });
            return;
        }

        this.movementInteraction = null;
        this.targetingInteraction = null;
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

    #beginEncounterMovementInteraction({ combat = null, combatantId = "", actionIndex = -1, maxAp = 0, feetPerAp = 10, pendingAction = false } = {}) {
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
            feetPerAp: Math.max(1, Number(feetPerAp) || 10),
            pendingAction: Boolean(pendingAction)
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
        const combatantTokenIds = getCombatantTokenReferenceIds(combatant);
        const directToken = this.#collectionContents(scene?.tokens).find((token) => {
            const tokenIds = collectTokenReferenceIds(token);
            for (const id of tokenIds) {
                if (combatantTokenIds.has(id)) return true;
            }
            return false;
        }) ?? null;
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
            logEncounterTargeting("targeting did not start", {
                reason: !scene ? "missing scene"
                    : !token ? "missing source token"
                        : !combat ? "missing combat"
                            : Number(actionIndex) < 0 ? "invalid action index"
                                : "invalid range",
                combatId: String(combat?.id ?? ""),
                combatantId: String(combatantId ?? ""),
                actionIndex: Number(actionIndex),
                rangeFeet,
                sourceToken: describeEncounterToken(token),
                sourceCombatant: describeEncounterCombatant(combatant)
            }, "warn");
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
            rangeType,
            actionId: String(action?.actionId ?? action?.id ?? ""),
            actionType: String(action?.type ?? ""),
            requiresToHit: Boolean(action?.requiresToHit),
            requiresTarget: Boolean(action?.requiresTarget)
        };
        this.movementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        this.#syncEncounterTargetingCanvasListener();
        logEncounterTargeting("targeting started", {
            interaction: this.targetingInteraction,
            action: {
                id: String(action?.id ?? ""),
                actionId: String(action?.actionId ?? ""),
                type: String(action?.type ?? ""),
                requiresToHit: Boolean(action?.requiresToHit),
                requiresTarget: Boolean(action?.requiresTarget)
            },
            sourceToken: describeEncounterToken(token),
            sourceCombatant: describeEncounterCombatant(combatant)
        });
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
        // Register at document capture level so this fires before PIXI's canvas-level
        // capture listener. If we register on the canvas element, PIXI (registered
        // first at Foundry init) gets the pointerdown first and selects the token
        // before our stopImmediatePropagation can prevent it. Document capture runs
        // before any canvas-element listener; only handle events targeting the canvas
        // view so clicks on workspace panels are not intercepted.
        const view = canvas?.app?.view ?? canvas?.app?.canvas ?? null;
        const handler = (event) => {
            if (view && !this.#isCanvasPointerEvent(event, view)) {
                logEncounterTargeting("ignored pointerdown outside canvas view", {
                    target: this.#describeEventTarget(event?.target),
                    hasComposedPath: typeof event?.composedPath === "function"
                });
                return;
            }
            void this.#handleEncounterTargetingCanvasPointerDown(event);
        };
        document.addEventListener("pointerdown", handler, { capture: true });
        this.targetingCanvasCleanup = () => document.removeEventListener("pointerdown", handler, { capture: true });
        logEncounterTargeting("targeting pointer listener attached", {
            hasView: Boolean(view),
            view: this.#describeEventTarget(view)
        });
    }

    #isCanvasPointerEvent(event = {}, view = null) {
        if (!view) return true;
        if (event.target === view) return true;
        if (typeof event.composedPath === "function" && event.composedPath().includes(view)) return true;
        return typeof view.contains === "function" && view.contains(event.target);
    }

    #describeEventTarget(target = null) {
        if (!target) return null;
        return {
            id: String(target?.id ?? ""),
            tagName: String(target?.tagName ?? ""),
            className: String(target?.className ?? ""),
            nodeName: String(target?.nodeName ?? ""),
            constructorName: String(target?.constructor?.name ?? "")
        };
    }

    #describePointerEventCoordinates(event = {}) {
        const sources = {
            event,
            nativeEvent: event?.nativeEvent,
            originalEvent: event?.originalEvent,
            dataOriginalEvent: event?.data?.originalEvent
        };
        return Object.fromEntries(Object.entries(sources)
            .filter(([, source]) => source)
            .map(([name, source]) => [name, {
                clientX: source?.clientX,
                clientY: source?.clientY,
                x: source?.x,
                y: source?.y,
                pageX: source?.pageX,
                pageY: source?.pageY,
                offsetX: source?.offsetX,
                offsetY: source?.offsetY,
                layerX: source?.layerX,
                layerY: source?.layerY,
                global: source?.global,
                dataGlobal: source?.data?.global
            }]));
    }

    async #handleEncounterTargetingCanvasPointerDown(event = {}) {
        if (!this.targetingInteraction) return;
        logEncounterTargeting("targeting pointerdown received", {
            interaction: this.targetingInteraction,
            button: event?.button ?? event?.data?.button ?? event?.nativeEvent?.button ?? event?.data?.originalEvent?.button,
            target: this.#describeEventTarget(event?.target),
            coordinates: this.#describePointerEventCoordinates(event)
        });
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        event?.nativeEvent?.stopImmediatePropagation?.();
        if (!isPrimaryPointerButton(event)) {
            await this.#cancelEncounterTargetingInteraction("non-primary pointer button", {
                button: event?.button ?? event?.data?.button ?? event?.nativeEvent?.button ?? event?.data?.originalEvent?.button
            });
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
        logEncounterTargeting("targeting hit-test completed", {
            point,
            overlayActive: Boolean(overlay?.active),
            targetTokenIds: overlay?.targetTokenIds ?? [],
            placeableCount: Number(canvas?.tokens?.placeables?.length ?? 0),
            sceneTokenCount: this.#collectionContents(scene?.tokens).length,
            token: describeEncounterToken(token)
        });
        const tokenId = String(token?.document?.id ?? token?.id ?? token?._id ?? "").trim();
        if (!tokenId) {
            await this.#abortEncounterTargetingInteraction("no token hit", {
                point,
                overlayActive: Boolean(overlay?.active),
                targetTokenIds: overlay?.targetTokenIds ?? []
            });
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

        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        const sourceAction = interaction.pendingAction ? this.activePlanEditSlot?.selectedAction : entry;
        if (!sourceAction) {
            this.renderCallback({ force: false });
            return;
        }

        const movementUpdate = this.#buildEncounterMovementSelectionUpdate({
            selectedCell,
            token,
            scene,
            combat,
            combatantId: interaction.combatantId,
            actionIndex: index,
            action: sourceAction,
            feetPerAp: interaction.feetPerAp
        });
        if (!movementUpdate) {
            this.renderCallback({ force: false });
            return;
        }

        if (interaction.pendingAction) {
            this.activePlanEditSlot = {
                ...(this.activePlanEditSlot ?? {}),
                selectedAction: {
                    ...sourceAction,
                    ...movementUpdate.action
                }
            };
            await applyLocalPlanningTokenPath(token, movementUpdate.path);
            this.renderCallback({ force: false });
            return;
        }

        if (!entry) {
            this.renderCallback({ force: false });
            return;
        }

        plan[index] = { ...entry, ...movementUpdate.action };
        await combat.setCombatantPlan(interaction.combatantId, plan);
        await applyLocalPlanningTokenPath(token, movementUpdate.path);
        this.renderCallback({ force: false });
    }

    #buildEncounterMovementSelectionUpdate({ selectedCell = null, token = null, scene = null, combat = null, combatantId = "", actionIndex = -1, action = null, feetPerAp = 10 } = {}) {
        if (!selectedCell || !token || !scene || !action) return null;

        const requiredAp = Number(selectedCell?.requiredAp ?? selectedCell);
        const cost = Math.max(1, Number.isFinite(requiredAp) ? requiredAp : 1);
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
            combatantId,
            beforeActionIndex: actionIndex
        });
        const movementPath = buildEncounterPlanningMovementPath({
            start: {
                x: Number(projectedToken?.x ?? projectedToken?.document?.x ?? originX),
                y: Number(projectedToken?.y ?? projectedToken?.document?.y ?? originY)
            },
            target: { x: targetX, y: targetY },
            scene
        });
        const movementFeetPerAp = Math.max(1, Number(action.movementFeetPerAp ?? feetPerAp ?? 10) || 10);

        return {
            action: {
                apCost: cost,
                movementFeet: movementFeetPerAp * cost,
                movementFeetPerAp,
                movementTargetRow: row,
                movementTargetCol: col,
                movementTargetX: targetX,
                movementTargetY: targetY,
                movementOriginX: Number.isFinite(originX) ? originX : null,
                movementOriginY: Number.isFinite(originY) ? originY : null
            },
            path: movementPath
        };
    }

    async #cancelEncounterMovementInteraction() {
        const interaction = this.movementInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this.movementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        if (!interaction.pendingAction && combat?.removeCombatantAction) {
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
            await this.#cancelEncounterTargetingInteraction("finish rejected target", {
                requestedTokenId: String(tokenId ?? ""),
                hasCombat: Boolean(combat),
                token: describeEncounterToken(token),
                targetCombatant: describeEncounterCombatant(targetCombatant),
                sourceCombatantId: String(interaction.combatantId ?? "")
            });
            return;
        }

        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        if (!entry || !combat.setCombatantPlan) {
            await this.#cancelEncounterTargetingInteraction("finish rejected plan entry", {
                actionIndex: index,
                hasEntry: Boolean(entry),
                requiresToHit: Boolean(entry?.requiresToHit),
                requiresTarget: Boolean(entry?.requiresTarget),
                interactionRequiresToHit: Boolean(interaction.requiresToHit),
                interactionRequiresTarget: Boolean(interaction.requiresTarget),
                hasSetCombatantPlan: Boolean(combat?.setCombatantPlan),
                planLength: plan.length
            });
            return;
        }

        plan[index] = {
            ...entry,
            targetId: targetCombatant.id
        };

        this.targetingInteraction = null;
        this.#clearEncounterTargetingCanvasListener();
        await combat.setCombatantPlan(interaction.combatantId, plan);
        logEncounterTargeting("target committed", {
            combatantId: String(interaction.combatantId ?? ""),
            actionIndex: index,
            targetCombatant: describeEncounterCombatant(targetCombatant),
            token: describeEncounterToken(token)
        });
        this.#syncEncounterTargetIconsOverlay(combat, interaction.combatantId, scene);
        this.#requestEncounterAttackRolls({
            combat,
            combatantId: interaction.combatantId,
            actionIndex: index,
            action: plan[index]
        });
        this.renderCallback({ force: false });
    }

    #requestEncounterAttackRolls({ combat = null, combatantId = "", actionIndex = -1, action = null } = {}) {
        if (!combat || !action || !(action.requiresToHit || action.type === "attack")) return;
        if (action.planningLocked || this.#collectionContents(action.planningRollResults).length > 0) return;

        const recipientIds = this.#resolveEncounterRollRecipientIds(combat.combatants?.get?.(combatantId));
        if (!recipientIds.length) return;

        const combatant = combat.combatants?.get?.(combatantId) ?? null;
        const requestBase = {
            initiatorId: game?.user?.id ?? "",
            requestor: {
                id: game?.user?.id ?? "",
                name: game?.user?.name ?? "GM",
                type: game?.user?.isGM ? "gm" : "player"
            },
            recipientIds,
            actorId: String(combatant?.actor?.id ?? ""),
            combatId: String(combat.id ?? ""),
            combatantId: String(combatantId ?? ""),
            actionIndex: Math.max(0, Number(actionIndex) || 0),
            actionId: String(action.actionId ?? action.id ?? "")
        };
        dieRollRequestManager.sendRequest({
            ...requestBase,
            id: `encounter-${combat.id}-combatant-${combatantId}-action-${Math.max(0, Number(actionIndex) || 0)}-attack`,
            rollType: "attack",
            rollSubType: "toHit",
            label: `${combatant?.name ?? "Combatant"}: ${action.label ?? "Attack"}`,
            dice: [{ count: 1, faces: 20 }]
        });

        const damageRequest = this.#buildEncounterDamageRollRequest({ combat, combatant, action, actionIndex });
        if (damageRequest) {
            dieRollRequestManager.sendRequest({
                ...requestBase,
                ...damageRequest
            });
        }
    }

    #buildEncounterDamageRollRequest({ combat = null, combatant = null, action = null, actionIndex = -1 } = {}) {
        const item = action?.itemId ? combatant?.actor?.items?.get?.(action.itemId) : null;
        const formula = String(item?.system?.damage?.formula ?? "").trim();
        const match = formula.match(/^(\d*)d(\d+)$/i);
        if (!match) return null;

        const bonus = Number(item?.system?.damage?.bonus ?? 0) || 0;
        return {
            id: `encounter-${combat?.id}-combatant-${combatant?.id}-action-${Math.max(0, Number(actionIndex) || 0)}-damage`,
            rollType: "attack",
            rollSubType: "damage",
            label: `${combatant?.name ?? "Combatant"}: ${action?.label ?? "Attack"} damage`,
            dice: [{ count: Math.max(1, Number(match[1] || 1) || 1), faces: Math.max(2, Number(match[2]) || 6) }],
            modifiers: bonus ? [{ label: "Damage bonus", value: bonus, source: "item" }] : []
        };
    }

    #resolveEncounterRollRecipientIds(combatant = null) {
        const users = this.#collectionContents(game?.users);
        const ownerIds = users
            .filter((user) => !user?.isGM && combatant?.actor?.testUserPermission?.(user, "OWNER"))
            .map((user) => String(user?.id ?? "").trim())
            .filter(Boolean);
        if (ownerIds.length) return ownerIds;

        const currentUserId = String(game?.user?.id ?? "").trim();
        return currentUserId ? [currentUserId] : [];
    }

    async #abortEncounterTargetingInteraction(reason = "aborted", details = {}) {
        const interaction = this.targetingInteraction;
        if (!interaction) return;
        this.targetingInteraction = null;
        this.#clearEncounterTargetingCanvasListener();
        logEncounterTargeting("targeting aborted; planned action retained", {
            reason,
            interaction,
            ...details
        }, "warn");
        this.renderCallback({ force: false });
    }

    async #cancelEncounterTargetingInteraction(reason = "cancelled", details = {}) {
        const interaction = this.targetingInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this.targetingInteraction = null;
        this.#clearEncounterTargetingCanvasListener();
        logEncounterTargeting("targeting cancelled; removing planned action", {
            reason,
            interaction,
            ...details
        }, "warn");
        if (combat?.removeCombatantAction) {
            await combat.removeCombatantAction(interaction.combatantId, interaction.actionIndex);
        }
        this.renderCallback({ force: false });
    }

    #syncEncounterTargetIconsOverlay(combat = null, combatantId = null, scene = null) {
        const icons = (combat && combatantId && scene)
            ? buildEncounterTargetIconsModel({ combat, combatantId, scene })
            : [];

        const hash = icons
            .map((i) => `${i.tokenId}:${i.iconType}:${i.x}:${i.y}:${i.tileWidth}:${i.tileHeight}`)
            .join("|");
        if (
            hash === this.lastTargetIconsHash
            && this.targetIconsContainer
            && !this.targetIconsContainer.destroyed
            && this.targetIconsContainer.children?.length === icons.length
        ) {
            return;
        }
        this.lastTargetIconsHash = hash;

        const targetIconLayer = canvas?.tokens ?? canvas?.primary ?? canvas?.stage ?? canvas?.interface;
        const targetIconLayerName = canvas?.tokens
            ? "canvas.tokens"
            : canvas?.primary
                ? "canvas.primary"
                : canvas?.stage
                    ? "canvas.stage"
                    : canvas?.interface
                        ? "canvas.interface"
                        : "";
        if (!targetIconLayer) {
            logEncounterTargeting("target icon overlay skipped", {
                reason: "missing target icon layer",
                combatId: String(combat?.id ?? ""),
                combatantId: String(combatantId ?? ""),
                iconCount: icons.length,
                icons
            }, "warn");
            return;
        }

        if (
            !this.targetIconsContainer
            || this.targetIconsContainer.destroyed
            || this.targetIconsContainer.parent !== targetIconLayer
        ) {
            if (this.targetIconsContainer && !this.targetIconsContainer.destroyed) {
                this.targetIconsContainer.destroy({ children: true });
            }
            if (typeof PIXI === "undefined") {
                logEncounterTargeting("target icon overlay skipped", {
                    reason: "PIXI unavailable",
                    combatId: String(combat?.id ?? ""),
                    combatantId: String(combatantId ?? ""),
                    iconCount: icons.length,
                    icons
                }, "warn");
                return;
            }
            this.targetIconsContainer = new PIXI.Container();
            this.targetIconsContainer.name = "totc-encounter-target-icons";
            this.targetIconsContainer.eventMode = "none";
            this.targetIconsContainer.interactive = false;
            this.targetIconsContainer.zIndex = 10_000;
            targetIconLayer.sortableChildren = true;
            targetIconLayer.addChild(this.targetIconsContainer);
        }

        renderEncounterTargetIconsToContainer(this.targetIconsContainer, icons);
        logEncounterTargeting("target icon overlay rendered", {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatantId ?? ""),
            layer: targetIconLayerName,
            iconCount: icons.length,
            icons
        });
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
