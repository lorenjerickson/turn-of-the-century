import { DEFAULT_DESIGN_ACTION_REGISTRY } from "../design-action-registry.mjs";

export function getDesignLensActions(panelId, { registry = DEFAULT_DESIGN_ACTION_REGISTRY, isGM = true } = {}) {
    return registry.getApplicableActions({ panelId, isGM });
}

export function buildDesignLensModel({ panel = null, active = false, isGM = false, registry = DEFAULT_DESIGN_ACTION_REGISTRY } = {}) {
    const panelId = String(panel?.id ?? "").trim();
    return {
        active: Boolean(active && isGM && panelId),
        panelId,
        title: panel?.title ? `${panel.title} Design` : "Design Lens",
        actions: getDesignLensActions(panelId, { registry, isGM })
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
