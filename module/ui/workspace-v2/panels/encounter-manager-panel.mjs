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

function planSegmentsFromActions(actions = []) {
    let cursor = 1;
    return toArray(actions).map((action, index) => {
        const cost = Math.max(1, toNumber(action?.apCost, 1));
        const segment = {
            id: String(action?.id ?? action?.actionId ?? `action-${index + 1}`),
            label: String(action?.label ?? `Action ${index + 1}`),
            start: cursor,
            span: cost
        };
        cursor += cost;
        return segment;
    });
}

function planSegmentsFromTimeline(timeline = [], combatantId = "") {
    return toArray(timeline)
        .filter((entry) => String(entry?.combatantId ?? "") === combatantId)
        .map((entry, index) => {
            const action = entry?.action ?? {};
            const start = Math.max(1, toNumber(action.apStart ?? entry.slot, 1));
            const end = Math.max(start, toNumber(action.apEnd ?? entry.slot, start));
            return {
                id: String(action.id ?? action.actionId ?? `resolved-${index + 1}`),
                label: String(action.label ?? entry?.outcome?.result ?? `Action ${index + 1}`),
                start,
                span: Math.max(1, end - start + 1),
                result: String(entry?.outcome?.result ?? "")
            };
        });
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

function buildCombatantSummary(combatant, state, timeline, apBudget) {
    const id = String(combatant?.id ?? "");
    const actor = combatant?.actor ?? null;
    const system = actor?.system ?? {};
    const currentState = combatantState(state, id);
    const plannedSegments = planSegmentsFromActions(currentState.plan);
    const resolvedSegments = planSegmentsFromTimeline(timeline, id);
    const segments = plannedSegments.length ? plannedSegments : resolvedSegments;

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
        segments
    };
}

export function buildEncounterManagerPanelModel({ combat = null } = {}) {
    const state = combat?.encounterState ?? combat?.encounter?.state ?? {};
    const initialized = Boolean(state?.initialized);
    const apBudget = Math.max(1, toNumber(state?.apBudget ?? combat?.apBudget, 6));
    const timeline = toArray(state?.timeline);
    const latestSlot = latestTimelineSlot(timeline);
    const currentTick = Math.max(1, Math.min(apBudget, toNumber(state?.currentEvaluationTick ?? state?.evaluationTick, latestSlot || 1)));

    return {
        active: Boolean(combat),
        initialized,
        combatId: String(combat?.id ?? ""),
        name: String(combat?.name ?? "Encounter"),
        round: toNumber(state?.round ?? combat?.round, 1),
        phase: String(combat?.phase ?? state?.phase ?? "planning"),
        apBudget,
        currentTick,
        canStartRound: Boolean(combat?.initializeEncounterRound),
        canResolveRound: Boolean(combat?.resolveEncounterRound),
        canSetPhase: Boolean(combat?.setEncounterPhase),
        actors: combatantContents(combat?.combatants).map((combatant) => buildCombatantSummary(combatant, state, timeline, apBudget)),
        lastNarrative: latestSlotNarrative(timeline, latestSlot),
        lastEvaluatedTick: latestSlot || null
    };
}

function renderTicks(apBudget) {
    return Array.from({ length: Math.max(1, Number(apBudget) || 1) }, (_, index) => `
        <span class="totc-v2-encounter-manager__tick" style="grid-column:${index + 1};">${index + 1}</span>`).join("");
}

function renderPlanBar(actor, currentTick, escapeHTML) {
    const tick = Math.max(1, Math.min(actor.apBudget, toNumber(currentTick, 1)));
    return `
        <div class="totc-v2-encounter-manager__plan" style="--totc-ap-budget:${actor.apBudget};--totc-current-tick:${tick};">
            ${renderTicks(actor.apBudget)}
            <span class="totc-v2-encounter-manager__current-line" aria-hidden="true"></span>
            ${(actor.segments ?? []).map((segment) => `
                <span class="totc-v2-encounter-manager__segment"
                    style="grid-column:${segment.start} / span ${segment.span};"
                    title="${escapeHTML(segment.label)}${segment.result ? `: ${escapeHTML(segment.result)}` : ""}">
                    ${escapeHTML(segment.label)}
                </span>`).join("")}
            ${(actor.segments ?? []).length ? "" : `<span class="totc-v2-encounter-manager__empty-plan">No plan</span>`}
        </div>`;
}

