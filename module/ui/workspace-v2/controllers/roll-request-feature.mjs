import { WorkspaceFeature } from "../workspace-feature.mjs";
import { dieRollRequestManager } from "../../../die-roll-request-manager.mjs";
import { acceptCompletedPlanningRoll } from "../../../encounters/planning-roll-lock.mjs";
import { getDieRollRequestHostPanelId } from "../die-roll-request-routing.mjs";
import {
    buildDieRollRequestPanelModel,
    renderDieRollRequestPanel
} from "../panels/die-roll-request-panel.mjs";
import { buildDiceRollFeedPanelModel } from "../panels/dice-roll-feed-panel.mjs";

const ROLL_LOCKED_ACTIONS = Object.freeze(new Set([
    "actor-create-npc",
    "actor-editor-generate",
    "actor-editor-save",
    "actor-list-new",
    "design-lens-action",
    "gm-create-scene",
    "gm-end-combat",
    "gm-next-turn",
    "gm-start-encounter",
    "grid-cal-confirm",
    "inspector-design-action",
    "scene-properties-activate",
    "scene-actors-add-heroes",
    "scene-actors-add-selected",
    "scene-actors-clear",
    "scene-actors-remove-selected"
]));

export class RollRequestFeature extends WorkspaceFeature {
    constructor({
        layoutEngine,
        panelRegistry,
        stateStore = null,
        render = () => {}
    } = {}) {
        super();
        this.layoutEngine = layoutEngine;
        this.panelRegistry = panelRegistry;
        this.stateStore = stateStore;
        this.renderCallback = render;

        this._unsubscribe = dieRollRequestManager.onChange((change) => {
            return this.#handleDieRollRequestChange(change);
        });

        this._rootElement = null;
        this._rollLockHandler = null;
    }

    async #handleDieRollRequestChange(change = {}) {
        await acceptCompletedPlanningRoll({ change });
        const userId = String(globalThis.game?.user?.id ?? "");
        const isGM = Boolean(globalThis.game?.user?.isGM);
        const hasRelevantPendingRequest = dieRollRequestManager
            .getVisibleRequests({ userId, isGM })
            .some((request) => request.isPending && (isGM || !request.hasResult(userId)));

        if (hasRelevantPendingRequest) {
            const panelDef = this.panelRegistry.get(getDieRollRequestHostPanelId({ isGM }));
            if (panelDef) {
                const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "bottomDock" });
                await this.stateStore?.setUserLayout?.(nextLayout);
            }
        }

        this.renderCallback({ force: false });
    }

    #getWorkspaceUsers() {
        const users = globalThis.game?.users?.contents
            ?? (typeof globalThis.game?.users?.values === "function" ? Array.from(globalThis.game.users.values()) : globalThis.game?.users)
            ?? [];
        return Array.from(users).map((user) => ({
            id: String(user?.id ?? ""),
            name: String(user?.name ?? user?.id ?? "Unknown User"),
            isGM: Boolean(user?.isGM)
        })).filter((user) => user.id);
    }

    async prepareContext(context) {
        const userId = globalThis.game?.user?.id;
        const isGM = Boolean(globalThis.game?.user?.isGM);
        const workspaceUsers = this.#getWorkspaceUsers();
        context.dieRollRequestPanel = buildDieRollRequestPanelModel({
            userId,
            isGM,
            users: workspaceUsers
        });
        context.diceRollFeedPanel = buildDiceRollFeedPanelModel({
            messages: globalThis.game?.messages?.contents ?? globalThis.game?.messages ?? [],
            rollRequests: dieRollRequestManager.getVisibleRequests({ userId, isGM }),
            users: workspaceUsers,
            limit: 20
        });
    }

    render(panel, context) {
        if (panel?.id === "die-roll-request") {
            return renderDieRollRequestPanel(context.dieRollRequestPanel ?? {}, {
                escapeHTML: (value) => String(value ?? "")
            });
        }
        return undefined;
    }

    renderRollRequests(dieRollRequestPanelModel) {
        return renderDieRollRequestPanel(dieRollRequestPanelModel, {
            escapeHTML: (value) => String(value ?? "")
        });
    }

    hasOutstandingRequests() {
        return dieRollRequestManager.hasOutstandingRequests();
    }

    getVisibleRequests({ userId, isGM }) {
        return dieRollRequestManager.getVisibleRequests({ userId, isGM });
    }

    bind(rootElement) {
        this._rootElement = rootElement;

        // Roll Lock Guard click listener
        this._rollLockHandler = (event) => {
            if (!dieRollRequestManager.hasOutstandingRequests()) return;
            const target = event.target?.closest?.("[data-action]");
            const action = String(target?.dataset?.action ?? "");
            if (!ROLL_LOCKED_ACTIONS.has(action)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            globalThis.ui?.notifications?.warn?.("Resolve or cancel outstanding roll requests before changing combat, scenes, or actors.");
        };
        rootElement?.addEventListener("click", this._rollLockHandler, { capture: true });

        // GM request creation submission
        rootElement?.querySelectorAll("[data-action='die-roll-request-create']")?.forEach((form) => {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                event.stopPropagation();

                const data = new FormData(form);
                const recipientId = String(data.get("recipientId") ?? "").trim();
                if (!recipientId) {
                    globalThis.ui?.notifications?.warn?.("Choose a player before requesting a roll.");
                    return;
                }

                const label = String(data.get("label") ?? "Requested Roll").trim() || "Requested Roll";
                const rollMode = String(data.get("rollMode") ?? "normal");
                const modifier = Number(data.get("modifier") ?? 0) || 0;
                dieRollRequestManager.sendRequest({
                    initiatorId: globalThis.game?.user?.id ?? "",
                    requestor: {
                        id: globalThis.game?.user?.id ?? "",
                        name: globalThis.game?.user?.name ?? "GM",
                        type: "gm"
                    },
                    recipientIds: [recipientId],
                    rollType: String(data.get("rollType") ?? "custom"),
                    rollSubType: label,
                    label,
                    dice: rollMode === "advantage"
                        ? [{ count: 2, faces: 20, keep: "highest" }]
                        : rollMode === "disadvantage"
                            ? [{ count: 2, faces: 20, keep: "lowest" }]
                            : [{ count: 1, faces: 20 }],
                    modifiers: modifier ? [{ label: "Requested modifier", value: modifier, source: "gm" }] : []
                });
            });
        });

        // Player/GM modifier adjustment
        rootElement?.querySelectorAll("[data-action='die-roll-adjust']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.adjustModifier(
                    button.dataset.requestId,
                    globalThis.game?.user?.id,
                    Number(button.dataset.delta ?? 0) || 0
                );
            });
        });

        // Player roll execution
        rootElement?.querySelectorAll("[data-action='die-roll-request-roll']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.rollRequestForRecipient(button.dataset.requestId, globalThis.game?.user?.id);
            });
        });

        // GM/Player cancel request
        rootElement?.querySelectorAll("[data-action='die-roll-request-cancel']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.sendCancel(button.dataset.requestId, { cancelledBy: globalThis.game?.user?.id ?? "" });
            });
        });
    }

    dispose() {
        this._unsubscribe?.();
        if (this._rollLockHandler && this._rootElement) {
            this._rootElement.removeEventListener("click", this._rollLockHandler, { capture: true });
        }
    }
}
