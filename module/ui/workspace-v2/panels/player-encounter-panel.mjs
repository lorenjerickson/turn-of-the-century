function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function itemId(document) {
    return String(document?.id ?? document?._id ?? "").trim();
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function actorStatusModel(actor = null) {
    if (!actor) return null;
    const system = actor.system ?? {};
    const effects = collectionContents(actor.effects)
        .filter((effect) => !effect?.disabled)
        .map((effect) => ({
            id: itemId(effect),
            name: String(effect?.name ?? effect?.label ?? "Effect")
        }))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    return {
        id: itemId(actor),
        name: String(actor.name ?? "Actor"),
        type: String(actor.type ?? "Actor"),
        img: String(actor.img ?? ""),
        health: {
            value: toNumber(system.resources?.health?.value, 0),
            max: toNumber(system.resources?.health?.max, 0)
        },
        grit: {
            value: toNumber(system.resources?.grit?.value, 0),
            max: toNumber(system.resources?.grit?.max, 0)
        },
        defenseRating: toNumber(system.defenses?.armorClass ?? system.defenses?.defenseRating, 0),
        effects
    };
}

function actionOptionModel(action = {}) {
    const apMin = Math.max(1, toNumber(action.apMin ?? action.apCost, 1));
    const apMax = Math.max(apMin, toNumber(action.apMax ?? action.apCost ?? apMin, apMin));
    const apCost = Math.max(apMin, Math.min(apMax, toNumber(action.apCost ?? apMin, apMin)));
    const actionType = String(action.type ?? "action");
    const requiresTarget = Boolean(action.requiresTarget);
    const requiresToHit = Boolean(action.requiresToHit);
    const isMovement = actionType.toLowerCase() === "movement";
    const apEnvelope = action.apEnvelope && typeof action.apEnvelope === "object" ? { ...action.apEnvelope } : null;
    const targetMode = String(action.targetMode ?? (isMovement ? "location" : (requiresTarget || requiresToHit ? "selectTarget" : "self")));
    const effectAp = Math.max(0, toNumber(action.effectAp ?? apEnvelope?.effectAp, isMovement ? apCost : apCost));
    const positioningAp = Math.max(0, toNumber(action.positioningAp ?? apEnvelope?.positioningAp, 0));
    return {
        ...action,
        id: String(action.id ?? action.actionId ?? ""),
        actionId: String(action.actionId ?? action.id ?? ""),
        type: actionType,
        label: String(action.label ?? "Action"),
        description: String(action.description ?? ""),
        apCost,
        apMin,
        apMax,
        variableAp: Boolean(action.variableAp && apMax > apMin),
        requiresToHit,
        requiresTarget,
        rangeType: String(action.rangeType ?? "melee"),
        toHitBonus: toNumber(action.toHitBonus, 0),
        targetingRangeFeet: toNumber(action.targetingRangeFeet, 0),
        targetMode,
        positioningAp,
        effectAp,
        movementFeet: toNumber(action.movementFeet, 0),
        movementFeetPerAp: toNumber(action.movementFeetPerAp, 0),
        movementTargetRow: toNumber(action.movementTargetRow, ""),
        movementTargetCol: toNumber(action.movementTargetCol, ""),
        movementTargetX: toNumber(action.movementTargetX, ""),
        movementTargetY: toNumber(action.movementTargetY, ""),
        movementOriginX: toNumber(action.movementOriginX, ""),
        movementOriginY: toNumber(action.movementOriginY, ""),
        damageFormula: String(action.damageFormula ?? ""),
        planningLocked: Boolean(action.planningLocked),
        planningRollResults: toArray(action.planningRollResults),
        rollRequirements: toArray(action.rollRequirements),
        summary: String(action.summary ?? ""),
        clauses: toArray(action.clauses),
        apEnvelope,
        itemId: action.itemId ? String(action.itemId) : "",
        img: String(action.img ?? ""),
        apLabel: action.variableAp && apMax > apMin
            ? `${apMin}-${apMax} AP`
            : `${apCost} AP`
    };
}

function itemOptionModel(item = {}) {
    return {
        id: String(item.id ?? ""),
        name: String(item.name ?? item.label ?? "Item").trim() || "Item",
        type: String(item.type ?? "item"),
        img: String(item.img ?? ""),
        description: String(item.description ?? item.system?.description ?? "").trim()
    };
}

function planSegmentModel(action = {}, index = 0) {
    const option = actionOptionModel(action);
    return {
        ...option,
        index,
        span: Math.max(1, option.apCost)
    };
}

function phraseModel(phrase = {}) {
    return {
        phraseId: String(phrase.phraseId ?? ""),
        clauseId: String(phrase.clauseId ?? ""),
        clauseIndex: Math.max(0, toNumber(phrase.clauseIndex, 0)),
        decision: String(phrase.decision ?? "action"),
        rootDecision: String(phrase.rootDecision ?? phrase.decision ?? "action"),
        text: String(phrase.text ?? ""),
        placeholder: Boolean(phrase.placeholder),
        editable: Boolean(phrase.editable ?? true)
    };
}

function draftNarrativeModel(planner = null, apBudget = 6) {
    const narrative = planner?.draftNarrative && typeof planner.draftNarrative === "object"
        ? planner.draftNarrative
        : null;
    const actorName = String(planner?.combatantName ?? "Combatant").trim() || "Combatant";
    return {
        text: String(narrative?.text ?? `${actorName} [select an action]`),
        phrases: toArray(narrative?.phrases).map(phraseModel),
        lifecycle: String(narrative?.lifecycle ?? planner?.draftPlan?.lifecycle ?? "drafting"),
        apBudget: Math.max(1, toNumber(narrative?.apBudget ?? planner?.draftPlan?.apBudget, apBudget)),
        spentAp: Math.max(0, toNumber(narrative?.spentAp ?? planner?.draftPlan?.spentAp, 0)),
        remainingAp: Math.max(0, toNumber(narrative?.remainingAp ?? planner?.draftPlan?.remainingAp, apBudget)),
        complete: Boolean(narrative?.complete),
        overBudget: Boolean(narrative?.overBudget),
        helpText: String(narrative?.helpText ?? ""),
        missingDecisions: toArray(narrative?.missingDecisions)
    };
}

function rollStatusModel(rollStatus = null) {
    const items = toArray(rollStatus?.items).map((item) => ({
        actionIndex: Math.max(0, toNumber(item?.actionIndex, 0)),
        actionId: String(item?.actionId ?? ""),
        label: String(item?.label ?? "Action"),
        rollType: String(item?.rollType ?? "roll"),
        rollSubType: String(item?.rollSubType ?? ""),
        complete: Boolean(item?.complete)
    }));

    return {
        required: Boolean(rollStatus?.required ?? items.length > 0),
        complete: items.length > 0 && items.every((item) => item.complete),
        pendingCount: items.filter((item) => !item.complete).length,
        items
    };
}

function historyRowsFromTimeline({ planner = null, combat = null } = {}) {
    const combatantId = String(planner?.combatantId ?? "").trim();
    const encounterState = combat?.encounterState ?? combat?.encounter?.state ?? {};
    const roundHistory = toArray(encounterState?.roundHistory);

    const toRow = (timeline = [], rowRound = 0, suffix = "") => {
        const filtered = toArray(timeline).filter((entry) => !combatantId || String(entry?.combatantId ?? "") === combatantId);
        if (!filtered.length) return null;

        const segments = filtered.map((entry, index) => {
            const action = entry?.action ?? {};
            const apStart = Math.max(1, toNumber(action.apStart ?? entry.slot ?? entry.tick, 1));
            const apEnd = Math.max(apStart, toNumber(action.apEnd ?? entry.slot ?? entry.tick, apStart));
            return {
                id: `${String(action.id ?? "action")}-${suffix}-${index}`,
                label: String(action.label ?? entry?.outcome?.result ?? "Action"),
                result: String(entry?.outcome?.result ?? ""),
                start: apStart,
                span: Math.max(1, apEnd - apStart + 1)
            };
        });

        return {
            id: `round-${rowRound}${suffix ? `-${suffix}` : ""}`,
            label: `Round ${rowRound}`,
            apBudget: Math.max(toNumber(planner?.apBudget, 6), ...segments.map((segment) => segment.start + segment.span - 1)),
            segments
        };
    };

    const rows = roundHistory
        .map((entry, index) => toRow(entry?.timeline, toNumber(entry?.round, index + 1), `history-${index}`))
        .filter(Boolean);

    const liveRound = toNumber(encounterState?.round ?? combat?.round, toNumber(planner?.round, 1));
    const liveRow = toRow(encounterState?.timeline, liveRound, "live");
    if (liveRow) rows.push(liveRow);

    return rows.reverse();
}

export function buildPlayerEncounterPanelModel({ actor = null, planner = null, combat = null, activePlanEditSlot = null } = {}) {
    const status = actorStatusModel(actor);
    const apBudget = Math.max(1, toNumber(planner?.apBudget ?? combat?.apBudget, 6));
    const combatId = String(planner?.combatId ?? combat?.id ?? "");
    const combatantId = String(planner?.combatantId ?? "");
    const activeEncounter = Boolean(combatId && combatantId);

    const rawActions = toArray(planner?.availableActions);
    const mappedActions = rawActions.map(actionOptionModel);

    const availableActions = mappedActions
        .filter((action) => Boolean(action.id))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
    const availableItems = toArray(planner?.availableItems)
        .map(itemOptionModel)
        .filter((item) => Boolean(item.id));

    const plannedActions = toArray(planner?.queue).map(planSegmentModel);
    const draftNarrative = draftNarrativeModel(planner, apBudget);
    const rollStatus = rollStatusModel(planner?.rollStatus);
    const draftClauseCount = toArray(planner?.draftPlan?.clauses).length;
    const canEditPlan = Boolean(planner?.canEditPlan);
    const lockedThroughIndex = plannedActions.reduce(
        (boundary, action) => action.planningLocked ? action.index : boundary,
        -1
    );
    for (const action of plannedActions) {
        action.editable = canEditPlan && action.index > lockedThroughIndex;
    }
    const encounterState = combat?.encounterState ?? combat?.encounter?.state ?? {};
    const resolution = encounterState?.resolution ?? {};
    const currentTick = Math.max(0, Math.min(apBudget, toNumber(resolution?.currentTick ?? encounterState?.currentEvaluationTick ?? 0, 0)));
    const progressPercent = Math.max(0, Math.min(100, Math.round((currentTick / apBudget) * 100)));

    const selectedAction = activePlanEditSlot?.selectedAction
        ? actionOptionModel(activePlanEditSlot.selectedAction)
        : null;
    const normalizedPlanEditSlot = activePlanEditSlot
        ? {
            ...activePlanEditSlot,
            selectedAction
        }
        : null;

    return {
        actorId: status?.id ?? "",
        combatId,
        combatantId,
        activeEncounter,
        encounterName: String(planner?.encounterName ?? combat?.name ?? "Encounter"),
        phase: String(planner?.phase ?? combat?.phase ?? "planning"),
        round: toNumber(planner?.round ?? combat?.round, 1),
        status,
        apBudget,
        remainingAp: toNumber(planner?.remainingAp, apBudget),
        draftRemainingAp: toNumber(planner?.draftRemainingAp ?? draftNarrative.remainingAp, draftNarrative.remainingAp),
        plannedAp: toNumber(planner?.plannedAp, plannedActions.reduce((sum, action) => sum + action.apCost, 0)),
        planningTimeDisplay: String(planner?.planningTimeDisplay ?? ""),
        canEditPlan,
        lockedThroughIndex,
        canClearPlan: canEditPlan && draftClauseCount > 0,
        canCommit: Boolean(planner?.canCommit && draftNarrative.complete && !draftNarrative.overBudget),
        ready: Boolean(planner?.ready),
        draftNarrative,
        rollStatus,
        currentTick,
        progressPercent,
        resolutionStatus: String(resolution?.status ?? "idle"),
        availableActions,
        plannedActions,
        hasPlannedActions: plannedActions.length > 0,
        historyRows: historyRowsFromTimeline({ planner, combat }),
        availableItems,
        activePlanEditSlot: normalizedPlanEditSlot
    };
}

function renderTicks(apBudget) {
    return Array.from({ length: Math.max(1, Number(apBudget) || 1) }, (_, index) => `
        <li class="totc-v2-encounter-panel__tick" style="grid-column:${index + 1};">${index + 1}</li>`).join("");
}

function actionDataAttributes(action, escapeHTML) {
    return [
        ["id", action.id],
        ["action-id", action.actionId],
        ["type", action.type],
        ["label", action.label],
        ["action-label", action.actionLabel],
        ["action-narrative-text", action.actionNarrativeText],
        ["ap-cost", action.apCost],
        ["ap-min", action.apMin],
        ["ap-max", action.apMax],
        ["variable-ap", action.variableAp ? "true" : "false"],
        ["requires-to-hit", action.requiresToHit ? "true" : "false"],
        ["requires-target", action.requiresTarget ? "true" : "false"],
        ["requires-duration", action.requiresDuration ? "true" : "false"],
        ["requires-engagement-action", action.requiresEngagementAction ? "true" : "false"],
        ["range-type", action.rangeType],
        ["to-hit-bonus", action.toHitBonus],
        ["targeting-range-feet", action.targetingRangeFeet],
        ["target-mode", action.targetMode],
        ["positioning-ap", action.positioningAp],
        ["effect-ap", action.effectAp],
        ["movement-feet", action.movementFeet],
        ["movement-feet-per-ap", action.movementFeetPerAp],
        ["movement-target-row", action.movementTargetRow],
        ["movement-target-col", action.movementTargetCol],
        ["movement-target-x", action.movementTargetX],
        ["movement-target-y", action.movementTargetY],
        ["movement-origin-x", action.movementOriginX],
        ["movement-origin-y", action.movementOriginY],
        ["item-id", action.itemId],
        ["item-name", action.itemName],
        ["damage-formula", action.damageFormula],
        ["img", action.img]
    ].map(([key, value]) => `data-${key}="${escapeHTML(String(value ?? ""))}"`).join(" ");
}

function renderPlanBar(model, escapeHTML) {
    const planned = model.plannedActions ?? [];
    let currentTick = 1;
    const segmentsMarkup = planned.map((action) => {
        const startTick = currentTick;
        action.startTick = startTick;
        currentTick += action.span;
        const clickableAttrs = action.editable
            ? `data-start-tick="${startTick}" style="grid-column:${startTick} / span ${action.span}; cursor:pointer;"`
            : `style="grid-column:${startTick} / span ${action.span};"`;

        return `
            <li class="totc-v2-encounter-panel__segment${action.variableAp ? " is-variable" : ""}"
                draggable="${action.editable ? "true" : "false"}"
                data-action="${action.editable ? "encounter-plan-segment" : "encounter-locked-plan-segment"}"
                ${clickableAttrs}
                ${actionDataAttributes(action, escapeHTML)}
                title="${escapeHTML(action.label)} (${escapeHTML(action.apLabel)})">
                <span>${action.planningLocked ? `<i class="fa-solid fa-lock" aria-label="Roll accepted; action locked"></i> ` : ""}${escapeHTML(action.label)}</span>
                <small>${escapeHTML(action.apLabel)}</small>
                ${action.editable ? `<button type="button" data-action="encounter-remove-action" data-action-index="${escapeHTML(String(action.index))}" title="Remove ${escapeHTML(action.label)}" aria-label="Remove ${escapeHTML(action.label)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
                ${action.editable && action.variableAp ? `<span class="totc-v2-encounter-panel__resize" data-action="encounter-resize-action" data-action-index="${escapeHTML(String(action.index))}" title="Resize action duration" aria-hidden="true"></span>` : ""}
            </li>`;
    }).join("");

    let placeholdersMarkup = "";
    if (model.canEditPlan) {
        for (let tick = currentTick; tick <= model.apBudget; tick++) {
            placeholdersMarkup += `
            <li class="totc-v2-encounter-panel__segment is-empty"
                style="grid-column:${tick}; cursor:pointer;"
                data-action="encounter-edit-plan-slot"
                data-action-index="${escapeHTML(String(planned.length))}"
                data-start-tick="${tick}"
                title="Click to add action starting at AP ${tick}">
                <span>+ Add</span>
            </li>`;
        }
    }

    return `
    <ul class="totc-v2-encounter-panel__bar" data-action="encounter-plan-bar" data-combatant-id="${escapeHTML(model.combatantId)}" data-ap-budget="${escapeHTML(String(model.apBudget))}" style="--totc-ap-budget:${model.apBudget};--totc-current-tick:${Math.max(1, model.currentTick || 1)};">
        ${renderTicks(model.apBudget)}
        <li class="totc-v2-encounter-panel__current-line" aria-hidden="true"></li>
        ${segmentsMarkup}
        ${placeholdersMarkup}
        ${planned.length || model.canEditPlan ? "" : `<li class="totc-v2-encounter-panel__empty-bar">No planned actions</li>`}
    </ul>`;
}

function renderOrderList(model, escapeHTML) {
    const planned = model.plannedActions ?? [];
    if (!planned.length) {
        return `<div class="totc-v2-encounter-panel__orders-empty">No orders planned.</div>`;
    }

    return `
    <ol class="totc-v2-encounter-panel__orders">
        ${planned.map((action) => {
            const envelope = action.apEnvelope ?? {};
            const maxAp = Math.max(1, toNumber(envelope.maxAp ?? action.apCost, action.apCost));
            const positioningAp = Math.max(0, toNumber(envelope.positioningAp, 0));
            const effectAp = Math.max(0, toNumber(envelope.effectAp, action.apCost));
            const envelopeLabel = positioningAp > 0
                ? `Up to ${maxAp} AP (${positioningAp} positioning, ${effectAp} effect)`
                : `${maxAp} AP`;
            return `
                <li class="totc-v2-encounter-panel__order${action.planningLocked ? " is-locked" : ""}">
                    <div class="totc-v2-encounter-panel__order-main">
                        <strong>${action.planningLocked ? `<i class="fa-solid fa-lock" aria-label="Roll accepted; order locked"></i> ` : ""}${escapeHTML(action.summary || action.label)}</strong>
                        <span>${escapeHTML(envelopeLabel)}</span>
                    </div>
                    ${(action.clauses ?? []).length > 1 ? `
                        <ul class="totc-v2-encounter-panel__order-clauses">
                            ${(action.clauses ?? []).map((clause) => `
                                <li>${escapeHTML(clause.text ?? clause.clauseText ?? "")}</li>
                            `).join("")}
                        </ul>
                    ` : ""}
                </li>`;
        }).join("")}
    </ol>`;
}

function renderHistoryRows(model, escapeHTML) {
    const rows = model.historyRows ?? [];
    if (!rows.length) return `<p class="totc-v2-encounter-panel__muted">No resolved round history yet.</p>`;
    return rows.map((row) => `
        <article class="totc-v2-encounter-panel__history-row">
            <strong>${escapeHTML(row.label)}</strong>
            <ul class="totc-v2-encounter-panel__history-bar" style="--totc-ap-budget:${row.apBudget};">
                ${renderTicks(row.apBudget)}
                ${(row.segments ?? []).map((segment) => `
                    <li class="totc-v2-encounter-panel__history-segment"
                        style="grid-column:${segment.start} / span ${segment.span};"
                        title="${escapeHTML(segment.label)}${segment.result ? `: ${escapeHTML(segment.result)}` : ""}">
                        ${escapeHTML(segment.label)}
                    </li>`).join("")}
            </ul>
        </article>`).join("");
}

function renderNarrativeText(model, escapeHTML) {
    const narrative = model.draftNarrative ?? {};
    const phrases = toArray(narrative.phrases);
    if (!phrases.length) return escapeHTML(narrative.text ?? "");

    const sourceText = String(narrative.text ?? "");
    let cursor = 0;
    const rendered = [];
    for (const phrase of phrases) {
        const phraseText = String(phrase.text ?? "");
        const foundAt = phraseText ? sourceText.indexOf(phraseText, cursor) : -1;
        if (foundAt < 0) continue;
        if (foundAt > cursor) rendered.push(escapeHTML(sourceText.slice(cursor, foundAt)));
        const editable = model.canEditPlan && phrase.editable;
        rendered.push(`
            <button type="button"
                class="totc-v2-encounter-narrative__phrase${phrase.placeholder ? " is-placeholder" : ""}"
                data-action="encounter-narrative-phrase"
                data-phrase-id="${escapeHTML(phrase.phraseId)}"
                data-clause-id="${escapeHTML(phrase.clauseId)}"
                data-clause-index="${escapeHTML(String(phrase.clauseIndex))}"
                data-decision="${escapeHTML(phrase.decision)}"
                data-root-decision="${escapeHTML(phrase.rootDecision)}"
                ${editable ? "" : "disabled"}>
                ${escapeHTML(phraseText)}
            </button>`);
        cursor = foundAt + phraseText.length;
    }
    if (cursor < sourceText.length) rendered.push(escapeHTML(sourceText.slice(cursor)));
    return rendered.join("");
}

function renderNarrativeComposer(model, escapeHTML) {
    const narrative = model.draftNarrative ?? {};
    const missingLabels = toArray(narrative.missingDecisions)
        .map((entry) => String(entry?.decision ?? "").trim())
        .filter(Boolean)
        .join(", ");
    const helpText = String(model.activePlanEditSlot?.helpText || narrative.helpText || `${model.draftRemainingAp} AP remaining.`);
    const statusText = narrative.overBudget
        ? "Plan exceeds available AP."
        : missingLabels
            ? `Choose ${missingLabels}.`
            : helpText;

    return `
    <section class="totc-v2-encounter-narrative" aria-label="Action plan narrative">
        <p class="totc-v2-encounter-narrative__text">${renderNarrativeText(model, escapeHTML)}</p>
        <div class="totc-v2-encounter-narrative__help">
            <span>${escapeHTML(statusText)}</span>
            <strong>${escapeHTML(String(narrative.remainingAp ?? model.draftRemainingAp))} AP unused</strong>
        </div>
    </section>`;
}

function renderPlanningRolls(model, escapeHTML) {
    const rollStatus = model.rollStatus ?? {};
    if (!rollStatus.required) return "";

    const items = toArray(rollStatus.items);
    const statusText = rollStatus.pendingCount > 0
        ? `${rollStatus.pendingCount} roll${rollStatus.pendingCount === 1 ? "" : "s"} pending`
        : "Rolls complete";
    const itemsMarkup = items.map((item) => `
        <li class="${item.complete ? "is-complete" : "is-pending"}">
            <span>${escapeHTML(item.label)}</span>
            <strong>${escapeHTML(item.complete ? "Complete" : "Pending")}</strong>
        </li>
    `).join("");

    return `
    <section class="totc-v2-encounter-rolls" aria-label="Required planning rolls">
        <header>
            <h4>Required Rolls</h4>
            <span>${escapeHTML(statusText)}</span>
        </header>
        <ul>${itemsMarkup}</ul>
    </section>`;
}

function renderNarrativeActionPopover(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    const mode = String(slot?.mode ?? "");
    if (!slot || slot.selectedAction || !["draftAction", "draftEngagementAction"].includes(mode)) return "";

    const remainingAp = Math.max(0, toNumber(slot.remainingAp ?? model.draftRemainingAp, model.draftRemainingAp));
    const actions = (model.availableActions ?? [])
        .filter((action) => action.apMin <= Math.max(1, remainingAp))
        .filter((action) => mode !== "draftEngagementAction" || String(action.type ?? "").toLowerCase() !== "movement");
    const searchId = "totc-encounter-action-search";
    const itemsMarkup = actions.map((action) => `
        <button type="button" class="totc-v2-encounter-popup__item"
            data-action="encounter-select-popup-action"
            ${actionDataAttributes(action, escapeHTML)}
            data-action-index="${escapeHTML(String(slot.index ?? 0))}">
            ${action.img ? `<img src="${escapeHTML(action.img)}" alt="">` : `<span class="totc-v2-encounter-popup__item-fallback"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span>`}
            <div class="totc-v2-encounter-popup__item-info">
                <span class="totc-v2-encounter-popup__item-label">${escapeHTML(action.label)}</span>
                ${action.description ? `<span class="totc-v2-encounter-popup__item-desc">${escapeHTML(action.description)}</span>` : ""}
            </div>
            <span class="totc-v2-encounter-popup__item-ap">${escapeHTML(action.apLabel)}</span>
        </button>
    `).join("");

    return `
    <div class="totc-v2-encounter-popup-overlay">
        <div class="totc-v2-encounter-popup">
            <header class="totc-v2-encounter-popup__header">
                <h4>${mode === "draftEngagementAction" ? "Choose Engagement" : "Choose Action"} · ${escapeHTML(String(remainingAp))} AP available</h4>
                <button type="button" class="totc-v2-encounter-popup__close" data-action="encounter-close-popup" aria-label="Close dialog">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>
            <label class="totc-v2-encounter-popup__search" for="${searchId}">
                <span>Search actions</span>
                <input id="${searchId}" type="search" data-action="encounter-action-search" placeholder="Search actions">
            </label>
            <div class="totc-v2-encounter-popup__list">
                ${itemsMarkup || `<div class="totc-v2-encounter-popup__empty">No available actions fit in the remaining budget.</div>`}
            </div>
        </div>
    </div>`;
}

function renderNarrativeItemPopover(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    if (!slot || String(slot.mode ?? "") !== "draftItem") return "";

    const searchId = "totc-encounter-item-search";
    const itemsMarkup = (model.availableItems ?? []).map((item) => `
        <button type="button" class="totc-v2-encounter-popup__item"
            data-action="encounter-select-draft-item"
            data-clause-index="${escapeHTML(String(slot.index ?? 0))}"
            data-item-id="${escapeHTML(item.id)}"
            data-item-name="${escapeHTML(item.name)}">
            ${item.img ? `<img src="${escapeHTML(item.img)}" alt="">` : `<span class="totc-v2-encounter-popup__item-fallback"><i class="fa-solid fa-briefcase" aria-hidden="true"></i></span>`}
            <div class="totc-v2-encounter-popup__item-info">
                <span class="totc-v2-encounter-popup__item-label">${escapeHTML(item.name)}</span>
                ${item.description ? `<span class="totc-v2-encounter-popup__item-desc">${escapeHTML(item.description)}</span>` : ""}
            </div>
            <span class="totc-v2-encounter-popup__item-ap">${escapeHTML(item.type)}</span>
        </button>
    `).join("");

    return `
    <div class="totc-v2-encounter-popup-overlay">
        <div class="totc-v2-encounter-popup">
            <header class="totc-v2-encounter-popup__header">
                <h4>Choose Item</h4>
                <button type="button" class="totc-v2-encounter-popup__close" data-action="encounter-close-popup" aria-label="Close dialog">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>
            <label class="totc-v2-encounter-popup__search" for="${searchId}">
                <span>Search items</span>
                <input id="${searchId}" type="search" data-action="encounter-item-search" placeholder="Search items">
            </label>
            <div class="totc-v2-encounter-popup__list">
                ${itemsMarkup || `<div class="totc-v2-encounter-popup__empty">No carried items are available.</div>`}
            </div>
        </div>
    </div>`;
}

function renderNarrativeDurationPopover(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    if (!slot || String(slot.mode ?? "") !== "draftDuration") return "";

    const maxDuration = Math.max(1, toNumber(slot.maxDurationAp ?? model.draftRemainingAp, model.draftRemainingAp));
    const durations = Array.from({ length: maxDuration }, (_entry, index) => index + 1);
    const itemsMarkup = durations.map((duration) => `
        <button type="button" class="totc-v2-encounter-popup__item"
            data-action="encounter-select-draft-duration"
            data-clause-index="${escapeHTML(String(slot.index ?? 0))}"
            data-duration-ap="${escapeHTML(String(duration))}">
            <span class="totc-v2-encounter-popup__item-fallback"><i class="fa-solid fa-clock" aria-hidden="true"></i></span>
            <div class="totc-v2-encounter-popup__item-info">
                <span class="totc-v2-encounter-popup__item-label">${escapeHTML(duration === 1 ? "1 second" : `${duration} seconds`)}</span>
            </div>
            <span class="totc-v2-encounter-popup__item-ap">${escapeHTML(String(duration))} AP</span>
        </button>
    `).join("");

    return `
    <div class="totc-v2-encounter-popup-overlay">
        <div class="totc-v2-encounter-popup">
            <header class="totc-v2-encounter-popup__header">
                <h4>Choose Duration</h4>
                <button type="button" class="totc-v2-encounter-popup__close" data-action="encounter-close-popup" aria-label="Close dialog">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>
            <div class="totc-v2-encounter-popup__list">
                ${itemsMarkup}
            </div>
        </div>
    </div>`;
}

function renderPlanEditPopup(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    if (!slot || slot.selectedAction) return "";
    if (String(slot.mode ?? "").startsWith("draft")) return "";

    const remainingAp = slot.remainingAp;
    const actions = (model.availableActions ?? []).filter((action) => action.apMin <= remainingAp);

    const itemsMarkup = actions.map((action) => `
        <button type="button" class="totc-v2-encounter-popup__item"
            data-action="encounter-select-popup-action"
            ${actionDataAttributes(action, escapeHTML)}
            data-action-index="${escapeHTML(String(slot.index))}">
            ${action.img ? `<img src="${escapeHTML(action.img)}" alt="">` : `<span class="totc-v2-encounter-popup__item-fallback"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span>`}
            <div class="totc-v2-encounter-popup__item-info">
                <span class="totc-v2-encounter-popup__item-label">${escapeHTML(action.label)}</span>
                ${action.description ? `<span class="totc-v2-encounter-popup__item-desc">${escapeHTML(action.description)}</span>` : ""}
            </div>
            <span class="totc-v2-encounter-popup__item-ap">${escapeHTML(action.apLabel)}</span>
        </button>
    `).join("");

    return `
    <div class="totc-v2-encounter-popup-overlay">
        <div class="totc-v2-encounter-popup">
            <header class="totc-v2-encounter-popup__header">
                <h4>Add Action (Tick ${escapeHTML(String(slot.startTick))}, Max ${escapeHTML(String(remainingAp))} AP)</h4>
                <button type="button" class="totc-v2-encounter-popup__close" data-action="encounter-close-popup" aria-label="Close dialog">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </header>
            <div class="totc-v2-encounter-popup__list">
                ${itemsMarkup || `<div class="totc-v2-encounter-popup__empty">No available actions fit in the remaining budget.</div>`}
            </div>
        </div>
    </div>`;
}

function renderPlanConfiguration(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    const action = slot?.selectedAction;
    if (!slot || !action) return "";

    const remainingAp = Math.max(1, toNumber(slot.remainingAp, 1));
    const actionType = String(action.type ?? "").toLowerCase();
    const isMovement = actionType === "movement";
    const needsTarget = Boolean(action.requiresTarget || action.requiresToHit);
    const apMin = Math.max(1, Math.min(remainingAp, toNumber(action.apMin, 1)));
    const effectApMax = isMovement
        ? Math.max(apMin, Math.min(remainingAp, toNumber(action.apMax, action.apCost)))
        : Math.max(apMin, Math.min(remainingAp, toNumber(action.apMax, action.apCost)));
    const effectAp = isMovement
        ? Math.max(apMin, Math.min(effectApMax, toNumber(action.apCost, apMin)))
        : Math.max(apMin, Math.min(effectApMax, toNumber(action.effectAp ?? action.apCost, apMin)));
    const positioningApMax = isMovement || !needsTarget
        ? 0
        : Math.max(0, remainingAp - effectAp);
    const positioningAp = Math.max(0, Math.min(positioningApMax, toNumber(action.positioningAp, 0)));
    const apCost = isMovement
        ? effectAp
        : Math.max(1, Math.min(remainingAp, effectAp + positioningAp));
    const apMax = Math.max(apCost, remainingAp);
    const apOptions = Array.from({ length: apMax - apMin + 1 }, (_, index) => apMin + index)
        .map((ap) => `<option value="${escapeHTML(String(ap))}" ${ap === apCost ? "selected" : ""}>${escapeHTML(String(ap))} AP</option>`)
        .join("");
    const effectApOptions = Array.from({ length: effectApMax - apMin + 1 }, (_, index) => apMin + index)
        .map((ap) => `<option value="${escapeHTML(String(ap))}" ${ap === effectAp ? "selected" : ""}>${escapeHTML(String(ap))} AP</option>`)
        .join("");
    const positioningApOptions = Array.from({ length: positioningApMax + 1 }, (_, index) => index)
        .map((ap) => `<option value="${escapeHTML(String(ap))}" ${ap === positioningAp ? "selected" : ""}>${escapeHTML(String(ap))} AP</option>`)
        .join("");
    const targetMode = String(action.targetMode ?? (isMovement ? "location" : (needsTarget ? "selectTarget" : "self")));
    const targetModeDisabled = isMovement || !needsTarget;
    const positioningDisabled = isMovement || !needsTarget || positioningApMax === 0;
    const effectDisabled = isMovement;

    return `
    <section class="totc-v2-encounter-config" data-action-index="${escapeHTML(String(slot.index))}" data-remaining-ap="${escapeHTML(String(remainingAp))}">
        <header class="totc-v2-encounter-config__header">
            <div>
                <h4>${escapeHTML(action.label)}</h4>
                <span>Tick ${escapeHTML(String(slot.startTick))} · ${escapeHTML(String(remainingAp))} AP available</span>
            </div>
            <button type="button" class="totc-v2-encounter-config__icon" data-action="encounter-config-back" title="Choose a different action" aria-label="Choose a different action">
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            </button>
        </header>
        <div class="totc-v2-encounter-config__body">
            <label>
                <span>Target</span>
                <select data-action="encounter-config-target-mode" ${targetModeDisabled ? "disabled" : ""}>
                    <option value="self" ${targetMode === "self" ? "selected" : ""}>Self or no target</option>
                    <option value="selectTarget" ${targetMode === "selectTarget" ? "selected" : ""}>Select target on map</option>
                    <option value="location" ${targetMode === "location" ? "selected" : ""}>Selected location</option>
                </select>
            </label>
            <label>
                <span>Positioning AP</span>
                <select data-action="encounter-config-positioning-ap" ${positioningDisabled ? "disabled" : ""}>
                    ${positioningApOptions}
                </select>
            </label>
            <label>
                <span>Effect AP</span>
                <select data-action="encounter-config-effect-ap" ${effectDisabled ? "disabled" : ""}>
                    ${effectApOptions}
                </select>
            </label>
            <label>
                <span>Total AP</span>
                <select data-action="encounter-config-ap-cost" disabled>
                    ${apOptions}
                </select>
            </label>
            <label>
                <span>Follow-through</span>
                <select data-action="encounter-config-follow-through">
                    <option value="chooseAnotherAction" selected>Plan another action if AP remains</option>
                    <option value="hold">Hold position</option>
                    <option value="overwatch">Enter Overwatch if available</option>
                </select>
            </label>
            <label>
                <span>If blocked</span>
                <select data-action="encounter-config-failure-outcome">
                    <option value="bestReachablePosition" selected>Best reachable position</option>
                    <option value="holdPosition">Hold current position</option>
                </select>
            </label>
        </div>
        <footer class="totc-v2-encounter-config__actions">
            <button type="button" data-action="encounter-confirm-configured-action"
                ${actionDataAttributes(action, escapeHTML)}
                data-action-index="${escapeHTML(String(slot.index))}">
                Add Order
            </button>
        </footer>
    </section>`;
}

export function renderPlayerEncounterPanel(model = {}, {
    escapeHTML = (value) => String(value ?? ""),
    rollRequestsMarkup = ""
} = {}) {
    if (!model.status) {
        return `
        <section class="totc-v2-encounter-panel">
            <div class="totc-v2-encounter-panel__empty">Select or control an actor to plan an encounter turn.</div>
        </section>`;
    }

    if (!model.activeEncounter) {
        return `
        <section class="totc-v2-encounter-panel is-empty">
            <div class="totc-v2-encounter-panel__empty">No active encounter.</div>
        </section>`;
    }

    const status = model.status;

    return `
    <section class="totc-v2-encounter-panel" data-combat-id="${escapeHTML(model.combatId)}" data-combatant-id="${escapeHTML(model.combatantId)}">
        <header class="totc-v2-encounter-panel__status">
            ${status.img ? `<img src="${escapeHTML(status.img)}" alt="">` : `<span class="totc-v2-encounter-panel__portrait-fallback">${escapeHTML(status.name.slice(0, 1).toUpperCase())}</span>`}
            <div>
                <h3>${escapeHTML(status.name)}</h3>
                <p>${escapeHTML(model.encounterName)} · Round ${escapeHTML(String(model.round))} · ${escapeHTML(model.phase)}</p>
            </div>
            <dl>
                <div><dt>Health</dt><dd>${escapeHTML(String(status.health.value))}/${escapeHTML(String(status.health.max))}</dd></div>
                <div><dt>Defense</dt><dd>${escapeHTML(String(status.defenseRating))}</dd></div>
                <div><dt>Grit</dt><dd>${escapeHTML(String(status.grit.value))}/${escapeHTML(String(status.grit.max))}</dd></div>
                <div><dt>Effects</dt><dd>${status.effects.length ? status.effects.map((effect) => escapeHTML(effect.name)).join(", ") : "None"}</dd></div>
            </dl>
        </header>

        <section class="totc-v2-encounter-panel__planner">
            <header>
                <h3>Round Planning</h3>
                <span>${escapeHTML(String(model.draftRemainingAp))} AP remaining${model.planningTimeDisplay ? ` · ${escapeHTML(model.planningTimeDisplay)}` : ""}</span>
            </header>
            <div class="totc-v2-encounter-panel__progress" aria-label="Round progress">
                <span class="totc-v2-encounter-panel__progress-fill" style="width:${escapeHTML(String(model.progressPercent ?? 0))}%;"></span>
                <span class="totc-v2-encounter-panel__progress-label">AP ${escapeHTML(String(model.currentTick ?? 0))}/${escapeHTML(String(model.apBudget))} · ${escapeHTML(model.resolutionStatus ?? "idle")}</span>
            </div>
            <div class="totc-v2-encounter-panel__planning-view">
                ${renderNarrativeComposer(model, escapeHTML)}
                ${renderPlanningRolls(model, escapeHTML)}
                ${rollRequestsMarkup ? `
                <section class="totc-v2-encounter-panel__roll-requests" aria-label="Die roll requests">
                    ${rollRequestsMarkup}
                </section>` : ""}
                ${renderNarrativeActionPopover(model, escapeHTML)}
                ${renderNarrativeItemPopover(model, escapeHTML)}
                ${renderNarrativeDurationPopover(model, escapeHTML)}
            </div>
            <footer class="totc-v2-encounter-panel__actions">
                <button type="button" data-action="encounter-clear-plan" ${model.canClearPlan ? "" : "disabled"}>Clear Unlocked</button>
                <button type="button" data-action="encounter-toggle-ready" data-ready="${model.ready ? "true" : "false"}" aria-pressed="${model.ready ? "true" : "false"}" ${model.canCommit ? "" : "disabled"}>Confirm Plan</button>
            </footer>
        </section>

        <section class="totc-v2-encounter-panel__history">
            <h3>Round History</h3>
            ${renderHistoryRows(model, escapeHTML)}
        </section>
    </section>`;
}
