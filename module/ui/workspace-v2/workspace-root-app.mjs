import { WORKSPACE_V2_DOCK_IDS, WORKSPACE_V2_FLAG_SCOPE } from "./constants.mjs";
import { InteractionController } from "./interaction-controller.mjs";
import { LayoutEngine } from "./layout-engine.mjs";

function getApplicationV2BaseClass() {
    return foundry?.applications?.api?.ApplicationV2 ?? null;
}

const ApplicationV2Base = getApplicationV2BaseClass();

const PANEL_LIBRARY = Object.freeze([
    { id: "gamemaster", title: "Gamemaster" },
    { id: "map", title: "Map" },
    { id: "travel", title: "Travel" },
    { id: "encounter", title: "Encounter Planner" },
    { id: "market", title: "Market" },
    { id: "compendium", title: "Unified Compendium" },
    { id: "camp", title: "Camp" },
    { id: "chat", title: "Chat and Messages" },
    { id: "tracker", title: "Turn Tracker" }
]);

const DOCK_LABELS = Object.freeze({
    leftDock: "Left Dock",
    topDock: "Top Dock",
    centerDock: "Center Dock",
    rightDock: "Right Dock",
    bottomDock: "Bottom Dock"
});

const MIN_FLOAT_WIDTH = 240;
const MIN_FLOAT_HEIGHT = 160;
const MIN_TOP_BOTTOM_DOCK_HEIGHT = 128;
const MIN_LEFT_RIGHT_DOCK_WIDTH = 240;
const GM_PANEL_STATE_KEY = "gmPanelState";

const GM_PANEL_DEFAULT_STATE = Object.freeze({
    collapsedGroupIds: [],
    actionSearchQuery: "",
    allActionsExpanded: false,
    contextDebug: false
});

