import {
    TOTC_BASE_ACTION_POINT_BUDGET,
    TOTC_ENCOUNTER_PHASES,
    getActionPointBudget,
    getBaseActionCatalog,
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

function clampActionData(action, index = 0) {
    return {
        id: action.id || action.actionId || `action-${index + 1}`,
        actionId: action.actionId || action.id || null,
        type: String(action.type || "custom"),
        label: String(action.label || action.type || `Action ${index + 1}`),
        apCost: clampActionCost(action.apCost ?? 1),
        itemId: action.itemId || null,
        targetId: action.targetId || null,
        requiresToHit: Boolean(action.requiresToHit || action.type === "attack"),
        toHitBonus: Number(action.toHitBonus || 0),
        movementFeet: Number(action.movementFeet || 0)
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

    get planningStartedAt() {
        return Number(this.encounterState.planningStartedAt ?? 0);
    }

    get planningElapsedSeconds() {
        if (!this.planningStartedAt) return 0;
        return Math.max(0, Math.floor((Date.now() - this.planningStartedAt) / 1000));
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

    async setCombatantReady(combatantId, ready) {
        const state = this.encounterState;
        const perCombatant = foundry.utils.deepClone(state.perCombatant ?? {});
        if (!perCombatant[combatantId]) throw new Error(`Combatant ${combatantId} is not part of this encounter.`);

        perCombatant[combatantId].ready = Boolean(ready);

        await this.setFlag("turn-of-the-century", "encounter", {
            ...state,
            perCombatant
        });
    }

    async addCombatantAction(combatantId, action) {
        const plan = this.getCombatantPlan(combatantId);
        await this.setCombatantPlan(combatantId, [...plan, action]);
    }

    async removeCombatantAction(combatantId, index) {
        const plan = this.getCombatantPlan(combatantId);
        const next = plan.filter((_, currentIndex) => currentIndex !== Number(index));
        await this.setCombatantPlan(combatantId, next);
    }

    async clearCombatantPlan(combatantId) {
        await this.setCombatantPlan(combatantId, []);
    }

    getAvailableActionsForCombatant(combatantId) {
        const combatant = getCombatantFromId(this, combatantId);
        if (!combatant?.actor) return [];

        const catalog = this.actionCatalog;
        const movementAction = catalog.move10ft
            ? [{
                id: catalog.move10ft.id,
                actionId: catalog.move10ft.id,
                type: catalog.move10ft.type,
                label: game.i18n.localize("TOTC.Encounter.Action.Move10ft"),
                apCost: Number(catalog.move10ft.apCost ?? 1),
                movementFeet: Number(catalog.move10ft.movementFeet ?? 10),
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
                apCost: Number(variant.apCost ?? 1),
                requiresToHit: Boolean(variant.requiresToHit),
                toHitBonus: Number(variant.toHitBonus ?? 0),
                itemId: item.id
            }));
        });

        return [...movementAction, ...itemActions];
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

    async setCombatantPlan(combatantId, actions = []) {
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
            ready: true
        };

        await this.setFlag("turn-of-the-century", "encounter", {
            ...state,
            phase: "planning",
            perCombatant
        });
    }

    async setEncounterPhase(phase) {
        if (!TOTC_ENCOUNTER_PHASES.includes(phase)) throw new Error(`Unsupported encounter phase: ${phase}`);
        await this.setFlag("turn-of-the-century", "encounter", {
            ...this.encounterState,
            phase
        });
    }

    async resolveEncounterRound() {
        const initialState = this.encounterState;
        const perCombatant = foundry.utils.deepClone(initialState.perCombatant ?? {});
        const timeline = [];

        await this.setEncounterPhase("locked");
        await this.setEncounterPhase("resolving");

        const orderedCombatants = sortByInitiativeDescending(this.combatants?.contents ?? []);
        for (let tick = 1; tick <= this.apBudget; tick += 1) {
            for (const combatant of orderedCombatants) {
                const state = perCombatant[combatant.id];
                if (!state || state.remainingAp <= 0) continue;

                const action = state.plan?.[state.pointer];
                if (!action) {
                    state.remainingAp = Math.max(0, state.remainingAp - 1);
                    state.spentAp += 1;
                    continue;
                }

                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                state.progress += 1;

                if (state.progress < action.apCost) continue;

                const outcome = await this.#resolveAction(combatant, action);
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome
                });

                state.pointer += 1;
                state.progress = 0;
            }
        }

        await this.setFlag("turn-of-the-century", "encounter", {
            ...this.encounterState,
            phase: "roundComplete",
            timeline,
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
