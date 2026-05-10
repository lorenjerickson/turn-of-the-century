/**
 * Workspace Tab Group Manager
 * 
 * Manages custom panel organization into tab groups, allowing users to:
 * - Create multiple tab groups
 * - Move panels between groups
 * - Switch between tabs within a group
 * - Persist tab configuration across sessions
 * - Reset to default layout
 */

const DEFAULT_TAB_CONFIG = Object.freeze({
    groups: [
        {
            id: "main-group",
            name: "Main",
            tabs: [
                { id: "encounter-tab", panelContext: "encounter", label: "Encounter" },
                { id: "travel-tab", panelContext: "travel", label: "Travel" },
                { id: "market-tab", panelContext: "market", label: "Market" },
                { id: "camp-tab", panelContext: "camp", label: "Camp" }
            ],
            activeTab: "encounter-tab"
        }
    ]
});

export class TotcTabGroupManager {
    constructor(scene) {
        this.scene = scene;
        this.config = this._loadConfig();
    }

    /**
     * Load tab configuration from scene flag
     */
    _loadConfig() {
        if (!this.scene) return foundry.utils.deepClone(DEFAULT_TAB_CONFIG);

        const stored = this.scene.getFlag("turn-of-the-century", "tabGroupConfig");
        return stored ? foundry.utils.deepClone(stored) : foundry.utils.deepClone(DEFAULT_TAB_CONFIG);
    }

    /**
     * Save tab configuration to scene flag
     */
    async _saveConfig() {
        if (!this.scene) return;
        await this.scene.setFlag("turn-of-the-century", "tabGroupConfig", foundry.utils.deepClone(this.config));
    }

    /**
     * Get all tab groups
     */
    getGroups() {
        return this.config.groups || [];
    }

    /**
     * Get a specific group by ID
     */
    getGroup(groupId) {
        return this.config.groups?.find((g) => g.id === groupId) ?? null;
    }

    /**
     * Get all tabs in a group
     */
    getGroupTabs(groupId) {
        const group = this.getGroup(groupId);
        return group?.tabs ?? [];
    }

    /**
     * Get the currently active tab in a group
     */
    getActiveTab(groupId) {
        const group = this.getGroup(groupId);
        if (!group) return null;

        const activeTabId = group.activeTab;
        return group.tabs?.find((t) => t.id === activeTabId) ?? null;
    }

    /**
     * Set active tab in a group
     */
    async setActiveTab(groupId, tabId) {
        const group = this.getGroup(groupId);
        if (!group) return false;

        const tab = group.tabs?.find((t) => t.id === tabId);
        if (!tab) return false;

        group.activeTab = tabId;
        await this._saveConfig();
        return true;
    }

    /**
     * Create a new tab group
     */
    async createGroup(groupName = "New Group") {
        const groupId = `group-${Date.now()}`;
        const newGroup = {
            id: groupId,
            name: groupName,
            tabs: [],
            activeTab: null
        };

        this.config.groups = this.config.groups || [];
        this.config.groups.push(newGroup);
        await this._saveConfig();

        return newGroup;
    }

    /**
     * Delete a tab group
     */
    async deleteGroup(groupId) {
        if (!this.config.groups) return false;

        const initialLength = this.config.groups.length;
        this.config.groups = this.config.groups.filter((g) => g.id !== groupId);

        if (this.config.groups.length < initialLength) {
            await this._saveConfig();
            return true;
        }

        return false;
    }

    /**
     * Rename a group
     */
    async renameGroup(groupId, newName) {
        const group = this.getGroup(groupId);
        if (!group) return false;

        group.name = String(newName || "Unnamed Group");
        await this._saveConfig();
        return true;
    }

