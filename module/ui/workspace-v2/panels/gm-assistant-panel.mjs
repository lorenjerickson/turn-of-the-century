export function buildGMAssistantPanelModel(state = {}) {
    const promptTextareaHeight = Number(state.promptTextareaHeight ?? 0);
    const elementType = state.elementType || "campaign";
    const actorType = ["hero", "pawn", "villain"].includes(state.actorType) ? state.actorType : "pawn";
    const parentLocationId = String(state.parentLocationId ?? "");
    const parentLocationOptions = [
        { value: "", label: "No parent location", selected: !parentLocationId },
        ...(state.parentLocationOptions ?? []).map((option) => {
            const value = String(option.value ?? option.id ?? "");
            return {
                value,
                label: option.label ?? option.name ?? "Unnamed location",
                selected: value === parentLocationId
            };
        })
    ];

    return {
        elementType,
        prompt: state.prompt || "",
        promptTextareaHeight: Number.isFinite(promptTextareaHeight) && promptTextareaHeight > 0 ? promptTextareaHeight : 0,
        actorType,
        actorTypeOptions: [
            { value: "hero", label: "Hero", selected: actorType === "hero" },
            { value: "pawn", label: "Pawn", selected: actorType === "pawn" },
            { value: "villain", label: "Villain", selected: actorType === "villain" }
        ],
        showActorTypeSelector: elementType === "actor",
        parentLocationId,
        parentLocationOptions,
        showParentLocationSelector: elementType === "location",
        isGenerating: !!state.isGenerating,
        result: state.result || null,
        error: state.error || null,
        options: [
            { value: "campaign", label: "Campaign", selected: state.elementType === "campaign" },
            { value: "scenario", label: "Scenario", selected: state.elementType === "scenario" },
            { value: "encounter-design", label: "Encounter", selected: state.elementType === "encounter-design" },
            { value: "location", label: "Location (Village/Market/etc)", selected: state.elementType === "location" },
            { value: "actor", label: "Actor", selected: state.elementType === "actor" }
        ]
    };
}

export function renderGMAssistantPanel(model, { escapeHTML }) {
    const optionsMarkup = model.options.map(opt => 
        `<option value="${escapeHTML(opt.value)}" ${opt.selected ? "selected" : ""}>${escapeHTML(opt.label)}</option>`
    ).join("");
    const promptHeight = Number(model.promptTextareaHeight ?? 0);
    const promptStyle = Number.isFinite(promptHeight) && promptHeight > 0
        ? ` style="height: ${Math.round(promptHeight)}px;"`
        : "";
    const parentLocationMarkup = model.showParentLocationSelector
        ? `<label class="totc-v2-gm-assistant__field">
                <span>Parent Location</span>
                <select data-action="gm-assistant-set-parent-location">
                    ${model.parentLocationOptions.map((opt) => `<option value="${escapeHTML(opt.value)}" ${opt.selected ? "selected" : ""}>${escapeHTML(opt.label)}</option>`).join("")}
                </select>
            </label>`
        : "";
    const actorTypeMarkup = model.showActorTypeSelector
        ? `<label class="totc-v2-gm-assistant__field">
                <span>Actor Type</span>
                <select data-action="gm-assistant-set-actor-type">
                    ${model.actorTypeOptions.map((opt) => `<option value="${escapeHTML(opt.value)}" ${opt.selected ? "selected" : ""}>${escapeHTML(opt.label)}</option>`).join("")}
                </select>
            </label>`
        : "";

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
            <label class="totc-v2-gm-assistant__field">
                <span>Element Type</span>
                <select data-action="gm-assistant-set-type">
                    ${optionsMarkup}
                </select>
            </label>
            ${parentLocationMarkup}
            ${actorTypeMarkup}
            <label class="totc-v2-gm-assistant__field totc-v2-gm-assistant__field--prompt">
                <span>Prompt</span>
                <textarea data-action="gm-assistant-set-prompt" placeholder="Describe what you want to create..."${promptStyle}>${escapeHTML(model.prompt)}</textarea>
            </label>
            <button type="button" class="totc-v2-gm-assistant__generate-btn" data-action="gm-assistant-generate" ${model.isGenerating || !model.prompt ? "disabled" : ""}>Generate</button>
        </div>
        <div class="totc-v2-gm-assistant__results-area">
            ${resultMarkup}
        </div>
    </section>`;
}
