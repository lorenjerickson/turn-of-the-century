const DESIGN_ACTIONS_BY_PANEL = Object.freeze({
    map: [
        { id: "scene.walls", label: "Walls", description: "Draw or revise scene boundaries." },
        { id: "scene.lights", label: "Lights", description: "Place lamps, lanterns, and atmospheric sources." },
        { id: "scene.tokens", label: "Tokens", description: "Stage actors and hazards on the current map." },
        { id: "scene.notes", label: "Notes", description: "Pin investigative clues and private GM annotations." }
    ],
    compendium: [
        { id: "compendium.createItem", label: "Create Item", description: "Draft a new item for the active library." },
        { id: "compendium.import", label: "Import", description: "Bring selected world content into a pack." },
        { id: "compendium.validate", label: "Validate Pack", description: "Check required fields and period tone." }
    ],
    player: [
        { id: "actor.createNpc", label: "Create NPC", description: "Create a supporting character from the current actor context." },
        { id: "actor.tokenDefaults", label: "Token Defaults", description: "Review token display and disposition defaults." }
    ],
    encounter: [
        { id: "encounter.createNpc", label: "Create NPC", description: "Create a combat-ready adversary or bystander." },
        { id: "encounter.seed", label: "Seed Encounter", description: "Build opposition from the current scene context." }
    ],
    tracker: [
        { id: "encounter.createNpc", label: "Create NPC", description: "Add an actor to the current encounter." },
        { id: "encounter.pacing", label: "Round Design", description: "Review initiative and AP pacing assumptions." }
    ],
    market: [
        { id: "market.stock", label: "Add Stock", description: "Add goods or curiosities to the local market." },
        { id: "market.prices", label: "Price Audit", description: "Review affordability and treasury effects." }
    ]
});

const DEFAULT_DESIGN_ACTIONS = Object.freeze([
    { id: "inspect.context", label: "Inspect", description: "Review design details for the active view." },
    { id: "design.issues", label: "Issues", description: "Surface missing data and likely preparation gaps." }
]);

export function getDesignLensActions(panelId) {
    const actions = DESIGN_ACTIONS_BY_PANEL[String(panelId ?? "")] ?? DEFAULT_DESIGN_ACTIONS;
    return actions.map((action) => ({ ...action }));
}

export function buildDesignLensModel({ panel = null, active = false, isGM = false } = {}) {
    const panelId = String(panel?.id ?? "").trim();
    return {
        active: Boolean(active && isGM && panelId),
        panelId,
        title: panel?.title ? `${panel.title} Design` : "Design Lens",
        actions: getDesignLensActions(panelId)
    };
}

export function renderDesignLensSurface(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (!model.active) return "";

    return `
    <aside class="totc-v2-design-lens" data-design-lens-panel-id="${escapeHTML(model.panelId)}">
        <header class="totc-v2-design-lens__header">
            <span>${escapeHTML(model.title)}</span>
        </header>
        <div class="totc-v2-design-lens__actions" role="list">
            ${(model.actions ?? []).map((action) => `
                <button
                    type="button"
                    class="totc-v2-design-lens__action"
                    data-action="design-lens-action"
                    data-design-action-id="${escapeHTML(action.id)}"
                    role="listitem"
                    title="${escapeHTML(action.description)}">
                    <span>${escapeHTML(action.label)}</span>
                </button>`).join("")}
        </div>
    </aside>`;
}