    /**
     * Add a tab to a group
     */
    async addTab(groupId, panelContext, tabLabel = null) {
        const group = this.getGroup(groupId);
        if (!group) return null;

        group.tabs = group.tabs || [];

        // Prevent duplicates
        if (group.tabs.some((t) => t.panelContext === panelContext)) {
            return null;
        }

        const tabId = `tab-${panelContext}-${Date.now()}`;
        const newTab = {
            id: tabId,
            panelContext,
            label: tabLabel || panelContext.charAt(0).toUpperCase() + panelContext.slice(1)
        };

        group.tabs.push(newTab);

        // Set as active if this is the first tab
        if (!group.activeTab) {
            group.activeTab = tabId;
        }

        await this._saveConfig();
        return newTab;
    }

    /**
     * Remove a tab from a group
     */
    async removeTab(groupId, tabId) {
        const group = this.getGroup(groupId);
        if (!group || !group.tabs) return false;

        const initialLength = group.tabs.length;
        group.tabs = group.tabs.filter((t) => t.id !== tabId);

        if (group.tabs.length < initialLength) {
            // Update activeTab if it was the deleted tab
            if (group.activeTab === tabId) {
                group.activeTab = group.tabs[0]?.id ?? null;
            }

            await this._saveConfig();
            return true;
        }

        return false;
    }

    /**
     * Move a tab from one group to another
     */
    async moveTabToGroup(fromGroupId, toGroupId, tabId) {
        const fromGroup = this.getGroup(fromGroupId);
        const toGroup = this.getGroup(toGroupId);

        if (!fromGroup || !toGroup) return false;

        // Find and remove tab from source group
        const tab = fromGroup.tabs?.find((t) => t.id === tabId);
        if (!tab) return false;

        fromGroup.tabs = fromGroup.tabs.filter((t) => t.id !== tabId);

        // Update activeTab in source if needed
        if (fromGroup.activeTab === tabId) {
            fromGroup.activeTab = fromGroup.tabs[0]?.id ?? null;
        }

        // Add tab to target group
        toGroup.tabs = toGroup.tabs || [];
        toGroup.tabs.push(tab);

        // Set as active in target if it's the first tab
        if (!toGroup.activeTab) {
            toGroup.activeTab = tabId;
        }

        await this._saveConfig();
        return true;
    }

    /**
     * Reorder tabs within a group
     */
    async reorderTabs(groupId, tabIds) {
        const group = this.getGroup(groupId);
        if (!group || !group.tabs) return false;

        // Create map of old tabs
        const tabMap = new Map(group.tabs.map((t) => [t.id, t]));

        // Rebuild tabs array in new order
        const reordered = [];
        for (const tabId of tabIds) {
            const tab = tabMap.get(tabId);
            if (tab) reordered.push(tab);
        }

        // Only update if all tabs were found
        if (reordered.length === group.tabs.length) {
            group.tabs = reordered;
            await this._saveConfig();
            return true;
        }

        return false;
    }

    /**
     * Reset to default layout
     */
    async resetToDefault() {
        this.config = foundry.utils.deepClone(DEFAULT_TAB_CONFIG);
        await this._saveConfig();
        return this.config;
    }

    /**
     * Export tab configuration as JSON
     */
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import tab configuration from JSON
     */
    async importConfig(jsonString) {
        try {
            const imported = JSON.parse(jsonString);

            // Validate structure
            if (!imported.groups || !Array.isArray(imported.groups)) {
                return false;
            }

            this.config = imported;
            await this._saveConfig();
            return true;
        } catch (err) {
            console.error("[TabGroupManager] Import failed:", err);
            return false;
        }
    }

    /**
     * Get detailed group info including active panel
     */
    getGroupDetails(groupId) {
        const group = this.getGroup(groupId);
        if (!group) return null;

        const activeTab = this.getActiveTab(groupId);

        return {
            id: group.id,
            name: group.name,
            tabCount: group.tabs?.length ?? 0,
            tabs: group.tabs ?? [],
            activeTab,
            activePanelContext: activeTab?.panelContext ?? null
        };
    }

    /**
     * Check if a panel context is in any tab
     */
    hasPanelInTabs(panelContext) {
        return this.config.groups?.some((g) =>
            g.tabs?.some((t) => t.panelContext === panelContext)
        ) ?? false;
    }

