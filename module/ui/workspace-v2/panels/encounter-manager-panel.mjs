import { buildEncounterOrderDisplay } from "../../../encounters/encounter-order-model.mjs";
import { orderIdForAction } from "../../../encounters/encounter-order-clauses.mjs";
import { renderDraftPlanNarrative } from "../../../encounters/encounter-draft-narrative.mjs";
import { renderOrderList, renderPlanBar } from "./player-encounter-panel.mjs";

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function combatantContents(combatants) {
    return collectionContents(combatants);
}

function combatantState(state, combatantId) {
    return state?.perCombatant?.[combatantId] ?? {};
}

function actorEffects(actor) {
    return collectionContents(actor?.effects)
        .filter((effect) => !effect?.disabled)
        .map((effect) => String(effect?.name ?? effect?.label ?? "Condition"))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function latestTimelineSlot(timeline = []) {
    return toArray(timeline).reduce((latest, entry) => Math.max(latest, toNumber(entry?.slot ?? entry?.tick, 0)), 0);
}

function latestSlotNarrative(timeline = [], slot = 0) {
    const entries = toArray(timeline).filter((entry) => toNumber(entry?.slot ?? entry?.tick, 0) === slot);
    if (!entries.length) return "";
    return entries
        .map((entry) => String(entry?.outcome?.detail ?? entry?.action?.outcome?.detail ?? ""))
        .filter(Boolean)
        .join(" ");
}

function timelineClauseEntries(timeline = [], combatantId = "", currentTick = 0) {
    const tick = Math.max(0, toNumber(currentTick, 0));
    return toArray(timeline)
        .filter((entry) => String(entry?.combatantId ?? "") === combatantId)
        .filter((entry) => toNumber(entry?.tick ?? entry?.slot, 0) <= tick)
        .filter((entry) => String(entry?.orderId ?? "").trim() && String(entry?.clauseId ?? "").trim());
}

function latestClauseEntry(entries = [], orderId = "", clauseId = "") {
    const matches = entries
        .filter((entry) => String(entry?.orderId ?? "") === orderId && String(entry?.clauseId ?? "") === clauseId)
        .sort((left, right) => toNumber(right?.tick ?? right?.slot, 0) - toNumber(left?.tick ?? left?.slot, 0));
    return matches[0] ?? null;
}

function clauseModel({ clause = {}, orderId = "", action = {}, index = 0, currentTick = 0, timelineEntries = [] } = {}) {
    const clauseId = String(clause?.clauseId ?? `clause-${index + 1}-effect`);
    const timelineEntry = latestClauseEntry(timelineEntries, orderId, clauseId);
    const status = String(timelineEntry?.clauseStatus ?? clause?.clauseStatus ?? "pending");
    const relatedCombatantIds = toArray(timelineEntry?.relatedCombatantIds ?? clause?.relatedCombatantIds);

    return {
        clauseId,
        clauseType: String(timelineEntry?.clauseType ?? clause?.clauseType ?? "effect"),
        text: String(timelineEntry?.clauseText ?? clause?.text ?? clause?.clauseText ?? action?.summary ?? action?.label ?? "Action"),
        status,
        active: status === "active",
        relatedCombatantIds,
        tick: timelineEntry ? toNumber(timelineEntry.tick ?? timelineEntry.slot, currentTick) : null
    };
}

function orderModelsFromPlan({ actions = [], timeline = [], combatantId = "", currentTick = 0 } = {}) {
    const clauseEntries = timelineClauseEntries(timeline, combatantId, currentTick);
    return toArray(actions).map((action, index) => {
        const display = buildEncounterOrderDisplay(action, { index });
        const orderId = orderIdForAction(action, index);
        const clauses = toArray(display.clauses).map((clause) => clauseModel({
            clause,
            orderId,
            action,
            index,
            currentTick,
            timelineEntries: clauseEntries
        }));
        const active = clauses.some((clause) => clause.active);
        const failed = clauses.some((clause) => ["failed", "interrupted"].includes(clause.status));
        const completed = clauses.length > 0 && clauses.every((clause) => clause.status === "completed");

        return {
            orderId,
            summary: String(display.summary ?? action?.label ?? `Action ${index + 1}`),
            active,
            status: active ? "active" : failed ? "failed" : completed ? "completed" : "pending",
            clauses,
            rollResults: toArray(action.planningRollResults).map(rollResultModel)
        };
    });
}

function rollRequirementsForAction(action = {}) {
    const requirements = toArray(action.rollRequirements);
    if (requirements.length) return requirements;
    if (action.requiresToHit || action.type === "attack") {
        return [{ rollType: "attack", rollSubType: "toHit" }];
    }
    return [];
}

function rollRequirementSatisfied(action = {}, requirement = {}) {
    const requiredType = String(requirement?.rollType ?? "").toLowerCase();
    const requiredSubType = String(requirement?.rollSubType ?? "").toLowerCase();
    return toArray(action.planningRollResults).some((result) => {
        const nestedResult = result?.result && typeof result.result === "object" ? result.result : {};
        const resultType = String(result?.rollType ?? nestedResult.rollType ?? "").toLowerCase();
        const resultSubType = String(result?.rollSubType ?? nestedResult.rollSubType ?? "").toLowerCase();
        if (requiredType && resultType !== requiredType) return false;
        if (requiredSubType && resultSubType !== requiredSubType) return false;
        return true;
    });
}

function rollResultModel(result = {}) {
    const nestedResult = result?.result && typeof result.result === "object" ? result.result : {};
    const total = toNumber(nestedResult.total ?? result.total, Number.NaN);
    const formula = String(nestedResult.formula ?? result.formula ?? "").trim();
    const rollType = String(result.rollType ?? nestedResult.rollType ?? "roll").trim() || "roll";
    const rollSubType = String(result.rollSubType ?? nestedResult.rollSubType ?? "").trim();

    return {
        requestId: String(result.requestId ?? nestedResult.requestId ?? ""),
        label: rollSubType || rollType,
        rollType,
        rollSubType,
        formula,
        total: Number.isFinite(total) ? total : null
    };
}

function pendingRollCount(actions = []) {
    return toArray(actions).reduce((sum, action) => {
        const pending = rollRequirementsForAction(action)
            .filter((requirement) => !rollRequirementSatisfied(action, requirement))
            .length;
        return sum + pending;
    }, 0);
}

function lifecycleLabel(lifecycle = "") {
    const normalized = String(lifecycle || "drafting");
    if (normalized === "confirmedAwaitingRolls") return "Awaiting Rolls";
    if (normalized === "locked") return "Locked";
    if (normalized === "resolving") return "Resolving";
    if (normalized === "resolved") return "Resolved";
    return "Draft";
}

function draftSummaryModel({ combatant = null, currentState = {}, apBudget = 6 } = {}) {
    const draftPlan = currentState.draftPlan ?? null;
    if (!draftPlan || !toArray(draftPlan?.clauses).length) return null;
    const narrative = renderDraftPlanNarrative(draftPlan, {
        subjectName: String(combatant?.name ?? combatant?.actor?.name ?? "Combatant"),
        apBudget
    });
    const missingDecisions = toArray(narrative.missingDecisions)
        .map((entry) => String(entry?.decision ?? "").trim())
        .filter(Boolean);
    const lifecycle = String(narrative.lifecycle ?? draftPlan?.lifecycle ?? "drafting");
    const pendingRolls = lifecycle === "confirmedAwaitingRolls"
        ? pendingRollCount(currentState.plan)
        : 0;

    return {
        lifecycle,
        lifecycleLabel: lifecycleLabel(lifecycle),
        text: String(narrative.text ?? ""),
        spentAp: Math.max(0, toNumber(narrative.spentAp, 0)),
        remainingAp: Math.max(0, toNumber(narrative.remainingAp, apBudget)),
        complete: Boolean(narrative.complete),
        overBudget: Boolean(narrative.overBudget),
        missingDecisions,
        pendingRolls,
        hasClauses: toArray(draftPlan?.clauses).length > 0
    };
}

function tickNarrativeFromResolution(resolution = {}, tick = 0) {
    const rows = toArray(resolution?.tickNarratives);
    const match = rows.find((row) => toNumber(row?.tick, 0) === toNumber(tick, 0)) ?? null;
    if (!match) return "";
    const generatedNarrative = String(match.generatedNarrative ?? match.narrative ?? "").trim();
    if (generatedNarrative) return generatedNarrative;
    const summary = String(match.summary ?? "").trim();
    if (summary) return summary;
    return toArray(match.lines).map((line) => String(line ?? "").trim()).filter(Boolean).join(" ");
}

function tickNarrativeRowModel(row = null) {
    if (!row) return {};
    const summary = String(row.summary ?? "").trim()
        || toArray(row.lines).map((line) => String(line ?? "").trim()).filter(Boolean).join(" ");
    return {
        tick: Math.max(0, toNumber(row.tick, 0)),
        summary,
        generatedNarrative: String(row.generatedNarrative ?? row.narrative ?? "").trim(),
        factualOutlineMarkdown: String(row.factualOutlineMarkdown ?? "").trim(),
        links: toArray(row.links).map(narrativeLinkModel),
        gmNotes: toArray(row.gmNotes).map((note) => String(note ?? "").trim()).filter(Boolean),
        generationStatus: String(row.generationStatus ?? "").trim()
    };
}

function narrativeLinkModel(link = {}) {
    const id = String(link.id ?? "").trim();
    const text = String(link.text ?? "").trim();
    return {
        id,
        text,
        type: String(link.type ?? "exchange").trim() || "exchange",
        combatantIds: toArray(link.combatantIds).map((entry) => String(entry ?? "").trim()).filter(Boolean),
        actionId: String(link.actionId ?? "").trim(),
        itemId: String(link.itemId ?? "").trim(),
        timelineEntryIds: toArray(link.timelineEntryIds).map((entry) => String(entry ?? "").trim()).filter(Boolean),
        rollRequestIds: toArray(link.rollRequestIds).map((entry) => String(entry ?? "").trim()).filter(Boolean),
        rollResultIds: toArray(link.rollResultIds).map((entry) => String(entry ?? "").trim()).filter(Boolean),
        clauseIds: toArray(link.clauseIds).map((entry) => String(entry ?? "").trim()).filter(Boolean)
    };
}

function buildRoundNarrativeTicks({ resolution = {}, timeline = [], totalTicks = 6, currentTick = 0 } = {}) {
    const tickCount = Math.max(1, toNumber(totalTicks, 6));
    const activeTick = Math.max(0, toNumber(currentTick, 0));
    const rows = toArray(resolution?.tickNarratives);
    return Array.from({ length: tickCount }, (_, index) => {
        const tick = index + 1;
        const row = tickNarrativeRowModel(rows.find((candidate) => toNumber(candidate?.tick, 0) === tick) ?? null);
        const fallbackSummary = latestSlotNarrative(timeline, tick);
        return {
            tick,
            summary: row.summary || fallbackSummary,
            generatedNarrative: row.generatedNarrative,
            factualOutlineMarkdown: row.factualOutlineMarkdown,
            links: row.links ?? [],
            gmNotes: row.gmNotes ?? [],
            generationStatus: row.generationStatus,
            current: tick === activeTick,
            evaluated: activeTick > 0 && tick <= activeTick
        };
    });
}

function currentTickNarrativeModel(ticks = [], currentTick = 0) {
    const tick = Math.max(1, toNumber(currentTick, 1));
    return toArray(ticks).find((entry) => toNumber(entry?.tick, 0) === tick) ?? {
        tick,
        summary: "",
        generatedNarrative: "",
        factualOutlineMarkdown: "",
        links: [],
        gmNotes: [],
        generationStatus: ""
    };
}

function deterministicRoundLines(ticks = []) {
    const lines = toArray(ticks)
        .filter((tick) => String(tick.generatedNarrative ?? tick.summary ?? "").trim())
        .map((tick) => ({
            tick: Math.max(1, toNumber(tick.tick, 1)),
            narrative: String(tick.generatedNarrative || tick.summary || "").trim(),
            links: toArray(tick.links)
        }));
    if (!lines.length) return null;
    return lines;
}

function latestRoundHistoryEntry(roundHistory = []) {
    return toArray(roundHistory)
        .filter((entry) => Number.isFinite(Number(entry?.round)))
        .sort((left, right) => toNumber(right?.round, 0) - toNumber(left?.round, 0))[0] ?? null;
}

function lastRoundNarrativeModel({ ticks = [], phase = "", roundHistory = [] } = {}) {
    const historyEntry = latestRoundHistoryEntry(roundHistory);
    if (historyEntry) {
        const roundNarrative = historyEntry.roundNarrative ?? {};
        const generatedNarrative = String(roundNarrative.narrative ?? "").trim();
        if (generatedNarrative) {
            return {
                round: toNumber(historyEntry.round, 0),
                status: String(roundNarrative.status ?? "complete"),
                lines: [{
                    narrative: generatedNarrative,
                    links: toArray(roundNarrative.links)
                }],
                text: generatedNarrative,
                gmNotes: toArray(roundNarrative.gmNotes)
            };
        }
        const fallbackLines = deterministicRoundLines(historyEntry.tickNarratives);
        if (fallbackLines) {
            return {
                round: toNumber(historyEntry.round, 0),
                status: String(roundNarrative.status ?? "deterministic"),
                lines: fallbackLines,
                text: fallbackLines.map((line) => line.narrative).join(" "),
                gmNotes: toArray(roundNarrative.gmNotes)
            };
        }
    }

    if (phase !== "roundComplete") return null;
    const lines = deterministicRoundLines(ticks);
    if (!lines) return null;
    return {
        round: 0,
        status: "deterministic",
        lines,
        text: lines.map((line) => line.narrative).join(" ")
    };
}

function linkReferences(link = {}) {
    return new Set([
        link.actionId,
        link.itemId,
        ...toArray(link.combatantIds),
        ...toArray(link.timelineEntryIds),
        ...toArray(link.rollRequestIds),
        ...toArray(link.rollResultIds),
        ...toArray(link.clauseIds)
    ].map((entry) => String(entry ?? "").trim()).filter(Boolean));
}

function linkMatchesOrder(link = {}, actor = {}, order = {}) {
    const references = linkReferences(link);
    if (toArray(link.combatantIds).length && !references.has(actor.id)) return false;
    if (link.actionId && !references.has(order.orderId)) return false;
    if (toArray(order.clauses).some((clause) => references.has(clause.clauseId))) return true;
    if (toArray(order.rollResults).some((roll) => references.has(roll.requestId))) return true;
    return references.has(actor.id) || references.has(order.orderId);
}

function linkDetailRows(link = {}, actors = []) {
    return toArray(actors).flatMap((actor) => toArray(actor.orders)
        .filter((order) => linkMatchesOrder(link, actor, order))
        .map((order) => ({
            actorName: actor.name,
            orderSummary: order.summary,
            status: order.status,
            clauses: toArray(order.clauses)
                .filter((clause) => !toArray(link.clauseIds).length || toArray(link.clauseIds).includes(clause.clauseId))
                .map((clause) => ({
                    text: clause.text,
                    status: clause.status
                })),
            rolls: toArray(order.rollResults)
                .filter((roll) => !toArray(link.rollResultIds).length && !toArray(link.rollRequestIds).length
                    || toArray(link.rollResultIds).includes(roll.requestId)
                    || toArray(link.rollRequestIds).includes(roll.requestId))
                .map((roll) => ({
                    label: roll.label,
                    total: roll.total,
                    formula: roll.formula
                }))
        })));
}

function enrichNarrativeLinks(tick = {}, actors = []) {
    return {
        ...tick,
        links: toArray(tick.links).map((link) => ({
            ...link,
            details: linkDetailRows(link, actors)
        }))
    };
}

function enrichNarrativeTicks(ticks = [], actors = []) {
    return toArray(ticks).map((tick) => enrichNarrativeLinks(tick, actors));
}

function plannedActionModel(action = {}, index = 0) {
    const apMin = Math.max(1, toNumber(action.apMin ?? action.apCost, 1));
    const apMax = Math.max(apMin, toNumber(action.apMax ?? action.apCost ?? apMin, apMin));
    const apCost = Math.max(apMin, Math.min(apMax, toNumber(action.apCost ?? apMin, apMin)));
    const apEnvelope = action.apEnvelope && typeof action.apEnvelope === "object" ? { ...action.apEnvelope } : null;
    const variableAp = Boolean(action.variableAp && apMax > apMin);
    return {
        ...action,
        id: String(action.id ?? action.actionId ?? ""),
        actionId: String(action.actionId ?? action.id ?? ""),
        type: String(action.type ?? "action"),
        label: String(action.label ?? "Action"),
        actionLabel: String(action.actionLabel ?? action.label ?? "Action"),
        actionNarrativeText: String(action.actionNarrativeText ?? ""),
        apCost,
        apMin,
        apMax,
        span: apCost,
        variableAp,
        requiresToHit: Boolean(action.requiresToHit),
        requiresTarget: Boolean(action.requiresTarget),
        requiresDuration: Boolean(action.requiresDuration),
        requiresEngagementAction: Boolean(action.requiresEngagementAction),
        rangeType: String(action.rangeType ?? "melee"),
        toHitBonus: toNumber(action.toHitBonus, 0),
        targetingRangeFeet: toNumber(action.targetingRangeFeet, 0),
        targetMode: String(action.targetMode ?? ""),
        positioningAp: toNumber(action.positioningAp ?? apEnvelope?.positioningAp, 0),
        effectAp: toNumber(action.effectAp ?? apEnvelope?.effectAp, apCost),
        movementFeet: toNumber(action.movementFeet, 0),
        movementFeetPerAp: toNumber(action.movementFeetPerAp, 0),
        movementTargetRow: toNumber(action.movementTargetRow, ""),
        movementTargetCol: toNumber(action.movementTargetCol, ""),
        movementTargetX: toNumber(action.movementTargetX, ""),
        movementTargetY: toNumber(action.movementTargetY, ""),
        movementOriginX: toNumber(action.movementOriginX, ""),
        movementOriginY: toNumber(action.movementOriginY, ""),
        itemId: action.itemId ? String(action.itemId) : "",
        itemName: String(action.itemName ?? ""),
        damageFormula: String(action.damageFormula ?? ""),
        img: String(action.img ?? ""),
        summary: String(action.summary ?? ""),
        clauses: toArray(action.clauses),
        apEnvelope,
        planningLocked: Boolean(action.planningLocked),
        editable: false,
        index,
        apLabel: variableAp ? `${apMin}-${apMax} AP` : `${apCost} AP`
    };
}

function buildCombatantSummary(combatant, state, timeline, apBudget, currentTick = 0) {
    const id = String(combatant?.id ?? "");
    const actor = combatant?.actor ?? null;
    const system = actor?.system ?? {};
    const currentState = combatantState(state, id);
    const orders = orderModelsFromPlan({
        actions: currentState.plan,
        timeline,
        combatantId: id,
        currentTick
    });

    return {
        id,
        combatantId: id,
        name: String(combatant?.name ?? actor?.name ?? "Combatant"),
        img: String(combatant?.img ?? actor?.img ?? ""),
        ready: Boolean(currentState.ready),
        health: {
            value: toNumber(system.resources?.health?.value, 0),
            max: toNumber(system.resources?.health?.max, 0)
        },
        conditions: actorEffects(actor),
        apBudget,
        currentTick,
        canEditPlan: false,
        plannedActions: toArray(currentState.plan).map(plannedActionModel),
        orders,
        canResetRolls: orders.some((order) => toArray(order.rollResults).length > 0) || pendingRollCount(currentState.plan) > 0,
        draftSummary: draftSummaryModel({ combatant, currentState, apBudget })
    };
}

function userModel(users = []) {
    return toArray(users).map((user) => ({
        id: String(user?.id ?? ""),
        name: String(user?.name ?? user?.id ?? "User"),
        isGM: Boolean(user?.isGM)
    })).filter((user) => user.id);
}

function requestFormula(request = {}, recipientId = "") {
    if (typeof request.getFormulaFor === "function") return request.getFormulaFor(recipientId);
    const dice = toArray(request.dice).map((die) => {
        const count = Math.max(1, toNumber(die?.count, 1));
        const faces = Math.max(2, toNumber(die?.faces ?? die?.sides, 20));
        const keep = die?.keep === "highest" ? "kh1" : die?.keep === "lowest" ? "kl1" : "";
        return `${count}d${faces}${keep}`;
    }).join(" + ") || "1d20";
    const modifier = toArray(request.modifiers).reduce((sum, entry) => sum + toNumber(entry?.value ?? entry?.modifier, 0), 0);
    return modifier ? `${dice} ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}` : dice;
}

function rollRequestModel(request = {}, users = []) {
    const recipients = toArray(request.recipientIds).map((recipientId) => {
        const user = users.find((entry) => entry.id === recipientId) ?? null;
        const result = request.results?.[recipientId] ?? null;
        return {
            id: recipientId,
            name: user?.name ?? recipientId,
            isGM: Boolean(user?.isGM),
            pending: !result,
            formula: String(result?.formula ?? requestFormula(request, recipientId)),
            total: Number.isFinite(Number(result?.total)) ? Number(result.total) : null
        };
    });

    return {
        id: String(request.id ?? ""),
        combatId: String(request.combatId ?? ""),
        combatantId: String(request.combatantId ?? ""),
        actionIndex: Number.isInteger(Number(request.actionIndex)) ? Number(request.actionIndex) : null,
        label: String(request.label ?? "Requested Roll"),
        rollType: String(request.rollType ?? "roll"),
        rollSubType: String(request.rollSubType ?? ""),
        status: String(request.status ?? "pending"),
        pending: Boolean(request.isPending ?? recipients.some((recipient) => recipient.pending)),
        gmControlled: recipients.some((recipient) => recipient.isGM),
        hasPendingRecipients: recipients.some((recipient) => recipient.pending),
        recipients
    };
}

function rollRequestQueueModel({ combat = null, rollRequests = [], users = [] } = {}) {
    const combatId = String(combat?.id ?? "");
    const normalizedUsers = userModel(users);
    const requests = toArray(rollRequests)
        .filter((request) => !combatId || String(request?.combatId ?? "") === combatId)
        .map((request) => rollRequestModel(request, normalizedUsers));
    const gmRequests = requests.filter((request) => request.gmControlled && request.pending);
    const pendingRequests = requests.filter((request) => request.pending && request.hasPendingRecipients);
    return {
        requests,
        gmRequests,
        hasRequests: requests.length > 0,
        hasPendingGmRequests: gmRequests.length > 0,
        pendingRequestCount: pendingRequests.length
    };
}

export function buildEncounterManagerPanelModel({ combat = null, rollRequests = [], users = [] } = {}) {
    const state = combat?.encounterState ?? combat?.encounter?.state ?? {};
    const resolution = state?.resolution ?? {};
    const phase = String(combat?.phase ?? state?.phase ?? "planning");
    const initialized = Boolean(state?.initialized);
    const apBudget = Math.max(1, toNumber(state?.apBudget ?? combat?.apBudget, 6));
    const timeline = toArray(state?.timeline);
    const latestSlot = latestTimelineSlot(timeline);
    const currentTick = Math.max(0, Math.min(apBudget, toNumber(resolution?.currentTick ?? state?.currentEvaluationTick ?? state?.evaluationTick, latestSlot || 0)));
    const totalTicks = Math.max(1, toNumber(resolution?.totalTicks, apBudget));
    const progressPercent = Math.max(0, Math.min(100, Math.round((currentTick / totalTicks) * 100)));
    const rawTickNarratives = buildRoundNarrativeTicks({ resolution, timeline, totalTicks, currentTick });
    const tickNarrative = tickNarrativeFromResolution(resolution, currentTick)
        || latestSlotNarrative(timeline, currentTick)
        || latestSlotNarrative(timeline, latestSlot);
    const hasSnapshots = Boolean(combat?.stepEncounterResolution)
        && toArray(resolution?.snapshots).length > 0;
    const isInProgress = phase === "resolving" || phase === "roundComplete";

    const actors = combatantContents(combat?.combatants).map((combatant) => buildCombatantSummary(combatant, state, timeline, apBudget, currentTick));
    const tickNarratives = enrichNarrativeTicks(rawTickNarratives, actors);
    const currentTickNarrative = currentTickNarrativeModel(tickNarratives, currentTick || latestSlot || 1);
    const pendingRequiredRolls = actors.reduce((sum, actor) => sum + pendingRollCount(combatantState(state, actor.id).plan), 0);
    const allActorsReady = actors.length > 0 && actors.every((actor) => Boolean(actor.ready));
    const rollQueue = rollRequestQueueModel({ combat, rollRequests, users });

    return {
        active: Boolean(combat),
        initialized,
        combatId: String(combat?.id ?? ""),
        name: String(combat?.name ?? "Encounter"),
        round: toNumber(state?.round ?? combat?.round, 1),
        phase,
        apBudget,
        currentTick,
        totalTicks,
        progressPercent,
        resolutionStatus: String(resolution?.status ?? "idle"),
        canStartRound: Boolean(combat?.initializeEncounterRound),
        canResolveRound: Boolean(combat?.resolveEncounterRound || combat?.beginEncounterResolution)
            && allActorsReady
            && pendingRequiredRolls === 0
            && rollQueue.pendingRequestCount === 0,
        canSetPhase: Boolean(combat?.setEncounterPhase),
        canStepPrevious: hasSnapshots && isInProgress && currentTick > 0,
        canStepNext: hasSnapshots && phase === "resolving" && currentTick < totalTicks,
        actors,
        pendingRequiredRolls,
        rollQueue,
        lastNarrative: tickNarrative,
        currentTickNarrative,
        lastRoundNarrative: lastRoundNarrativeModel({ ticks: tickNarratives, phase, roundHistory: state.roundHistory }),
        tickNarratives,
        lastEvaluatedTick: latestSlot || null
    };
}

function renderDraftSummary(actor, escapeHTML) {
    const draft = actor.draftSummary ?? null;
    if (!draft) return "";
    const lifecycle = String(draft.lifecycle ?? "drafting");
    const missingText = toArray(draft.missingDecisions).length
        ? `Needs ${toArray(draft.missingDecisions).join(", ")}.`
        : draft.overBudget
            ? "Over AP budget."
            : draft.pendingRolls > 0
                ? `${draft.pendingRolls} roll${draft.pendingRolls === 1 ? "" : "s"} pending.`
                : draft.complete
                    ? "Complete."
                    : "Composition in progress.";

    return `
        <section class="totc-v2-encounter-manager__draft is-${escapeHTML(lifecycle)}" aria-label="${escapeHTML(actor.name)} draft plan">
            <header>
                <span class="totc-v2-encounter-manager__draft-label">Narrative Plan</span>
                <span class="totc-v2-encounter-manager__draft-state is-${escapeHTML(lifecycle)}">${escapeHTML(draft.lifecycleLabel)}</span>
            </header>
            <p>${escapeHTML(draft.text)}</p>
            <footer>
                <span>${escapeHTML(String(draft.spentAp))} AP planned</span>
                <span>${escapeHTML(String(draft.remainingAp))} AP unused</span>
                <strong>${escapeHTML(missingText)}</strong>
            </footer>
        </section>`;
}

function encounterStatusLabel(actor, phase = "") {
    if (phase === "roundComplete") return "Resolved";
    if (actor.draftSummary?.lifecycle === "confirmedAwaitingRolls") return "Awaiting Rolls";
    if (actor.draftSummary?.lifecycle === "locked") return "Ready";
    return actor.ready ? "Ready" : "Planning";
}

function renderActorPlan(actor, phase, escapeHTML) {
    const status = encounterStatusLabel(actor, phase);
    const statusClass = status.toLowerCase().replace(/\s+/g, "-");
    return `
        <article class="totc-v2-encounter-manager__actor-plan">
            <header class="totc-v2-encounter-manager__actor-plan-label">
                <span class="totc-v2-encounter-manager__actor-name">${escapeHTML(actor.name)}</span>
                <span class="totc-v2-encounter-manager__actor-ready is-${escapeHTML(statusClass)}">${escapeHTML(status)}</span>
                <button type="button"
                    data-action="encounter-manager-reset-rolls"
                    data-combatant-id="${escapeHTML(actor.id)}"
                    ${actor.canResetRolls ? "" : "disabled"}>
                    Reset Rolls
                </button>
            </header>
            ${renderDraftSummary(actor, escapeHTML)}
            <div class="totc-v2-encounter-manager__actor-planner">
                ${renderPlanBar(actor, escapeHTML)}
                ${renderOrderList(actor, escapeHTML)}
            </div>
        </article>`;
}

function linkIdsMarkup(link = {}, escapeHTML) {
    const groups = [
        ["Combatants", link.combatantIds],
        ["Timeline", link.timelineEntryIds],
        ["Roll requests", link.rollRequestIds],
        ["Roll results", link.rollResultIds],
        ["Clauses", link.clauseIds]
    ].filter(([, ids]) => toArray(ids).length);
    if (!groups.length && !link.actionId && !link.itemId) return `<p>No linked mechanics were supplied.</p>`;
    return `
        <dl>
            ${link.actionId ? `<div><dt>Action</dt><dd>${escapeHTML(link.actionId)}</dd></div>` : ""}
            ${link.itemId ? `<div><dt>Item</dt><dd>${escapeHTML(link.itemId)}</dd></div>` : ""}
            ${groups.map(([label, ids]) => `
                <div><dt>${escapeHTML(label)}</dt><dd>${toArray(ids).map((id) => escapeHTML(id)).join(", ")}</dd></div>
            `).join("")}
        </dl>`;
}

function linkDetailRowsMarkup(link = {}, escapeHTML) {
    const details = toArray(link.details);
    if (!details.length) return "";
    return `
        <ul class="totc-v2-encounter-manager__narrative-detail-rows">
            ${details.map((detail) => `
                <li>
                    <span>${escapeHTML(detail.actorName)}</span>
                    <strong>${escapeHTML(detail.orderSummary)} · ${escapeHTML(detail.status)}</strong>
                    ${toArray(detail.rolls).length ? `
                        <small>${toArray(detail.rolls).map((roll) => {
                            const total = roll.total === null ? "?" : String(roll.total);
                            const formula = roll.formula ? ` (${roll.formula})` : "";
                            return `${roll.label}: ${total}${formula}`;
                        }).map((entry) => escapeHTML(entry)).join("; ")}</small>
                    ` : ""}
                    ${toArray(detail.clauses).length ? `
                        <small>${toArray(detail.clauses).map((clause) => `${clause.status}: ${clause.text}`).map((entry) => escapeHTML(entry)).join("; ")}</small>
                    ` : ""}
                </li>
            `).join("")}
        </ul>`;
}

function renderNarrativeDetail(link = {}, escapeHTML) {
    return `
        <span class="totc-v2-encounter-manager__narrative-link-wrap">
            <button type="button"
                class="totc-v2-encounter-manager__narrative-link"
                data-action="encounter-manager-narrative-detail"
                data-link-id="${escapeHTML(link.id)}"
                aria-haspopup="dialog">
                ${escapeHTML(link.text)}
            </button>
            <span class="totc-v2-encounter-manager__narrative-detail" role="dialog" aria-label="${escapeHTML(link.text)} details">
                <strong>${escapeHTML(link.type)}</strong>
                ${linkDetailRowsMarkup(link, escapeHTML)}
                ${linkIdsMarkup(link, escapeHTML)}
            </span>
        </span>`;
}

function renderLinkedNarrative(tick = {}, escapeHTML) {
    const narrative = String(tick.generatedNarrative || tick.narrative || tick.summary || "").trim();
    if (!narrative) return "No narration yet.";
    const links = toArray(tick.links).filter((link) => link.id && link.text);
    if (!links.length) return escapeHTML(narrative);

    let rendered = escapeHTML(narrative);
    for (const link of links) {
        const markedText = `[${link.text}]`;
        const escapedMarkedText = escapeHTML(markedText);
        const escapedText = escapeHTML(link.text);
        if (rendered.includes(escapedMarkedText)) {
            rendered = rendered.replace(escapedMarkedText, renderNarrativeDetail(link, escapeHTML));
        } else if (rendered.includes(escapedText)) {
            rendered = rendered.replace(escapedText, renderNarrativeDetail(link, escapeHTML));
        }
    }
    return rendered.replaceAll("[", "").replaceAll("]", "");
}

function renderRoundNarrative(model = {}, escapeHTML) {
    const tick = model.currentTickNarrative
        ?? toArray(model.tickNarratives).find((entry) => entry.current)
        ?? {};
    const tickNumber = Math.max(1, toNumber(tick.tick ?? model.currentTick, 1));
    return `
        <section class="totc-v2-encounter-manager__narrative" aria-label="Current tick narrative">
            <h3>Current Second</h3>
            <article class="totc-v2-encounter-manager__tick-narrative is-current" data-tick="${escapeHTML(String(tickNumber))}">
                <span class="totc-v2-encounter-manager__tick-label">Second ${escapeHTML(String(tickNumber))}</span>
                <p class="totc-v2-encounter-manager__tick-story">${renderLinkedNarrative(tick, escapeHTML)}</p>
            </article>
        </section>`;
}

function renderLastRoundSummary(model = {}, escapeHTML) {
    const summary = model.lastRoundNarrative ?? null;
    if (!summary) return "";
    const status = String(summary.status ?? "").trim();
    return `
        <section class="totc-v2-encounter-manager__last-round" aria-label="Last round summary">
            <h3>Last Round</h3>
            ${status === "pending" ? `<p class="totc-v2-encounter-manager__last-round-status">Generating refined narration...</p>` : ""}
            ${status === "failed" ? `<p class="totc-v2-encounter-manager__last-round-status">Narrative generation failed; showing deterministic summary.</p>` : ""}
            <div class="totc-v2-encounter-manager__last-round-scroll">
                ${toArray(summary.lines).map((line) => `
                    <p>${line.tick ? `<strong>Second ${escapeHTML(String(line.tick))}.</strong> ` : ""}${renderLinkedNarrative(line, escapeHTML)}</p>
                `).join("")}
            </div>
        </section>`;
}

function renderRollRecipient(recipient, escapeHTML) {
    return `
        <li class="${recipient.pending ? "is-pending" : "is-complete"}">
            <span>${escapeHTML(recipient.name)}</span>
            <small>${escapeHTML(recipient.formula)}</small>
            <strong>${recipient.pending ? "Pending" : escapeHTML(String(recipient.total))}</strong>
        </li>`;
}

function renderRollRequestCard(request, escapeHTML, { allowRoll = false } = {}) {
    return `
        <article class="totc-v2-encounter-manager__roll-request ${request.pending ? "is-pending" : "is-complete"}"
            data-request-id="${escapeHTML(request.id)}"
            data-combatant-id="${escapeHTML(request.combatantId)}">
            <header>
                <span>${escapeHTML(request.rollSubType || request.rollType)}</span>
                <h4>${escapeHTML(request.label)}</h4>
                <strong>${escapeHTML(request.status)}</strong>
            </header>
            <ul class="totc-v2-encounter-manager__roll-recipients">
                ${request.recipients.map((recipient) => renderRollRecipient(recipient, escapeHTML)).join("")}
            </ul>
            ${allowRoll && request.pending ? `
                <footer>
                    ${request.recipients.filter((recipient) => recipient.pending).map((recipient) => `
                        <button type="button"
                            data-action="encounter-manager-roll-request"
                            data-request-id="${escapeHTML(request.id)}"
                            data-recipient-id="${escapeHTML(recipient.id)}">
                            Roll ${escapeHTML(recipient.name)}
                        </button>
                    `).join("")}
                </footer>` : ""}
        </article>`;
}

function renderRollQueue(model = {}, escapeHTML) {
    const queue = model.rollQueue ?? {};
    const requests = toArray(queue.requests);
    if (!requests.length && !model.pendingRequiredRolls) return "";
    return `
        <section class="totc-v2-encounter-manager__roll-queue" aria-label="Required encounter rolls">
            <header>
                <h3>Required Rolls</h3>
                <span>${escapeHTML(String(model.pendingRequiredRolls ?? 0))} unresolved</span>
                <button type="button"
                    data-action="encounter-manager-auto-roll-gm"
                    ${queue.hasPendingGmRequests ? "" : "disabled"}>
                    Auto-roll GM
                </button>
            </header>
            ${requests.length
                ? `<div class="totc-v2-encounter-manager__roll-list">
                    ${requests.map((request) => renderRollRequestCard(request, escapeHTML, { allowRoll: request.hasPendingRecipients })).join("")}
                </div>`
                : `<p class="totc-v2-encounter-manager__empty">Confirmed plans still need roll requests.</p>`}
        </section>`;
}

export function renderEncounterManagerPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (!model.active) {
        return `
        <section class="totc-v2-encounter-manager is-empty">
            <div class="totc-v2-encounter-manager__empty">No active encounter.</div>
        </section>`;
    }

    const totalTicks = Math.max(1, toNumber(model.totalTicks ?? model.apBudget, 1));
    const currentTick = Math.max(0, toNumber(model.currentTick, 0));
    const progressPercent = Number.isFinite(Number(model.progressPercent))
        ? Math.max(0, Math.min(100, Math.round(Number(model.progressPercent))))
        : Math.max(0, Math.min(100, Math.round((currentTick / totalTicks) * 100)));

    return `
    <section class="totc-v2-encounter-manager">
        <header class="totc-v2-encounter-manager__header">
            <div>
                <h3>${escapeHTML(model.name)}</h3>
                <p>Round ${escapeHTML(String(model.round))} · ${escapeHTML(model.phase)} · AP ${escapeHTML(String(currentTick))}/${escapeHTML(String(totalTicks))}</p>
            </div>
            <span>${escapeHTML(String(model.actors.length))} actors</span>
        </header>

        <div class="totc-v2-encounter-manager__progress" aria-label="Round resolution progress">
            <span class="totc-v2-encounter-manager__progress-fill" style="width:${escapeHTML(String(progressPercent))}%;"></span>
            <span class="totc-v2-encounter-manager__progress-label">${escapeHTML(String(progressPercent))}% · ${escapeHTML(model.resolutionStatus || "idle")}</span>
        </div>

        <div class="totc-v2-encounter-manager__controls">
            <button type="button" data-action="encounter-manager-start-round" ${model.canStartRound ? "" : "disabled"}>Next Round</button>
            <button type="button" data-action="encounter-manager-set-phase" data-phase="locked" ${model.canSetPhase && model.phase === "planning" ? "" : "disabled"}>Lock Plans</button>
            <button type="button" data-action="encounter-manager-set-phase" data-phase="planning" ${model.canSetPhase && model.phase !== "planning" ? "" : "disabled"}>Reopen Planning</button>
            <button type="button" data-action="encounter-manager-resolve-round" ${model.canResolveRound ? "" : "disabled"}>Evaluate Round</button>
            <button type="button" data-action="encounter-manager-step-tick" data-direction="-1" ${model.canStepPrevious ? "" : "disabled"}>Prev Second</button>
            <button type="button" data-action="encounter-manager-step-tick" data-direction="1" ${model.canStepNext ? "" : "disabled"}>Next Second</button>
        </div>

        ${renderRoundNarrative(model, escapeHTML)}

        ${renderRollQueue(model, escapeHTML)}

        <section class="totc-v2-encounter-manager__actors" style="--totc-ap-budget:${model.apBudget};--totc-current-tick:${model.currentTick};">
            <h3>Combatant Plans</h3>
            ${model.actors.length
                ? model.actors.map((actor) => renderActorPlan(actor, model.phase, escapeHTML)).join("")
                : `<p class="totc-v2-encounter-manager__empty">No actors in this encounter.</p>`}
        </section>

        ${renderLastRoundSummary(model, escapeHTML)}
    </section>`;
}
