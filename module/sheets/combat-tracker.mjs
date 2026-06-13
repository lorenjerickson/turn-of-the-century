import {
    requireCombatTrackerV2
} from "../foundry-v14-runtime.mjs";

const BaseCombatTracker = requireCombatTrackerV2();

export class TurnOfTheCenturyCombatTracker extends BaseCombatTracker {
    static get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS ?? {}, {
            template: "systems/turn-of-the-century/templates/combat/combat-tracker.hbs"
        });
    }

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
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
            const missingInitiative = !Number.isFinite(Number(trackedCombatant?.initiative));

            return {
                ...turn,
                encounter: {
                    ready: Boolean(combatantState?.ready),
                    missingInitiative,
                    canRollInitiative: Boolean(combat.canCurrentUserRollInitiative?.(combatantId)),
                    spentAp: Number(combatantState?.spentAp ?? 0),
                    remainingAp: Number(combat.getCombatantRemainingAp?.(combatantId) ?? combat.apBudget ?? 0)
                }
            };
        });

        context.turns = turns;
        context.totcEncounter = {
            active: Boolean(encounterState?.initialized),
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

    async _onRender(context, options) {
        await super._onRender(context, options);

        this.element.querySelectorAll("[data-action='totc-init-round']").forEach((element) => element.addEventListener("click", async (event) => {
            event.preventDefault();
            const combat = this.viewed ?? game.combat;
            if (!combat?.initializeEncounterRound) return;
            await combat.initializeEncounterRound();
            this.render();
        }));

        this.element.querySelectorAll("[data-action='totc-roll-all-initiative']").forEach((element) => element.addEventListener("click", async (event) => {
            event.preventDefault();
            const combat = this.viewed ?? game.combat;
            if (!combat?.rollAllMissingInitiatives) return;
            await combat.rollAllMissingInitiatives();
            this.render();
        }));

        this.element.querySelectorAll("[data-action='totc-roll-initiative']").forEach((element) => element.addEventListener("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = this.viewed ?? game.combat;
            if (!combatantId || !combat?.rollEncounterInitiative) return;

            await combat.rollEncounterInitiative(combatantId);
            this.render();
        }));

    }
}