const GM_ACTION_MODELS = Object.freeze([
    {
        id: "gm-start-encounter",
        label: "Start Encounter",
        description: "Start a new encounter from the current scene context.",
        groupId: "encounter-control",
        keywords: ["combat", "encounter", "initiative", "start"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-open-combat-tracker",
        label: "Open Combat Tracker",
        description: "Open the combat tracker popout for detailed round control.",
        groupId: "encounter-control",
        keywords: ["combat", "tracker", "initiative", "round"],
        isRelevant: (snapshot) => snapshot.hasActiveCombat
    },
    {
        id: "gm-next-turn",
        label: "Advance Turn",
        description: "Advance to the next combat turn.",
        groupId: "encounter-control",
        keywords: ["combat", "turn", "next", "round"],
        isRelevant: (snapshot) => snapshot.hasActiveCombat
    },
    {
        id: "gm-end-combat",
        label: "End Encounter",
        description: "End and clear the active encounter.",
        groupId: "encounter-control",
        keywords: ["combat", "encounter", "end", "stop"],
        isRelevant: (snapshot) => snapshot.hasActiveCombat
    },
    {
        id: "gm-toggle-pause",
        label: "Toggle Pause",
        description: "Pause or resume the world clock and actions.",
        groupId: "scene-flow",
        keywords: ["pause", "resume", "world", "time"],
        isRelevant: () => true
    },
    {
        id: "gm-toggle-context-debug",
        label: "Toggle Context Debug",
        description: "Show or hide context scoring diagnostics inside the Gamemaster panel.",
        groupId: "scene-flow",
        keywords: ["debug", "context", "diagnostic", "priority"],
        isRelevant: () => true
    },
    {
        id: "gm-focus-controlled",
        label: "Focus Controlled Tokens",
        description: "Center the view on currently controlled tokens.",
        groupId: "selection-tools",
        keywords: ["token", "selection", "focus", "camera"],
        isRelevant: (snapshot) => snapshot.controlledCount > 0
    },
    {
        id: "gm-clear-selection",
        label: "Clear Token Selection",
        description: "Release all currently controlled tokens.",
        groupId: "selection-tools",
        keywords: ["token", "selection", "clear"],
        isRelevant: (snapshot) => snapshot.controlledCount > 0
    },
    {
        id: "gm-roll-camp-event",
        label: "Roll Travel Event",
        description: "Generate a context-aware camp/travel event.",
        groupId: "travel-generators",
        keywords: ["travel", "camp", "event", "roll"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-generate-town",
        label: "Generate Town Hook",
        description: "Create a fast narrative hook for a nearby settlement.",
        groupId: "travel-generators",
        keywords: ["town", "generator", "travel", "hook"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-generate-market",
        label: "Generate Market Hook",
        description: "Create a market opportunity hook for the current journey.",
        groupId: "travel-generators",
        keywords: ["market", "generator", "travel", "hook"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-generate-mob",
        label: "Generate Mob Hook",
        description: "Create a crowd or mob complication hook.",
        groupId: "travel-generators",
        keywords: ["mob", "crowd", "generator", "hook"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-generate-poi",
        label: "Generate Point of Interest",
        description: "Create a point-of-interest hook for the current route.",
        groupId: "travel-generators",
        keywords: ["poi", "location", "generator", "travel"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-atmosphere-clear-weather",
        label: "Set Atmosphere: Clear",
        description: "Set a clear-weather atmosphere cue for narration.",
        groupId: "atmosphere",
        keywords: ["atmosphere", "weather", "audio", "visual"],
        isRelevant: () => true
    },
    {
        id: "gm-atmosphere-storm",
        label: "Set Atmosphere: Storm",
        description: "Set a storm atmosphere cue for narration.",
        groupId: "atmosphere",
        keywords: ["atmosphere", "weather", "audio", "visual", "storm"],
        isRelevant: () => true
    }
]);

const GM_GROUP_MODELS = Object.freeze([
    {
        id: "encounter-control",
        title: "Encounter Control",
        description: "Run or close encounters based on current combat state.",
        basePriority: 90,
        isRelevant: (snapshot) => snapshot.hasActiveCombat || !snapshot.hasActiveCombat
    },
    {
        id: "scene-flow",
        title: "Scene and Flow",
        description: "World timing and pacing controls.",
        basePriority: 60,
        isRelevant: () => true
    },
    {
        id: "selection-tools",
        title: "Selection Tools",
        description: "Token-focused controls for current selection.",
        basePriority: 50,
        isRelevant: (snapshot) => snapshot.controlledCount > 0
    },
    {
        id: "travel-generators",
        title: "Travel Generators",
        description: "Generate narrative travel hooks for towns, markets, mobs, and POIs.",
        basePriority: 45,
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "atmosphere",
        title: "Audio and Visual Atmosphere",
        description: "Quick atmosphere cues for scene tone.",
        basePriority: 35,
        isRelevant: () => true
    }
]);

function normalizeGamemasterPanelState(value = {}) {
    const collapsedGroupIds = Array.isArray(value?.collapsedGroupIds)
        ? [...new Set(value.collapsedGroupIds.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
        : [...GM_PANEL_DEFAULT_STATE.collapsedGroupIds];

    return {
        collapsedGroupIds,
        actionSearchQuery: String(value?.actionSearchQuery ?? GM_PANEL_DEFAULT_STATE.actionSearchQuery),
        allActionsExpanded: Boolean(value?.allActionsExpanded ?? GM_PANEL_DEFAULT_STATE.allActionsExpanded),
        contextDebug: Boolean(value?.contextDebug ?? GM_PANEL_DEFAULT_STATE.contextDebug)
    };
}

function buildGamemasterContextSnapshot({ scene = null, combat = null, controlledTokens = [] } = {}) {
    return {
        isGM: Boolean(game.user?.isGM),
        paused: Boolean(game.paused),
        worldTime: Number(game.time?.worldTime ?? 0),
        sceneName: scene?.name ?? game.scenes?.viewed?.name ?? "No active scene",
        sceneId: scene?.id ?? game.scenes?.viewed?.id ?? null,
        hasActiveCombat: Boolean(combat),
        combat: combat
            ? {
                id: combat.id ?? null,
                started: Boolean(combat.started),
                round: Number(combat.round ?? 0),
                turn: Number(combat.turn ?? 0),
                phase: String(combat.phase ?? "planning"),
                combatantCount: combat.combatants?.size ?? combat.combatants?.contents?.length ?? 0
            }
            : null,
        controlledCount: controlledTokens.length,
        controlledNames: controlledTokens.map((token) => token?.name).filter(Boolean)
    };
}

function scoreGamemasterGroup(group, snapshot, actions = []) {
    let score = Number(group.basePriority) || 0;
    if (group.id === "encounter-control" && snapshot.hasActiveCombat) score += 25;
    if (group.id === "selection-tools") score += Math.min(15, snapshot.controlledCount * 5);
    if (group.id === "travel-generators" && !snapshot.hasActiveCombat) score += 15;
    score += Math.min(10, actions.length * 2);
    return score;
}

function buildGamemasterPanelModel({ snapshot, panelState }) {
    const collapsedSet = new Set(panelState.collapsedGroupIds ?? []);
    const actions = GM_ACTION_MODELS.map((action) => ({
        ...action,
        relevant: action.isRelevant?.(snapshot) ?? true
    }));

    const groups = GM_GROUP_MODELS
        .map((group) => {
            const groupActions = actions.filter((action) => action.groupId === group.id && action.relevant);
            const relevant = (group.isRelevant?.(snapshot) ?? true) && groupActions.length > 0;
            const priorityScore = scoreGamemasterGroup(group, snapshot, groupActions);
            return {
                ...group,
                actions: groupActions,
                relevant,
                collapsed: collapsedSet.has(group.id),
                priorityScore
            };
        })
        .filter((group) => group.relevant)
        .sort((left, right) => right.priorityScore - left.priorityScore);

    const searchQuery = String(panelState.actionSearchQuery ?? "").trim().toLowerCase();
    const allActions = actions
        .filter((action) => {
            if (!searchQuery) return true;
            const haystack = `${action.label} ${action.description} ${(action.keywords ?? []).join(" ")}`.toLowerCase();
            return haystack.includes(searchQuery);
        })
        .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" }));

    return {
        groups,
        allActions,
        allActionsExpanded: Boolean(panelState.allActionsExpanded),
        actionSearchQuery: panelState.actionSearchQuery,
        totalActionCount: actions.length,
        contextDebug: Boolean(panelState.contextDebug),
        debugRows: [
            { label: "Scene", value: snapshot.sceneName ?? "No active scene" },
            { label: "Active Combat", value: snapshot.hasActiveCombat ? "Yes" : "No" },
            { label: "Controlled Tokens", value: String(snapshot.controlledCount ?? 0) },
            { label: "World Paused", value: snapshot.paused ? "Yes" : "No" },
            {
                label: "Group Scores",
                value: groups.map((group) => `${group.title}: ${group.priorityScore}`).join(" | ") || "None"
            }
        ]
    };
}

export class WorkspaceRootApp extends (ApplicationV2Base ?? class {}) {
    static get isSupported() {
        return Boolean(ApplicationV2Base);
    }

    static get DEFAULT_OPTIONS() {
        if (!ApplicationV2Base) return {};

        return {
            id: "totc-workspace-v2-root",
            classes: ["turn-of-the-century", "totc-workspace-v2-root-app"],
            tag: "section",
            position: {
                width: "100vw",
                height: "100vh",
                top: 0,
                left: 0
            },
            window: {
                frame: false,
                positioned: true,
                minimizable: false,
                resizable: false,
                title: "Turn of the Century Workspace V2"
            }
        };
    }

    constructor({ stateStore, governor } = {}) {
        super();
        this.stateStore = stateStore;
        this.governor = governor;
        this.layoutEngine = new LayoutEngine({
            layout: this.stateStore?.getUserLayout?.(),
            panels: PANEL_LIBRARY
        });
        this.interactionController = new InteractionController();
        this.ghostIntent = null;
        this.compendiumSearchQuery = "";
        this._compendiumItemEntries = null;
        this._compendiumItemsPromise = null;
        this._resizeSession = null;
        this._compendiumSearchTimeout = null;
        this._mapViewportState = {
            scale: null,
            offsetX: 0,
            offsetY: 0
        };
        this._mapPanSession = null;
        this._sceneRefreshHandler = () => {
            if (this.rendered) {
                this.render(false);
            }
        };
        this._compendiumRefreshHandler = () => {
            // Clear cache and refresh the compendium panel when game becomes ready
            this._compendiumItemEntries = null;
            this._compendiumItemsPromise = null;
            if (this.rendered) {
                this.render(false);
            }
        };
        this._compendiumDocumentMutationHandler = (document, change, options = {}) => {
            const pack = options?.pack ?? document?.pack ?? document?.parent?.collection ?? null;
            if (!pack) return;
            this._compendiumRefreshHandler();
        };
        this._gamemasterRefreshHandler = () => {
            if (this.rendered) {
                this.render(false);
            }
        };
        this._sceneHooksBound = false;
        this._compendiumHooksBound = false;
        this._gamemasterHooksBound = false;
    }

    async _prepareContext() {
        const policy = this.stateStore?.getPolicy?.() ?? { enabled: false, debugGovernance: false };
        const userLayout = this.stateStore?.getUserLayout?.() ?? this.layoutEngine.getLayout();
        this.layoutEngine.setLayout(userLayout);
        const enforcedLayout = this.#enforceRequiredDocking();
        if (enforcedLayout) {
            await this.stateStore?.setUserLayout?.(enforcedLayout);
        }
        const activeLayout = this.layoutEngine.getLayout();
        const visiblePanels = this.#getVisiblePanelIds(activeLayout);
        const scene = canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null;
        const combat = game.combats?.active ?? game.combat ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const gmPanelState = this.#getGamemasterPanelState();
        const gmSnapshot = buildGamemasterContextSnapshot({ scene, combat, controlledTokens });
        const gmPanel = buildGamemasterPanelModel({
            snapshot: gmSnapshot,
            panelState: gmPanelState
        });
        const compendiumItems = await this.#getUnifiedCompendiumItems();

        return {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: PANEL_LIBRARY,
            panelVisibility: PANEL_LIBRARY.map((panel) => ({
                id: panel.id,
                title: panel.title,
                visible: visiblePanels.has(panel.id)
            })),
            layout: activeLayout,
            dockWeights: this.layoutEngine.getDockWeightLayout(),
            compendiumSearchQuery: this.compendiumSearchQuery,
            compendiumItems,
            scene: {
                id: scene?.id ?? null,
                name: scene?.name ?? game.scenes?.viewed?.name ?? "Current Scene",
                mapSrc: this.#getSceneMapSource(scene),
                width: Number(scene?.width ?? canvas?.dimensions?.sceneWidth ?? 0),
                height: Number(scene?.height ?? canvas?.dimensions?.sceneHeight ?? 0)
            },
            gm: gmSnapshot,
            gmPanel
        };
    }

    async _renderHTML(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");
        root.setAttribute("data-drag-host", "true");
        const dockWeights = context.dockWeights ?? { left: 0.18, centerX: 0.64, right: 0.18, top: 0.18, centerY: 0.64, bottom: 0.18 };
        const layoutRoot = context.layout?.root ?? {};
        const leftOccupied = this.#isDockOccupied(layoutRoot.leftDock);
        const rightOccupied = this.#isDockOccupied(layoutRoot.rightDock);
        const topOccupied = this.#isDockOccupied(layoutRoot.topDock);
        const bottomOccupied = this.#isDockOccupied(layoutRoot.bottomDock);
        const leftMin = leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const rightMin = rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const topMin = topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const bottomMin = bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const columnTemplate = `minmax(${leftMin}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) minmax(${rightMin}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const rowTemplate = `minmax(${topMin}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) minmax(${bottomMin}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        const docksMarkup = WORKSPACE_V2_DOCK_IDS
            .map((dockId) => this.#renderDockMarkup(dockId, context.layout.root[dockId], context))
            .join("\n");
        const panelToggleMarkup = (context.panelVisibility ?? []).map((panel) => `
            <label class="totc-v2-command-menu__panel-toggle">
                <input
                    type="checkbox"
                    data-action="toggle-panel-visibility"
                    data-panel-id="${this.#escapeHTML(panel.id)}"
                    ${panel.visible ? "checked" : ""}>
                <span>${this.#escapeHTML(panel.title)}</span>
            </label>`).join("");

        root.innerHTML = `
<section class="totc-workspace-v2-shell">
    <div class="totc-workspace-v2-shell__emergency">
        <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-command-menu-toggle" title="Open workspace menu" aria-label="Open workspace menu" aria-expanded="false">
            <i class="fas fa-gear" aria-hidden="true"></i>
        </button>
        <div class="totc-v2-command-menu" data-command-menu="true" hidden>
            <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-exit-world">Return to Setup</button>
            <div class="totc-v2-command-menu__divider" role="separator" aria-hidden="true"></div>
            <section class="totc-v2-command-menu__panel-list" aria-label="Panels">
                ${panelToggleMarkup}
            </section>
        </div>
    </div>
    <main class="totc-workspace-v2-shell__main">
        <section class="totc-v2-layout" data-layout-root="true" style="grid-template-columns:${columnTemplate};grid-template-rows:${rowTemplate};">
            ${docksMarkup}
            ${this.#renderDockSplittersMarkup(dockWeights)}
            ${this.#renderFloatingWindowsMarkup(context.layout.root.floatingWindows ?? [])}
            <div class="totc-v2-ghost" data-drop-ghost="true" hidden>
                <span data-drop-label="true"></span>
            </div>
        </section>
    </main>
</section>`;
        return root;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#bindSceneHooks();
        this.#bindCompendiumHooks();
        this.#bindGamemasterHooks();

        this.element?.querySelectorAll("[data-action='totc-v2-exit-world']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!game.user?.isGM) {
                    ui.notifications?.warn("Only a GM can exit the world to setup.");
                    return;
                }

                await game.shutDown?.();
            });
        });

        this.element?.querySelectorAll("[data-action='compendium-search']")?.forEach((input) => {
            input.addEventListener("input", async () => {
                // Clear any existing timeout
                if (this._compendiumSearchTimeout) {
                    clearTimeout(this._compendiumSearchTimeout);
                }
                // Set a new timeout with 300ms delay before updating search
                this._compendiumSearchTimeout = setTimeout(async () => {
                    this.compendiumSearchQuery = String(input.value ?? "");
                    await this.render(false);
                    // Restore focus to the search input after render
                    this.element?.querySelector("[data-action='compendium-search']")?.focus();
                    this._compendiumSearchTimeout = null;
                }, 300);
            });
        });

        this.element?.querySelectorAll("[data-action='totc-v2-command-menu-toggle']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const menu = this.element?.querySelector("[data-command-menu='true']");
                if (!menu) return;

                const expanded = !menu.hidden;
                menu.hidden = expanded;
                button.setAttribute("aria-expanded", expanded ? "false" : "true");
            });
        });

        this.element?.addEventListener("click", (event) => {
            const menu = this.element?.querySelector("[data-command-menu='true']");
            const toggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
            if (!menu || menu.hidden) return;

            const target = event.target;
            if (!(target instanceof Node)) return;
            if (menu.contains(target)) return;
            if (toggleButton?.contains(target)) return;

            menu.hidden = true;
            toggleButton?.setAttribute("aria-expanded", "false");
        });

        this.element?.querySelectorAll("[data-action='toggle-panel-visibility']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", async (event) => {
                event.stopPropagation();
                const panelId = checkbox.dataset.panelId;
                if (!panelId) return;

                const panelDef = PANEL_LIBRARY.find((panel) => panel.id === panelId);
                if (!panelDef) return;

                const nextLayout = checkbox.checked
                    ? this.layoutEngine.restorePanel(panelDef)
                    : this.layoutEngine.closePanel(panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='activate-tab']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const { dockId, stackId, panelId } = button.dataset;
                if (!dockId || !stackId || !panelId) return;

                const nextLayout = this.layoutEngine.setActivePanel(dockId, stackId, panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='float-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const panelId = button.dataset.panelId;
                const panelDef = PANEL_LIBRARY.find((panel) => panel.id === panelId);
                if (!panelDef) return;

                const nextLayout = this.layoutEngine.floatPanel(panelDef);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='close-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const panelId = button.dataset.panelId;
                if (!panelId) return;

                const nextLayout = this.layoutEngine.closePanel(panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='undock-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const dockId = button.dataset.dockId;
                const stackId = button.dataset.stackId;
                const panelId = button.dataset.panelId;
                if (!dockId || !stackId || !panelId) return;

                const nextLayout = this.layoutEngine.undockPanel({ dockId, stackId, panelId });
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='redock-panel']")?.forEach((button) => {
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = button.dataset.floatingId;
                if (!floatingId) return;

                const nextLayout = this.layoutEngine.redockFloatingWindow(floatingId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='floating-close']")?.forEach((button) => {
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const windowId = button.dataset.floatingId;
                if (!windowId) return;

                const nextLayout = this.layoutEngine.removeFloatingWindow(windowId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='gm-execute-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = button.dataset.gmActionId;
                if (!actionId) return;
                await this.#executeGamemasterAction(actionId);
            });
        });

        this.element?.querySelectorAll("[data-action='gm-toggle-group']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const groupId = button.dataset.gmGroupId;
                if (!groupId) return;

                const current = this.#getGamemasterPanelState();
                const collapsed = new Set(current.collapsedGroupIds ?? []);
                if (collapsed.has(groupId)) {
                    collapsed.delete(groupId);
                } else {
                    collapsed.add(groupId);
                }
                await this.#setGamemasterPanelStatePatch({ collapsedGroupIds: [...collapsed] });
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='gm-toggle-all-actions']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const current = this.#getGamemasterPanelState();
                await this.#setGamemasterPanelStatePatch({ allActionsExpanded: !current.allActionsExpanded });
                this.render(false);
            });
        });

        this.element?.querySelectorAll("[data-action='gm-search-actions']")?.forEach((input) => {
            input.addEventListener("input", async () => {
                await this.#setGamemasterPanelStatePatch({ actionSearchQuery: String(input.value ?? "") });
                this.render(false);
            });
        });

        this.#wireMapInteractionHandlers();

        this.#wireInteractionHandlers();
        this.#wireResizeHandlers();
    }

    async close(options = {}) {
        this.#unbindSceneHooks();
        this.#unbindCompendiumHooks();
        this.#unbindGamemasterHooks();
        this.#endMapPanSession();
        return await super.close?.(options);
    }

    #renderDockMarkup(dockId, dock = { stacks: [] }, context = {}) {
        const stackItemsMarkup = (dock?.stacks ?? [])
            .map((stack, index, stacks) => {
                const stackMarkup = this.#renderStackMarkup(dockId, stack, context, {
                    includeDockLabel: false,
                    dockLabel: DOCK_LABELS[dockId] ?? dockId
                });
                const splitterMarkup = index < stacks.length - 1
                    ? this.#renderStackSplitterMarkup(dockId, stack.id, stacks[index + 1]?.id, dock?.orientation)
                    : "";
                return `${stackMarkup}${splitterMarkup}`;
            })
            .join("");
        const orientationClass = dock?.orientation === "horizontal" ? "is-horizontal" : "is-vertical";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass}" data-dock-id="${dockId}">
            <div class="totc-v2-dock__stacks ${orientationClass}" data-dock-stacks="${dockId}">
                ${stackItemsMarkup || `<div class='totc-v2-dock__empty' data-dock-drop-target='${dockId}'>Drop panel here</div>`}
            </div>
        </section>`;
    }

    #renderStackMarkup(dockId, stack, context = {}, options = {}) {
        const tabsMarkup = (stack?.panels ?? [])
            .map((panel) => `
            <button
                type="button"
                data-action="activate-tab"
                data-dock-id="${dockId}"
                data-stack-id="${stack.id}"
                data-panel-id="${panel.id}"
                draggable="true"
                data-drag-panel-id="${panel.id}"
                class="totc-v2-stack__tab ${panel.id === stack.activePanelId ? "is-active" : ""}">
                ${panel.title}
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        const panelContent = this.#renderPanelContent(activePanel, context);

        return `
        <article class="totc-v2-stack" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
            <div class="totc-v2-stack__tabs">
                ${options.includeDockLabel ? `<span class="totc-v2-dock-label-inline">${this.#escapeHTML(options.dockLabel ?? dockId)}</span>` : ""}
                ${tabsMarkup}
            </div>
            <div class="totc-v2-stack__actions">
                <button type="button" data-action="close-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}">Close</button>
                <button type="button" data-action="undock-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}">Undock</button>
            </div>
            <div class="totc-v2-stack__content">${panelContent}</div>
        </article>`;
    }

    #renderStackSplitterMarkup(dockId, leadingStackId, trailingStackId, orientation = "vertical") {
        const orientationClass = orientation === "horizontal" ? "is-horizontal" : "is-vertical";
        return `
        <div
            class="totc-v2-stack-splitter ${orientationClass}"
            data-action="stack-splitter"
            data-dock-id="${dockId}"
            data-leading-stack-id="${leadingStackId}"
            data-trailing-stack-id="${trailingStackId}"
            title="Resize stack"></div>`;
    }

    #renderDockSplittersMarkup(dockWeights = {}) {
        const left = Number(dockWeights.left) || 0.18;
        const centerX = Number(dockWeights.centerX) || Math.max(0.2, 1 - left - (Number(dockWeights.right) || 0.18));
        const right = Number(dockWeights.right) || 0.18;
        const top = Number(dockWeights.top) || 0.18;
        const centerY = Number(dockWeights.centerY) || Math.max(0.2, 1 - top - (Number(dockWeights.bottom) || 0.18));
        const bottom = Number(dockWeights.bottom) || 0.18;
        const totalX = Math.max(0.0001, left + centerX + right);
        const totalY = Math.max(0.0001, top + centerY + bottom);
        const leftBoundary = (left / totalX) * 100;
        const rightBoundary = ((left + centerX) / totalX) * 100;
        const topBoundary = (top / totalY) * 100;
        const bottomBoundary = ((top + centerY) / totalY) * 100;
        const centerLeftBoundary = `${leftBoundary}%`;
        const centerRightBoundary = `${100 - rightBoundary}%`;

        return `
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--left" style="left:${leftBoundary}%;" data-action="dock-resizer" data-dock-id="leftDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--right" style="left:${rightBoundary}%;" data-action="dock-resizer" data-dock-id="rightDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--top" style="top:${topBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="topDock" data-axis="y" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--bottom" style="top:${bottomBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="bottomDock" data-axis="y" title="Resize dock"></div>`;
    }

    #renderFloatingWindowsMarkup(floatingWindows = []) {
        return floatingWindows.map((floatingWindow) => {
            const title = this.#escapeHTML(floatingWindow.panel?.title ?? "Floating Panel");
            const content = this.#renderPanelContent(floatingWindow.panel, {
                scene: {
                    name: game.scenes?.viewed?.name ?? "Current Scene",
                    mapSrc: this.#getSceneMapSource(canvas?.scene ?? game.scenes?.viewed ?? null)
                }
            });

            return `
            <article
                class="totc-v2-floating"
                data-floating-id="${floatingWindow.id}"
                style="left:${floatingWindow.x}px;top:${floatingWindow.y}px;width:${floatingWindow.width}px;height:${floatingWindow.height}px;z-index:${floatingWindow.zIndex};">
                <header class="totc-v2-floating__header" data-action="floating-move-handle" data-floating-id="${floatingWindow.id}">
                    <span>${title}</span>
                    <div class="totc-v2-floating__buttons">
                        <button type="button" data-action="redock-panel" data-floating-id="${floatingWindow.id}">Redock</button>
                        <button type="button" data-action="floating-close" data-floating-id="${floatingWindow.id}">Close</button>
                    </div>
                </header>
                <section class="totc-v2-floating__body">${content}</section>
                <div class="totc-v2-floating__resize-handle" data-action="floating-resize-handle" data-floating-id="${floatingWindow.id}" title="Resize"></div>
            </article>`;
        }).join("");
    }

    #renderPanelContent(panel, context = {}) {
        if (!panel) {
            return `<div class="totc-v2-panel-placeholder">Empty</div>`;
        }

        if (panel.id === "map") {
            const sceneName = this.#escapeHTML(context.scene?.name ?? "Current Scene");
            const mapSrc = context.scene?.mapSrc ?? "";
            const dimensions = [context.scene?.width, context.scene?.height].filter((value) => Number.isFinite(value) && value > 0);
            const dimensionLabel = dimensions.length === 2 ? `${dimensions[0]} × ${dimensions[1]}` : "Scene map";
            const imageMarkup = mapSrc
                ? `<div class="totc-v2-map-panel__viewport" data-action="map-viewport" data-map-viewport="true">
                    <img class="totc-v2-map-panel__image" src="${this.#escapeHTML(mapSrc)}" alt="${sceneName}" draggable="false" data-action="map-image">
                </div>`
                : `<div class="totc-v2-map-panel__empty">No active scene map available</div>`;

            return `
            <figure class="totc-v2-map-panel">
                ${imageMarkup}
                <figcaption class="totc-v2-map-panel__caption">
                    <span class="totc-v2-map-panel__name">${sceneName}</span>
                    <span class="totc-v2-map-panel__meta">${this.#escapeHTML(dimensionLabel)}</span>
                </figcaption>
            </figure>`;
        }

        if (panel.id === "compendium") {
            const query = String(context.compendiumSearchQuery ?? "").trim().toLowerCase();
            const allEntries = Array.isArray(context.compendiumItems) ? context.compendiumItems : [];
            const entries = query
                ? allEntries.filter((entry) => String(entry.name ?? "").toLowerCase().includes(query))
                : allEntries;

            return `
            <section class="totc-v2-compendium-panel">
                <label class="totc-v2-compendium-panel__search">
                    <span>Search items</span>
                    <input type="search" data-action="compendium-search" value="${this.#escapeHTML(context.compendiumSearchQuery ?? "")}" placeholder="Filter by item name">
                </label>
                <div class="totc-v2-compendium-panel__summary">
                    ${entries.length} item${entries.length === 1 ? "" : "s"} from ${this.#escapeHTML(allEntries.length ? `${allEntries.length} compendium entries` : "no compendium entries")}
                </div>
                <div class="totc-v2-compendium-panel__list" role="list">
                    ${entries.length ? entries.map((entry) => `
                        <article class="totc-v2-compendium-panel__entry" role="listitem" data-entry-uuid="${this.#escapeHTML(entry.uuid ?? "")}">
                            <div class="totc-v2-compendium-panel__entry-name">${this.#escapeHTML(entry.name)}</div>
                            <div class="totc-v2-compendium-panel__entry-pack">${this.#escapeHTML(entry.packLabel)}</div>
                        </article>`).join("") : `<div class="totc-v2-compendium-panel__empty">No items match this search.</div>`}
                </div>
            </section>`;
        }

        if (panel.id === "gamemaster") {
            if (!context.gm?.isGM) {
                return `
                <section class="totc-v2-gm-panel">
                    <div class="totc-v2-gm-panel__state">
                        <h3>Gamemaster Panel</h3>
                        <p>This panel is only available to the active GM.</p>
                    </div>
                </section>`;
            }

            return this.#renderGamemasterPanel(context.gmPanel, context.gm);
        }

        return `<div class="totc-v2-panel-placeholder">${this.#escapeHTML(panel.title)}</div>`;
    }

    #getSceneMapSource(scene) {
        return scene?.background?.src
            ?? scene?.img
            ?? scene?.texture?.src
            ?? scene?.thumb
            ?? scene?.thumbnail?.src
            ?? "";
    }

    #escapeHTML(value) {
        const text = String(value ?? "");
        return foundry?.utils?.escapeHTML?.(text) ?? text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    #bindSceneHooks() {
        if (this._sceneHooksBound) return;
        Hooks.on("canvasReady", this._sceneRefreshHandler);
        Hooks.on("updateScene", this._sceneRefreshHandler);
        Hooks.on("createScene", this._sceneRefreshHandler);
        Hooks.on("deleteScene", this._sceneRefreshHandler);
        this._sceneHooksBound = true;
    }

    #bindCompendiumHooks() {
        if (this._compendiumHooksBound) return;

        // If app starts after ready has already fired, refresh immediately.
        if (game.ready) {
            this._compendiumRefreshHandler();
        } else {
            Hooks.once("ready", this._compendiumRefreshHandler);
        }

        // Refresh compendium cache when pack metadata changes.
        Hooks.on("createCompendium", this._compendiumRefreshHandler);
        Hooks.on("deleteCompendium", this._compendiumRefreshHandler);
        Hooks.on("createItem", this._compendiumDocumentMutationHandler);
        Hooks.on("updateItem", this._compendiumDocumentMutationHandler);
        Hooks.on("deleteItem", this._compendiumDocumentMutationHandler);
        this._compendiumHooksBound = true;
    }

    #unbindSceneHooks() {
        if (!this._sceneHooksBound) return;
        Hooks.off("canvasReady", this._sceneRefreshHandler);
        Hooks.off("updateScene", this._sceneRefreshHandler);
        Hooks.off("createScene", this._sceneRefreshHandler);
        Hooks.off("deleteScene", this._sceneRefreshHandler);
        this._sceneHooksBound = false;
    }

    #unbindCompendiumHooks() {
        if (!this._compendiumHooksBound) return;
        Hooks.off("createCompendium", this._compendiumRefreshHandler);
        Hooks.off("deleteCompendium", this._compendiumRefreshHandler);
        Hooks.off("createItem", this._compendiumDocumentMutationHandler);
        Hooks.off("updateItem", this._compendiumDocumentMutationHandler);
        Hooks.off("deleteItem", this._compendiumDocumentMutationHandler);
        this._compendiumHooksBound = false;
    }

    #bindGamemasterHooks() {
        if (this._gamemasterHooksBound) return;
        Hooks.on("createCombat", this._gamemasterRefreshHandler);
        Hooks.on("deleteCombat", this._gamemasterRefreshHandler);
        Hooks.on("updateCombat", this._gamemasterRefreshHandler);
        Hooks.on("controlToken", this._gamemasterRefreshHandler);
        Hooks.on("pauseGame", this._gamemasterRefreshHandler);
        this._gamemasterHooksBound = true;
    }

    #unbindGamemasterHooks() {
        if (!this._gamemasterHooksBound) return;
        Hooks.off("createCombat", this._gamemasterRefreshHandler);
        Hooks.off("deleteCombat", this._gamemasterRefreshHandler);
        Hooks.off("updateCombat", this._gamemasterRefreshHandler);
        Hooks.off("controlToken", this._gamemasterRefreshHandler);
        Hooks.off("pauseGame", this._gamemasterRefreshHandler);
        this._gamemasterHooksBound = false;
    }

    #getGamemasterPanelState() {
        const workspaceFlags = foundry.utils.deepClone(game.user?.getFlag(game.system?.id, WORKSPACE_V2_FLAG_SCOPE) ?? {});
        return normalizeGamemasterPanelState(workspaceFlags[GM_PANEL_STATE_KEY] ?? {});
    }

    async #setGamemasterPanelStatePatch(patch = {}) {
        const systemId = game.system?.id;
        const current = foundry.utils.deepClone(game.user?.getFlag(systemId, WORKSPACE_V2_FLAG_SCOPE) ?? {});
        const merged = normalizeGamemasterPanelState({
            ...(current[GM_PANEL_STATE_KEY] ?? {}),
            ...patch
        });
        current[GM_PANEL_STATE_KEY] = merged;
        await game.user?.setFlag(systemId, WORKSPACE_V2_FLAG_SCOPE, current);
        return merged;
    }

    #renderGamemasterPanel(gmPanel = {}, gmSnapshot = {}) {
        const combat = gmSnapshot.combat;
        const combatSummary = combat
            ? `${combat.combatantCount} combatant${combat.combatantCount === 1 ? "" : "s"} · Round ${Math.max(1, combat.round || 1)} · Turn ${Math.max(1, (combat.turn ?? 0) + 1)}`
            : "No active combat";
        const controlledSummary = gmSnapshot.controlledCount
            ? gmSnapshot.controlledNames.slice(0, 3).join(", ")
            : "No controlled tokens";

        const groupsMarkup = (gmPanel.groups ?? []).map((group) => {
            const actionsMarkup = (group.actions ?? []).map((action) => `
                <button type="button" data-action="gm-execute-action" data-gm-action-id="${this.#escapeHTML(action.id)}" title="${this.#escapeHTML(action.description)}">${this.#escapeHTML(action.label)}</button>`).join("");

            return `
            <article class="totc-v2-gm-panel__group ${group.collapsed ? "is-collapsed" : ""}">
                <button type="button" class="totc-v2-gm-panel__group-header" data-action="gm-toggle-group" data-gm-group-id="${this.#escapeHTML(group.id)}" aria-expanded="${group.collapsed ? "false" : "true"}">
                    <span>${this.#escapeHTML(group.title)}</span>
                    <span class="totc-v2-gm-panel__group-meta">${group.collapsed ? "+" : "-"}</span>
                </button>
                <div class="totc-v2-gm-panel__group-description">${this.#escapeHTML(group.description)}</div>
                <div class="totc-v2-gm-panel__button-grid" ${group.collapsed ? "hidden" : ""}>
                    ${actionsMarkup}
                </div>
            </article>`;
        }).join("");

        const allActionsMarkup = (gmPanel.allActions ?? []).map((action) => `
            <button type="button" data-action="gm-execute-action" data-gm-action-id="${this.#escapeHTML(action.id)}" title="${this.#escapeHTML(action.description)}">${this.#escapeHTML(action.label)}</button>`).join("");
        const debugRowsMarkup = (gmPanel.debugRows ?? []).map((row) => `
            <div class="totc-v2-gm-panel__debug-row">
                <span>${this.#escapeHTML(row.label)}</span>
                <span>${this.#escapeHTML(row.value)}</span>
            </div>`).join("");

        return `
        <section class="totc-v2-gm-panel">
            <article class="totc-v2-gm-panel__state">
                <h3>Current Context</h3>
                <p><strong>Scene:</strong> ${this.#escapeHTML(gmSnapshot.sceneName ?? "No active scene")}</p>
                <p><strong>World:</strong> ${gmSnapshot.paused ? "Paused" : "Running"}</p>
                <p><strong>Combat:</strong> ${this.#escapeHTML(combatSummary)}</p>
                <p><strong>Selection:</strong> ${this.#escapeHTML(controlledSummary)}</p>
                ${gmPanel.contextDebug ? `<div class="totc-v2-gm-panel__debug">${debugRowsMarkup}</div>` : ""}
            </article>
            <section class="totc-v2-gm-panel__groups">
                ${groupsMarkup || `<div class="totc-v2-gm-panel__empty">No context groups are active right now.</div>`}
            </section>
            <article class="totc-v2-gm-panel__all-actions ${gmPanel.allActionsExpanded ? "is-expanded" : ""}">
                <button type="button" class="totc-v2-gm-panel__group-header" data-action="gm-toggle-all-actions" aria-expanded="${gmPanel.allActionsExpanded ? "true" : "false"}">
                    <span>All GM Actions</span>
                    <span class="totc-v2-gm-panel__group-meta">${gmPanel.allActionsExpanded ? "-" : "+"}</span>
                </button>
                <div class="totc-v2-gm-panel__all-actions-body" ${gmPanel.allActionsExpanded ? "" : "hidden"}>
                    <label class="totc-v2-gm-panel__search">
                        <span>Search actions</span>
                        <input type="search" data-action="gm-search-actions" value="${this.#escapeHTML(gmPanel.actionSearchQuery ?? "")}" placeholder="Filter by label, description, or keyword">
                    </label>
                    <div class="totc-v2-gm-panel__all-actions-meta">${(gmPanel.allActions ?? []).length} of ${Number(gmPanel.totalActionCount ?? 0)} actions</div>
                    <div class="totc-v2-gm-panel__button-grid">
                        ${allActionsMarkup || `<div class="totc-v2-gm-panel__empty">No actions match this search.</div>`}
                    </div>
                </div>
            </article>
        </section>`;
    }

    async #executeGamemasterAction(actionId) {
        if (!game.user?.isGM) {
            ui.notifications?.warn("Only the GM can run Gamemaster actions.");
            return;
        }

        const combat = game.combats?.active ?? game.combat ?? null;

        switch (String(actionId)) {
            case "gm-toggle-pause": {
                await game.togglePause?.(!game.paused, true);
                break;
            }
            case "gm-open-combat-tracker": {
                if (typeof ui.combat?.renderPopout === "function") {
                    ui.combat.renderPopout(true);
                } else {
                    ui.combat?.render?.(true);
                }
                break;
            }
            case "gm-start-encounter": {
                let activeCombat = combat;
                if (!activeCombat && canvas?.scene?.id && typeof Combat?.create === "function") {
                    activeCombat = await Combat.create({ scene: canvas.scene.id });
                }
                if (activeCombat?.initializeEncounterRound) {
                    await activeCombat.initializeEncounterRound();
                }
                break;
            }
            case "gm-next-turn": {
                if (!combat) break;
                await combat.nextTurn?.();
                break;
            }
            case "gm-end-combat": {
                if (!combat) break;
                await combat.delete?.();
                break;
            }
            case "gm-focus-controlled": {
                const controlled = canvas?.tokens?.controlled ?? [];
                if (!controlled.length) break;
                const anchor = controlled[0];
                await canvas?.animatePan?.({ x: anchor.center?.x ?? anchor.x, y: anchor.center?.y ?? anchor.y, scale: canvas.stage?.scale?.x ?? 1 });
                break;
            }
            case "gm-clear-selection": {
                const controlled = canvas?.tokens?.controlled ?? [];
                for (const token of controlled) {
                    token.release?.();
                }
                break;
            }
            case "gm-roll-camp-event": {
                const eventResult = game.turnOfTheCentury?.campEvents?.rollEvent?.({});
                if (eventResult?.name) {
                    ui.notifications?.info(`Travel event: ${eventResult.name}`);
                } else {
                    ui.notifications?.info("Travel event roll executed.");
                }
                break;
            }
            case "gm-generate-town": {
                await this.#generateGamemasterHook("town");
                break;
            }
            case "gm-generate-market": {
                await this.#generateGamemasterHook("market");
                break;
            }
            case "gm-generate-mob": {
                await this.#generateGamemasterHook("mob");
                break;
            }
            case "gm-generate-poi": {
                await this.#generateGamemasterHook("poi");
                break;
            }
            case "gm-atmosphere-clear-weather": {
                await this.#setGamemasterAtmospherePreset("clear");
                break;
            }
            case "gm-atmosphere-storm": {
                await this.#setGamemasterAtmospherePreset("storm");
                break;
            }
            case "gm-toggle-context-debug": {
                const current = this.#getGamemasterPanelState();
                await this.#setGamemasterPanelStatePatch({ contextDebug: !current.contextDebug });
                break;
            }
            default:
                ui.notifications?.warn(`Unknown Gamemaster action: ${actionId}`);
                break;
        }

        this.render(false);
    }

    async #generateGamemasterHook(kind) {
        const seedsApi = game.turnOfTheCentury?.seeds;
        const factionMap = seedsApi?.factionMetadata ?? {};
        const factionKeys = Object.keys(factionMap);
        const fallbackFaction = "frontier-raiders";
        const factionKey = this.#randomFrom(factionKeys) ?? fallbackFaction;
        const narrative = seedsApi?.getNarrative?.(factionKey) ?? {};
        const faction = seedsApi?.getFaction?.(factionKey) ?? { name: factionKey };

        const promptByKind = {
            town: `Town lead: ${narrative.preEncounter ?? "A settlement asks for immediate aid."}`,
            market: `Market lead: ${narrative.victory ?? "A broker offers scarce goods at a risky premium."}`,
            mob: `Mob lead: ${narrative.combat ?? "Crowd unrest spills into the streets."}`,
            poi: `Point of interest: ${narrative.defeat ?? "A marked site hints at unresolved danger."}`
        };

        const titleByKind = {
            town: "Town Hook Generated",
            market: "Market Hook Generated",
            mob: "Mob Hook Generated",
            poi: "Point of Interest Generated"
        };

        const lines = [
            `Faction: ${faction?.name ?? factionKey}`,
            promptByKind[kind] ?? "Narrative hook generated."
        ];

        await this.#announceGamemasterGeneratedContent({
            title: titleByKind[kind] ?? "GM Hook Generated",
            lines
        });
    }

    async #setGamemasterAtmospherePreset(preset) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        if (!scene) {
            ui.notifications?.warn("No active scene is available for atmosphere controls.");
            return;
        }

        const data = {
            preset,
            updatedBy: game.user?.id ?? null,
            updatedAt: Date.now()
        };

        await scene.setFlag?.(game.system?.id ?? "turn-of-the-century", "gmAtmosphere", data);

        const title = preset === "storm" ? "Atmosphere Set: Storm" : "Atmosphere Set: Clear";
        const description = preset === "storm"
            ? "Wind and thunder cues are now the active scene tone."
            : "Clear-weather cues are now the active scene tone.";

        await this.#announceGamemasterGeneratedContent({
            title,
            lines: [
                `Scene: ${scene.name ?? "Unknown scene"}`,
                description
            ]
        });
    }

    async #announceGamemasterGeneratedContent({ title, lines = [] } = {}) {
        const safeTitle = String(title ?? "Gamemaster Output");
        const safeLines = Array.isArray(lines)
            ? lines.map((line) => String(line ?? "").trim()).filter(Boolean)
            : [];

        const content = `<h3>${this.#escapeHTML(safeTitle)}</h3>${safeLines.map((line) => `<p>${this.#escapeHTML(line)}</p>`).join("")}`;
        const whisperRecipients = ChatMessage?.getWhisperRecipients?.("GM")?.map((user) => user.id).filter(Boolean) ?? [];

        if (typeof ChatMessage?.create === "function") {
            await ChatMessage.create({
                content,
                whisper: whisperRecipients.length ? whisperRecipients : undefined,
                speaker: ChatMessage.getSpeaker?.({ alias: "Gamemaster Panel" })
            });
        }

        ui.notifications?.info(safeTitle);
    }

    #randomFrom(items = []) {
        if (!Array.isArray(items) || !items.length) return null;
        const index = Math.floor(Math.random() * items.length);
        return items[index];
    }

    #wireMapInteractionHandlers() {
        const viewports = [...(this.element?.querySelectorAll("[data-action='map-viewport']") ?? [])];
        if (!viewports.length) return;

        for (const viewport of viewports) {
            const image = viewport.querySelector("[data-action='map-image']");
            if (!(image instanceof HTMLImageElement)) continue;

            viewport.addEventListener("contextmenu", (event) => {
                event.preventDefault();
            });

            viewport.addEventListener("pointerdown", (event) => {
                if (event.button !== 2) return;

                event.preventDefault();
                event.stopPropagation();
                this._mapPanSession = {
                    pointerId: event.pointerId,
                    viewport,
                    image,
                    startX: event.clientX,
                    startY: event.clientY,
                    startOffsetX: this._mapViewportState.offsetX,
                    startOffsetY: this._mapViewportState.offsetY
                };

                this._onMapPanPointerMove ??= this.#onMapPanPointerMove.bind(this);
                this._onMapPanPointerUp ??= this.#onMapPanPointerUp.bind(this);
                document.addEventListener("pointermove", this._onMapPanPointerMove);
                document.addEventListener("pointerup", this._onMapPanPointerUp);
                viewport.classList.add("is-panning");
            });

            viewport.addEventListener("wheel", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#applyMapWheelZoom(viewport, image, event);
            }, { passive: false });

            if (image.complete && Number.isFinite(image.naturalWidth) && image.naturalWidth > 0) {
                this.#syncMapViewportTransform(viewport, image, { initializeScale: true });
            } else {
                image.addEventListener("load", () => {
                    this.#syncMapViewportTransform(viewport, image, { initializeScale: true });
                }, { once: true });
            }
        }
    }

    #wireInteractionHandlers() {
        const host = this.element?.querySelector("[data-layout-root='true']");
        if (!host) return;

        this.element?.querySelectorAll("[data-panel-id], [data-drag-panel-id]")?.forEach((panelButton) => {
            panelButton.addEventListener("dragstart", (event) => {
                const panelId = panelButton.dataset.panelId || panelButton.dataset.dragPanelId;
                event.dataTransfer?.setData("text/plain", panelId ?? "");
                event.dataTransfer.effectAllowed = "move";
            });
            panelButton.addEventListener("dragend", () => {
                this.interactionController.clearIntent();
                this.#hideGhost();
            });
        });

        host.addEventListener("dragover", (event) => {
            event.preventDefault();
            const stackElements = [...host.querySelectorAll("[data-stack-id]")];
            const intent = this.interactionController.computeIntent({
                event,
                rootElement: host,
                stackElements
            });
            if (!intent) return;

            this.ghostIntent = intent;
            const ghostRect = this.interactionController.computeGhostRect({ intent, rootElement: host });
            this.#showGhost(ghostRect, intent.label);
            event.dataTransfer.dropEffect = "move";
        });

        host.addEventListener("dragleave", (event) => {
            const related = event.relatedTarget;
            if (related && host.contains(related)) return;
            this.interactionController.clearIntent();
            this.#hideGhost();
        });

        host.addEventListener("drop", async (event) => {
            event.preventDefault();
            const panelId = event.dataTransfer?.getData("text/plain");
            const panelDef = PANEL_LIBRARY.find((panel) => panel.id === panelId);
            if (!panelDef) {
                this.#hideGhost();
                return;
            }

            const intent = this.interactionController.getIntent();
            const nextLayout = this.layoutEngine.applyDropIntent(panelDef, intent ?? { kind: "edge", dockId: "centerDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);

            this.interactionController.clearIntent();
            this.#hideGhost();
            this.render(false);
        });
    }

    #wireResizeHandlers() {
        this.element?.querySelectorAll("[data-action='dock-resizer']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "dock",
                    dockId: handle.dataset.dockId,
                    axis: handle.dataset.axis,
                    startX: event.clientX,
                    startY: event.clientY,
                    startWeights: this.layoutEngine.getDockWeightLayout()
                });
            });
        });

        this.element?.querySelectorAll("[data-action='floating-move-handle']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = handle.dataset.floatingId;
                const floatingWindow = this.layoutEngine.getLayout().root.floatingWindows.find((entry) => entry.id === floatingId);
                if (!floatingWindow) return;

                this.#beginResizeSession({
                    type: "floating-move",
                    floatingId,
                    panelDef: floatingWindow.panel ? { ...floatingWindow.panel } : null,
                    startX: event.clientX,
                    startY: event.clientY,
                    original: { x: floatingWindow.x, y: floatingWindow.y }
                });
            });
        });

        this.element?.querySelectorAll("[data-action='floating-resize-handle']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const floatingId = handle.dataset.floatingId;
                const floatingWindow = this.layoutEngine.getLayout().root.floatingWindows.find((entry) => entry.id === floatingId);
                if (!floatingWindow) return;

                this.#beginResizeSession({
                    type: "floating-resize",
                    floatingId,
                    startX: event.clientX,
                    startY: event.clientY,
                    original: {
                        x: floatingWindow.x,
                        y: floatingWindow.y,
                        width: floatingWindow.width,
                        height: floatingWindow.height
                    }
                });
            });
        });

        this.element?.querySelectorAll("[data-action='stack-splitter']")?.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#beginResizeSession({
                    type: "stack",
                    dockId: handle.dataset.dockId,
                    leadingStackId: handle.dataset.leadingStackId,
                    trailingStackId: handle.dataset.trailingStackId,
                    startX: event.clientX,
                    startY: event.clientY
                });
            });
        });
    }

    #beginResizeSession(session) {
        this._resizeSession = {
            ...session,
            accumulatedDeltaX: 0,
            accumulatedDeltaY: 0
        };
        this._onResizePointerMove = this._onResizePointerMove?.bind(this) ?? this.#onResizePointerMove.bind(this);
        this._onResizePointerUp = this._onResizePointerUp?.bind(this) ?? this.#onResizePointerUp.bind(this);
        document.addEventListener("pointermove", this._onResizePointerMove);
        document.addEventListener("pointerup", this._onResizePointerUp, { once: true });
    }

    async #onResizePointerUp() {
        document.removeEventListener("pointermove", this._onResizePointerMove);
        const session = this._resizeSession;
        this._resizeSession = null;

        if (session?.type === "floating-move" && session.panelDef?.id && session.panelDef?.title) {
            const intent = this.interactionController.getIntent();
            if (intent) {
                const droppedLayout = this.layoutEngine.applyDropIntent(session.panelDef, intent);
                await this.stateStore?.setUserLayout?.(droppedLayout);
                this.interactionController.clearIntent();
                this.#hideGhost();
                this.render(false);
                return;
            }
        }

        await this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
        this.interactionController.clearIntent();
        this.#hideGhost();
        this.render(false);
    }

    #onResizePointerMove(event) {
        if (!this._resizeSession) return;
        const deltaX = event.clientX - this._resizeSession.startX;
        const deltaY = event.clientY - this._resizeSession.startY;
        const hostBounds = this.element?.querySelector("[data-layout-root='true']")?.getBoundingClientRect();

        if (this._resizeSession.type === "dock") {
            const current = this._resizeSession.startWeights;
            const viewportWidth = Math.max(hostBounds?.width ?? window.innerWidth, 1);
            const viewportHeight = Math.max(hostBounds?.height ?? window.innerHeight, 1);
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;

            if (this._resizeSession.dockId === "leftDock" || this._resizeSession.dockId === "rightDock") {
                const pixelThreshold = 1;
                if (Math.abs(accumulatedX) >= pixelThreshold) {
                    const appliedDeltaX = Math.floor(accumulatedX);
                    const stepX = appliedDeltaX / viewportWidth;
                    if (this._resizeSession.dockId === "leftDock") {
                        this.layoutEngine.setDockWeight("leftDock", current.left + stepX);
                    } else {
                        this.layoutEngine.setDockWeight("rightDock", current.right - stepX);
                    }
                    this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                    void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                    this.#syncDockGridAndSplitters();
                }
            } else if (this._resizeSession.dockId === "topDock" || this._resizeSession.dockId === "bottomDock") {
                const pixelThreshold = 1;
                if (Math.abs(accumulatedY) >= pixelThreshold) {
                    const appliedDeltaY = Math.floor(accumulatedY);
                    const stepY = appliedDeltaY / viewportHeight;
                    if (this._resizeSession.dockId === "topDock") {
                        this.layoutEngine.setDockWeight("topDock", current.top + stepY);
                    } else {
                        this.layoutEngine.setDockWeight("bottomDock", current.bottom - stepY);
                    }
                    this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                    void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                    this.#syncDockGridAndSplitters();
                }
            }
            return;
        }

        if (this._resizeSession.type === "stack") {
            const dock = this.layoutEngine.getLayout().root[this._resizeSession.dockId] ?? { stacks: [] };
            const leading = dock.stacks.find((stack) => stack.id === this._resizeSession.leadingStackId);
            const trailing = dock.stacks.find((stack) => stack.id === this._resizeSession.trailingStackId);
            if (!leading || !trailing) return;

            const orientation = dock.orientation ?? "vertical";
            const accumulatedDelta = orientation === "horizontal" ? this._resizeSession.accumulatedDeltaX + deltaX : this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedDelta) >= pixelThreshold) {
                const appliedDelta = Math.floor(accumulatedDelta);
                const delta = appliedDelta / 100;
                this.layoutEngine.resizeStack(this._resizeSession.dockId, leading.id, delta, trailing.id);
                if (orientation === "horizontal") {
                    this._resizeSession.accumulatedDeltaX = accumulatedDelta - appliedDelta;
                } else {
                    this._resizeSession.accumulatedDeltaY = accumulatedDelta - appliedDelta;
                }
                void this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
                this.render(false);
            }
            return;
        }

        if (this._resizeSession.type === "floating-move") {
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedX) >= pixelThreshold || Math.abs(accumulatedY) >= pixelThreshold) {
                const appliedDeltaX = Math.abs(accumulatedX) >= pixelThreshold ? Math.floor(accumulatedX) : 0;
                const appliedDeltaY = Math.abs(accumulatedY) >= pixelThreshold ? Math.floor(accumulatedY) : 0;
                const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                    x: this._resizeSession.original.x + appliedDeltaX,
                    y: this._resizeSession.original.y + appliedDeltaY
                });
                this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                void this.stateStore?.setUserLayout?.(nextLayout);
                this.#syncFloatingElementStyle(this._resizeSession.floatingId, nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId));
            }

            const host = this.element?.querySelector("[data-layout-root='true']");
            const rootBounds = host?.getBoundingClientRect();
            const pointerInsideRoot = Boolean(rootBounds)
                && event.clientX >= rootBounds.left
                && event.clientX <= rootBounds.right
                && event.clientY >= rootBounds.top
                && event.clientY <= rootBounds.bottom;

            if (host && pointerInsideRoot) {
                const stackElements = [...host.querySelectorAll("[data-stack-id]")];
                const intent = this.interactionController.computeIntent({
                    event,
                    rootElement: host,
                    stackElements
                });
                if (intent) {
                    const ghostRect = this.interactionController.computeGhostRect({ intent, rootElement: host });
                    this.#showGhost(ghostRect, intent.label);
                } else {
                    this.interactionController.clearIntent();
                    this.#hideGhost();
                }
            } else {
                this.interactionController.clearIntent();
                this.#hideGhost();
            }
            return;
        }

        if (this._resizeSession.type === "floating-resize") {
            const accumulatedX = this._resizeSession.accumulatedDeltaX + deltaX;
            const accumulatedY = this._resizeSession.accumulatedDeltaY + deltaY;
            const pixelThreshold = 1;
            if (Math.abs(accumulatedX) >= pixelThreshold || Math.abs(accumulatedY) >= pixelThreshold) {
                const appliedDeltaX = Math.abs(accumulatedX) >= pixelThreshold ? Math.floor(accumulatedX) : 0;
                const appliedDeltaY = Math.abs(accumulatedY) >= pixelThreshold ? Math.floor(accumulatedY) : 0;
                const nextLayout = this.layoutEngine.updateFloatingWindow(this._resizeSession.floatingId, {
                    width: Math.max(MIN_FLOAT_WIDTH, this._resizeSession.original.width + appliedDeltaX),
                    height: Math.max(MIN_FLOAT_HEIGHT, this._resizeSession.original.height + appliedDeltaY)
                });
                this._resizeSession.accumulatedDeltaX = accumulatedX - appliedDeltaX;
                this._resizeSession.accumulatedDeltaY = accumulatedY - appliedDeltaY;
                void this.stateStore?.setUserLayout?.(nextLayout);
                this.#syncFloatingElementStyle(this._resizeSession.floatingId, nextLayout.root.floatingWindows.find((entry) => entry.id === this._resizeSession.floatingId));
            }
        }
    }

    #syncFloatingElementStyle(floatingId, floatingWindow) {
        const element = this.element?.querySelector(`[data-floating-id='${floatingId}']`);
        if (!element || !floatingWindow) return;

        element.style.left = `${floatingWindow.x}px`;
        element.style.top = `${floatingWindow.y}px`;
        element.style.width = `${floatingWindow.width}px`;
        element.style.height = `${floatingWindow.height}px`;
        element.style.zIndex = `${floatingWindow.zIndex}`;
    }

    #syncDockGridAndSplitters() {
        const host = this.element?.querySelector("[data-layout-root='true']");
        if (!host) return;

        const layout = this.layoutEngine.getLayout();
        const dockWeights = this.layoutEngine.getDockWeightLayout();
        const leftOccupied = this.#isDockOccupied(layout.root.leftDock);
        const rightOccupied = this.#isDockOccupied(layout.root.rightDock);
        const topOccupied = this.#isDockOccupied(layout.root.topDock);
        const bottomOccupied = this.#isDockOccupied(layout.root.bottomDock);

        const leftMin = leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const rightMin = rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px";
        const topMin = topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";
        const bottomMin = bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px";

        host.style.gridTemplateColumns = `minmax(${leftMin}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) minmax(${rightMin}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        host.style.gridTemplateRows = `minmax(${topMin}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr) minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) minmax(${bottomMin}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        const left = Number(dockWeights.left) || 0.18;
        const centerX = Number(dockWeights.centerX) || Math.max(0.2, 1 - left - (Number(dockWeights.right) || 0.18));
        const right = Number(dockWeights.right) || 0.18;
        const top = Number(dockWeights.top) || 0.18;
        const centerY = Number(dockWeights.centerY) || Math.max(0.2, 1 - top - (Number(dockWeights.bottom) || 0.18));
        const bottom = Number(dockWeights.bottom) || 0.18;
        const totalX = Math.max(0.0001, left + centerX + right);
        const totalY = Math.max(0.0001, top + centerY + bottom);

        const leftBoundary = (left / totalX) * 100;
        const rightBoundary = ((left + centerX) / totalX) * 100;
        const topBoundary = (top / totalY) * 100;
        const bottomBoundary = ((top + centerY) / totalY) * 100;

        const leftHandle = host.querySelector(".totc-v2-dock-resizer--left");
        const rightHandle = host.querySelector(".totc-v2-dock-resizer--right");
        const topHandle = host.querySelector(".totc-v2-dock-resizer--top");
        const bottomHandle = host.querySelector(".totc-v2-dock-resizer--bottom");
        if (leftHandle) leftHandle.style.left = `${leftBoundary}%`;
        if (rightHandle) rightHandle.style.left = `${rightBoundary}%`;
        if (topHandle) topHandle.style.top = `${topBoundary}%`;
        if (bottomHandle) bottomHandle.style.top = `${bottomBoundary}%`;

        this.#syncMapViewportTransforms({ initializeScale: false });
    }

    #syncMapViewportTransforms({ initializeScale = false } = {}) {
        const viewports = [...(this.element?.querySelectorAll("[data-action='map-viewport']") ?? [])];
        for (const viewport of viewports) {
            const image = viewport.querySelector("[data-action='map-image']");
            if (!(image instanceof HTMLImageElement)) continue;
            if (!image.complete || !Number.isFinite(image.naturalWidth) || image.naturalWidth <= 0) continue;
            this.#syncMapViewportTransform(viewport, image, { initializeScale });
        }
    }

    #syncMapViewportTransform(viewport, image, { initializeScale = false } = {}) {
        const viewportRect = viewport.getBoundingClientRect();
        const viewportWidth = Math.max(1, Math.round(viewportRect.width));
        const viewportHeight = Math.max(1, Math.round(viewportRect.height));
        const imageWidth = Math.max(1, image.naturalWidth);
        const imageHeight = Math.max(1, image.naturalHeight);

        const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const maxScale = Math.max(minScale, 8);

        if (initializeScale || !Number.isFinite(this._mapViewportState.scale)) {
            this._mapViewportState.scale = minScale;
            this._mapViewportState.offsetX = (viewportWidth - (imageWidth * minScale)) / 2;
            this._mapViewportState.offsetY = (viewportHeight - (imageHeight * minScale)) / 2;
        }

        this._mapViewportState.scale = this.#clamp(this._mapViewportState.scale, minScale, maxScale);

        const clampedOffsets = this.#clampMapOffsets({
            viewportWidth,
            viewportHeight,
            imageWidth,
            imageHeight,
            scale: this._mapViewportState.scale,
            offsetX: this._mapViewportState.offsetX,
            offsetY: this._mapViewportState.offsetY
        });
        this._mapViewportState.offsetX = clampedOffsets.offsetX;
        this._mapViewportState.offsetY = clampedOffsets.offsetY;

        image.style.transform = `translate(${this._mapViewportState.offsetX}px, ${this._mapViewportState.offsetY}px) scale(${this._mapViewportState.scale})`;
    }

    #applyMapWheelZoom(viewport, image, event) {
        const viewportRect = viewport.getBoundingClientRect();
        const viewportWidth = Math.max(1, Math.round(viewportRect.width));
        const viewportHeight = Math.max(1, Math.round(viewportRect.height));
        const imageWidth = Math.max(1, image.naturalWidth);
        const imageHeight = Math.max(1, image.naturalHeight);

        const minScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const maxScale = Math.max(minScale, 8);
        const currentScale = Number.isFinite(this._mapViewportState.scale) ? this._mapViewportState.scale : minScale;
        const zoomStep = event.deltaY < 0 ? 1.08 : 0.92;
        const nextScale = this.#clamp(currentScale * zoomStep, minScale, maxScale);
        if (Math.abs(nextScale - currentScale) < 0.0001) {
            this.#syncMapViewportTransform(viewport, image, { initializeScale: false });
            return;
        }

        const cursorX = event.clientX - viewportRect.left;
        const cursorY = event.clientY - viewportRect.top;
        const imageSpaceX = (cursorX - this._mapViewportState.offsetX) / currentScale;
        const imageSpaceY = (cursorY - this._mapViewportState.offsetY) / currentScale;

        const nextOffsetX = cursorX - (imageSpaceX * nextScale);
        const nextOffsetY = cursorY - (imageSpaceY * nextScale);
        const clampedOffsets = this.#clampMapOffsets({
            viewportWidth,
            viewportHeight,
            imageWidth,
            imageHeight,
            scale: nextScale,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY
        });

        this._mapViewportState.scale = nextScale;
        this._mapViewportState.offsetX = clampedOffsets.offsetX;
        this._mapViewportState.offsetY = clampedOffsets.offsetY;
        image.style.transform = `translate(${this._mapViewportState.offsetX}px, ${this._mapViewportState.offsetY}px) scale(${this._mapViewportState.scale})`;
    }

    #onMapPanPointerMove(event) {
        if (!this._mapPanSession) return;
        if (event.pointerId !== this._mapPanSession.pointerId) return;

        const { viewport, image, startX, startY, startOffsetX, startOffsetY } = this._mapPanSession;
        const viewportRect = viewport.getBoundingClientRect();
        const viewportWidth = Math.max(1, Math.round(viewportRect.width));
        const viewportHeight = Math.max(1, Math.round(viewportRect.height));
        const imageWidth = Math.max(1, image.naturalWidth);
        const imageHeight = Math.max(1, image.naturalHeight);

        const nextOffsetX = startOffsetX + (event.clientX - startX);
        const nextOffsetY = startOffsetY + (event.clientY - startY);
        const clampedOffsets = this.#clampMapOffsets({
            viewportWidth,
            viewportHeight,
            imageWidth,
            imageHeight,
            scale: this._mapViewportState.scale,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY
        });

        this._mapViewportState.offsetX = clampedOffsets.offsetX;
        this._mapViewportState.offsetY = clampedOffsets.offsetY;
        image.style.transform = `translate(${this._mapViewportState.offsetX}px, ${this._mapViewportState.offsetY}px) scale(${this._mapViewportState.scale})`;
    }

    #onMapPanPointerUp(event) {
        if (!this._mapPanSession) return;
        if (event.pointerId !== this._mapPanSession.pointerId) return;

        this.#endMapPanSession();
    }

    #endMapPanSession() {
        this._mapPanSession?.viewport?.classList?.remove("is-panning");
        this._mapPanSession = null;
        document.removeEventListener("pointermove", this._onMapPanPointerMove);
        document.removeEventListener("pointerup", this._onMapPanPointerUp);
    }

    #clampMapOffsets({ viewportWidth, viewportHeight, imageWidth, imageHeight, scale, offsetX, offsetY }) {
        const scaledWidth = imageWidth * scale;
        const scaledHeight = imageHeight * scale;

        const minX = scaledWidth > viewportWidth ? viewportWidth - scaledWidth : (viewportWidth - scaledWidth) / 2;
        const maxX = scaledWidth > viewportWidth ? 0 : (viewportWidth - scaledWidth) / 2;
        const minY = scaledHeight > viewportHeight ? viewportHeight - scaledHeight : (viewportHeight - scaledHeight) / 2;
        const maxY = scaledHeight > viewportHeight ? 0 : (viewportHeight - scaledHeight) / 2;

        return {
            offsetX: this.#clamp(offsetX, minX, maxX),
            offsetY: this.#clamp(offsetY, minY, maxY)
        };
    }

    #clamp(value, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return min;
        return Math.min(max, Math.max(min, numeric));
    }

    #isDockOccupied(dock) {
        return Boolean(dock?.stacks?.some((stack) => (stack?.panels?.length ?? 0) > 0));
    }

    #enforceRequiredDocking() {
        const mapPanel = PANEL_LIBRARY.find((panel) => panel.id === "map");
        const compendiumPanel = PANEL_LIBRARY.find((panel) => panel.id === "compendium");
        if (!mapPanel || !compendiumPanel) return null;

        let changed = false;
        const initialLayout = this.layoutEngine.getLayout();
        if (!this.#dockHasPanel(initialLayout, "centerDock", "map")) {
            this.layoutEngine.applyDropIntent(mapPanel, { kind: "edge", dockId: "centerDock" });
            changed = true;
        }

        const nextLayout = this.layoutEngine.getLayout();
        if (!this.#dockHasPanel(nextLayout, "rightDock", "compendium")) {
            this.layoutEngine.applyDropIntent(compendiumPanel, { kind: "edge", dockId: "rightDock" });
            changed = true;
        }

        return changed ? this.layoutEngine.getLayout() : null;
    }

    #dockHasPanel(layout, dockId, panelId) {
        const dock = layout?.root?.[dockId];
        if (!dock?.stacks?.length) return false;

        return dock.stacks.some((stack) => (stack?.panels ?? []).some((panel) => panel.id === panelId));
    }

    #getVisiblePanelIds(layout) {
        const visible = new Set();

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout?.root?.[dockId];
            for (const stack of dock?.stacks ?? []) {
                for (const panel of stack?.panels ?? []) {
                    if (panel?.id) visible.add(panel.id);
                }
            }
        }

        for (const window of layout?.root?.floatingWindows ?? []) {
            if (window?.panel?.id) visible.add(window.panel.id);
        }

        return visible;
    }

    async #getUnifiedCompendiumItems() {
        if (Array.isArray(this._compendiumItemEntries)) return this._compendiumItemEntries;
        if (this._compendiumItemsPromise) return await this._compendiumItemsPromise;

        this._compendiumItemsPromise = this.#loadUnifiedCompendiumItems();
        try {
            const entries = await this._compendiumItemsPromise;
            this._compendiumItemEntries = entries;
            return entries;
        } finally {
            this._compendiumItemsPromise = null;
        }
    }

    async #loadUnifiedCompendiumItems() {
        const packs = this.#getCompendiumPacks();
        const dedupedEntries = new Map();
        const semanticEntries = new Map();
        for (const pack of packs) {
            if (String(pack?.documentName ?? "").toLowerCase() !== "item") {
                continue;
            }
            if (this.#isAggregateCompendiumPack(pack)) {
                continue;
            }

            let indexEntries = [];
            try {
                const index = await pack.getIndex();
                if (Array.isArray(index)) {
                    indexEntries = index;
                } else if (Array.isArray(index?.contents)) {
                    indexEntries = index.contents;
                } else if (typeof index?.values === "function") {
                    indexEntries = Array.from(index.values());
                }
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to load compendium index", pack?.collection ?? pack?.metadata?.label, error);
                continue;
            }

            for (const entry of indexEntries) {
                const entryId = entry?._id ?? entry?.id;
                const uuid = entry?.uuid ?? (entryId ? `Compendium.${pack.collection}.${entryId}` : null);
                if (!uuid) continue;

                if (dedupedEntries.has(uuid)) continue;
                const itemEntry = {
                    uuid,
                    name: entry?.name ?? "Unnamed Entry",
                    type: String(entry?.type ?? "item"),
                    packLabel: pack?.metadata?.label ?? pack?.title ?? pack?.collection ?? "Compendium"
                };
                dedupedEntries.set(uuid, itemEntry);

                const semanticKey = this.#buildCompendiumSemanticKey(itemEntry);
                if (!semanticKey) continue;
                const existing = semanticEntries.get(semanticKey);
                if (!existing) {
                    semanticEntries.set(semanticKey, itemEntry);
                    continue;
                }

                if (this.#isBetterSemanticCompendiumEntry(itemEntry, existing)) {
                    semanticEntries.set(semanticKey, itemEntry);
                }
            }
        }

        const entries = semanticEntries.size
            ? Array.from(semanticEntries.values())
            : Array.from(dedupedEntries.values());

        entries.sort((left, right) => {
            const nameCompare = String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" });
            if (nameCompare !== 0) return nameCompare;
            return String(left.packLabel ?? "").localeCompare(String(right.packLabel ?? ""), undefined, { sensitivity: "base" });
        });

        return entries;
    }

    #getCompendiumPacks() {
        if (Array.isArray(game?.packs?.contents)) {
            return game.packs.contents;
        }

        if (typeof game?.packs?.values === "function") {
            return Array.from(game.packs.values());
        }

        const iterablePacks = Array.from(game?.packs ?? []);
        return iterablePacks.map((pack) => Array.isArray(pack) && pack.length > 1 ? pack[1] : pack);
    }

    #isAggregateCompendiumPack(pack) {
        const collection = String(pack?.collection ?? "").toLowerCase();
        return collection.endsWith(".starter-items") || collection.endsWith(".starter-actors");
    }

    #buildCompendiumSemanticKey(entry) {
        const type = String(entry?.type ?? "").trim().toLowerCase();
        const name = String(entry?.name ?? "").trim().toLowerCase();
        if (!name) return null;
        return `${type}|${name}`;
    }

    #isBetterSemanticCompendiumEntry(candidate, existing) {
        const existingAggregate = /starter library/i.test(String(existing?.packLabel ?? ""));
        const candidateAggregate = /starter library/i.test(String(candidate?.packLabel ?? ""));
        if (existingAggregate !== candidateAggregate) {
            return !candidateAggregate;
        }

        const existingLabel = String(existing?.packLabel ?? "").toLowerCase();
        const candidateLabel = String(candidate?.packLabel ?? "").toLowerCase();
        return candidateLabel < existingLabel;
    }

    #showGhost(rect, label) {
        const ghost = this.element?.querySelector("[data-drop-ghost='true']");
        const ghostLabel = this.element?.querySelector("[data-drop-label='true']");
        if (!ghost || !rect) return;

        ghost.hidden = false;
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        if (ghostLabel) {
            ghostLabel.textContent = label ?? "Drop Target";
        }
    }

    #hideGhost() {
        const ghost = this.element?.querySelector("[data-drop-ghost='true']");
        if (!ghost) return;
        ghost.hidden = true;
        ghost.style.removeProperty("left");
        ghost.style.removeProperty("top");
        ghost.style.removeProperty("width");
        ghost.style.removeProperty("height");
    }
}
