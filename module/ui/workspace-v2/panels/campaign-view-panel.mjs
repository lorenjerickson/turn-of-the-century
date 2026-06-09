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

function getSystemValue(item, key) {
    if (!item?.system || typeof item.system !== "object") return undefined;
    if (typeof item.system.toObject === "function") return item.system.toObject()?.[key];
    if (typeof item.system.toJSON === "function") return item.system.toJSON()?.[key];
    return item.system[key];
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
    const scenarioCampaignId = String(getSystemValue(scenario, "campaignId") ?? "").trim();
    if (scenarioCampaignId && scenarioCampaignId === campaignId) return true;
    return getLinkedIds(getSystemValue(campaign, "scenarios")).has(getItemId(scenario));
}

function hasEncounterLink(scenario, encounter) {
    const scenarioId = getItemId(scenario);
    const encounterScenarioId = String(getSystemValue(encounter, "scenarioId") ?? "").trim();
    if (encounterScenarioId && encounterScenarioId === scenarioId) return true;
    return getLinkedIds(getSystemValue(scenario, "encounters")).has(getItemId(encounter));
}

function sortLinkedChildren(parent, children, key) {
    const orderedIds = toArray(getSystemValue(parent, key)).map((id) => String(id ?? "").trim()).filter(Boolean);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    return [...children].sort((a, b) => {
        const aOrder = order.has(getItemId(a)) ? order.get(getItemId(a)) : Number.MAX_SAFE_INTEGER;
        const bOrder = order.has(getItemId(b)) ? order.get(getItemId(b)) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return sortByName(a, b);
    });
}

