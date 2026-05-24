import { DEFAULT_DESIGN_ACTION_REGISTRY } from "../design-action-registry.mjs";

function makeDetail(label, value) {
    return {
        label,
        value: String(value ?? "").trim() || "None"
    };
}

export function buildInspectorPanelModel({
    activePanel = null,
    scene = null,
    combat = null,
    controlledTokens = [],
    isGM = false,
    registry = DEFAULT_DESIGN_ACTION_REGISTRY
} = {}) {
    const panelId = String(activePanel?.id ?? "").trim();
    const actions = registry.getApplicableActions({ panelId, isGM });
    const selectedTokens = Array.isArray(controlledTokens) ? controlledTokens : [];

    return {
        activePanel: {
            id: panelId || "none",
            title: activePanel?.title ?? "Workspace"
        },
        scene: {
            id: scene?.id ?? "",
            name: scene?.name ?? "No active scene"
        },
        details: [
            makeDetail("Scene", scene?.name ?? "No active scene"),
            makeDetail("Selected Tokens", selectedTokens.length),
            makeDetail("Combat", combat ? "Active" : "None"),
            makeDetail("Actions", actions.length)
        ],
        actions
    };
}

export function renderInspectorPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const details = Array.isArray(model.details) ? model.details : [];
    const actions = Array.isArray(model.actions) ? model.actions : [];

    return `
    <section class="totc-v2-inspector-panel">
        <header class="totc-v2-inspector-panel__header">
            <span class="totc-v2-inspector-panel__eyebrow">Inspector</span>
            <h3>${escapeHTML(model.activePanel?.title ?? "Workspace")}</h3>
        </header>
        <dl class="totc-v2-inspector-panel__details">
            ${details.map((detail) => `
                <div class="totc-v2-inspector-panel__detail">
                    <dt>${escapeHTML(detail.label)}</dt>
                    <dd>${escapeHTML(detail.value)}</dd>
                </div>`).join("")}
        </dl>
        <section class="totc-v2-inspector-panel__actions" aria-label="Relevant design actions">
            <h4>Relevant Actions</h4>
            <div class="totc-v2-inspector-panel__action-list" role="list">
                ${actions.length ? actions.map((action) => `
                    <button
                        type="button"
                        class="totc-v2-inspector-panel__action"
                        data-action="inspector-design-action"
                        data-design-action-id="${escapeHTML(action.id)}"
                        data-panel-id="${escapeHTML(model.activePanel?.id ?? "")}"
                        role="listitem"
                        title="${escapeHTML(action.description)}">
                        <span>${escapeHTML(action.label)}</span>
                        <small>${escapeHTML(action.domain)} · ${escapeHTML(action.id)}</small>
                    </button>`).join("") : `<div class="totc-v2-inspector-panel__empty">No actions are relevant to this view.</div>`}
            </div>
        </section>
    </section>`;
}
