export function buildScenarioBuilderPanelModel({ scenarios = [] } = {}) {
    return {
        scenarios: scenarios.map(s => ({
            id: s.id,
            name: s.name,
            summary: s.system?.profile?.summary || ""
        }))
    };
}

export function renderScenarioBuilderPanel(model, { escapeHTML }) {
    const listMarkup = (model.scenarios || []).map(s => `
        <article class="totc-v2-scenario-entry">
            <strong>${escapeHTML(s.name)}</strong>
            <p>${escapeHTML(s.summary)}</p>
        </article>
    `).join("");

    return `
    <section class="totc-v2-scenario-builder">
        <header class="totc-v2-scenario-builder__header">
            <h3>Scenario Builder</h3>
            <button type="button" data-action="create-scenario">New Scenario</button>
        </header>
        <div class="totc-v2-scenario-builder__list">
            ${listMarkup || `<p class="totc-v2-empty-state">No scenarios found.</p>`}
        </div>
    </section>`;
}
