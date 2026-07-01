import { buildEncounterOrderDisplay } from "../../../encounters/encounter-order-model.mjs";
import { orderIdForAction } from "../../../encounters/encounter-order-clauses.mjs";
import { renderDraftPlanNarrative } from "../../../encounters/encounter-draft-narrative.mjs";

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
        const resultType = String(result?.rollType ?? "").toLowerCase();
        const resultSubType = String(result?.rollSubType ?? "").toLowerCase();
        if (resultType && requiredType && resultType !== requiredType) return false;
        if (resultSubType && requiredSubType && resultSubType !== requiredSubType) return false;
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
    const draftPlan = currentState.draftPlan ?? { clauses: [] };
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
    const summary = String(match.summary ?? "").trim();
    if (summary) return summary;
    return toArray(match.lines).map((line) => String(line ?? "").trim()).filter(Boolean).join(" ");
}

function buildRoundNarrativeTicks({ resolution = {}, timeline = [], totalTicks = 6, currentTick = 0 } = {}) {
    const tickCount = Math.max(1, toNumber(totalTicks, 6));
    const activeTick = Math.max(0, toNumber(currentTick, 0));
    return Array.from({ length: tickCount }, (_, index) => {
        const tick = index + 1;
        return {
            tick,
            summary: tickNarrativeFromResolution(resolution, tick) || latestSlotNarrative(timeline, tick),
            current: tick === activeTick,
            evaluated: activeTick > 0 && tick <= activeTick
        };
    });
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
        name: String(combatant?.name ?? actor?.name ?? "Combatant"),
        img: String(combatant?.img ?? actor?.img ?? ""),
        ready: Boolean(currentState.ready),
        health: {
            value: toNumber(system.resources?.health?.value, 0),
            max: toNumber(system.resources?.health?.max, 0)
        },
        conditions: actorEffects(actor),
        apBudget,
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
    return {
        requests,
        gmRequests,
        hasRequests: requests.length > 0,
        hasPendingGmRequests: gmRequests.length > 0
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
    const tickNarrative = tickNarrativeFromResolution(resolution, currentTick)
        || latestSlotNarrative(timeline, currentTick)
        || latestSlotNarrative(timeline, latestSlot);
    const hasSnapshots = Boolean(combat?.stepEncounterResolution)
        && toArray(resolution?.snapshots).length > 0;
    const isInProgress = phase === "resolving" || phase === "roundComplete";

    const actors = combatantContents(combat?.combatants).map((combatant) => buildCombatantSummary(combatant, state, timeline, apBudget, currentTick));
    const pendingRequiredRolls = actors.reduce((sum, actor) => sum + pendingRollCount(combatantState(state, actor.id).plan), 0);

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
        canResolveRound: Boolean(combat?.resolveEncounterRound || combat?.beginEncounterResolution) && pendingRequiredRolls === 0,
        canSetPhase: Boolean(combat?.setEncounterPhase),
        canStepPrevious: hasSnapshots && isInProgress && currentTick > 0,
        canStepNext: hasSnapshots && phase === "resolving" && currentTick < totalTicks,
        actors,
        pendingRequiredRolls,
        rollQueue: rollRequestQueueModel({ combat, rollRequests, users }),
        lastNarrative: tickNarrative,
        tickNarratives: buildRoundNarrativeTicks({ resolution, timeline, totalTicks, currentTick }),
        lastEvaluatedTick: latestSlot || null
    };
}

function renderOrderClauses(order, escapeHTML) {
    const clauses = toArray(order.clauses);
    if (!clauses.length) return "";
    return `
        <ul class="totc-v2-encounter-manager__order-clauses">
            ${clauses.map((clause) => {
                const status = String(clause.status ?? "pending");
                const related = toArray(clause.relatedCombatantIds).join(", ");
                return `
                <li class="totc-v2-encounter-manager__order-clause is-${escapeHTML(status)}"
                    data-clause-id="${escapeHTML(clause.clauseId)}"
                    data-clause-type="${escapeHTML(clause.clauseType)}"
                    ${related ? `data-related-combatant-ids="${escapeHTML(related)}"` : ""}>
                    <span class="totc-v2-encounter-manager__order-clause-status">${escapeHTML(status)}</span>
                    <span class="totc-v2-encounter-manager__order-clause-text">${escapeHTML(clause.text)}</span>
                </li>`;
            }).join("")}
        </ul>`;
}

