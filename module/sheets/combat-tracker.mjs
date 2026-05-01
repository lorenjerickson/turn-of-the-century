function readSelectedAction(selectElement) {
    const selectedOption = selectElement?.selectedOptions?.[0];
    if (!selectedOption) return null;

    return {
        id: selectedOption.dataset.id,
        actionId: selectedOption.dataset.actionId,
        type: selectedOption.dataset.type,
        label: selectedOption.dataset.label,
        apCost: Number(selectedOption.dataset.apCost || 1),
        apMin: Number(selectedOption.dataset.apMin || selectedOption.dataset.apCost || 1),
        apMax: Number(selectedOption.dataset.apMax || selectedOption.dataset.apCost || 1),
        variableAp: selectedOption.dataset.variableAp === "true",
        requiresToHit: selectedOption.dataset.requiresToHit === "true",
        toHitBonus: Number(selectedOption.dataset.toHitBonus || 0),
        movementFeet: Number(selectedOption.dataset.movementFeet || 0),
        movementFeetPerAp: Number(selectedOption.dataset.movementFeetPerAp || 0),
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
        let phase = combat.phase ?? encounterState.phase ?? "planning";
        if (game.user?.isGM && phase === "planning") {
            await combat.maybeAutoFinalizePlanning?.();
            phase = combat.phase ?? combat.encounterState?.phase ?? "planning";
        }
        const planningElapsedSeconds = combat.planningElapsedSeconds ?? 0;
        const planningLimitSeconds = combat.planningLimitSeconds ?? 60;
        const planningRemainingSeconds = combat.planningRemainingSeconds ?? 0;
        const planningWarningSeconds = combat.planningWarningSeconds ?? 45;
        const missingInitiativeCombatants = combat.getMissingInitiativeCombatants?.() ?? [];
        const initiativeReady = missingInitiativeCombatants.length === 0;

        const turns = (context.turns ?? []).map((turn) => {
            const combatantId = turn.id;
            const trackedCombatant = combat.combatants?.get(combatantId);
            const combatantState = combat.getCombatantState?.(combatantId) ?? null;
            const availableActions = combat.getAvailableActionsForCombatant?.(combatantId) ?? [];
            const targetOptions = combat.getTargetOptionsForCombatant?.(combatantId) ?? [];
            const queue = combat.getCombatantPlan?.(combatantId) ?? [];
            const missingInitiative = !Number.isFinite(Number(trackedCombatant?.initiative));

            return {
                ...turn,
                canPlan: Boolean((game.user?.isGM || turn.owner) && initiativeReady && phase === "planning" && !combatantState?.ready),
                encounter: {
                    ready: Boolean(combatantState?.ready),
                    missingInitiative,
                    canRollInitiative: Boolean(combat.canCurrentUserRollInitiative?.(combatantId)),
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
            initiativeReady,
            missingInitiativeCount: missingInitiativeCombatants.length,
            planningElapsedSeconds,
            planningLimitSeconds,
            planningRemainingSeconds,
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
            const combat = this.viewed ?? game.combat;
            if (!combat?.initializeEncounterRound) return;
            await combat.initializeEncounterRound();
            this.render();
        });

        html.find("[data-action='totc-roll-all-initiative']").on("click", async (event) => {
            event.preventDefault();
            const combat = this.viewed ?? game.combat;
            if (!combat?.rollAllMissingInitiatives) return;
            await combat.rollAllMissingInitiatives();
            this.render();
        });

        html.find("[data-action='totc-roll-initiative']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = this.viewed ?? game.combat;
            if (!combatantId || !combat?.rollEncounterInitiative) return;

            await combat.rollEncounterInitiative(combatantId);
            this.render();
        });

        html.find("[data-action='totc-toggle-ready']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = this.viewed ?? game.combat;
            if (!combatantId || !combat?.setCombatantReady) return;

            const currentReady = event.currentTarget.dataset.ready === "true";
            await combat.setCombatantReady(combatantId, !currentReady);
            this.render();
        });

        html.find("[data-action='totc-add-action']").on("click", async (event) => {
            event.preventDefault();

            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = this.viewed ?? game.combat;
            if (!combatantId || !combat?.addCombatantAction) return;

            const row = event.currentTarget.closest(".totc-encounter-row");
            const actionSelect = row?.querySelector(".totc-encounter-action-select");
            const targetSelect = row?.querySelector(".totc-encounter-target-select");
            const selectedAction = readSelectedAction(actionSelect);
            if (!selectedAction) return;

            if (selectedAction.variableAp) {
                const apInput = row?.querySelector(".totc-encounter-ap-input");
                const selectedCost = Number(apInput?.value || selectedAction.apCost || 1);
                const apMin = Math.max(1, Number(selectedAction.apMin || 1));
                const apMax = Math.max(apMin, Number(selectedAction.apMax || apMin));
                selectedAction.apCost = Math.max(apMin, Math.min(apMax, selectedCost));
                if (selectedAction.type === "movement") {
                    const feetPerAp = Number(selectedAction.movementFeetPerAp || 10);
                    selectedAction.movementFeet = feetPerAp * selectedAction.apCost;
                }
            }

            selectedAction.targetId = targetSelect?.value || null;
            await combat.addCombatantAction(combatantId, selectedAction);
            this.render();
        });

        html.find("[data-action='totc-remove-action']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const actionIndex = Number(event.currentTarget.dataset.actionIndex);
            const combat = this.viewed ?? game.combat;
            if (!combatantId || Number.isNaN(actionIndex) || !combat?.removeCombatantAction) return;

            await combat.removeCombatantAction(combatantId, actionIndex);
            this.render();
        });

        html.find("[data-action='totc-clear-plan']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = this.viewed ?? game.combat;
            if (!combatantId || !combat?.clearCombatantPlan) return;

            await combat.clearCombatantPlan(combatantId);
            this.render();
        });

        html.find(".totc-encounter-action-select").on("change", (event) => {
            const select = event.currentTarget;
            const row = select.closest(".totc-encounter-row");
            const apInput = row?.querySelector(".totc-encounter-ap-input");
            const selected = select.selectedOptions?.[0];
            if (!apInput || !selected) return;

            const variableAp = selected.dataset.variableAp === "true";
            const apMin = Number(selected.dataset.apMin || selected.dataset.apCost || 1);
            const apMax = Number(selected.dataset.apMax || selected.dataset.apCost || apMin);
            const apCost = Number(selected.dataset.apCost || apMin || 1);

            apInput.disabled = !variableAp;
            apInput.min = String(Math.max(1, apMin));
            apInput.max = String(Math.max(apMin, apMax));
            apInput.value = String(Math.max(apMin, Math.min(apMax, apCost)));
        });

        html.find(".totc-encounter-action-select").each((_, select) => {
            select.dispatchEvent(new Event("change"));
        });
    }
}
