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
    return {
        ...action,
        id: String(action.id ?? action.actionId ?? ""),
        actionId: String(action.actionId ?? action.id ?? ""),
        type: String(action.type ?? "action"),
        label: String(action.label ?? "Action"),
        description: String(action.description ?? ""),
        apCost,
        apMin,
        apMax,
        variableAp: Boolean(action.variableAp && apMax > apMin),
        requiresToHit: Boolean(action.requiresToHit),
        toHitBonus: toNumber(action.toHitBonus, 0),
        movementFeet: toNumber(action.movementFeet, 0),
        movementFeetPerAp: toNumber(action.movementFeetPerAp, 0),
        itemId: action.itemId ? String(action.itemId) : "",
        img: String(action.img ?? ""),
        apLabel: action.variableAp && apMax > apMin
            ? `${apMin}-${apMax} AP`
            : `${apCost} AP`
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

function historyRowsFromTimeline({ planner = null, combat = null } = {}) {
    const combatantId = String(planner?.combatantId ?? "").trim();
    const timeline = toArray(combat?.encounterState?.timeline ?? combat?.encounter?.state?.timeline)
        .filter((entry) => !combatantId || String(entry?.combatantId ?? "") === combatantId);
    if (!timeline.length) return [];

    const round = toNumber(combat?.encounterState?.round ?? combat?.round, toNumber(planner?.round, 1));
    const segments = timeline.map((entry, index) => {
        const action = entry?.action ?? {};
        const apStart = Math.max(1, toNumber(action.apStart ?? entry.slot, 1));
        const apEnd = Math.max(apStart, toNumber(action.apEnd ?? entry.slot, apStart));
        return {
            id: `${String(action.id ?? "action")}-${index}`,
            label: String(action.label ?? entry?.outcome?.result ?? "Action"),
            result: String(entry?.outcome?.result ?? ""),
            start: apStart,
            span: Math.max(1, apEnd - apStart + 1)
        };
    });

    return [{
        id: `round-${round}`,
        label: `Round ${round}`,
        apBudget: Math.max(toNumber(planner?.apBudget, 6), ...segments.map((segment) => segment.start + segment.span - 1)),
        segments
    }];
}

export function buildPlayerEncounterPanelModel({ actor = null, planner = null, combat = null, activePlanEditSlot = null } = {}) {
    console.group("[TOTC-DEBUG] buildPlayerEncounterPanelModel");
    console.log("Actor:", actor);
    console.log("Planner:", planner);
    console.log("Combat:", combat);
    if (planner) {
        console.log("Raw Planner Available Actions:", planner.availableActions);
    } else {
        console.warn("Planner is null! availableActions will default to empty.");
    }
    const status = actorStatusModel(actor);
    const apBudget = Math.max(1, toNumber(planner?.apBudget ?? combat?.apBudget, 6));
    
    const rawActions = toArray(planner?.availableActions);
    const mappedActions = rawActions.map(actionOptionModel);
    console.log("Mapped Actions (before ID filtering):", mappedActions);

    const availableActions = mappedActions
        .filter((action) => {
            const hasId = Boolean(action.id);
            if (!hasId) {
                console.warn("Action filtered out because it has no ID:", action);
            }
            return hasId;
        })
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
        
    console.log("Final Filtered/Sorted Available Actions:", availableActions);
    console.log("canBrowseActions will be:", availableActions.length > 0);
    console.groupEnd();

    const plannedActions = toArray(planner?.queue).map(planSegmentModel);

    return {
        actorId: status?.id ?? "",
        combatId: String(planner?.combatId ?? combat?.id ?? ""),
        combatantId: String(planner?.combatantId ?? ""),
        encounterName: String(planner?.encounterName ?? combat?.name ?? "Encounter"),
        phase: String(planner?.phase ?? combat?.phase ?? "planning"),
        round: toNumber(planner?.round ?? combat?.round, 1),
        status,
        apBudget,
        remainingAp: toNumber(planner?.remainingAp, apBudget),
        plannedAp: toNumber(planner?.plannedAp, plannedActions.reduce((sum, action) => sum + action.apCost, 0)),
        planningTimeDisplay: String(planner?.planningTimeDisplay ?? ""),
        canEditPlan: Boolean(planner?.canEditPlan),
        canCommit: Boolean(planner?.canCommit),
        ready: Boolean(planner?.ready),
        availableActions,
        plannedActions,
        hasPlannedActions: plannedActions.length > 0,
        historyRows: historyRowsFromTimeline({ planner, combat }),
        activePlanEditSlot
    };
}

function renderTicks(apBudget) {
    return Array.from({ length: Math.max(1, Number(apBudget) || 1) }, (_, index) => `
        <span class="totc-v2-encounter-panel__tick" style="grid-column:${index + 1};">${index + 1}</span>`).join("");
}

function actionDataAttributes(action, escapeHTML) {
    return [
        ["id", action.id],
        ["action-id", action.actionId],
        ["type", action.type],
        ["label", action.label],
        ["ap-cost", action.apCost],
        ["ap-min", action.apMin],
        ["ap-max", action.apMax],
        ["variable-ap", action.variableAp ? "true" : "false"],
        ["requires-to-hit", action.requiresToHit ? "true" : "false"],
        ["to-hit-bonus", action.toHitBonus],
        ["movement-feet", action.movementFeet],
        ["movement-feet-per-ap", action.movementFeetPerAp],
        ["item-id", action.itemId],
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
        const clickableAttrs = model.canEditPlan
            ? `data-start-tick="${startTick}" style="grid-column:${startTick} / span ${action.span}; cursor:pointer;"`
            : `style="grid-column:${startTick} / span ${action.span};"`;

        return `
            <article class="totc-v2-encounter-panel__segment${action.variableAp ? " is-variable" : ""}"
                draggable="${model.canEditPlan ? "true" : "false"}"
                data-action="encounter-plan-segment"
                ${clickableAttrs}
                ${actionDataAttributes(action, escapeHTML)}
                title="${escapeHTML(action.label)} (${escapeHTML(action.apLabel)})">
                <span>${escapeHTML(action.label)}</span>
                <small>${escapeHTML(action.apLabel)}</small>
                ${model.canEditPlan ? `<button type="button" data-action="encounter-remove-action" data-action-index="${escapeHTML(String(action.index))}" title="Remove ${escapeHTML(action.label)}" aria-label="Remove ${escapeHTML(action.label)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
                ${model.canEditPlan && action.variableAp ? `<span class="totc-v2-encounter-panel__resize" data-action="encounter-resize-action" data-action-index="${escapeHTML(String(action.index))}" title="Resize action duration" aria-hidden="true"></span>` : ""}
            </article>`;
    }).join("");

    let placeholdersMarkup = "";
    if (model.canEditPlan) {
        for (let tick = currentTick; tick <= model.apBudget; tick++) {
            placeholdersMarkup += `
            <div class="totc-v2-encounter-panel__segment is-empty"
                style="grid-column:${tick}; cursor:pointer;"
                data-action="encounter-edit-plan-slot"
                data-action-index="${escapeHTML(String(planned.length))}"
                data-start-tick="${tick}"
                title="Click to add action starting at AP ${tick}">
                <span>+ Add</span>
            </div>`;
        }
    }

    return `
    <div class="totc-v2-encounter-panel__bar" data-action="encounter-plan-bar" data-combatant-id="${escapeHTML(model.combatantId)}" data-ap-budget="${escapeHTML(String(model.apBudget))}" style="--totc-ap-budget:${model.apBudget};">
        ${renderTicks(model.apBudget)}
        ${segmentsMarkup}
        ${placeholdersMarkup}
        ${planned.length || model.canEditPlan ? "" : `<div class="totc-v2-encounter-panel__empty-bar">No planned actions</div>`}
    </div>`;
}

function renderHistoryRows(model, escapeHTML) {
    const rows = model.historyRows ?? [];
    if (!rows.length) return `<p class="totc-v2-encounter-panel__muted">No resolved round history yet.</p>`;
    return rows.map((row) => `
        <article class="totc-v2-encounter-panel__history-row">
            <strong>${escapeHTML(row.label)}</strong>
            <div class="totc-v2-encounter-panel__history-bar" style="--totc-ap-budget:${row.apBudget};">
                ${renderTicks(row.apBudget)}
                ${(row.segments ?? []).map((segment) => `
                    <span class="totc-v2-encounter-panel__history-segment"
                        style="grid-column:${segment.start} / span ${segment.span};"
                        title="${escapeHTML(segment.label)}${segment.result ? `: ${escapeHTML(segment.result)}` : ""}">
                        ${escapeHTML(segment.label)}
                    </span>`).join("")}
            </div>
        </article>`).join("");
}

function renderPlanEditPopup(model, escapeHTML) {
    const slot = model.activePlanEditSlot;
    if (!slot) return "";

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

export function renderPlayerEncounterPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (!model.status) {
        return `
        <section class="totc-v2-encounter-panel">
            <div class="totc-v2-encounter-panel__empty">Select or control an actor to plan an encounter turn.</div>
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
                <span>${escapeHTML(String(model.remainingAp))} AP remaining${model.planningTimeDisplay ? ` · ${escapeHTML(model.planningTimeDisplay)}` : ""}</span>
            </header>
            ${renderPlanBar(model, escapeHTML)}
            <footer class="totc-v2-encounter-panel__actions">
                <button type="button" data-action="encounter-clear-plan" ${model.canEditPlan && model.hasPlannedActions ? "" : "disabled"}>Clear Plan</button>
                <button type="button" data-action="encounter-toggle-ready" data-ready="${model.ready ? "true" : "false"}" aria-pressed="${model.ready ? "true" : "false"}" ${model.canCommit ? "" : "disabled"}>Ready</button>
            </footer>
            ${model.activePlanEditSlot ? renderPlanEditPopup(model, escapeHTML) : ""}
        </section>

        <section class="totc-v2-encounter-panel__history">
            <h3>Previous Round</h3>
            ${renderHistoryRows(model, escapeHTML)}
        </section>
    </section>`;
}