function renderActorOrders(actor, escapeHTML) {
    const orders = toArray(actor.orders);
    if (!orders.length) return `<p class="totc-v2-encounter-manager__orders-empty">No orders.</p>`;
    return `
        <ol class="totc-v2-encounter-manager__orders">
            ${orders.map((order) => `
                <li class="totc-v2-encounter-manager__order is-${escapeHTML(String(order.status ?? "pending"))}"
                    data-order-id="${escapeHTML(order.orderId)}">
                    <strong>${escapeHTML(order.summary)}</strong>
                    ${renderOrderRollResults(order, escapeHTML)}
                    ${renderOrderClauses(order, escapeHTML)}
                </li>`).join("")}
        </ol>`;
}

function renderOrderRollResults(order, escapeHTML) {
    const results = toArray(order.rollResults);
    if (!results.length) return "";
    return `
        <ul class="totc-v2-encounter-manager__order-rolls" aria-label="Order die roll results">
            ${results.map((result) => {
                const total = result.total === null ? "?" : String(result.total);
                const formula = result.formula ? ` (${result.formula})` : "";
                return `
                <li>
                    <span>${escapeHTML(result.label)}</span>
                    <strong>${escapeHTML(total)}</strong>
                    ${formula ? `<small>${escapeHTML(formula)}</small>` : ""}
                </li>`;
            }).join("")}
        </ul>`;
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
            ${renderActorOrders(actor, escapeHTML)}
        </article>`;
}

function renderRoundNarrative(model = {}, escapeHTML) {
    const ticks = toArray(model.tickNarratives);
    return `
        <section class="totc-v2-encounter-manager__narrative" aria-label="Round narrative">
            <h3>Round Narrative</h3>
            ${ticks.length
                ? `<ol class="totc-v2-encounter-manager__tick-narratives">
                    ${ticks.map((tick) => {
                        const tickNumber = Math.max(1, toNumber(tick.tick, 1));
                        const stateClass = tick.current ? " is-current" : tick.evaluated ? " is-evaluated" : "";
                        return `
                        <li class="totc-v2-encounter-manager__tick-narrative${stateClass}" data-tick="${escapeHTML(String(tickNumber))}">
                            <span class="totc-v2-encounter-manager__tick-label">Second ${escapeHTML(String(tickNumber))}</span>
                            <p>${tick.summary ? escapeHTML(tick.summary) : "No narration yet."}</p>
                        </li>`;
                    }).join("")}
                </ol>`
                : `<p>No AP slot has been evaluated yet.</p>`}
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
                    ${requests.map((request) => renderRollRequestCard(request, escapeHTML, { allowRoll: request.gmControlled })).join("")}
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

    return `
    <section class="totc-v2-encounter-manager">
        <header class="totc-v2-encounter-manager__header">
            <div>
                <h3>${escapeHTML(model.name)}</h3>
                <p>Round ${escapeHTML(String(model.round))} · ${escapeHTML(model.phase)} · AP ${escapeHTML(String(model.currentTick))}/${escapeHTML(String(model.totalTicks))}</p>
            </div>
            <span>${escapeHTML(String(model.actors.length))} actors</span>
        </header>

        <div class="totc-v2-encounter-manager__progress" aria-label="Round resolution progress">
            <span class="totc-v2-encounter-manager__progress-fill" style="width:${escapeHTML(String(model.progressPercent))}%;"></span>
            <span class="totc-v2-encounter-manager__progress-label">${escapeHTML(String(model.progressPercent))}% · ${escapeHTML(model.resolutionStatus || "idle")}</span>
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
    </section>`;
}
