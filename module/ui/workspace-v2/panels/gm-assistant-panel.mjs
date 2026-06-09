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

function clonePlainObject(value) {
    if (!value || typeof value !== "object") return {};
    try {
        return structuredClone(value);
    } catch {
        return { ...value };
    }
}

export function getSerializableSystemData(system = {}) {
    if (!system || typeof system !== "object") return {};

    if (typeof system.toObject === "function") {
        return clonePlainObject(system.toObject());
    }

    if (typeof system.toJSON === "function") {
        return clonePlainObject(system.toJSON());
    }

    if (system._source && typeof system._source === "object") {
        return clonePlainObject(system._source);
    }

    return clonePlainObject(system);
}

export function buildGMAssistantDocumentSystemData(system = {}, elementType = "") {
    const source = getSerializableSystemData(system);
    const profile = source.profile && typeof source.profile === "object" ? source.profile : {};
    const type = String(elementType ?? "").trim();

    if (type === "campaign") {
        return {
            setting: source.setting ?? profile.summary ?? "",
            era: source.era ?? "",
            environment: source.environment ?? profile.environment ?? "",
            culture: source.culture ?? profile.culture ?? "",
            socialClimate: source.socialClimate ?? profile.socialClimate ?? "",
            antagonist: source.antagonist ?? profile.antagonist ?? {},
            motivations: source.motivations ?? profile.motivations ?? profile.antagonist?.motivations ?? "",
            scenarios: source.scenarios ?? []
        };
    }

    if (type === "scenario") {
        return {
            campaignId: source.campaignId ?? "",
            description: source.description ?? profile.description ?? profile.summary ?? "",
            historicalNotes: source.historicalNotes ?? profile.historicalNotes ?? "",
            resolutionCriteria: source.resolutionCriteria ?? profile.resolutionCriteria ?? "",
            encounters: source.encounters ?? []
        };
    }

    if (type === "encounter-design") {
        return {
            scenarioId: source.scenarioId ?? "",
            description: source.description ?? profile.description ?? profile.summary ?? "",
            hazards: source.hazards ?? profile.hazards ?? "",
            npcs: source.npcs ?? profile.npcs ?? []
        };
    }

    if (type === "location") {
        return {
            ...source,
            description: source.description ?? profile.description ?? "",
            notes: source.notes ?? profile.notes ?? "",
            locationType: source.locationType ?? "village",
            parentLocationId: source.parentLocationId ?? ""
        };
    }

    return source;
}

function humanizeKey(key = "") {
    return String(key ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (char) => char.toUpperCase());
}

function stripUnsafeHTML(html = "") {
    return String(html ?? "")
        .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
        .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?\s*>/gi, "")
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "");
}

function renderStringAsHTML(value, { escapeHTML }) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const containsMarkup = /<\/?[a-z][\s\S]*>/i.test(text);
    if (containsMarkup) return stripUnsafeHTML(text);

    return text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

function renderGeneratedValue(key, value, { escapeHTML }, depth = 0) {
    if (value == null || value === "") return "";
    const title = humanizeKey(key);
    const titleTag = depth > 0 ? "h6" : "h5";

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const body = renderStringAsHTML(value, { escapeHTML });
        if (!body) return "";
        return `
            <section class="totc-v2-gm-assistant__generated-section">
                <${titleTag}>${escapeHTML(title)}</${titleTag}>
                <div class="totc-v2-gm-assistant__generated-html">${body}</div>
            </section>`;
    }

    if (Array.isArray(value)) {
        const items = value
            .map((entry, index) => renderGeneratedValue(`${title} ${index + 1}`, entry, { escapeHTML }, depth + 1))
            .filter(Boolean)
            .join("");
        if (!items) return "";
        return `
            <section class="totc-v2-gm-assistant__generated-section">
                <${titleTag}>${escapeHTML(title)}</${titleTag}>
                <div class="totc-v2-gm-assistant__generated-list">${items}</div>
            </section>`;
    }

    if (typeof value === "object") {
        const sections = Object.entries(value)
            .filter(([childKey]) => !String(childKey).startsWith("_"))
            .map(([childKey, childValue]) => renderGeneratedValue(childKey, childValue, { escapeHTML }, depth + 1))
            .filter(Boolean)
            .join("");
        if (!sections) return "";
        return `
            <section class="totc-v2-gm-assistant__generated-section">
                <${titleTag}>${escapeHTML(title)}</${titleTag}>
                <div class="totc-v2-gm-assistant__generated-group">${sections}</div>
            </section>`;
    }

    return "";
}

export function renderGeneratedAssistantContent(result = {}, { escapeHTML }) {
    const hiddenKeys = new Set(["campaignId", "scenarioId", "parentLocationId", "scenarios", "encounters"]);
    const system = getSerializableSystemData(result?.system ?? {});
    const content = Object.entries(system)
        .filter(([key]) => !hiddenKeys.has(key))
        .map(([key, value]) => renderGeneratedValue(key, value, { escapeHTML }))
        .filter(Boolean)
        .join("");

    return content || `<p class="totc-v2-gm-assistant__generated-empty">No generated content was returned.</p>`;
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
        const resultName = model.result.name || "Unnamed Element";
        const resultType = model.elementType;
        const generatedContent = renderGeneratedAssistantContent(model.result, { escapeHTML });
        
        resultMarkup = `
        <article class="totc-v2-gm-assistant__result">
            <header class="totc-v2-gm-assistant__result-header">
                <h4>${escapeHTML(resultName)}</h4>
                <p class="totc-v2-gm-assistant__result-type">${escapeHTML(resultType)}</p>
            </header>
            <div class="totc-v2-gm-assistant__result-content">
                ${generatedContent}
            </div>
            <footer class="totc-v2-gm-assistant__result-actions">
                <button type="button" data-action="gm-assistant-accept">Accept</button>
                <button type="button" data-action="gm-assistant-regenerate">Regenerate</button>
            </footer>
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
