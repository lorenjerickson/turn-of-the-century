export function buildGMAssistantPanelModel(state = {}) {
    return {
        elementType: state.elementType || "campaign",
        prompt: state.prompt || "",
        isGenerating: !!state.isGenerating,
        result: state.result || null,
        error: state.error || null,
        options: [
            { value: "campaign", label: "Campaign", selected: state.elementType === "campaign" },
            { value: "scenario", label: "Scenario", selected: state.elementType === "scenario" },
            { value: "encounter-design", label: "Encounter", selected: state.elementType === "encounter-design" },
            { value: "location", label: "Location (Village/Market/etc)", selected: state.elementType === "location" },
            { value: "pawn", label: "NPC (Pawn)", selected: state.elementType === "pawn" }
        ]
    };
}

export function renderGMAssistantPanel(model, { escapeHTML }) {
    const optionsMarkup = model.options.map(opt => 
        `<option value="${escapeHTML(opt.value)}" ${opt.selected ? "selected" : ""}>${escapeHTML(opt.label)}</option>`
    ).join("");

    let resultMarkup = "";
    if (model.isGenerating) {
        resultMarkup = `<div class="totc-v2-gm-assistant__loading">
            <i class="fas fa-spinner fa-spin"></i> Generating content...
        </div>`;
    } else if (model.error) {
        resultMarkup = `<div class="totc-v2-gm-assistant__error">
            <i class="fas fa-exclamation-triangle"></i> ${escapeHTML(model.error)}
        </div>`;
    } else if (model.result) {
        // Pretty print the top level properties of the generated item
        const resultName = model.result.name || "Unnamed Element";
        const resultType = model.elementType;
        const profile = model.result.system?.profile || {};
        
        let detailsMarkup = "";
        for (const [key, value] of Object.entries(profile)) {
            if (typeof value === "string") {
                detailsMarkup += `<div><strong>${escapeHTML(key)}:</strong> ${escapeHTML(value.substring(0, 100))}${value.length > 100 ? "..." : ""}</div>`;
            }
        }
        
        resultMarkup = `
        <article class="totc-v2-gm-assistant__result">
            <h4>${escapeHTML(resultName)}</h4>
            <p class="totc-v2-gm-assistant__result-type">${escapeHTML(resultType)}</p>
            <div class="totc-v2-gm-assistant__result-details">
                ${detailsMarkup}
            </div>
            <div class="totc-v2-gm-assistant__result-actions">
                <button type="button" data-action="gm-assistant-accept">Accept</button>
                <button type="button" data-action="gm-assistant-regenerate">Regenerate</button>
            </div>
        </article>`;
    } else {
        resultMarkup = `<div class="totc-v2-gm-assistant__empty">No active generation.</div>`;
    }

    return `
    <section class="totc-v2-gm-assistant">
        <header class="totc-v2-gm-assistant__header">
            <h3>GM Assistant</h3>
        </header>
        <div class="totc-v2-gm-assistant__input-group">
            <label>Element Type
                <select data-action="gm-assistant-set-type">
                    ${optionsMarkup}
                </select>
            </label>
            <label>Prompt
                <textarea data-action="gm-assistant-set-prompt" placeholder="Describe what you want to create...">${escapeHTML(model.prompt)}</textarea>
            </label>
            <button type="button" class="totc-v2-gm-assistant__generate-btn" data-action="gm-assistant-generate" ${model.isGenerating || !model.prompt ? "disabled" : ""}>Generate</button>
        </div>
        <div class="totc-v2-gm-assistant__results-area">
            ${resultMarkup}
        </div>
    </section>`;
}