function renderActorSummary(actor, currentTick, escapeHTML) {
    const conditions = actor.conditions.length ? actor.conditions.join(", ") : "None";
    return `
        <details class="totc-v2-encounter-manager__actor" open>
            <summary>
                ${actor.img ? `<img src="${escapeHTML(actor.img)}" alt="">` : `<span class="totc-v2-encounter-manager__portrait-fallback">${escapeHTML(actor.name.slice(0, 1).toUpperCase())}</span>`}
                <span class="totc-v2-encounter-manager__actor-name">${escapeHTML(actor.name)}</span>
                <span class="totc-v2-encounter-manager__actor-status">${escapeHTML(String(actor.health.value))}/${escapeHTML(String(actor.health.max))} HP</span>
                <span class="totc-v2-encounter-manager__actor-ready">${actor.ready ? "Ready" : "Planning"}</span>
            </summary>
            <div class="totc-v2-encounter-manager__actor-body">
                <dl>
                    <div><dt>Health</dt><dd>${escapeHTML(String(actor.health.value))}/${escapeHTML(String(actor.health.max))}</dd></div>
                    <div><dt>Conditions</dt><dd>${escapeHTML(conditions)}</dd></div>
                </dl>
                ${renderPlanBar(actor, currentTick, escapeHTML)}
            </div>
        </details>`;
}

export function renderEncounterManagerPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (!model.active) {
        return `
        <section class="totc-v2-encounter-manager">
            <div class="totc-v2-encounter-manager__empty">No active encounter.</div>
        </section>`;
    }

    return `
    <section class="totc-v2-encounter-manager">
        <header class="totc-v2-encounter-manager__header">
            <div>
                <h3>${escapeHTML(model.name)}</h3>
                <p>Round ${escapeHTML(String(model.round))} · ${escapeHTML(model.phase)} · AP ${escapeHTML(String(model.currentTick))}</p>
            </div>
            <span>${escapeHTML(String(model.actors.length))} actors</span>
        </header>

        <div class="totc-v2-encounter-manager__controls">
            <button type="button" data-action="encounter-manager-start-round" ${model.canStartRound ? "" : "disabled"}>New Round</button>
            <button type="button" data-action="encounter-manager-set-phase" data-phase="locked" ${model.canSetPhase && model.phase === "planning" ? "" : "disabled"}>Lock Plans</button>
            <button type="button" data-action="encounter-manager-set-phase" data-phase="planning" ${model.canSetPhase && model.phase !== "planning" ? "" : "disabled"}>Reopen Planning</button>
            <button type="button" data-action="encounter-manager-resolve-round" ${model.canResolveRound ? "" : "disabled"}>Resolve Round</button>
        </div>

        <section class="totc-v2-encounter-manager__actors" style="--totc-ap-budget:${model.apBudget};--totc-current-tick:${model.currentTick};">
            <span class="totc-v2-encounter-manager__actors-current-line" aria-hidden="true"></span>
            ${model.actors.length
                ? model.actors.map((actor) => renderActorSummary(actor, model.currentTick, escapeHTML)).join("")
                : `<p class="totc-v2-encounter-manager__empty">No actors in this encounter.</p>`}
        </section>

        <section class="totc-v2-encounter-manager__narrative">
            <h3>Last Evaluated AP${model.lastEvaluatedTick ? ` ${escapeHTML(String(model.lastEvaluatedTick))}` : ""}</h3>
            <p>${model.lastNarrative ? escapeHTML(model.lastNarrative) : "No AP slot has been evaluated yet."}</p>
        </section>
    </section>`;
}