function uniqueIds(ids) {
    return [...new Set(toArray(ids).map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function findScenarioParent(scenario, campaigns) {
    const campaignId = String(getSystemValue(scenario, "campaignId") ?? "").trim();
    if (campaignId) return campaigns.find((campaign) => getItemId(campaign) === campaignId) ?? null;
    return campaigns.find((campaign) => getLinkedIds(getSystemValue(campaign, "scenarios")).has(getItemId(scenario))) ?? null;
}

function findEncounterParent(encounter, scenarios) {
    const scenarioId = String(getSystemValue(encounter, "scenarioId") ?? "").trim();
    if (scenarioId) return scenarios.find((scenario) => getItemId(scenario) === scenarioId) ?? null;
    return scenarios.find((scenario) => getLinkedIds(getSystemValue(scenario, "encounters")).has(getItemId(encounter))) ?? null;
}

function insertMovedId(ids, movingId, targetId = "", dropMode = "inside") {
    const withoutMoving = uniqueIds(ids).filter((id) => id !== movingId);
    if (dropMode === "inside" || !targetId) return [...withoutMoving, movingId];
    const targetIndex = withoutMoving.indexOf(targetId);
    if (targetIndex < 0) return [...withoutMoving, movingId];
    const insertIndex = dropMode === "before" ? targetIndex : targetIndex + 1;
    return [
        ...withoutMoving.slice(0, insertIndex),
        movingId,
        ...withoutMoving.slice(insertIndex)
    ];
}

function buildOrderedIdsForParent(parent, children, relationKey) {
    const linked = sortLinkedChildren(parent, children, relationKey).map((child) => getItemId(child));
    return uniqueIds([
        ...toArray(getSystemValue(parent, relationKey)),
        ...linked
    ]);
}

export function getCampaignViewDropMode({ draggedType = "", targetType = "", pointerRatio = 0.5 } = {}) {
    if (draggedType === SCENARIO_TYPE && targetType === CAMPAIGN_TYPE) return "inside";
    if (draggedType === ENCOUNTER_TYPE && targetType === SCENARIO_TYPE) return "inside";
    if (draggedType === SCENARIO_TYPE && targetType === SCENARIO_TYPE) return Number(pointerRatio) < 0.5 ? "before" : "after";
    if (draggedType === ENCOUNTER_TYPE && targetType === ENCOUNTER_TYPE) return Number(pointerRatio) < 0.5 ? "before" : "after";
    return "";
}

export function buildCampaignViewMovePlan({
    items = [],
    draggedId = "",
    targetId = "",
    dropMode = "inside"
} = {}) {
    const allItems = toArray(items);
    const campaigns = allItems.filter((item) => item?.type === CAMPAIGN_TYPE);
    const scenarios = allItems.filter((item) => item?.type === SCENARIO_TYPE);
    const encounters = allItems.filter((item) => item?.type === ENCOUNTER_TYPE);
    const dragged = allItems.find((item) => getItemId(item) === String(draggedId ?? "").trim());
    const target = allItems.find((item) => getItemId(item) === String(targetId ?? "").trim());
    if (!dragged || !target || getItemId(dragged) === getItemId(target)) return null;

    const normalizedMode = String(dropMode ?? "").trim();
    const draggedType = String(dragged.type ?? "").trim();
    const targetType = String(target.type ?? "").trim();
    const movingId = getItemId(dragged);
    const targetItemId = getItemId(target);

    if (draggedType === SCENARIO_TYPE) {
        const targetParent = normalizedMode === "inside" && targetType === CAMPAIGN_TYPE
            ? target
            : targetType === SCENARIO_TYPE
                ? findScenarioParent(target, campaigns)
                : null;
        if (!targetParent) return null;

        const previousParent = findScenarioParent(dragged, campaigns);
        const targetParentId = getItemId(targetParent);
        const targetOrder = insertMovedId(
            buildOrderedIdsForParent(targetParent, scenarios.filter((scenario) => hasScenarioLink(targetParent, scenario)), "scenarios"),
            movingId,
            normalizedMode === "inside" ? "" : targetItemId,
            normalizedMode
        );
        const previousOrder = previousParent && getItemId(previousParent) !== targetParentId
            ? buildOrderedIdsForParent(previousParent, scenarios.filter((scenario) => hasScenarioLink(previousParent, scenario)), "scenarios")
                .filter((id) => id !== movingId)
            : null;

        return {
            itemId: movingId,
            parentId: targetParentId,
            previousParentId: previousParent ? getItemId(previousParent) : "",
            itemUpdate: { "system.campaignId": targetParentId },
            parentUpdate: { "system.scenarios": targetOrder },
            previousParentUpdate: previousOrder ? { "system.scenarios": previousOrder } : null
        };
    }

    if (draggedType === ENCOUNTER_TYPE) {
        const targetParent = normalizedMode === "inside" && targetType === SCENARIO_TYPE
            ? target
            : targetType === ENCOUNTER_TYPE
                ? findEncounterParent(target, scenarios)
                : null;
        if (!targetParent) return null;

        const previousParent = findEncounterParent(dragged, scenarios);
        const targetParentId = getItemId(targetParent);
        const targetOrder = insertMovedId(
            buildOrderedIdsForParent(targetParent, encounters.filter((encounter) => hasEncounterLink(targetParent, encounter)), "encounters"),
            movingId,
            normalizedMode === "inside" ? "" : targetItemId,
            normalizedMode
        );
        const previousOrder = previousParent && getItemId(previousParent) !== targetParentId
            ? buildOrderedIdsForParent(previousParent, encounters.filter((encounter) => hasEncounterLink(previousParent, encounter)), "encounters")
                .filter((id) => id !== movingId)
            : null;

        return {
            itemId: movingId,
            parentId: targetParentId,
            previousParentId: previousParent ? getItemId(previousParent) : "",
            itemUpdate: { "system.scenarioId": targetParentId },
            parentUpdate: { "system.encounters": targetOrder },
            previousParentUpdate: previousOrder ? { "system.encounters": previousOrder } : null
        };
    }

    return null;
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
        const childScenarios = sortLinkedChildren(campaign, scenarios.filter((scenario) => hasScenarioLink(campaign, scenario)), "scenarios");
        childScenarios.forEach((scenario) => scenarioIdsInHierarchy.add(getItemId(scenario)));

        return {
            ...normalizeItem(campaign),
            level: 0,
            expanded: expanded.has(getItemId(campaign)),
            childType: SCENARIO_TYPE,
            children: childScenarios.map((scenario) => {
                const childEncounters = sortLinkedChildren(scenario, encounters.filter((encounter) => hasEncounterLink(scenario, encounter)), "encounters");
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
                .sort(sortByName)
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
            <div class="totc-v2-campaign-view__row${selectedClass}" draggable="true" style="${rowStyle}" data-campaign-view-draggable="true" data-campaign-view-item-id="${escapeHTML(node.id)}" data-campaign-view-item-type="${escapeHTML(node.type)}">
                <div class="totc-v2-campaign-view__drop-indicator totc-v2-campaign-view__drop-indicator--before" aria-hidden="true"></div>
                <div class="totc-v2-campaign-view__drop-indicator totc-v2-campaign-view__drop-indicator--after" aria-hidden="true"></div>
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
