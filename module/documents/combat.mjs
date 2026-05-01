import {
    TOTC_BASE_ACTION_POINT_BUDGET,
    TOTC_ENCOUNTER_PHASES,
    getActionPointBudget,
    getBaseActionCatalog,
    getMovementFeetPerAp,
    getPlanningLimitSeconds,
    getPlanningWarningSeconds
} from "../encounters/action-catalog.mjs";

function sortByInitiativeDescending(combatants = []) {
    return [...combatants].sort((left, right) => Number(right.initiative ?? 0) - Number(left.initiative ?? 0));
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

function getWhisperRecipientsForGm() {
    return ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
}

function createNarrationMessage(round, tick, line) {
    const replayStyle = game.settings?.get("turn-of-the-century", "encounterReplayNarrationStyle") ?? "detailed";
    if (replayStyle === "concise") {
        return `AP ${tick}: ${line}`;
    }

    return `Round ${round}, AP ${tick}: ${line}`;
}

function formatDamageText(amount) {
    return `${Math.max(0, Number(amount) || 0)} damage`;
}

function getCombatantFromId(combat, combatantId) {
    return combat.combatants?.get(combatantId) ?? null;
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function hasInitiativeValue(value) {
    const number = Number(value);
    return Number.isFinite(number);
}

function clampActionData(action, index = 0) {
    const apMin = clampActionCost(action.apMin ?? action.apCost ?? 1);
    const apMax = Math.max(apMin, clampActionCost(action.apMax ?? action.apCost ?? apMin));
    const apCost = Math.max(apMin, Math.min(apMax, clampActionCost(action.apCost ?? apMin)));

    return {
        id: action.id || action.actionId || `action-${index + 1}`,
        actionId: action.actionId || action.id || null,
        type: String(action.type || "custom"),
        label: String(action.label || action.type || `Action ${index + 1}`),
        apCost,
        apMin,
        apMax,
        variableAp: Boolean(action.variableAp && apMax > apMin),
        itemId: action.itemId || null,
        targetId: action.targetId || null,
        requiresToHit: Boolean(action.requiresToHit || action.type === "attack"),
        toHitBonus: Number(action.toHitBonus || 0),
        movementFeet: Number(action.movementFeet || 0),
        movementFeetPerAp: Number(action.movementFeetPerAp || 0)
    };
}

export class TurnOfTheCenturyCombat extends Combat {
    get encounterState() {
        return this.getFlag("turn-of-the-century", "encounter") ?? {};
    }

    get phase() {
        return this.encounterState.phase ?? "planning";
    }

    get actionCatalog() {
        return this.encounterState.actionCatalog ?? getBaseActionCatalog();
    }

    get apBudget() {
        return Number(this.encounterState.apBudget ?? getActionPointBudget() ?? TOTC_BASE_ACTION_POINT_BUDGET);
    }

    get planningWarningSeconds() {
        return Number(getPlanningWarningSeconds() || 45);
    }

    get planningLimitSeconds() {
        return Number(getPlanningLimitSeconds() || 60);
    }

    get planningStartedAt() {
        return Number(this.encounterState.planningStartedAt ?? 0);
    }

    get planningElapsedSeconds() {
        if (!this.planningStartedAt) return 0;
        return Math.max(0, Math.floor((Date.now() - this.planningStartedAt) / 1000));
    }

    get planningRemainingSeconds() {
        return Math.max(0, this.planningLimitSeconds - this.planningElapsedSeconds);
    }

    get isPlanningExpired() {
        return this.phase === "planning" && this.planningRemainingSeconds <= 0;
    }

    get isPlanningWarningActive() {
        return this.phase === "planning" && this.planningElapsedSeconds >= this.planningWarningSeconds;
    }

    getCombatantState(combatantId) {
        return this.encounterState.perCombatant?.[combatantId] ?? null;
    }

    getCombatantPlan(combatantId) {
        return toArray(this.getCombatantState(combatantId)?.plan);
    }

    getCombatantSpentAp(combatantId) {
        return Number(this.getCombatantState(combatantId)?.spentAp ?? 0);
    }

    getCombatantRemainingAp(combatantId) {
        return Math.max(0, this.apBudget - this.getCombatantPlan(combatantId).reduce((sum, action) => sum + Number(action.apCost || 0), 0));
    }

    getMissingInitiativeCombatants() {
        return (this.combatants?.contents ?? []).filter((combatant) => !hasInitiativeValue(combatant.initiative));
    }

    get hasInitiativeGateActive() {
        return this.getMissingInitiativeCombatants().length > 0;
    }

    canCurrentUserRollInitiative(combatantId) {
        if (game.user?.isGM) return true;
        const combatant = getCombatantFromId(this, combatantId);
        return Boolean(combatant?.actor?.isOwner);
    }

    #isCombatantOwnedByCurrentUser(combatantId) {
        if (game.user?.isGM) return true;

        const combatant = getCombatantFromId(this, combatantId);
        return Boolean(combatant?.actor?.isOwner);
    }

    #requireGm(action) {
        if (game.user?.isGM) return;
        throw new Error(`Only the GM can ${action}.`);
    }

    #requireInitiativeReady() {
        if (!this.hasInitiativeGateActive) return;
        throw new Error("All encounter participants must roll initiative before planning can begin.");
    }

    #requirePlanningOpen(combatantId) {
        if (this.phase !== "planning") {
            throw new Error("Encounter planning is not currently open.");
        }

        const state = this.getCombatantState(combatantId);
        if (!state) throw new Error(`Combatant ${combatantId} is not part of this encounter.`);
        if (state.ready) {
            throw new Error("Action plan is already committed for this round.");
        }
    }

    async maybeAutoFinalizePlanning() {
        if (this.hasInitiativeGateActive) return false;
        if (this.phase !== "planning") return false;

        const combatants = this.combatants?.contents ?? [];
        if (!combatants.length) return false;

        const allCommitted = combatants.every((combatant) => Boolean(this.getCombatantState(combatant.id)?.ready));
        const expired = this.isPlanningExpired;
        if (!allCommitted && !expired) return false;
        if (!game.user?.isGM) return false;

        await this.resolveEncounterRound();
        return true;
    }

    async setCombatantReady(combatantId, ready) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to commit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.encounterState;
        const perCombatant = foundry.utils.deepClone(state.perCombatant ?? {});
        if (!perCombatant[combatantId]) throw new Error(`Combatant ${combatantId} is not part of this encounter.`);

        perCombatant[combatantId].ready = Boolean(ready);
        perCombatant[combatantId].committedAt = ready ? Date.now() : 0;

        await this.setFlag("turn-of-the-century", "encounter", {
            ...state,
            perCombatant
        });

        await this.maybeAutoFinalizePlanning();
    }

    async addCombatantAction(combatantId, action) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.getCombatantPlan(combatantId);
        await this.setCombatantPlan(combatantId, [...plan, action]);
    }

    async removeCombatantAction(combatantId, index) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.getCombatantPlan(combatantId);
        const next = plan.filter((_, currentIndex) => currentIndex !== Number(index));
        await this.setCombatantPlan(combatantId, next);
    }

    async clearCombatantPlan(combatantId) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        await this.setCombatantPlan(combatantId, []);
    }

    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const index = Number(actionIndex);
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(`Invalid action index: ${actionIndex}`);
        }

        const plan = this.getCombatantPlan(combatantId).map((action, currentIndex) => {
            if (currentIndex !== index) return action;

            const min = clampActionCost(action.apMin ?? action.apCost ?? 1);
            const max = Math.max(min, clampActionCost(action.apMax ?? action.apCost ?? min));
            const nextCost = Math.max(min, Math.min(max, clampActionCost(apCost)));
            const movementFeetPerAp = Number(action.movementFeetPerAp || getMovementFeetPerAp() || 10);

            return {
                ...action,
                apCost: nextCost,
                movementFeet: action.type === "movement" ? movementFeetPerAp * nextCost : Number(action.movementFeet || 0)
            };
        });

        await this.setCombatantPlan(combatantId, plan);
    }

    getAvailableActionsForCombatant(combatantId) {
        const combatant = getCombatantFromId(this, combatantId);
        if (!combatant?.actor) return [];

        const catalog = this.actionCatalog;
        const movementTemplate = catalog.move ?? catalog.move10ft;
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);
        const movementAction = movementTemplate
            ? [{
                id: movementTemplate.id,
                actionId: movementTemplate.id,
                type: movementTemplate.type,
                label: game.i18n.localize("TOTC.Encounter.Action.Move"),
                apCost: Number(movementTemplate.apCost ?? 1),
                apMin: Number(movementTemplate.apMin ?? 1),
                apMax: Number(movementTemplate.apMax ?? this.apBudget),
                variableAp: Boolean(movementTemplate.variableAp),
                movementFeet: Number((movementTemplate.apCost ?? 1) * movementFeetPerAp),
                movementFeetPerAp,
                requiresToHit: false,
                toHitBonus: 0,
                itemId: null
            }]
            : [];

        const defendAction = catalog.defend
            ? [{
                id: catalog.defend.id,
                actionId: catalog.defend.id,
                type: catalog.defend.type,
                label: game.i18n.localize("TOTC.Encounter.Action.Defend"),
                apCost: Number(catalog.defend.apCost ?? 1),
                apMin: Number(catalog.defend.apMin ?? 1),
                apMax: Number(catalog.defend.apMax ?? this.apBudget),
                variableAp: Boolean(catalog.defend.variableAp),
                requiresToHit: false,
                toHitBonus: 0,
                itemId: null
            }]
            : [];

        const itemActions = combatant.actor.items.contents.flatMap((item) => {
            const variants = item.actionVariants ?? [];
            return variants.map((variant) => ({
                id: `${item.id}:${variant.id}`,
                actionId: variant.id,
                type: variant.type,
                label: `${item.name}: ${variant.label}`,
                apCost: item.type === "consumable" ? this.#getConsumableApCost(combatant.actor, item, variant) : Number(variant.apCost ?? 1),
                apMin: Number(variant.apCost ?? 1),
                apMax: Number(variant.apCost ?? 1),
                variableAp: false,
                requiresToHit: Boolean(variant.requiresToHit),
                toHitBonus: Number(variant.toHitBonus ?? 0),
                itemId: item.id
            }));
        });

        return [...movementAction, ...defendAction, ...itemActions];
    }

    #getConsumableApCost(actor, item, variant) {
        const beltIds = toArray(actor.system?.inventory?.equipment?.belt?.itemIds);
        if (beltIds.includes(item.id)) return 1;

        const packIds = toArray(actor.system?.inventory?.pack?.itemIds);
        if (packIds.includes(item.id)) return 3;

        return Number(variant.apCost ?? 1);
    }

    getTargetOptionsForCombatant(combatantId) {
        return (this.combatants?.contents ?? [])
            .filter((combatant) => combatant.id !== combatantId)
            .map((combatant) => ({
                id: combatant.id,
                name: combatant.name
            }));
    }

    async initializeEncounterRound({ phase = "planning" } = {}) {
        this.#requireGm("initialize encounter rounds");

        if (!TOTC_ENCOUNTER_PHASES.includes(phase)) phase = "planning";

        const perCombatant = Object.fromEntries(
            (this.combatants?.contents ?? []).map((combatant) => [
                combatant.id,
                {
                    spentAp: 0,
                    remainingAp: this.apBudget,
                    plan: [],
                    pointer: 0,
                    progress: 0,
                    ready: false
                }
            ])
        );

        await this.setFlag("turn-of-the-century", "encounter", {
            phase,
            apBudget: this.apBudget,
            actionCatalog: this.actionCatalog,
            perCombatant,
            timeline: [],
            planningStartedAt: Date.now(),
            round: this.round || 1
        });
    }

    async rollEncounterInitiative(combatantId) {
        if (!combatantId) throw new Error("Missing combatant ID for initiative roll.");
        if (!this.canCurrentUserRollInitiative(combatantId)) {
            throw new Error("You do not have permission to roll initiative for this combatant.");
        }

        await this.rollInitiative([combatantId]);
        return getCombatantFromId(this, combatantId);
    }

    async rollAllMissingInitiatives() {
        this.#requireGm("roll initiative for all participants");
        const ids = this.getMissingInitiativeCombatants().map((combatant) => combatant.id);
        if (!ids.length) return [];
        await this.rollInitiative(ids);
        return ids;
    }

    async setCombatantPlan(combatantId, actions = []) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.encounterState;
        const perCombatant = foundry.utils.deepClone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) throw new Error(`Combatant ${combatantId} is not part of the encounter state.`);

        const normalized = toArray(actions).map((action, index) => clampActionData(action, index));

        const totalCost = normalized.reduce((sum, action) => sum + action.apCost, 0);
        if (totalCost > this.apBudget) {
            throw new Error(`Action plan exceeds AP budget (${totalCost}/${this.apBudget}).`);
        }

        perCombatant[combatantId] = {
            ...combatantState,
            spentAp: 0,
            remainingAp: Math.max(0, this.apBudget - totalCost),
            plan: normalized,
            pointer: 0,
            progress: 0,
            ready: false,
            committedAt: 0
        };

        await this.setFlag("turn-of-the-century", "encounter", {
            ...state,
            phase: "planning",
            perCombatant
        });
    }

    async setEncounterPhase(phase) {
        this.#requireGm("change encounter phases");

        if (!TOTC_ENCOUNTER_PHASES.includes(phase)) throw new Error(`Unsupported encounter phase: ${phase}`);
        await this.setFlag("turn-of-the-century", "encounter", {
            ...this.encounterState,
            phase
        });
    }

    async resolveEncounterRound() {
        this.#requireGm("resolve encounter rounds");
        this.#requireInitiativeReady();

        const initialState = this.encounterState;
        const perCombatant = foundry.utils.deepClone(initialState.perCombatant ?? {});
        const timeline = [];

        await this.setEncounterPhase("locked");
        await this.setEncounterPhase("resolving");

        const orderedCombatants = sortByInitiativeDescending(this.combatants?.contents ?? []);
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);
        for (let tick = 1; tick <= this.apBudget; tick += 1) {
            for (const combatant of orderedCombatants) {
                const state = perCombatant[combatant.id];
                if (!state || state.remainingAp <= 0) continue;

                const action = state.plan?.[state.pointer];
                if (!action) {
                    state.remainingAp = Math.max(0, state.remainingAp - 1);
                    state.spentAp += 1;
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action: null,
                        outcome: {
                            result: "forfeit",
                            detail: `${combatant.name} forfeits 1 AP with no planned action.`
                        }
                    });
                    continue;
                }

                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                state.progress += 1;

                if (action.type === "movement") {
                    const stepFeet = Number(action.movementFeetPerAp || movementFeetPerAp || 10);
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "movementStep",
                            detail: `${combatant.name} moves ${stepFeet} ft.`
                        }
                    });
                } else if (state.progress < action.apCost) {
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "progress",
                            detail: `${combatant.name} continues ${action.label} (${state.progress}/${action.apCost} AP).`
                        }
                    });
                }

                if (state.progress < action.apCost) continue;

                if (action.type !== "movement") {
                    const outcome = await this.#resolveAction(combatant, action);
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome
                    });
                }

                state.pointer += 1;
                state.progress = 0;
            }
        }

        await this.setFlag("turn-of-the-century", "encounter", {
            ...this.encounterState,
            phase: "roundComplete",
            timeline,
            planningStartedAt: 0,
            perCombatant
        });

        await this.#publishRoundReplay(timeline);
        return timeline;
    }

    async #resolveAction(combatant, action) {
        const actor = combatant.actor;
        const item = action.itemId ? actor?.items?.get(action.itemId) : null;

        if (item) {
            const useResult = await item.executeEncounterAction?.({
                actor,
                actionId: action.actionId,
                consume: true
            });

            if (useResult && !useResult.success) {
                return {
                    result: "failed",
                    detail: `${combatant.name} cannot complete ${action.label} (${useResult.reason}).`
                };
            }
        }

        if (action.type === "movement") {
            return {
                result: "moved",
                detail: `${combatant.name} advances ${toNumber(action.movementFeet, 10)} ft.`
            };
        }

        if (action.type === "defense") {
            return {
                result: "defended",
                detail: `${combatant.name} braces defensively for ${Math.max(1, toNumber(action.apCost, 1))} AP.`
            };
        }

        if (!action.requiresToHit && action.type !== "attack") {
            return {
                result: "resolved",
                detail: `${combatant.name} completes ${action.label}.`
            };
        }

        const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
        const weaponData = item?.system ?? {};
        const attackAbilityBonus = this.#getAttackAbilityBonus(actor, item);
        const toHitFlatBonus = Number(action.toHitBonus || 0);

        const roll = await (new Roll("1d20")).roll({ async: true });
        const natural = Number(roll.total ?? 0);

        const targetForFumble = this.#selectCriticalFailureTarget(combatant.id, action.targetId);

        const targetArmorClass = toNumber(targetCombatant?.actor?.system?.defenses?.armorClass, 10);
        const toHitTotal = natural + attackAbilityBonus + toHitFlatBonus;
        const hits = natural === 20 || (natural !== 1 && toHitTotal >= targetArmorClass);

        const damageRoll = await this.#rollDamageForAction({ actor, item, action, weaponData });
        const baseDamage = Math.max(0, toNumber(damageRoll.total, 0));

        if (natural === 20) {
            const appliedDamage = baseDamage * 2;
            await this.#applyDamageToCombatant(targetCombatant, appliedDamage);

            return {
                result: "criticalHit",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                targetCombatantId: targetCombatant?.id ?? null,
                targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.Target.Unspecified"),
                detail: `${combatant.name} critically hits ${targetCombatant?.name ?? "the target"} with ${action.label} for ${formatDamageText(appliedDamage)}.`
            };
        }

        if (natural === 1) {
            const redirectedTarget = targetForFumble;
            const appliedDamage = baseDamage * 2;
            await this.#applyDamageToCombatant(redirectedTarget, appliedDamage);

            return {
                result: "criticalFailure",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                redirectedTargetId: redirectedTarget?.id ?? null,
                redirectedTargetName: redirectedTarget?.name ?? null,
                detail: `${combatant.name} critically fumbles ${action.label}, dealing ${formatDamageText(appliedDamage)} to ${redirectedTarget?.name ?? "an unintended target"}.`
            };
        }

        if (hits) {
            await this.#applyDamageToCombatant(targetCombatant, baseDamage);
        }

        return {
            result: hits ? "hit" : "miss",
            roll: natural,
            total: toHitTotal,
            targetArmorClass,
            damage: hits ? baseDamage : 0,
            targetCombatantId: targetCombatant?.id ?? null,
            targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.Target.Unspecified"),
            detail: hits
                ? `${combatant.name} hits ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}) for ${formatDamageText(baseDamage)}.`
                : `${combatant.name} misses ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}, total ${toHitTotal}).`
        };
    }

    #resolveDeclaredTarget(sourceCombatantId, targetCombatantId) {
        if (targetCombatantId) {
            return this.combatants?.get(targetCombatantId) ?? null;
        }

        const candidates = (this.combatants?.contents ?? []).filter((combatant) => combatant.id !== sourceCombatantId);
        return candidates[0] ?? null;
    }

    #getAttackAbilityBonus(actor, item) {
        const classification = String(item?.system?.classification ?? "");
        const dexClassifications = new Set(["simpleRanged", "martialRanged", "firearm", "explosive", "thrown"]);
        const abilityKey = dexClassifications.has(classification) ? "dex" : "str";
        return toNumber(actor?.system?.abilities?.[abilityKey]?.bonus, 0);
    }

    async #rollDamageForAction({ actor, item, action, weaponData }) {
        const formula = String(weaponData?.damage?.formula || "1").trim() || "1";
        const bonus = toNumber(weaponData?.damage?.bonus, 0);
        const compiled = bonus ? `${formula} + ${bonus}` : formula;

        const rollData = {
            actor: actor?.getRollData?.() ?? actor?.system ?? {},
            item: item?.getRollData?.() ?? item?.system ?? {},
            action
        };

        return (new Roll(compiled, rollData)).roll({ async: true });
    }

    async #applyDamageToCombatant(combatant, amount) {
        if (!combatant?.actor) return;
        const actor = combatant.actor;
        const current = toNumber(actor.system?.resources?.health?.value, 0);
        const next = Math.max(0, current - Math.max(0, toNumber(amount, 0)));
        await actor.update({ "system.resources.health.value": next });
    }

    #selectCriticalFailureTarget(sourceCombatantId, intendedTargetId) {
        const candidates = (this.combatants?.contents ?? []).filter((candidate) => {
            if (!candidate?.id) return false;
            if (candidate.id === intendedTargetId) return false;
            return true;
        });

        if (!candidates.length) {
            return this.combatants?.get(sourceCombatantId) ?? null;
        }

        return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    }

    async #publishRoundReplay(timeline) {
        if (!timeline.length) return;

        const round = this.round || this.encounterState.round || 1;
        const gmLines = timeline.map((entry) => createNarrationMessage(round, entry.tick, entry.outcome.detail));
        const summaryText = game.i18n.format("TOTC.Encounter.RoundSummary", {
            round,
            actionCount: timeline.length
        });

        await ChatMessage.create({
            content: summaryText,
            flags: {
                "turn-of-the-century": {
                    type: "encounter-round-summary",
                    round,
                    timeline
                }
            }
        });

        await ChatMessage.create({
            content: gmLines.map((line) => `<p class="totc-encounter-replay-line">${line}</p>`).join(""),
            whisper: getWhisperRecipientsForGm(),
            flags: {
                "turn-of-the-century": {
                    type: "encounter-round-narration",
                    gmOnly: true,
                    round,
                    timeline
                }
            }
        });
    }
}
