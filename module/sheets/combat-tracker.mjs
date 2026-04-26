function readSelectedAction(selectElement) {
    const selectedOption = selectElement?.selectedOptions?.[0];
    if (!selectedOption) return null;

    return {
        id: selectedOption.dataset.id,
        actionId: selectedOption.dataset.actionId,
        type: selectedOption.dataset.type,
        label: selectedOption.dataset.label,
        apCost: Number(selectedOption.dataset.apCost || 1),
        requiresToHit: selectedOption.dataset.requiresToHit === "true",
        toHitBonus: Number(selectedOption.dataset.toHitBonus || 0),
        movementFeet: Number(selectedOption.dataset.movementFeet || 0),
        itemId: selectedOption.dataset.itemId || null
    };
}

export class TurnOfTheCenturyCombatTracker extends CombatTracker {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "systems/turn-of-the-century/templates/combat/combat-tracker.hbs"
        });
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        const combat = this.viewed ?? game.combat;

        if (!combat) {
            context.totcEncounter = null;
            return context;
        }

        const encounterState = combat.encounterState ?? {};
        const phase = combat.phase ?? encounterState.phase ?? "planning";
        const planningElapsedSeconds = combat.planningElapsedSeconds ?? 0;
        const planningWarningSeconds = combat.planningWarningSeconds ?? 45;

        const turns = (context.turns ?? []).map((turn) => {
            const combatantId = turn.id;
            const combatantState = combat.getCombatantState?.(combatantId) ?? null;
            const availableActions = combat.getAvailableActionsForCombatant?.(combatantId) ?? [];
            const targetOptions = combat.getTargetOptionsForCombatant?.(combatantId) ?? [];
            const queue = combat.getCombatantPlan?.(combatantId) ?? [];

            return {
                ...turn,
                canPlan: Boolean(game.user?.isGM || turn.owner),
                encounter: {
                    ready: Boolean(combatantState?.ready),
                    spentAp: Number(combatantState?.spentAp ?? 0),
                    remainingAp: Number(combat.getCombatantRemainingAp?.(combatantId) ?? combat.apBudget ?? 0),
                    queue,
                    availableActions,
                    targetOptions
                }
            };
        });

        context.turns = turns;
        context.totcEncounter = {
            active: Boolean(encounterState && Object.keys(encounterState).length),
            phase,
            apBudget: combat.apBudget ?? 6,
            planningElapsedSeconds,
            planningWarningSeconds,
            planningWarningActive: Boolean(combat.isPlanningWarningActive),
            controlsVisible: Boolean(game.user?.isGM)
        };

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find("[data-action='totc-init-round']").on("click", async (event) => {
            event.preventDefault();
            if (!game.combat?.initializeEncounterRound) return;
            await game.combat.initializeEncounterRound();
            this.render();
        });

        html.find("[data-action='totc-resolve-round']").on("click", async (event) => {
            event.preventDefault();
            if (!game.combat?.resolveEncounterRound) return;
            await game.combat.resolveEncounterRound();
            this.render();
        });

        html.find("[data-action='totc-toggle-ready']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            if (!combatantId || !game.combat?.setCombatantReady) return;

            const currentReady = event.currentTarget.dataset.ready === "true";
            await game.combat.setCombatantReady(combatantId, !currentReady);
            this.render();
        });

        html.find("[data-action='totc-add-action']").on("click", async (event) => {
            event.preventDefault();

            const combatantId = event.currentTarget.dataset.combatantId;
            if (!combatantId || !game.combat?.addCombatantAction) return;

            const row = event.currentTarget.closest(".totc-encounter-row");
            const actionSelect = row?.querySelector(".totc-encounter-action-select");
            const targetSelect = row?.querySelector(".totc-encounter-target-select");
            const selectedAction = readSelectedAction(actionSelect);
            if (!selectedAction) return;

            selectedAction.targetId = targetSelect?.value || null;
            await game.combat.addCombatantAction(combatantId, selectedAction);
            this.render();
        });

        html.find("[data-action='totc-remove-action']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const actionIndex = Number(event.currentTarget.dataset.actionIndex);
            if (!combatantId || Number.isNaN(actionIndex) || !game.combat?.removeCombatantAction) return;

            await game.combat.removeCombatantAction(combatantId, actionIndex);
            this.render();
        });

        html.find("[data-action='totc-clear-plan']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            if (!combatantId || !game.combat?.clearCombatantPlan) return;

            await game.combat.clearCombatantPlan(combatantId);
            this.render();
        });
    }
}
