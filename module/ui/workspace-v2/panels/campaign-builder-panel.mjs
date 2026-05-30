export function buildCampaignBuilderPanelModel({ campaigns = [] } = {}) {
    return {
        campaigns: campaigns.map(c => ({
            id: c.id,
            name: c.name,
            summary: c.system?.profile?.summary || ""
        }))
    };
}

export function renderCampaignBuilderPanel(model, { escapeHTML }) {
    const listMarkup = (model.campaigns || []).map(c => `
        <article class="totc-v2-campaign-entry">
            <strong>${escapeHTML(c.name)}</strong>
            <p>${escapeHTML(c.summary)}</p>
        </article>
    `).join("");

    return `
    <section class="totc-v2-campaign-builder">
        <header class="totc-v2-campaign-builder__header">
            <h3>Campaign Builder</h3>
            <button type="button" data-action="create-campaign">New Campaign</button>
        </header>
        <div class="totc-v2-campaign-builder__list">
            ${listMarkup || `<p class="totc-v2-empty-state">No campaigns found.</p>`}
        </div>
    </section>`;
}
