function clonePanel(panel) {
    return {
        id: panel.id,
        title: panel.title,
        ...(panel.defaultDock ? { defaultDock: panel.defaultDock } : {}),
        ...(panel.roleAccess ? { roleAccess: { ...panel.roleAccess } } : {}),
        ...(Array.isArray(panel.contextTags) ? { contextTags: [...panel.contextTags] } : {})
    };
}

export const DEFAULT_WORKSPACE_PANELS = Object.freeze([
    { id: "gamemaster", title: "Gamemaster", roleAccess: { gmOnly: true }, contextTags: ["gm", "commands"] },
    { id: "scenes", title: "Scenes", defaultDock: "leftDock", contextTags: ["scene", "navigation"] },
    { id: "inspector", title: "Inspector", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "design", "inspection"] },
    { id: "design-issues", title: "Design Issues", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "design", "inspection"] },
    { id: "scene-properties", title: "Scene Properties", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "scene", "design"] },
    { id: "media-browser", title: "Media Browser", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "media", "assets"] },
    { id: "campaign-builder", title: "Campaign Builder", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "campaign", "design"] },
    { id: "scenario-builder", title: "Scenario Builder", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "scenario", "design"] },
    { id: "encounter-designer", title: "Encounter Designer", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "encounter", "design"] },
    { id: "gm-assistant", title: "GM Assistant", defaultDock: "rightDock", roleAccess: { gmOnly: true }, contextTags: ["gm", "llm", "design"] },
    { id: "map", title: "Map", contextTags: ["scene", "navigation"] },
    { id: "travel", title: "Travel", contextTags: ["travel", "exploration"] },
    { id: "encounter", title: "Encounter Planner", contextTags: ["encounter", "combat"] },
    { id: "market", title: "Market", contextTags: ["economy", "inventory"] },
    { id: "player", title: "Player Panel", defaultDock: "rightDock", contextTags: ["player", "actor"] },
    { id: "compendium", title: "Unified Compendium", contextTags: ["items", "search"] },
    { id: "camp", title: "Camp", contextTags: ["camp", "travel"] },
    { id: "chat", title: "Chat and Messages", contextTags: ["chat", "messages"] },
    { id: "roll-feed", title: "Dice and Roll Feed", defaultDock: "bottomDock", contextTags: ["dice", "rolls", "messages"] },
    { id: "tracker", title: "Turn Tracker", contextTags: ["combat", "turns"] }
]);

export class WorkspacePanelRegistry {
    constructor({ panels = DEFAULT_WORKSPACE_PANELS } = {}) {
        this.#panels = panels.map(clonePanel);
        this.#panelMap = new Map(this.#panels.map((panel) => [panel.id, panel]));
    }

    #panels;
    #panelMap;

    getAll() {
        return this.#panels.map(clonePanel);
    }

    get(panelId) {
        const panel = this.#panelMap.get(panelId);
        return panel ? clonePanel(panel) : null;
    }

    has(panelId) {
        return this.#panelMap.has(panelId);
    }

    getAvailability({ isGM = false } = {}) {
        return this.#panels
            .filter((panel) => !panel.roleAccess?.gmOnly || isGM)
            .map(clonePanel);
    }

    getVisibilityModel(visiblePanelIds = new Set()) {
        const visibleIds = visiblePanelIds instanceof Set
            ? visiblePanelIds
            : new Set(Array.isArray(visiblePanelIds) ? visiblePanelIds : []);

        return this.#panels.map((panel) => ({
            id: panel.id,
            title: panel.title,
            visible: visibleIds.has(panel.id)
        }));
    }
}
