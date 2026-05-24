import { DEFAULT_DESIGN_ACTION_REGISTRY } from "../design-action-registry.mjs";

function normalizeQuery(value) {
    return String(value ?? "").trim().toLowerCase();
}

function actionMatchesQuery(action, query) {
    if (!query) return true;
    return [
        action.id,
        action.label,
        action.description,
        action.domain,
        ...(action.contexts ?? [])
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

export function buildDesignCommandPaletteModel({
    active = false,
    activePanel = null,
    isGM = false,
    query = "",
    registry = DEFAULT_DESIGN_ACTION_REGISTRY,
    limit = 12
} = {}) {
    const panelId = String(activePanel?.id ?? "").trim();
    const normalizedQuery = normalizeQuery(query);
    const normalizedLimit = Math.max(1, Number(limit) || 12);
    const actions = registry
        .getApplicableActions({ panelId, isGM })
        .filter((action) => actionMatchesQuery(action, normalizedQuery))
        .slice(0, normalizedLimit);

    return {
        active: Boolean(active && isGM),
        activePanelId: panelId,
        activePanelTitle: activePanel?.title ?? "",
        query: String(query ?? ""),
        actions
    };
}

export function renderDesignCommandPalette(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (!model.active) return "";

    return `
    <section class="totc-v2-design-command-palette" data-design-command-palette="true" role="dialog" aria-label="Design command palette">
        <header class="totc-v2-design-command-palette__header">
            <div>
                <span class="totc-v2-design-command-palette__title">Design Commands</span>
                <span class="totc-v2-design-command-palette__context">${escapeHTML(model.activePanelTitle || "Workspace")}</span>
            </div>
            <button type="button" data-action="toggle-design-command-palette" title="Close command palette" aria-label="Close command palette">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </header>
        <label class="totc-v2-design-command-palette__search">
            <span>Filter commands</span>
            <input type="search" data-action="design-command-palette-search" value="${escapeHTML(model.query)}" placeholder="Search design actions">
        </label>
        <div class="totc-v2-design-command-palette__list" role="list">
            ${model.actions?.length ? model.actions.map((action) => `
                <button
                    type="button"
                    class="totc-v2-design-command-palette__action"
                    data-action="design-command-palette-execute"
                    data-design-action-id="${escapeHTML(action.id)}"
                    data-panel-id="${escapeHTML(model.activePanelId)}"
                    role="listitem"
                    title="${escapeHTML(action.description)}">
                    <span class="totc-v2-design-command-palette__action-label">${escapeHTML(action.label)}</span>
                    <span class="totc-v2-design-command-palette__action-meta">${escapeHTML(action.domain)} · ${escapeHTML(action.id)}</span>
                </button>`).join("") : `<div class="totc-v2-design-command-palette__empty">No design commands match.</div>`}
        </div>
    </section>`;
}
