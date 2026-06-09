import { renderGeneratedAssistantContent } from "./gm-assistant-panel.mjs";

const CAMPAIGN_TYPE = "campaign";
const SCENARIO_TYPE = "scenario";
const ENCOUNTER_TYPE = "encounter-design";

function toArray(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function getItemId(item) {
    return String(item?.id ?? item?._id ?? "").trim();
}

function getLinkedIds(value) {
    return new Set(toArray(value).map((id) => String(id ?? "").trim()).filter(Boolean));
}

function sortByName(a, b) {
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function summarize(item) {
    return String(item?.system?.profile?.summary
        ?? item?.system?.setting
        ?? item?.system?.locationType
        ?? ""
    ).trim();
}

function getTypeLabel(type = "") {
    if (type === CAMPAIGN_TYPE) return "Campaign";
    if (type === SCENARIO_TYPE) return "Scenario";
    if (type === ENCOUNTER_TYPE) return "Encounter";
    return "Item";
}

function normalizeItem(item) {
    return {
        id: getItemId(item),
        name: String(item?.name ?? "Unnamed").trim() || "Unnamed",
        type: String(item?.type ?? "").trim(),
        summary: summarize(item),
        document: item
    };
}

function hasScenarioLink(campaign, scenario) {
    const campaignId = getItemId(campaign);
    const scenarioCampaignId = String(scenario?.system?.campaignId ?? "").trim();
    if (scenarioCampaignId && scenarioCampaignId === campaignId) return true;
    return getLinkedIds(campaign?.system?.scenarios).has(getItemId(scenario));
}

function hasEncounterLink(scenario, encounter) {
    const scenarioId = getItemId(scenario);
    const encounterScenarioId = String(encounter?.system?.scenarioId ?? "").trim();
    if (encounterScenarioId && encounterScenarioId === scenarioId) return true;
    return getLinkedIds(scenario?.system?.encounters).has(getItemId(encounter));
}

export function buildCampaignViewPanelModel({
    items = [],
    expandedIds = [],
    selectedId = ""
} = {}) {
    const allItems = toArray(items);
    const campaigns = allItems.filter((item) => item?.type === CAMPAIGN_TYPE).sort(sortByName);
    const scenarios = allItems.filter((item) => item?.type === SCENARIO_TYPE).sort(sortByName);
    const encounters = allItems.filter((item) => item?.type === ENCOUNTER_TYPE).sort(sortByName);
    const expanded = new Set(toArray(expandedIds).map((id) => String(id ?? "").trim()).filter(Boolean));
    const selected = String(selectedId ?? "").trim();

    const scenarioIdsInHierarchy = new Set();
    const encounterIdsInHierarchy = new Set();
    const campaignNodes = campaigns.map((campaign) => {
        const childScenarios = scenarios.filter((scenario) => hasScenarioLink(campaign, scenario));
        childScenarios.forEach((scenario) => scenarioIdsInHierarchy.add(getItemId(scenario)));

        return {
            ...normalizeItem(campaign),
            level: 0,
            expanded: expanded.has(getItemId(campaign)),
            childType: SCENARIO_TYPE,
            children: childScenarios.map((scenario) => {
                const childEncounters = encounters.filter((encounter) => hasEncounterLink(scenario, encounter));
                childEncounters.forEach((encounter) => encounterIdsInHierarchy.add(getItemId(encounter)));
                return {
                    ...normalizeItem(scenario),
                    level: 1,
                    expanded: expanded.has(getItemId(scenario)),
                    childType: ENCOUNTER_TYPE,
                    children: childEncounters.map((encounter) => ({
                        ...normalizeItem(encounter),
                        level: 2,
                        expanded: false,
                        childType: "",
                        children: []
                    }))
                };
            })
        };
    });

    const orphanScenarios = scenarios.filter((scenario) => !scenarioIdsInHierarchy.has(getItemId(scenario)));
    const orphanEncounters = encounters.filter((encounter) => !encounterIdsInHierarchy.has(getItemId(encounter)));
    const fallbackSelection = campaignNodes[0]?.id
        ?? orphanScenarios[0]?.id
        ?? orphanEncounters[0]?.id
        ?? "";
    const selectedDocument = allItems.find((item) => getItemId(item) === (selected || fallbackSelection)) ?? null;

    return {
        title: "Campaign View",
        selectedId: getItemId(selectedDocument),
        selected: selectedDocument ? normalizeItem(selectedDocument) : null,
        campaigns: campaignNodes,
        orphanScenarios: orphanScenarios.map((scenario) => ({
            ...normalizeItem(scenario),
            level: 1,
            expanded: expanded.has(getItemId(scenario)),
            childType: ENCOUNTER_TYPE,
            children: encounters
                .filter((encounter) => hasEncounterLink(scenario, encounter))
                .map((encounter) => ({ ...normalizeItem(encounter), level: 2, children: [], childType: "" }))
        })),
        orphanEncounters: orphanEncounters.map((encounter) => ({
            ...normalizeItem(encounter),
            level: 2,
            children: [],
            childType: ""
        }))
    };
}

function renderNode(node, { escapeHTML }) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const canAddChild = Boolean(node.childType);
    const selectedClass = node.selected ? " is-selected" : "";
    const expandedClass = node.expanded ? " is-expanded" : "";
    const rowStyle = `--totc-campaign-level:${node.level ?? 0}`;
    const childMarkup = hasChildren && node.expanded
        ? `<div class="totc-v2-campaign-view__children">${node.children.map((child) => renderNode(child, { escapeHTML })).join("")}</div>`
        : "";

    return `
        <div class="totc-v2-campaign-view__node${expandedClass}" data-campaign-view-node-id="${escapeHTML(node.id)}">
            <div class="totc-v2-campaign-view__row${selectedClass}" style="${rowStyle}">
                <button type="button" class="totc-v2-campaign-view__twisty" data-action="campaign-view-toggle" data-item-id="${escapeHTML(node.id)}" aria-label="${node.expanded ? "Collapse" : "Expand"} ${escapeHTML(node.name)}" aria-expanded="${node.expanded ? "true" : "false"}" ${hasChildren ? "" : "disabled"}>
                    <i class="fa-solid ${node.expanded ? "fa-chevron-down" : "fa-chevron-right"}" aria-hidden="true"></i>
                </button>
                <button type="button" class="totc-v2-campaign-view__select" data-action="campaign-view-select" data-item-id="${escapeHTML(node.id)}">
                    <span class="totc-v2-campaign-view__type">${escapeHTML(getTypeLabel(node.type))}</span>
                    <span class="totc-v2-campaign-view__name">${escapeHTML(node.name)}</span>
                </button>
                ${canAddChild ? `
                <button type="button" class="totc-v2-campaign-view__icon-action" data-action="campaign-view-create-child" data-parent-id="${escapeHTML(node.id)}" data-child-type="${escapeHTML(node.childType)}" title="Add ${escapeHTML(getTypeLabel(node.childType))}" aria-label="Add ${escapeHTML(getTypeLabel(node.childType))}">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                </button>
                <button type="button" class="totc-v2-campaign-view__icon-action" data-action="campaign-view-generate-child" data-parent-id="${escapeHTML(node.id)}" data-child-type="${escapeHTML(node.childType)}" title="Generate ${escapeHTML(getTypeLabel(node.childType))}" aria-label="Generate ${escapeHTML(getTypeLabel(node.childType))}">
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                </button>` : ""}
            </div>
            ${childMarkup}
        </div>`;
}

function renderDetail(selected, { escapeHTML }) {
    if (!selected) {
        return `<div class="totc-v2-campaign-view__empty-detail">Select or create a campaign item.</div>`;
    }

    return `
        <article class="totc-v2-campaign-view__detail-card">
            <header class="totc-v2-campaign-view__detail-header">
                <p>${escapeHTML(getTypeLabel(selected.type))}</p>
                <h3>${escapeHTML(selected.name)}</h3>
                ${selected.summary ? `<span>${escapeHTML(selected.summary)}</span>` : ""}
            </header>
            <div class="totc-v2-campaign-view__detail-content">
                ${renderGeneratedAssistantContent({ system: selected.document?.system ?? {} }, { escapeHTML })}
            </div>
        </article>`;
}

export function renderCampaignViewPanel(model = {}, { escapeHTML }) {
    const campaignMarkup = (model.campaigns ?? []).map((campaign) => {
        const selectedCampaign = {
            ...campaign,
            selected: campaign.id === model.selectedId,
            children: campaign.children.map((scenario) => ({
                ...scenario,
                selected: scenario.id === model.selectedId,
                children: scenario.children.map((encounter) => ({
                    ...encounter,
                    selected: encounter.id === model.selectedId
                }))
            }))
        };
        return renderNode(selectedCampaign, { escapeHTML });
    }).join("");

    const orphanMarkup = [
        ...(model.orphanScenarios ?? []),
        ...(model.orphanEncounters ?? [])
    ].map((node) => renderNode({ ...node, selected: node.id === model.selectedId }, { escapeHTML })).join("");

    return `
    <section class="totc-v2-campaign-view">
        <header class="totc-v2-campaign-view__header">
            <h3>${escapeHTML(model.title ?? "Campaign View")}</h3>
            <button type="button" class="totc-v2-campaign-view__new-campaign" data-action="campaign-view-create-root">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                <span>Campaign</span>
            </button>
        </header>
        <div class="totc-v2-campaign-view__body">
            <nav class="totc-v2-campaign-view__tree" aria-label="Campaign hierarchy">
                ${campaignMarkup || `<p class="totc-v2-campaign-view__empty">No campaigns found.</p>`}
                ${orphanMarkup ? `<section class="totc-v2-campaign-view__orphans"><h4>Unlinked Content</h4>${orphanMarkup}</section>` : ""}
            </nav>
            <section class="totc-v2-campaign-view__detail">
                ${renderDetail(model.selected, { escapeHTML })}
            </section>
        </div>
    </section>`;
}