    /**
     * Get all panel contexts not currently in any tab
     */
    getUnreferencedPanels(availablePanels = ["encounter", "travel", "market", "camp"]) {
        return availablePanels.filter((panel) => !this.hasPanelInTabs(panel));
    }

    /**
     * Create a quick layout with all panels in separate tabs
     */
    async createSeparateTabsLayout() {
        await this.resetToDefault();

        const mainGroup = this.config.groups[0];
        if (!mainGroup) return false;

        mainGroup.tabs = [
            { id: "tab-encounter", panelContext: "encounter", label: "Encounter" },
            { id: "tab-travel", panelContext: "travel", label: "Travel" },
            { id: "tab-market", panelContext: "market", label: "Market" },
            { id: "tab-camp", panelContext: "camp", label: "Camp" }
        ];
        mainGroup.activeTab = "tab-encounter";

        await this._saveConfig();
        return true;
    }

    /**
     * Create a quick layout with grouped tabs
     */
    async createGroupedLayout() {
        await this.resetToDefault();

        const playGroup = await this.createGroup("Play");
        const planGroup = await this.createGroup("Plan");

        // Play group: Encounter + Camp
        await this.addTab(playGroup.id, "encounter", "Combat");
        await this.addTab(playGroup.id, "camp", "Rest");

        // Plan group: Travel + Market
        await this.addTab(planGroup.id, "travel", "Journey");
        await this.addTab(planGroup.id, "market", "Trade");

        return true;
    }
}

/**
 * Console API for managing tab groups
 */
export class TabGroupConsoleAPI {
    constructor(manager) {
        this.manager = manager;
    }

    /**
     * List all groups and tabs
     */
    listGroups() {
        const groups = this.manager.getGroups();
        console.log("=== Tab Groups ===");

        groups.forEach((group) => {
            const details = this.manager.getGroupDetails(group.id);
            console.log(`\nGroup: "${group.name}" (${group.id})`);
            console.log(`  Active Tab: ${details.activeTab?.label ?? "None"}`);
            console.log(`  Tabs (${group.tabs?.length ?? 0}):`);

            group.tabs?.forEach((tab) => {
                const isActive = group.activeTab === tab.id ? " ✓" : "";
                console.log(`    - ${tab.label} (${tab.panelContext})${isActive}`);
            });
        });
    }

    /**
     * Switch to a tab
     */
    async switchTab(groupId, tabId) {
        const success = await this.manager.setActiveTab(groupId, tabId);
        if (success) {
            console.log(`Switched to tab: ${tabId}`);
            return true;
        } else {
            console.error(`Failed to switch tab: ${groupId} / ${tabId}`);
            return false;
        }
    }

    /**
     * Create a new group and tabs
     */
    async createNewGroup(groupName) {
        const group = await this.manager.createGroup(groupName);
        console.log(`Created group: "${group.name}" (${group.id})`);
        return group;
    }

    /**
     * Apply preset layout
     */
    async applyLayout(layoutName) {
        const layouts = {
            default: () => this.manager.resetToDefault(),
            separate: () => this.manager.createSeparateTabsLayout(),
            grouped: () => this.manager.createGroupedLayout()
        };

        const layoutFn = layouts[layoutName];
        if (!layoutFn) {
            console.error(`Unknown layout: ${layoutName}. Available: ${Object.keys(layouts).join(", ")}`);
            return false;
        }

        await layoutFn();
        console.log(`Applied layout: ${layoutName}`);
        this.listGroups();
        return true;
    }

    /**
     * Show full config
     */
    showConfig() {
        console.log("=== Tab Group Configuration ===");
        console.log(JSON.stringify(this.manager.config, null, 2));
    }

    /**
     * Export config
     */
    exportConfig() {
        const json = this.manager.exportConfig();
        console.log("=== Tab Group Configuration (JSON) ===");
        console.log(json);
        return json;
    }

    /**
     * Import config from JSON
     */
    async importConfig(jsonString) {
        const success = await this.manager.importConfig(jsonString);
        if (success) {
            console.log("Configuration imported successfully");
            this.listGroups();
        } else {
            console.error("Failed to import configuration");
        }
        return success;
    }
}
