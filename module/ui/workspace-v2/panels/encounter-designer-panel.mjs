export function buildEncounterDesignerPanelModel({ encounters = [] } = {}) {
    return {
        encounters: encounters.map(e => ({
            id: e.id,
            name: e.name,
            summary: e.system?.profile?.summary || ""
        }))
    };
}

export function renderEncounterDesignerPanel(model, { escapeHTML }) {
    const listMarkup = (model.encounters || []).map(e => `
        <article class="totc-v2-encounter-entry">
            <strong>${escapeHTML(e.name)}</strong>
            <p>${escapeHTML(e.summary)}</p>
        </article>
    `).join("");

    return `
    <section class="totc-v2-encounter-designer">
        <header class="totc-v2-encounter-designer__header">
            <h3>Encounter Designer</h3>
            <button type="button" data-action="create-encounter">New Encounter</button>
        </header>
        <div class="totc-v2-encounter-designer__list">
            ${listMarkup || `<p class="totc-v2-empty-state">No encounters found.</p>`}
        </div>
    </section>`;
}
