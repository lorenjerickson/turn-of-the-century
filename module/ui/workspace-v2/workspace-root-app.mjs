import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";
import { InteractionController } from "./interaction-controller.mjs";
import { GridCalibrationController } from "./grid-calibration-controller.mjs";
import { LayoutEngine } from "./layout-engine.mjs";
import { MapViewportController } from "./map-viewport-controller.mjs";
import { WorkspacePanelRegistry } from "./panel-registry.mjs";
import { openFoundrySettingsView } from "./workspace-system-menu.mjs";
import {
    focusWorkspaceTextInputAtEnd,
    isWorkspaceDebouncedTextInputTarget
} from "./workspace-text-inputs.mjs";
import {
    buildDiceRollFeedPanelModel,
    renderDiceRollFeedPanel
} from "./panels/dice-roll-feed-panel.mjs";
import {
    buildDesignLensModel,
    renderDesignLensSurface
} from "./panels/design-lens-panel.mjs";
import {
    buildDesignCommandPaletteModel,
    renderDesignCommandPalette
} from "./panels/design-command-palette.mjs";
import {
    buildInspectorPanelModel,
    renderInspectorPanel
} from "./panels/inspector-panel.mjs";
import { WorkspaceDesignActionRegistry } from "./design-action-registry.mjs";
import {
    getCompendiumPacks,
    loadUnifiedCompendiumItems
} from "./compendium-items.mjs";
import {
    buildDesignIssuesPanelModel,
    renderDesignIssuesPanel
} from "./panels/design-issues-panel.mjs";
import {
    buildGridCalibrationModel,
    renderGridCalibrationDialog,
    buildGridCalibrationSceneUpdate,
    buildGridCalibrationOverlayModel,
    buildSceneGridOverlayState,
    GRID_CAL_PHASE_HINTS
} from "./panels/grid-calibration.mjs";
import {
    buildSceneBackgroundUploadTarget,
    buildScenePropertiesPanelModel,
    buildScenePropertiesNameInputState,
    buildScenePropertiesUpdateData,
    resolveScenePropertiesScene,
    renderScenePropertiesPanel
} from "./panels/scene-properties-panel.mjs";
import {
    buildScenesPanelModel,
    renderScenesPanel
} from "./panels/scenes-panel.mjs";
import {
    createSceneDesignScene,
    uploadSceneBackgroundFile
} from "./design-actions/scene-actions.mjs";
import { buildEncounterPlanner } from "../../encounters/planner-context.mjs";
import {
    renderFoundryApplication,
    requireApplicationV2,
    requireCombatDocumentClass
} from "../../foundry-v14-runtime.mjs";

const ApplicationV2Base = requireApplicationV2();
const CombatDocumentClass = requireCombatDocumentClass();

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
const COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT = 38;
const COLLAPSED_LEFT_RIGHT_DOCK_WIDTH = 42;
const TEXT_INPUT_DEBOUNCE_MS = 300;
const COMPENDIUM_STARTUP_RETRY_LIMIT = 10;
const COMPENDIUM_STARTUP_RETRY_BASE_MS = 250;
const GM_PANEL_STATE_KEY = "gmPanelState";
const MARKET_PANEL_STATE_KEY = "marketPanelState";
const PLAYER_PANEL_STATE_KEY = "playerPanelState";
const MARKET_SCENE_FLAG_KEY = "workspaceV2Market";

const GM_PANEL_DEFAULT_STATE = Object.freeze({
    collapsedGroupIds: [],
    actionSearchQuery: "",
    allActionsExpanded: false,
    contextDebug: false
});

const MARKET_PANEL_DEFAULT_STATE = Object.freeze({
    selectedBuyerActorId: ""
});

const PLAYER_PANEL_DEFAULT_STATE = Object.freeze({
    selectedActorId: "",
    collapsedSectionIds: []
});

const MARKET_TRADABLE_ITEM_TYPES = Object.freeze(new Set([
    "armor",
    "weapon",
    "equipment",
    "consumable",
    "item"
]));

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
        id: "gm-create-scene",
        label: "Create Scene",
        description: "Create a new scene from a battle-map image in the organized world assets folder.",
        groupId: "scene-flow",
        keywords: ["scene", "map", "battlemap", "background", "image", "create"],
        isRelevant: () => true
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

function normalizeMarketPanelState(value = {}) {
    return {
        selectedBuyerActorId: String(value?.selectedBuyerActorId ?? MARKET_PANEL_DEFAULT_STATE.selectedBuyerActorId)
    };
}

function normalizePlayerPanelState(value = {}) {
    const collapsedSectionIds = Array.isArray(value?.collapsedSectionIds)
        ? [...new Set(value.collapsedSectionIds.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
        : [...PLAYER_PANEL_DEFAULT_STATE.collapsedSectionIds];

    return {
        selectedActorId: String(value?.selectedActorId ?? PLAYER_PANEL_DEFAULT_STATE.selectedActorId),
        collapsedSectionIds
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

function buildPlayerPanelModel({ actor = null, combat = null, panelState = {}, actorOptions = [], highlightedSectionIds = [] } = {}) {
    const system = actor?.system?.toObject?.() ?? foundry.utils.deepClone(actor?.system ?? {});
    const collapsedSectionIds = new Set(panelState?.collapsedSectionIds ?? []);
    const highlightedIds = new Set(highlightedSectionIds ?? []);

    const equipmentSlots = system.inventory?.equipment ?? {};
    const equippedIds = new Set(Object.values(equipmentSlots).flatMap((slot) => Array.isArray(slot?.itemIds) ? slot.itemIds : []).filter(Boolean));
    const allItems = Array.isArray(actor?.items?.contents) ? actor.items.contents : [];
    const actorItems = allItems.map((item) => ({
        id: item.id,
        name: item.name,
        type: String(item.type ?? "item"),
        img: item.img ?? "",
        quantity: Math.max(0, Math.floor(Number(item.system?.physical?.quantity ?? 1))),
        value: Math.max(0, Number(item.system?.value?.price ?? 0)),
        slot: String(item.system?.slot ?? ""),
        category: String(item.system?.category ?? "")
    }));

    const equippedBySlot = Object.entries(equipmentSlots)
        .filter(([, slot]) => Boolean(slot))
        .map(([slotKey, slot]) => ({
            key: slotKey,
            label: String(slot?.label ?? slotKey),
            items: (Array.isArray(slot?.itemIds) ? slot.itemIds : [])
                .map((itemId) => allItems.find((item) => item.id === itemId))
                .filter(Boolean)
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    type: String(item.type ?? "item"),
                    img: item.img ?? ""
                }))
        }));

    const inventoryItems = actorItems
        .filter((item) => !equippedIds.has(item.id))
        .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" }));
    const effects = Array.isArray(actor?.effects?.contents) ? actor.effects.contents : [];
    const activeEffects = effects
        .map((effect) => ({
            id: effect.id,
            name: effect.name,
            disabled: Boolean(effect.disabled),
            duration: effect.duration ?? null,
            label: effect.disabled ? "Inactive" : "Active"
        }))
        .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" }));

    const planner = actor ? buildEncounterPlanner(actor, actor?.getActiveTokens?.()?.[0] ?? actor?.token ?? null) : null;
    const quickActions = [];
    if (actor) {
        quickActions.push({ id: "open-sheet", label: "Open Actor Sheet", type: "sheet" });
        if (actor?.token || actor?.getActiveTokens?.()?.length) {
            quickActions.push({ id: "center-token", label: "Center on Token", type: "camera" });
        }
    }

    const statusSection = {
        id: "status",
        title: "Status",
        priority: combat ? 100 : 80,
        visible: Boolean(actor),
        collapsed: collapsedSectionIds.has("status"),
        highlighted: highlightedIds.has("status"),
        summary: actor ? `${String(actor.type ?? "Actor")} · ${activeEffects.length} effect${activeEffects.length === 1 ? "" : "s"}` : "No actor selected",
        rows: actor ? [
            { label: "Health", value: `${Number(system.resources?.health?.value ?? 0)} / ${Number(system.resources?.health?.max ?? 0)}` },
            { label: "Grit", value: `${Number(system.resources?.grit?.value ?? 0)} / ${Number(system.resources?.grit?.max ?? 0)}` },
            { label: "Armor Class", value: String(system.defenses?.armorClass ?? 0) },
            { label: "Initiative", value: String(system.defenses?.initiative ?? 0) },
            { label: "Level", value: String(system.progression?.level ?? 0) },
            { label: "Passive Perception", value: String(system.senses?.passivePerception ?? 0) }
        ] : []
    };

    const resourcesSection = {
        id: "resources",
        title: "Resources",
        priority: combat ? 90 : 70,
        visible: Boolean(actor),
        collapsed: collapsedSectionIds.has("resources"),
        highlighted: highlightedIds.has("resources"),
        summary: actor ? "Current pools and limits" : "No actor selected",
        rows: actor ? [
            { label: "Health", value: `${Number(system.resources?.health?.value ?? 0)} / ${Number(system.resources?.health?.max ?? 0)}` },
            { label: "Grit", value: `${Number(system.resources?.grit?.value ?? 0)} / ${Number(system.resources?.grit?.max ?? 0)}` },
            { label: "Encumbrance", value: `${Number(system.inventory?.pack?.encumbrance ?? 0)} / ${Number(system.inventory?.pack?.capacity ?? 0)}` },
            { label: "Wallet", value: `${Number(system.economy?.wallet?.gbp ?? 0)} GBP` }
        ] : []
    };

    const actionsSection = {
        id: "actions",
        title: "Actions",
        priority: combat ? 95 : 55,
        visible: Boolean(actor),
        collapsed: collapsedSectionIds.has("actions"),
        highlighted: highlightedIds.has("actions"),
        summary: combat ? `${planner?.availableActions?.length ?? 0} combat choices` : `${quickActions.length} quick actions`,
        actions: combat ? (planner?.availableActions ?? []).map((action) => ({
            id: action.id,
            label: action.label,
            detail: action.apLabel,
            img: action.img,
            disabled: false,
            type: action.type,
            apCost: action.apCost,
            apMin: action.apMin,
            apMax: action.apMax,
            variableAp: Boolean(action.variableAp),
            requiresToHit: Boolean(action.requiresToHit),
            itemId: action.itemId ?? null
        })) : quickActions
    };

    const effectsSection = {
        id: "effects",
        title: "Effects",
        priority: activeEffects.length ? 60 : 20,
        visible: activeEffects.length > 0,
        collapsed: collapsedSectionIds.has("effects"),
        highlighted: highlightedIds.has("effects"),
        summary: `${activeEffects.length} active effect${activeEffects.length === 1 ? "" : "s"}`,
        effects: activeEffects
    };

    const inventorySection = {
        id: "inventory",
        title: "Inventory",
        priority: inventoryItems.length ? 50 : 10,
        visible: inventoryItems.length > 0,
        collapsed: collapsedSectionIds.has("inventory"),
        highlighted: highlightedIds.has("inventory"),
        summary: `${inventoryItems.length} carried item${inventoryItems.length === 1 ? "" : "s"}`,
        items: inventoryItems
    };

    const equipmentSection = {
        id: "equipment",
        title: "Equipment",
        priority: equippedBySlot.some((slot) => slot.items.length) ? 52 : 12,
        visible: equippedBySlot.some((slot) => slot.items.length),
        collapsed: collapsedSectionIds.has("equipment"),
        highlighted: highlightedIds.has("equipment"),
        summary: "Currently equipped items only",
        slots: equippedBySlot.filter((slot) => slot.items.length)
    };

    const encounterSection = {
        id: "encounter",
        title: "Encounter",
        priority: planner ? 110 : 0,
        visible: Boolean(planner),
        collapsed: collapsedSectionIds.has("encounter"),
        highlighted: highlightedIds.has("encounter"),
        summary: planner ? `${planner.phase ?? "planning"} · ${planner.remainingAp ?? 0} AP remaining` : "",
        planner
    };

    const promptSection = {
        id: "prompts",
        title: "Prompts",
        priority: planner ? 85 : 40,
        visible: Boolean(actor),
        collapsed: collapsedSectionIds.has("prompts"),
        highlighted: highlightedIds.has("prompts"),
        summary: planner
            ? (planner.canCommit ? "Ready to commit this turn." : (planner.canRollInitiative ? "Roll initiative when ready." : "Follow the current encounter flow."))
            : "Open the sheet or select a token to focus the panel.",
        prompts: planner
            ? [planner.canCommit ? "Commit the turn once your plan is complete." : "Choose a tactical action or adjust your plan."]
            : ["Select or focus an actor to populate the player panel."]
    };

    const sections = [statusSection, resourcesSection, actionsSection, effectsSection, inventorySection, equipmentSection, encounterSection, promptSection]
        .filter((section) => section.visible)
        .sort((left, right) => right.priority - left.priority || String(left.title).localeCompare(String(right.title), undefined, { sensitivity: "base" }));

    return {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? "No actor selected",
        actorType: actor?.type ?? null,
        actorImage: actor?.img ?? "",
        actorOptions,
        sections,
        hasActor: Boolean(actor),
        hasCombat: Boolean(planner),
        selectedActorId: String(panelState?.selectedActorId ?? "")
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
        this.panelRegistry = new WorkspacePanelRegistry();
        this.designActionRegistry = new WorkspaceDesignActionRegistry();
        this.panels = this.panelRegistry.getAll();
        this.layoutEngine = new LayoutEngine({
            layout: this.stateStore?.getUserLayout?.(),
            panels: this.panels
        });
        this.interactionController = new InteractionController();
        this.ghostIntent = null;
        this.activeDesignLensPanelIds = new Set();
        this.designCommandPaletteOpen = false;
        this.designCommandPaletteQuery = "";
        this.compendiumSearchQuery = "";
        this._compendiumItemEntries = null;
        this._compendiumItemsPromise = null;
        this._resizeSession = null;
        this._textInputDebounceTimers = new Map();
        this.mapViewportController = new MapViewportController({
            stateStore: this.stateStore,
            onTransformChange: () => this.#drawGridCalibrationOverlay()
        });
        this.gridCalibrationController = new GridCalibrationController({
            sceneResolver: (state) => state.sceneId
                ? game.scenes?.get(state.sceneId)
                : (canvas?.scene ?? game.scenes?.viewed ?? null),
            notifications: globalThis.ui?.notifications,
            logger: console
        });
        this._scenePropertiesState = {
            sceneId: "",
            sceneName: null,
            selectedFilename: "",
            backgroundPath: "",
            createMode: false,
            status: "",
            error: ""
        };
        this._playerPanelSectionSnapshotInitialized = false;
        this._playerPanelVisibleSectionIds = new Set();
        this._sceneRefreshHandler = () => {
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._deletedSceneHandler = (scene) => {
            void this.#removeDeletedSceneMapPanel(scene);
        };
        this._compendiumRefreshHandler = () => {
            // Clear cache and refresh the compendium panel when game becomes ready
            this._compendiumItemEntries = null;
            this._compendiumItemsPromise = null;
            this._compendiumHydrationRetries = 0;
            this.#clearCompendiumHydrationRetry();
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._compendiumDocumentMutationHandler = (document, change, options = {}) => {
            const pack = options?.pack ?? document?.pack ?? document?.parent?.collection ?? null;
            if (!pack) return;
            this._compendiumRefreshHandler();
        };
        this._gamemasterRefreshHandler = () => {
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._playerRefreshHandler = () => {
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._designIssuesRefreshHandler = () => {
            if (this.rendered) this.render({ force: false });
        };
        this._sceneHooksBound = false;
        this._compendiumHooksBound = false;
        this._gamemasterHooksBound = false;
        this._playerHooksBound = false;
        this._designIssuesHooksBound = false;
        this._compendiumHydrationRetries = 0;
        this._compendiumHydrationRetryTimer = null;
    }

    /**
     * Track which section/group IDs are newly revealed for a given panel.
     * Returns an array of IDs that are visible now but were not visible last render.
     */
    #trackPanelSectionHighlights(panelKey, visibleIds) {
        if (!this._panelSectionSnapshots) this._panelSectionSnapshots = {};
        const prev = this._panelSectionSnapshots[panelKey] || new Set();
        const now = new Set(visibleIds);
        const revealed = visibleIds.filter((id) => !prev.has(id));
        this._panelSectionSnapshots[panelKey] = now;
        return revealed;
    }

    /**
     * Render a list of collapsible sections/groups with highlight-on-reveal.
     * Accepts: sections [{id, title, summary, collapsed, highlighted, ...}],
     *          opts: { panelId, toggleAction, sectionClass, headerClass, bodyClass, sectionType }
     */
    #renderCollapsibleSections(sections, opts = {}) {
        const {
            panelId = "panel",
            toggleAction = "toggle-section",
            sectionClass = "totc-v2-shared-panel__section",
            headerClass = "totc-v2-shared-panel__section-header",
            bodyClass = "totc-v2-shared-panel__section-body",
            sectionType = "section"
        } = opts;
        return (sections ?? []).map((section) => {
            const collapsed = Boolean(section.collapsed);
            const revealClass = section.highlighted ? "is-revealed" : "";
            return `
            <article class="${sectionClass} ${collapsed ? "is-collapsed" : ""} ${revealClass}" data-${panelId}-${sectionType}-id="${this.#escapeHTML(section.id)}">
                <button type="button" class="${headerClass}" data-action="${toggleAction}" data-${sectionType}-id="${this.#escapeHTML(section.id)}" aria-expanded="${collapsed ? "false" : "true"}">
                    <span>${this.#escapeHTML(section.title)}</span>
                    <span class="${sectionClass}-meta">${this.#escapeHTML(section.summary ?? "")}</span>
                </button>
                <div class="${bodyClass}" ${collapsed ? "hidden" : ""}>
                    ${section.body ?? ""}
                </div>
            </article>`;
        }).join("");
    }

    async _prepareContext(options) {
        const policy = this.stateStore?.getPolicy?.() ?? { enabled: false, debugGovernance: false };
        const userLayout = this.stateStore?.getUserLayout?.() ?? this.layoutEngine.getLayout();
        this.layoutEngine.setLayout(userLayout);
        const enforcedLayout = this.#enforceRequiredDocking();
        if (enforcedLayout) {
            await this.stateStore?.setUserLayout?.(enforcedLayout);
        }
        const activeLayout = this.layoutEngine.getLayout();
        const visiblePanels = this.#getVisiblePanelIds(activeLayout);
        const activeWorkspacePanel = this.#getPrimaryActivePanel(activeLayout);
        const viewedScene = this.#getViewedScene();
        const scene = canvas?.scene ?? game.scenes?.active ?? viewedScene;
        const scenePropertiesScene = resolveScenePropertiesScene({
            activePanel: activeWorkspacePanel,
            viewedScene,
            defaultScene: scene,
            sceneResolver: (sceneId) => this.#getSceneDocumentById(sceneId)
        });
        const combat = game.combats?.active ?? game.combat ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const gmPanelState = this.#getGamemasterPanelState();
        const gmSnapshot = buildGamemasterContextSnapshot({ scene, combat, controlledTokens });
        const gmPanel = buildGamemasterPanelModel({
            snapshot: gmSnapshot,
            panelState: gmPanelState
        });
        const compendiumItems = await this.#getUnifiedCompendiumItems();
        const diceRollFeedPanel = buildDiceRollFeedPanelModel({
            messages: game.messages?.contents ?? game.messages ?? [],
            limit: 20
        });
        const inspectorPanel = buildInspectorPanelModel({
            activePanel: activeWorkspacePanel,
            scene,
            combat,
            controlledTokens,
            isGM: Boolean(game.user?.isGM),
            registry: this.designActionRegistry
        });
        const marketPanelState = this.#getMarketPanelState();
        const marketPanel = await this.#buildMarketPanelModel({
            scene,
            controlledTokens,
            panelState: marketPanelState,
            compendiumItems
        });
        const playerPanelState = this.#getPlayerPanelState();
        const playerActors = this.#getPlayerPanelActors(controlledTokens);
        const selectedPlayerActor = this.#resolvePlayerPanelActor({ playerActors, playerPanelState });
        const playerActorOptions = playerActors.map((actorOption) => ({
            id: actorOption.id,
            name: actorOption.name,
            selected: actorOption.id === selectedPlayerActor?.id
        }));
        if (selectedPlayerActor?.id && selectedPlayerActor.id !== playerPanelState.selectedActorId) {
            await this.#setPlayerPanelStatePatch({ selectedActorId: selectedPlayerActor.id });
        }
        // Player panel highlight tracking
        const playerPanel = buildPlayerPanelModel({
            actor: selectedPlayerActor,
            combat,
            panelState: playerPanelState,
            actorOptions: playerActorOptions,
            highlightedSectionIds: []
        });
        const playerVisibleSectionIds = playerPanel.sections.map((section) => section.id);
        const playerHighlightedSectionIds = this.#trackPanelSectionHighlights("player", playerVisibleSectionIds);
        const highlightedPlayerPanel = {
            ...playerPanel,
            sections: playerPanel.sections.map((section) => ({
                ...section,
                highlighted: playerHighlightedSectionIds.includes(section.id)
            }))
        };

        // GM panel highlight tracking (groups)
        const gmVisibleGroupIds = gmPanel.groups?.map((g) => g.id) ?? [];
        const gmHighlightedGroupIds = this.#trackPanelSectionHighlights("gm", gmVisibleGroupIds);
        const highlightedGmPanel = {
            ...gmPanel,
            groups: gmPanel.groups?.map((group) => ({
                ...group,
                highlighted: gmHighlightedGroupIds.includes(group.id)
            })) ?? [],
        };

        const worldActors = Array.from(game.actors?.contents ?? []);
        const designIssuesPanel = buildDesignIssuesPanelModel({
            scene,
            actors: worldActors,
            combat
        });

        return {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: this.panels,
            panelVisibility: this.panelRegistry.getVisibilityModel(visiblePanels),
            designCommandPalette: buildDesignCommandPaletteModel({
                active: this.designCommandPaletteOpen,
                activePanel: activeWorkspacePanel,
                isGM: Boolean(game.user?.isGM),
                query: this.designCommandPaletteQuery,
                registry: this.designActionRegistry
            }),
            layout: activeLayout,
            dockWeights: this.layoutEngine.getDockWeightLayout(),
            compendiumSearchQuery: this.compendiumSearchQuery,
            compendiumItems,
            diceRollFeedPanel,
            inspectorPanel,
            scene: {
                id: scene?.id ?? null,
                name: scene?.name ?? game.scenes?.viewed?.name ?? "Current Scene",
                mapSrc: this.#getSceneMapSource(scene),
                width: Number(scene?.width ?? canvas?.dimensions?.sceneWidth ?? 0),
                height: Number(scene?.height ?? canvas?.dimensions?.sceneHeight ?? 0),
                shiftX: Number(scene?.shiftX ?? 0),
                shiftY: Number(scene?.shiftY ?? 0),
                grid: {
                    type: Number(scene?.grid?.type ?? 1),
                    size: Number(scene?.grid?.size ?? 100),
                    distance: Number(scene?.grid?.distance ?? 5),
                    units: String(scene?.grid?.units ?? "ft")
                }
            },
            scenesPanel: buildScenesPanelModel({
                scenes: game.scenes,
                currentScene: scene,
                viewedScene: game.scenes?.viewed ?? null
            }),
            gm: gmSnapshot,
            gmPanel: highlightedGmPanel,
            marketPanel,
            playerPanel: highlightedPlayerPanel,
            designIssuesPanel,
            scenePropertiesPanel: buildScenePropertiesPanelModel({
                ...this._scenePropertiesState,
                scene: scenePropertiesScene
            })
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
        const leftTrack = leftOccupied && layoutRoot.leftDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr)`;
        const rightTrack = rightOccupied && layoutRoot.rightDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const topTrack = topOccupied && layoutRoot.topDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr)`;
        const bottomTrack = bottomOccupied && layoutRoot.bottomDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;
        const columnTemplate = `${leftTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) ${rightTrack}`;
        const rowTemplate = `${topTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) ${bottomTrack}`;

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
        ${game.user?.isGM ? `<button type="button" class="totc-v2-emergency-button" data-action="toggle-design-command-palette" title="Open design command palette" aria-label="Open design command palette" aria-expanded="${context.designCommandPalette?.active ? "true" : "false"}">
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        </button>` : ""}
        <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-command-menu-toggle" title="Open workspace menu" aria-label="Open workspace menu" aria-expanded="false">
            <i class="fas fa-gear" aria-hidden="true"></i>
        </button>
        <div class="totc-v2-command-menu" data-command-menu="true" hidden>
            <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-open-foundry-settings">Foundry Settings</button>
            <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-exit-world">Return to Setup</button>
            <div class="totc-v2-command-menu__divider" role="separator" aria-hidden="true"></div>
            <section class="totc-v2-command-menu__panel-list" aria-label="Panels">
                ${panelToggleMarkup}
            </section>
        </div>
        ${renderDesignCommandPalette(context.designCommandPalette ?? {}, { escapeHTML: (value) => this.#escapeHTML(value) })}
    </div>
    <main class="totc-workspace-v2-shell__main">
        <section class="totc-v2-layout" data-layout-root="true" style="grid-template-columns:${columnTemplate};grid-template-rows:${rowTemplate};">
            ${docksMarkup}
            ${this.#renderDockSplittersMarkup(dockWeights, layoutRoot)}
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
        this.#bindPlayerHooks();
        this.#bindDesignIssuesHooks();

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

        this.element?.querySelectorAll("[data-action='totc-v2-open-foundry-settings']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openFoundrySettingsView({ game, ui, foundry });
                const menu = this.element?.querySelector("[data-command-menu='true']");
                const toggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
                if (menu) menu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
            });
        });

        this.#wireDebouncedTextInputHandlers();

        this.element?.querySelectorAll("[data-action='market-select-buyer']")?.forEach((input) => {
            input.addEventListener("change", async () => {
                await this.#setMarketPanelStatePatch({ selectedBuyerActorId: String(input.value ?? "") });
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='market-buy-item']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const offerId = String(button.dataset.offerId ?? "").trim();
                if (!offerId) return;
                const quantityInput = button.closest(".totc-v2-market-panel__entry-actions")?.querySelector("[data-action='market-buy-quantity']");
                const quantity = this.#parseMarketQuantityInput(quantityInput, {
                    fallback: 1,
                    max: Number(button.dataset.maxQuantity ?? 1)
                });
                await this.#handleMarketBuy(offerId, quantity);
            });
        });

        this.element?.querySelectorAll("[data-action='market-sell-item']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const itemId = String(button.dataset.itemId ?? "").trim();
                if (!itemId) return;
                const quantityInput = button.closest(".totc-v2-market-panel__entry-actions")?.querySelector("[data-action='market-sell-quantity']");
                const quantity = this.#parseMarketQuantityInput(quantityInput, {
                    fallback: 1,
                    max: Number(button.dataset.maxQuantity ?? 1)
                });
                await this.#handleMarketSell(itemId, quantity);
            });
        });

        this.element?.querySelectorAll("[data-action='player-select-actor']")?.forEach((select) => {
            select.addEventListener("change", async () => {
                await this.#setPlayerPanelStatePatch({ selectedActorId: String(select.value ?? "") });
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='player-toggle-section']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const sectionId = String(button.dataset.sectionId ?? "").trim();
                if (!sectionId) return;

                const current = this.#getPlayerPanelState();
                const collapsed = new Set(current.collapsedSectionIds ?? []);
                if (collapsed.has(sectionId)) collapsed.delete(sectionId);
                else collapsed.add(sectionId);
                await this.#setPlayerPanelStatePatch({ collapsedSectionIds: [...collapsed] });
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='player-open-sheet']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actorId = String(button.dataset.actorId ?? "").trim();
                const actor = actorId ? game.actors?.get?.(actorId) : null;
                if (!actor) return;
                renderFoundryApplication(actor?.sheet, { force: true });
            });
        });

        this.element?.querySelectorAll("[data-action='player-center-token']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actorId = String(button.dataset.actorId ?? "").trim();
                const actor = actorId ? game.actors?.get?.(actorId) : null;
                if (!actor) return;
                const token = actor?.getActiveTokens?.()?.[0] ?? actor?.token ?? null;
                if (!token) return;
                await canvas?.animatePan?.({ x: token.center?.x ?? token.x, y: token.center?.y ?? token.y, scale: canvas.stage?.scale?.x ?? 1 });
            });
        });

        this.element?.querySelectorAll("[data-action='player-execute-encounter-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const combat = game.combat;
                if (!combat?.addCombatantAction) {
                    ui.notifications?.warn("Encounter actions are not available right now.");
                    return;
                }

                const actorId = String(button.dataset.actorId ?? "").trim();
                const actor = actorId ? game.actors?.get?.(actorId) : null;
                const combatant = actor ? combat.getCombatantByActor?.(actor.id) ?? combat.combatants?.contents?.find((entry) => entry.actorId === actor.id) ?? null : null;
                if (!combatant) {
                    ui.notifications?.warn("This actor is not part of the current encounter.");
                    return;
                }

                if (button.dataset.variableAp === "true" || button.dataset.requiresToHit === "true") {
                    ui.notifications?.info("Use the actor sheet planner for configurable encounter actions.");
                    return;
                }

                const actionData = {
                    id: String(button.dataset.playerActionId ?? ""),
                    type: String(button.dataset.playerActionType ?? "action"),
                    label: button.querySelector("span")?.textContent?.trim() ?? String(button.dataset.playerActionId ?? "Action"),
                    apCost: Math.max(1, Number(button.dataset.apCost ?? 1)),
                    apMin: Math.max(1, Number(button.dataset.apMin ?? 1)),
                    apMax: Math.max(1, Number(button.dataset.apMax ?? 1)),
                    variableAp: button.dataset.variableAp === "true",
                    requiresToHit: button.dataset.requiresToHit === "true",
                    itemId: String(button.dataset.itemId ?? "") || null
                };

                await combat.addCombatantAction(combatant.id, actionData);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='toggle-design-lens']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const panelId = String(button.dataset.panelId ?? "").trim();
                if (!panelId || !game.user?.isGM) return;

                if (this.activeDesignLensPanelIds.has(panelId)) this.activeDesignLensPanelIds.delete(panelId);
                else this.activeDesignLensPanelIds.add(panelId);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='design-lens-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(button.dataset.designActionId ?? "").trim();
                const panelId = String(button.dataset.panelId ?? "").trim();
                await this.#executeDesignAction(actionId, { panelId });
            });
        });

        this.element?.querySelectorAll("[data-action='toggle-design-command-palette']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.designCommandPaletteOpen = !this.designCommandPaletteOpen;
                if (!this.designCommandPaletteOpen) this.designCommandPaletteQuery = "";
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='design-command-palette-execute']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(button.dataset.designActionId ?? "").trim();
                const panelId = String(button.dataset.panelId ?? "").trim();
                await this.#executeDesignAction(actionId, { panelId });
                this.designCommandPaletteOpen = false;
                this.designCommandPaletteQuery = "";
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='inspector-design-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(button.dataset.designActionId ?? "").trim();
                const panelId = String(button.dataset.panelId ?? "").trim();
                await this.#executeDesignAction(actionId, { panelId });
            });
        });

        this.element?.querySelectorAll("[data-action='navigate-design-issue']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const navigateAction = String(button.dataset.navigateAction ?? "").trim();
                const subjectId = String(button.dataset.subjectId ?? "").trim();
                const subjectType = String(button.dataset.subjectType ?? "").trim();
                await this.#executeDesignIssueNavigation(navigateAction, { subjectId, subjectType });
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
            const commandPalette = this.element?.querySelector("[data-design-command-palette='true']");
            const commandPaletteToggle = this.element?.querySelector("[data-action='toggle-design-command-palette']");

            const target = event.target;
            if (!(target instanceof Node)) return;

            if (menu && !menu.hidden && !menu.contains(target) && !toggleButton?.contains(target)) {
                menu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
            }

            if (this.designCommandPaletteOpen && commandPalette && !commandPalette.contains(target) && !commandPaletteToggle?.contains(target)) {
                this.designCommandPaletteOpen = false;
                this.designCommandPaletteQuery = "";
                this.render({ force: false });
            }
        });

        this.element?.querySelectorAll("[data-action='toggle-panel-visibility']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", async (event) => {
                event.stopPropagation();
                const panelId = checkbox.dataset.panelId;
                if (!panelId) return;

                const panelDef = this.panelRegistry.get(panelId);
                if (!panelDef) return;

                const nextLayout = checkbox.checked
                    ? this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? null })
                    : this.layoutEngine.closePanel(panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='toggle-dock-collapse']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const dockId = button.dataset.dockId;
                if (!dockId) return;

                const nextLayout = this.layoutEngine.toggleDockCollapsed(dockId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='activate-tab']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const { dockId, stackId, panelId } = button.dataset;
                if (!dockId || !stackId || !panelId) return;

                const nextLayout = this.layoutEngine.setActivePanel(dockId, stackId, panelId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='open-scene-map']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const sceneId = String(button.dataset.sceneId ?? "").trim();
                if (!sceneId) return;

                if (event.detail > 1) {
                    await this.#activateScene(this.#getSceneDocumentById(sceneId));
                    return;
                }

                const nextLayout = this.#openSceneMapPanel(sceneId);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='scenes-create-scene']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#executeDesignAction("scene.create", { panelId: "scenes" });
            });
        });

        this.element?.querySelectorAll("[data-action='float-panel']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const panelId = button.dataset.panelId;
                const panelDef = this.#resolvePanelDefinition(panelId);
                if (!panelDef) return;

                const nextLayout = this.layoutEngine.floatPanel(panelDef);
                await this.stateStore?.setUserLayout?.(nextLayout);
                this.render({ force: false });
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
                this.render({ force: false });
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
                this.render({ force: false });
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
                this.render({ force: false });
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
                this.render({ force: false });
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
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='gm-toggle-all-actions']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const current = this.#getGamemasterPanelState();
                await this.#setGamemasterPanelStatePatch({ allActionsExpanded: !current.allActionsExpanded });
                this.render({ force: false });
            });
        });

        this.#wireMapInteractionHandlers();
        this.#wireGridCalibrationHandlers();
        this.#wireScenePropertiesHandlers();

        this.#wireInteractionHandlers();
        this.#wireResizeHandlers();
    }

    async close(options = {}) {
        this.#unbindSceneHooks();
        this.#unbindCompendiumHooks();
        this.#unbindGamemasterHooks();
        this.#unbindPlayerHooks();
        this.#unbindDesignIssuesHooks();
        this.#endMapPanSession();
        this.gridCalibrationController.close();
        return await super.close?.(options);
    }

    #renderDockMarkup(dockId, dock = { stacks: [] }, context = {}) {
        const collapsed = dockId !== "centerDock" && Boolean(dock?.collapsed);
        const stackItemsMarkup = (dock?.stacks ?? [])
            .map((stack, index, stacks) => {
                const stackMarkup = this.#renderStackMarkup(dockId, stack, context, {
                    includeDockLabel: false,
                    dockLabel: DOCK_LABELS[dockId] ?? dockId,
                    dockCollapsed: collapsed
                });
                const splitterMarkup = !collapsed && index < stacks.length - 1
                    ? this.#renderStackSplitterMarkup(dockId, stack.id, stacks[index + 1]?.id, dock?.orientation)
                    : "";
                return `${stackMarkup}${splitterMarkup}`;
            })
            .join("");
        const orientationClass = dock?.orientation === "horizontal" ? "is-horizontal" : "is-vertical";
        const collapsedClass = collapsed ? "is-collapsed" : "";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass} ${collapsedClass}" data-dock-id="${dockId}" data-collapsed="${collapsed ? "true" : "false"}">
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
                ${this.#renderPanelTabIcon(panel, context)}
                <span>${this.#escapeHTML(this.#getPanelTitle(panel, context))}</span>
            </button>`)
            .join("");

        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        const collapsed = Boolean(options.dockCollapsed);
        const panelContent = collapsed ? "" : this.#renderPanelContent(activePanel, context);
        const designLensActive = this.#isDesignLensActive(activePanel?.id);
        const designButtonTitle = designLensActive ? "Close design lens" : "Open design lens";
        const canCollapseDock = dockId !== "centerDock";
        const collapseTitle = collapsed ? "Restore dock" : "Minimize dock";

        return `
        <article class="totc-v2-stack ${collapsed ? "is-collapsed" : ""}" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
            <div class="totc-v2-stack__header">
                <div class="totc-v2-stack__tabs">
                    ${options.includeDockLabel ? `<span class="totc-v2-dock-label-inline">${this.#escapeHTML(options.dockLabel ?? dockId)}</span>` : ""}
                    ${tabsMarkup}
                </div>
                <div class="totc-v2-stack__actions">
                    ${canCollapseDock ? `<button type="button" data-action="toggle-dock-collapse" data-dock-id="${dockId}" title="${collapseTitle}" aria-label="${collapseTitle}" aria-pressed="${collapsed ? "true" : "false"}"><i class="fa-solid ${collapsed ? "fa-expand" : "fa-compress"}" aria-hidden="true"></i></button>` : ""}
                    ${game.user?.isGM ? `<button type="button" class="${designLensActive ? "is-active" : ""}" data-action="toggle-design-lens" data-panel-id="${activePanel?.id ?? ""}" title="${designButtonTitle}" aria-label="${designButtonTitle}" aria-pressed="${designLensActive ? "true" : "false"}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>` : ""}
                    <button type="button" data-action="undock-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}" title="Undock panel" aria-label="Undock panel"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
                    <button type="button" data-action="close-panel" data-dock-id="${dockId}" data-stack-id="${stack.id}" data-panel-id="${activePanel?.id ?? ""}" title="Close panel" aria-label="Close panel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
            </div>
            <div class="totc-v2-stack__content" ${collapsed ? "hidden" : ""}>${panelContent}</div>
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

    #renderDockSplittersMarkup(dockWeights = {}, layoutRoot = {}) {
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
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--left ${layoutRoot.leftDock?.collapsed ? "is-hidden" : ""}" style="left:${leftBoundary}%;" data-action="dock-resizer" data-dock-id="leftDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--right ${layoutRoot.rightDock?.collapsed ? "is-hidden" : ""}" style="left:${rightBoundary}%;" data-action="dock-resizer" data-dock-id="rightDock" data-axis="x" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--top ${layoutRoot.topDock?.collapsed ? "is-hidden" : ""}" style="top:${topBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="topDock" data-axis="y" title="Resize dock"></div>
        <div class="totc-v2-dock-resizer totc-v2-dock-resizer--bottom ${layoutRoot.bottomDock?.collapsed ? "is-hidden" : ""}" style="top:${bottomBoundary}%;--totc-v2-center-left:${centerLeftBoundary};--totc-v2-center-right:${centerRightBoundary};" data-action="dock-resizer" data-dock-id="bottomDock" data-axis="y" title="Resize dock"></div>`;
    }

    #renderFloatingWindowsMarkup(floatingWindows = []) {
        return floatingWindows.map((floatingWindow) => {
            const floatingContext = {
                scene: {
                    name: game.scenes?.viewed?.name ?? "Current Scene",
                    mapSrc: this.#getSceneMapSource(canvas?.scene ?? game.scenes?.viewed ?? null)
                }
            };
            const title = this.#escapeHTML(this.#getPanelTitle(floatingWindow.panel, floatingContext) ?? "Floating Panel");
            const designLensActive = this.#isDesignLensActive(floatingWindow.panel?.id);
            const designButtonTitle = designLensActive ? "Close design lens" : "Open design lens";
            const content = this.#renderPanelContent(floatingWindow.panel, floatingContext);

            return `
            <article
                class="totc-v2-floating"
                data-floating-id="${floatingWindow.id}"
                style="left:${floatingWindow.x}px;top:${floatingWindow.y}px;width:${floatingWindow.width}px;height:${floatingWindow.height}px;z-index:${floatingWindow.zIndex};">
                <header class="totc-v2-floating__header" data-action="floating-move-handle" data-floating-id="${floatingWindow.id}">
                    <span>${title}</span>
                    <div class="totc-v2-floating__buttons">
                        ${game.user?.isGM ? `<button type="button" class="${designLensActive ? "is-active" : ""}" data-action="toggle-design-lens" data-panel-id="${floatingWindow.panel?.id ?? ""}" title="${designButtonTitle}" aria-label="${designButtonTitle}" aria-pressed="${designLensActive ? "true" : "false"}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>` : ""}
                        <button type="button" data-action="redock-panel" data-floating-id="${floatingWindow.id}" title="Redock panel" aria-label="Redock panel"><i class="fa-solid fa-compress" aria-hidden="true"></i></button>
                        <button type="button" data-action="floating-close" data-floating-id="${floatingWindow.id}" title="Close panel" aria-label="Close panel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                    </div>
                </header>
                <section class="totc-v2-floating__body">${content}</section>
                <div class="totc-v2-floating__resize-handle" data-action="floating-resize-handle" data-floating-id="${floatingWindow.id}" title="Resize"></div>
            </article>`;
        }).join("");
    }

    #renderPanelContent(panel, context = {}) {
        const content = this.#renderPanelBodyContent(panel, context);
        const designLensModel = buildDesignLensModel({
            panel,
            active: this.#isDesignLensActive(panel?.id),
            isGM: Boolean(game.user?.isGM),
            registry: this.designActionRegistry
        });
        const designLens = renderDesignLensSurface(designLensModel, {
            escapeHTML: (value) => this.#escapeHTML(value)
        });

        return designLens
            ? `<div class="totc-v2-panel-with-design-lens">${designLens}<div class="totc-v2-panel-with-design-lens__body">${content}</div></div>`
            : content;
    }

    #renderPanelBodyContent(panel, context = {}) {
        if (!panel) {
            return `<div class="totc-v2-panel-placeholder">Empty</div>`;
        }

        if (this.#isMapPanel(panel)) {
            const mapScene = this.#getMapPanelScene(panel, context);
            const sceneName = this.#escapeHTML(mapScene?.name ?? "Current Scene");
            const mapSrc = mapScene?.mapSrc ?? "";
            const dimensions = [mapScene?.width, mapScene?.height].filter((value) => Number.isFinite(value) && value > 0);
            const dimensionLabel = dimensions.length === 2 ? `${dimensions[0]} × ${dimensions[1]}` : "Scene map";

            const calModel = buildGridCalibrationModel({
                state: this.gridCalibrationController.state,
                scene: mapScene
            });
            const calActive = calModel.active;
            const sceneGridOverlayActive = Boolean(!calActive && buildSceneGridOverlayState(mapScene));
            const gridOverlayActive = calActive || sceneGridOverlayActive;
            const calDialog = renderGridCalibrationDialog(calModel, { escapeHTML: (v) => this.#escapeHTML(v) });

            const imageMarkup = mapSrc
                ? `<div class="totc-v2-map-panel__viewport${calActive ? " is-calibrating" : ""}" data-action="map-viewport" data-map-viewport="true"
                    data-map-key="${this.#escapeHTML(mapScene?.id ?? mapSrc)}"
                    data-grid-type="${this.#escapeHTML(mapScene?.grid?.type ?? "")}"
                    data-grid-size="${this.#escapeHTML(mapScene?.grid?.size ?? "")}"
                    data-grid-shift-x="${this.#escapeHTML(mapScene?.shiftX ?? 0)}"
                    data-grid-shift-y="${this.#escapeHTML(mapScene?.shiftY ?? 0)}">
                    <img class="totc-v2-map-panel__image" src="${this.#escapeHTML(mapSrc)}" alt="${sceneName}" draggable="false" data-action="map-image">
                    ${gridOverlayActive ? `<svg class="totc-v2-map-panel__grid-overlay" data-grid-overlay="true" aria-hidden="true"></svg>` : ""}
                </div>`
                : `<div class="totc-v2-map-panel__empty">No active scene map available</div>`;

            return `
            <figure class="totc-v2-map-panel${calActive ? " is-calibrating" : ""}">
                ${imageMarkup}
                <figcaption class="totc-v2-map-panel__caption">
                    <span class="totc-v2-map-panel__name">${sceneName}</span>
                    <span class="totc-v2-map-panel__meta">${this.#escapeHTML(dimensionLabel)}</span>
                </figcaption>
                ${calDialog}
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

        if (panel.id === "scenes") {
            return renderScenesPanel(context.scenesPanel ?? {}, {
                escapeHTML: (value) => this.#escapeHTML(value)
            });
        }

        if (panel.id === "market") {
            return this.#renderMarketPanel(context.marketPanel ?? {});
        }

        if (panel.id === "inspector") {
            return renderInspectorPanel(context.inspectorPanel ?? {}, {
                escapeHTML: (value) => this.#escapeHTML(value)
            });
        }

        if (panel.id === "design-issues") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-issues-panel"><p class="totc-v2-issues-panel__access-denied">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderDesignIssuesPanel(context.designIssuesPanel ?? {}, {
                escapeHTML: (value) => this.#escapeHTML(value)
            });
        }

        if (panel.id === "scene-properties") {
            if (!context.gm?.isGM) {
                return `<section class="totc-v2-scene-properties-panel"><p class="totc-v2-scene-properties-panel__error">This panel is only available to the active Gamemaster.</p></section>`;
            }
            return renderScenePropertiesPanel(context.scenePropertiesPanel ?? {}, {
                escapeHTML: (value) => this.#escapeHTML(value)
            });
        }

        if (panel.id === "roll-feed") {
            return renderDiceRollFeedPanel(context.diceRollFeedPanel ?? {}, {
                escapeHTML: (value) => this.#escapeHTML(value)
            });
        }

        if (panel.id === "player") {
            return this.#renderPlayerPanel(context.playerPanel ?? {});
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

    #renderPlayerPanel(playerPanel = {}) {
        const actorOptionsMarkup = (playerPanel.actorOptions ?? []).map((actor) => `
            <option value="${this.#escapeHTML(actor.id)}" ${actor.selected ? "selected" : ""}>${this.#escapeHTML(actor.name)}</option>`).join("");

        if (!playerPanel.hasActor) {
            return `
            <section class="totc-v2-player-panel">
                <article class="totc-v2-player-panel__state">
                    <h3>Player Panel</h3>
                    <p>Select or control an actor to populate the panel.</p>
                    <label class="totc-v2-player-panel__selector">
                        <span>Actor</span>
                        <select data-action="player-select-actor">
                            ${actorOptionsMarkup || `<option value="">No eligible actor</option>`}
                        </select>
                    </label>
                </article>
            </section>`;
        }

        // Prepare section bodies for shared renderer
        const sectionsWithBody = (playerPanel.sections ?? []).map((section) => ({
            ...section,
            body: this.#renderPlayerSectionBody(section, playerPanel)
        }));
        const sectionsMarkup = this.#renderCollapsibleSections(sectionsWithBody, {
            panelId: "player",
            toggleAction: "player-toggle-section",
            sectionClass: "totc-v2-player-panel__section",
            headerClass: "totc-v2-player-panel__section-header",
            bodyClass: "totc-v2-player-panel__section-body",
            sectionType: "section"
        });

        return `
        <section class="totc-v2-player-panel">
            <article class="totc-v2-player-panel__state">
                <div class="totc-v2-player-panel__identity">
                    <div class="totc-v2-player-panel__portrait">
                        ${playerPanel.actorImage ? `<img src="${this.#escapeHTML(playerPanel.actorImage)}" alt="${this.#escapeHTML(playerPanel.actorName)}">` : `<span>${this.#escapeHTML(String(playerPanel.actorName ?? "?").slice(0, 1).toUpperCase())}</span>`}
                    </div>
                    <div>
                        <h3>${this.#escapeHTML(playerPanel.actorName ?? "Actor")}</h3>
                        <p>${this.#escapeHTML(String(playerPanel.actorType ?? "Actor").toUpperCase())}</p>
                    </div>
                </div>
                <label class="totc-v2-player-panel__selector">
                    <span>Actor</span>
                    <select data-action="player-select-actor">
                        ${actorOptionsMarkup}
                    </select>
                </label>
            </article>
            <section class="totc-v2-player-panel__sections">
                ${sectionsMarkup || `<div class="totc-v2-player-panel__empty">No actor sections are available yet.</div>`}
            </section>
        </section>`;
    }



    #renderPlayerSectionBody(section, playerPanel = {}) {
        if (section.id === "status" || section.id === "resources") {
            return `
            <dl class="totc-v2-player-panel__kv-grid">
                ${(section.rows ?? []).map((row) => `
                    <div class="totc-v2-player-panel__kv-row">
                        <dt>${this.#escapeHTML(row.label)}</dt>
                        <dd>${this.#escapeHTML(row.value)}</dd>
                    </div>`).join("")}
            </dl>`;
        }

        if (section.id === "actions") {
            return `
            <div class="totc-v2-player-panel__action-grid">
                ${(section.actions ?? []).map((action) => `
                    <button type="button" class="totc-v2-player-panel__action" data-action="${action.type === "camera" ? "player-center-token" : action.type ? "player-execute-encounter-action" : "player-open-sheet"}" data-actor-id="${this.#escapeHTML(playerPanel.actorId ?? "")}" data-player-action-id="${this.#escapeHTML(action.id)}" data-player-action-type="${this.#escapeHTML(action.type ?? "")}" data-ap-cost="${this.#escapeHTML(String(action.apCost ?? 0))}" data-ap-min="${this.#escapeHTML(String(action.apMin ?? 0))}" data-ap-max="${this.#escapeHTML(String(action.apMax ?? 0))}" data-variable-ap="${action.variableAp ? "true" : "false"}" data-requires-to-hit="${action.requiresToHit ? "true" : "false"}" data-item-id="${this.#escapeHTML(action.itemId ?? "")}">
                        ${action.img ? `<img src="${this.#escapeHTML(action.img)}" alt="">` : ""}
                        <span>${this.#escapeHTML(action.label)}</span>
                        ${action.detail ? `<small>${this.#escapeHTML(action.detail)}</small>` : ""}
                    </button>`).join("")}
            </div>`;
        }

        if (section.id === "effects") {
            return `
            <ul class="totc-v2-player-panel__list">
                ${(section.effects ?? []).map((effect) => `
                    <li class="totc-v2-player-panel__list-item">
                        <strong>${this.#escapeHTML(effect.name)}</strong>
                        <span>${this.#escapeHTML(effect.label)}</span>
                    </li>`).join("")}
            </ul>`;
        }

        if (section.id === "inventory") {
            return `
            <ul class="totc-v2-player-panel__list">
                ${(section.items ?? []).map((item) => `
                    <li class="totc-v2-player-panel__list-item">
                        <strong>${this.#escapeHTML(item.name)}</strong>
                        <span>${this.#escapeHTML(item.type)}${item.quantity > 1 ? ` × ${item.quantity}` : ""}</span>
                    </li>`).join("")}
            </ul>`;
        }

        if (section.id === "equipment") {
            return `
            <div class="totc-v2-player-panel__equipment">
                ${(section.slots ?? []).map((slot) => `
                    <article class="totc-v2-player-panel__equipment-slot">
                        <h4>${this.#escapeHTML(slot.label)}</h4>
                        <ul class="totc-v2-player-panel__list">
                            ${(slot.items ?? []).map((item) => `
                                <li class="totc-v2-player-panel__list-item">
                                    <strong>${this.#escapeHTML(item.name)}</strong>
                                    <span>${this.#escapeHTML(item.type)}</span>
                                </li>`).join("")}
                        </ul>
                    </article>`).join("")}
            </div>`;
        }

        if (section.id === "encounter") {
            const planner = section.planner ?? {};
            return `
            <div class="totc-v2-player-panel__encounter">
                <dl class="totc-v2-player-panel__kv-grid">
                    <div class="totc-v2-player-panel__kv-row"><dt>Phase</dt><dd>${this.#escapeHTML(planner.phase ?? "planning")}</dd></div>
                    <div class="totc-v2-player-panel__kv-row"><dt>Remaining AP</dt><dd>${this.#escapeHTML(String(planner.remainingAp ?? 0))}</dd></div>
                    <div class="totc-v2-player-panel__kv-row"><dt>Ready</dt><dd>${planner.ready ? "Yes" : "No"}</dd></div>
                    <div class="totc-v2-player-panel__kv-row"><dt>Initiative</dt><dd>${planner.canRollInitiative ? "Available" : "Locked"}</dd></div>
                </dl>
            </div>`;
        }

        if (section.id === "prompts") {
            return `
            <ul class="totc-v2-player-panel__prompt-list">
                ${(section.prompts ?? []).map((prompt) => `<li>${this.#escapeHTML(prompt)}</li>`).join("")}
            </ul>`;
        }

        return `<div class="totc-v2-player-panel__empty">No content available.</div>`;
    }

    #getSceneMapSource(scene) {
        return scene?.background?.src
            ?? scene?.["img"]
            ?? scene?.texture?.src
            ?? scene?.thumb
            ?? scene?.thumbnail?.src
            ?? "";
    }

    #getViewedScene() {
        return game.scenes?.viewed ?? canvas?.scene ?? game.scenes?.active ?? null;
    }

    #getScenePropertiesScene() {
        const viewedScene = this.#getViewedScene();
        const defaultScene = canvas?.scene ?? game.scenes?.active ?? viewedScene;
        return resolveScenePropertiesScene({
            activePanel: this.#getPrimaryActivePanel(),
            viewedScene,
            defaultScene,
            sceneResolver: (sceneId) => this.#getSceneDocumentById(sceneId)
        });
    }

    #isMapPanel(panel) {
        return panel?.id === "map" || panel?.baseId === "map" || String(panel?.id ?? "").startsWith("map:");
    }

    #getSceneDocumentById(sceneId) {
        const id = String(sceneId ?? "").trim();
        if (!id) return null;
        return game.scenes?.get?.(id)
            ?? (game.scenes?.contents ?? []).find((scene) => String(scene?.id ?? scene?._id ?? "") === id)
            ?? null;
    }

    #buildSceneViewModel(scene, fallback = {}) {
        return {
            id: scene?.id ?? scene?._id ?? fallback.id ?? null,
            name: scene?.name ?? fallback.name ?? "Current Scene",
            mapSrc: this.#getSceneMapSource(scene) || fallback.mapSrc || "",
            width: Number(scene?.width ?? fallback.width ?? 0),
            height: Number(scene?.height ?? fallback.height ?? 0),
            shiftX: Number(scene?.shiftX ?? fallback.shiftX ?? 0),
            shiftY: Number(scene?.shiftY ?? fallback.shiftY ?? 0),
            grid: {
                type: Number(scene?.grid?.type ?? fallback.grid?.type ?? 1),
                size: Number(scene?.grid?.size ?? fallback.grid?.size ?? 100),
                distance: Number(scene?.grid?.distance ?? fallback.grid?.distance ?? 5),
                units: String(scene?.grid?.units ?? fallback.grid?.units ?? "ft")
            }
        };
    }

    #getMapPanelScene(panel, context = {}) {
        const sceneId = panel?.sceneId ?? (String(panel?.id ?? "").startsWith("map:") ? String(panel.id).slice(4) : "");
        const scene = this.#getSceneDocumentById(sceneId);
        if (scene) return this.#buildSceneViewModel(scene, { id: sceneId });
        if (sceneId) return this.#buildSceneViewModel(null, { id: sceneId, name: panel?.title ?? "Missing Scene" });
        return context.scene ?? this.#buildSceneViewModel(null);
    }

    #getPanelTitle(panel, context = {}) {
        if (this.#isMapPanel(panel)) {
            return this.#getMapPanelScene(panel, context)?.name ?? panel?.title ?? "Map";
        }

        return panel?.title ?? "";
    }

    #getPanelSceneId(panel, context = {}) {
        if (!this.#isMapPanel(panel)) return "";
        const panelId = String(panel?.id ?? "");
        const explicitSceneId = panel?.sceneId ?? (panelId.startsWith("map:") ? panelId.slice(4) : "");
        return String(explicitSceneId || context.scene?.id || "").trim();
    }

    #getActiveSceneId() {
        return String(game.scenes?.active?.id
            ?? (game.scenes?.contents ?? []).find((scene) => scene?.active)?.id
            ?? ""
        ).trim();
    }

    #renderPanelTabIcon(panel, context = {}) {
        const sceneId = this.#getPanelSceneId(panel, context);
        if (!sceneId || sceneId !== this.#getActiveSceneId()) return "";
        return `<i class="fa-solid fa-star totc-v2-stack__tab-icon" aria-hidden="true"></i>`;
    }

    #makeSceneMapPanelDef(scene) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return null;

        return {
            id: `map:${sceneId}`,
            title: scene?.name ?? "Scene Map",
            baseId: "map",
            sceneId
        };
    }

    #resolvePanelDefinition(panelId) {
        const id = String(panelId ?? "").trim();
        if (!id) return null;

        const registered = this.panelRegistry.get(id);
        if (registered) return registered;

        if (id.startsWith("map:")) {
            const scene = this.#getSceneDocumentById(id.slice(4));
            return this.#makeSceneMapPanelDef(scene);
        }

        return null;
    }

    #findPanelLocation(panelId) {
        const id = String(panelId ?? "").trim();
        if (!id) return null;

        const layout = this.layoutEngine.getLayout();
        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout?.root?.[dockId];
            for (const stack of dock?.stacks ?? []) {
                if ((stack?.panels ?? []).some((panel) => panel.id === id)) {
                    return { kind: "dock", dockId, stackId: stack.id };
                }
            }
        }

        const floatingWindow = (layout?.root?.floatingWindows ?? []).find((entry) => entry?.panel?.id === id);
        return floatingWindow ? { kind: "floating", floatingId: floatingWindow.id } : null;
    }

    async #removeDeletedSceneMapPanel(scene) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) {
            if (this.rendered) this.render({ force: false });
            return this.layoutEngine.getLayout();
        }

        const panelId = `map:${sceneId}`;
        const location = this.#findPanelLocation(panelId);
        if (!location) {
            if (this.rendered) this.render({ force: false });
            return this.layoutEngine.getLayout();
        }

        const nextLayout = typeof this.layoutEngine.removePanel === "function"
            ? this.layoutEngine.removePanel(panelId)
            : this.layoutEngine.closePanel(panelId);
        await this.stateStore?.setUserLayout?.(nextLayout);
        if (this.rendered) this.render({ force: false });
        return nextLayout;
    }

    #openSceneMapPanel(sceneId) {
        const scene = this.#getSceneDocumentById(sceneId);
        const panelDef = this.#makeSceneMapPanelDef(scene);
        if (!panelDef) return this.layoutEngine.getLayout();

        const currentSceneId = String((canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed)?.id ?? "");
        if (panelDef.sceneId === currentSceneId) {
            const currentMap = this.#findPanelLocation("map");
            if (currentMap?.kind === "dock") {
                return this.layoutEngine.setActivePanel(currentMap.dockId, currentMap.stackId, "map");
            }
        }

        const existing = this.#findPanelLocation(panelDef.id);
        if (existing?.kind === "dock") {
            return this.layoutEngine.setActivePanel(existing.dockId, existing.stackId, panelDef.id);
        }
        if (existing?.kind === "floating") {
            return this.layoutEngine.getLayout();
        }

        const layout = this.layoutEngine.getLayout();
        const centerStack = layout.root?.centerDock?.stacks?.[0];
        return centerStack?.id
            ? this.layoutEngine.applyDropIntent(panelDef, {
                kind: "local",
                dockId: "centerDock",
                stackId: centerStack.id,
                zone: "local-center"
            })
            : this.layoutEngine.applyDropIntent(panelDef, { kind: "edge", dockId: "centerDock" });
    }

    async #activateScene(scene) {
        if (!scene) {
            ui.notifications?.warn("No scene is available to activate.");
            return false;
        }

        try {
            if (typeof scene.activate === "function") {
                await scene.activate();
            } else if (typeof scene.update === "function") {
                await scene.update({ active: true });
            } else {
                throw new Error("Scene activation is not available.");
            }
        } catch (error) {
            console.error("[turn-of-the-century] Scene activation failed", error);
            ui.notifications?.error("Scene activation failed - see console for details.");
            return false;
        }

        ui.notifications?.info?.(`Activated ${scene.name ?? "scene"}.`);
        this.render({ force: false });
        return true;
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

    #renderMarketPanel(marketPanel = {}) {
        const actorOptionsMarkup = (marketPanel.actors ?? []).map((actor) => `
            <option value="${this.#escapeHTML(actor.id)}" ${actor.selected ? "selected" : ""}>${this.#escapeHTML(actor.name)}</option>`).join("");

        if (!marketPanel.hasMarket) {
            return `
            <section class="totc-v2-market-panel">
                <article class="totc-v2-market-panel__state">
                    <h3>Market</h3>
                    <p>No generated market is active for this scene.</p>
                    ${marketPanel.canGenerate ? `
                    <button type="button" data-action="gm-execute-action" data-gm-action-id="gm-generate-market">Generate Market</button>` : ""}
                </article>
            </section>`;
        }

        const offersMarkup = (marketPanel.offers ?? []).map((offer) => `
            <article class="totc-v2-market-panel__entry">
                <div class="totc-v2-market-panel__entry-main">
                    <div class="totc-v2-market-panel__entry-name">${this.#escapeHTML(offer.name)}</div>
                    <div class="totc-v2-market-panel__entry-meta">${this.#escapeHTML(offer.stockLabel)} · ${this.#escapeHTML(offer.packLabel)}</div>
                </div>
                <div class="totc-v2-market-panel__entry-actions">
                    <span class="totc-v2-market-panel__price">${this.#escapeHTML(offer.priceLabel)}</span>
                    <div class="totc-v2-market-panel__trade-controls">
                        <input
                            type="number"
                            class="totc-v2-market-panel__quantity-input"
                            data-action="market-buy-quantity"
                            min="1"
                            max="${Math.max(1, Number(offer.maxBuyQty ?? 1))}"
                            value="1"
                            step="1"
                            ${offer.canBuy ? "" : "disabled"}
                            aria-label="Buy quantity for ${this.#escapeHTML(offer.name)}">
                        <button
                            type="button"
                            data-action="market-buy-item"
                            data-offer-id="${this.#escapeHTML(offer.id)}"
                            data-max-quantity="${Math.max(1, Number(offer.maxBuyQty ?? 1))}"
                            ${offer.canBuy ? "" : "disabled"}
                            title="${this.#escapeHTML(offer.buyHint)}">Buy</button>
                    </div>
                </div>
            </article>`).join("");

        const sellMarkup = (marketPanel.sellableItems ?? []).map((entry) => `
            <article class="totc-v2-market-panel__entry">
                <div class="totc-v2-market-panel__entry-main">
                    <div class="totc-v2-market-panel__entry-name">${this.#escapeHTML(entry.name)}</div>
                    <div class="totc-v2-market-panel__entry-meta">Qty ${entry.quantity} · Base ${this.#escapeHTML(entry.basePriceLabel)}</div>
                </div>
                <div class="totc-v2-market-panel__entry-actions">
                    <span class="totc-v2-market-panel__price">${this.#escapeHTML(entry.sellPriceLabel)}</span>
                    <div class="totc-v2-market-panel__trade-controls">
                        <input
                            type="number"
                            class="totc-v2-market-panel__quantity-input"
                            data-action="market-sell-quantity"
                            min="1"
                            max="${Math.max(1, Number(entry.maxSellQty ?? 1))}"
                            value="1"
                            step="1"
                            ${entry.canSell ? "" : "disabled"}
                            aria-label="Sell quantity for ${this.#escapeHTML(entry.name)}">
                        <button
                            type="button"
                            data-action="market-sell-item"
                            data-item-id="${this.#escapeHTML(entry.id)}"
                            data-max-quantity="${Math.max(1, Number(entry.maxSellQty ?? 1))}"
                            ${entry.canSell ? "" : "disabled"}
                            title="${this.#escapeHTML(entry.sellHint)}">Sell</button>
                    </div>
                </div>
            </article>`).join("");

        return `
        <section class="totc-v2-market-panel">
            <article class="totc-v2-market-panel__state">
                <h3>${this.#escapeHTML(marketPanel.title ?? "Market")}</h3>
                <p>${this.#escapeHTML(marketPanel.summary ?? "")}</p>
                <p><strong>Updated:</strong> ${this.#escapeHTML(marketPanel.updatedLabel ?? "")}</p>
            </article>
            <section class="totc-v2-market-panel__controls">
                <label class="totc-v2-market-panel__buyer-select">
                    <span>Buyer/Seller</span>
                    <select data-action="market-select-buyer" ${marketPanel.actors?.length ? "" : "disabled"}>
                        ${actorOptionsMarkup || `<option value="">No eligible actor</option>`}
                    </select>
                </label>
                <div class="totc-v2-market-panel__wallet">Wallet: ${this.#escapeHTML(marketPanel.walletLabel ?? "-")}</div>
            </section>
            <section class="totc-v2-market-panel__columns">
                <article class="totc-v2-market-panel__column">
                    <h3>Buy</h3>
                    <div class="totc-v2-market-panel__list">
                        ${offersMarkup || `<div class="totc-v2-market-panel__empty">No market offers available.</div>`}
                    </div>
                </article>
                <article class="totc-v2-market-panel__column">
                    <h3>Sell</h3>
                    <div class="totc-v2-market-panel__list">
                        ${sellMarkup || `<div class="totc-v2-market-panel__empty">No sellable inventory on selected actor.</div>`}
                    </div>
                </article>
            </section>
        </section>`;
    }

    #bindSceneHooks() {
        if (this._sceneHooksBound) return;
        Hooks.on("canvasReady", this._sceneRefreshHandler);
        Hooks.on("updateScene", this._sceneRefreshHandler);
        Hooks.on("createScene", this._sceneRefreshHandler);
        Hooks.on("deleteScene", this._deletedSceneHandler);
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
        Hooks.on("updateCompendium", this._compendiumRefreshHandler);
        Hooks.on("deleteCompendium", this._compendiumRefreshHandler);
        Hooks.on("createItem", this._compendiumDocumentMutationHandler);
        Hooks.on("updateItem", this._compendiumDocumentMutationHandler);
        Hooks.on("deleteItem", this._compendiumDocumentMutationHandler);
        this._compendiumHooksBound = true;
    }

    #bindPlayerHooks() {
        if (this._playerHooksBound) return;
        Hooks.on("updateActor", this._playerRefreshHandler);
        Hooks.on("createActor", this._playerRefreshHandler);
        Hooks.on("deleteActor", this._playerRefreshHandler);
        Hooks.on("createActiveEffect", this._playerRefreshHandler);
        Hooks.on("updateActiveEffect", this._playerRefreshHandler);
        Hooks.on("deleteActiveEffect", this._playerRefreshHandler);
        Hooks.on("controlToken", this._playerRefreshHandler);
        this._playerHooksBound = true;
    }

    #unbindSceneHooks() {
        if (!this._sceneHooksBound) return;
        Hooks.off("canvasReady", this._sceneRefreshHandler);
        Hooks.off("updateScene", this._sceneRefreshHandler);
        Hooks.off("createScene", this._sceneRefreshHandler);
        Hooks.off("deleteScene", this._deletedSceneHandler);
        this._sceneHooksBound = false;
    }

    #unbindCompendiumHooks() {
        if (!this._compendiumHooksBound) return;
        this.#clearCompendiumHydrationRetry();
        Hooks.off("createCompendium", this._compendiumRefreshHandler);
        Hooks.off("updateCompendium", this._compendiumRefreshHandler);
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

    #bindDesignIssuesHooks() {
        if (this._designIssuesHooksBound) return;
        // Scene-level changes: background, walls, lights, tokens
        Hooks.on("updateScene", this._designIssuesRefreshHandler);
        Hooks.on("canvasReady", this._designIssuesRefreshHandler);
        Hooks.on("createWall", this._designIssuesRefreshHandler);
        Hooks.on("deleteWall", this._designIssuesRefreshHandler);
        Hooks.on("createAmbientLight", this._designIssuesRefreshHandler);
        Hooks.on("deleteAmbientLight", this._designIssuesRefreshHandler);
        Hooks.on("createToken", this._designIssuesRefreshHandler);
        Hooks.on("updateToken", this._designIssuesRefreshHandler);
        Hooks.on("deleteToken", this._designIssuesRefreshHandler);
        // Actor-level changes: portrait, profession items
        Hooks.on("createActor", this._designIssuesRefreshHandler);
        Hooks.on("updateActor", this._designIssuesRefreshHandler);
        Hooks.on("deleteActor", this._designIssuesRefreshHandler);
        Hooks.on("createItem", this._designIssuesRefreshHandler);
        Hooks.on("deleteItem", this._designIssuesRefreshHandler);
        // Encounter-level changes: initiative rolls
        Hooks.on("createCombatant", this._designIssuesRefreshHandler);
        Hooks.on("updateCombatant", this._designIssuesRefreshHandler);
        Hooks.on("deleteCombatant", this._designIssuesRefreshHandler);
        this._designIssuesHooksBound = true;
    }

    #unbindDesignIssuesHooks() {
        if (!this._designIssuesHooksBound) return;
        Hooks.off("updateScene", this._designIssuesRefreshHandler);
        Hooks.off("canvasReady", this._designIssuesRefreshHandler);
        Hooks.off("createWall", this._designIssuesRefreshHandler);
        Hooks.off("deleteWall", this._designIssuesRefreshHandler);
        Hooks.off("createAmbientLight", this._designIssuesRefreshHandler);
        Hooks.off("deleteAmbientLight", this._designIssuesRefreshHandler);
        Hooks.off("createToken", this._designIssuesRefreshHandler);
        Hooks.off("updateToken", this._designIssuesRefreshHandler);
        Hooks.off("deleteToken", this._designIssuesRefreshHandler);
        Hooks.off("createActor", this._designIssuesRefreshHandler);
        Hooks.off("updateActor", this._designIssuesRefreshHandler);
        Hooks.off("deleteActor", this._designIssuesRefreshHandler);
        Hooks.off("createItem", this._designIssuesRefreshHandler);
        Hooks.off("deleteItem", this._designIssuesRefreshHandler);
        Hooks.off("createCombatant", this._designIssuesRefreshHandler);
        Hooks.off("updateCombatant", this._designIssuesRefreshHandler);
        Hooks.off("deleteCombatant", this._designIssuesRefreshHandler);
        this._designIssuesHooksBound = false;
    }

    #unbindPlayerHooks() {
        if (!this._playerHooksBound) return;
        Hooks.off("updateActor", this._playerRefreshHandler);
        Hooks.off("createActor", this._playerRefreshHandler);
        Hooks.off("deleteActor", this._playerRefreshHandler);
        Hooks.off("createActiveEffect", this._playerRefreshHandler);
        Hooks.off("updateActiveEffect", this._playerRefreshHandler);
        Hooks.off("deleteActiveEffect", this._playerRefreshHandler);
        Hooks.off("controlToken", this._playerRefreshHandler);
        this._playerHooksBound = false;
    }

    #getGamemasterPanelState() {
        return this.stateStore?.getUserScopedState?.(GM_PANEL_STATE_KEY, normalizeGamemasterPanelState)
            ?? normalizeGamemasterPanelState();
    }

    #getMarketPanelState() {
        return this.stateStore?.getUserScopedState?.(MARKET_PANEL_STATE_KEY, normalizeMarketPanelState)
            ?? normalizeMarketPanelState();
    }

    #getPlayerPanelState() {
        return this.stateStore?.getUserScopedState?.(PLAYER_PANEL_STATE_KEY, normalizePlayerPanelState)
            ?? normalizePlayerPanelState();
    }

    async #setGamemasterPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(GM_PANEL_STATE_KEY, patch, normalizeGamemasterPanelState);
    }

    async #setMarketPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(MARKET_PANEL_STATE_KEY, patch, normalizeMarketPanelState);
    }

    async #setPlayerPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(PLAYER_PANEL_STATE_KEY, patch, normalizePlayerPanelState);
    }

    #getPlayerPanelActors(controlledTokens = []) {
        const tokenActors = (controlledTokens ?? []).map((token) => token?.actor).filter((actor, index, list) => actor && list.findIndex((entry) => entry?.id === actor.id) === index);
        const ownedActors = (game.actors?.contents ?? []).filter((actor) => actor?.isOwner);
        const candidates = [
            ...tokenActors,
            game.user?.character ?? null,
            ...ownedActors
        ].filter(Boolean);

        const uniqueActors = [];
        const seenIds = new Set();
        for (const actor of candidates) {
            if (seenIds.has(actor.id)) continue;
            seenIds.add(actor.id);
            uniqueActors.push(actor);
        }

        return uniqueActors.sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" }));
    }

    #resolvePlayerPanelActor({ playerActors = [], playerPanelState = {} } = {}) {
        const selectedActorId = String(playerPanelState?.selectedActorId ?? "").trim();
        if (selectedActorId) {
            const selectedActor = playerActors.find((actor) => actor.id === selectedActorId);
            if (selectedActor) return selectedActor;
        }

        const preferredActor = game.user?.character ?? null;
        if (preferredActor) {
            const matched = playerActors.find((actor) => actor.id === preferredActor.id);
            if (matched) return matched;
        }

        return playerActors[0] ?? null;
    }

    #renderGamemasterPanel(gmPanel = {}, gmSnapshot = {}) {
        const combat = gmSnapshot.combat;
        const combatSummary = combat
            ? `${combat.combatantCount} combatant${combat.combatantCount === 1 ? "" : "s"} · Round ${Math.max(1, combat.round || 1)} · Turn ${Math.max(1, (combat.turn ?? 0) + 1)}`
            : "No active combat";
        const controlledSummary = gmSnapshot.controlledCount
            ? gmSnapshot.controlledNames.slice(0, 3).join(", ")
            : "No controlled tokens";

        // Prepare group bodies for shared renderer
        const groupsWithBody = (gmPanel.groups ?? []).map((group) => ({
            ...group,
            body: `
                <div class="totc-v2-gm-panel__group-description">${this.#escapeHTML(group.description)}</div>
                <div class="totc-v2-gm-panel__button-grid" ${group.collapsed ? "hidden" : ""}>
                    ${(group.actions ?? []).map((action) => `
                        <button type="button" data-action="gm-execute-action" data-gm-action-id="${this.#escapeHTML(action.id)}" title="${this.#escapeHTML(action.description)}">${this.#escapeHTML(action.label)}</button>`).join("")}
                </div>`
        }));
        const groupsMarkup = this.#renderCollapsibleSections(groupsWithBody, {
            panelId: "gm",
            toggleAction: "gm-toggle-group",
            sectionClass: "totc-v2-gm-panel__group",
            headerClass: "totc-v2-gm-panel__group-header",
            bodyClass: "totc-v2-gm-panel__group-body",
            sectionType: "group"
        });

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
            case "gm-create-scene": {
                await this.#executeDesignAction("scene.create", { panelId: "gamemaster" });
                break;
            }
            case "gm-open-combat-tracker": {
                renderFoundryApplication(ui.combat, { force: true });
                break;
            }
            case "gm-start-encounter": {
                let activeCombat = combat;
                if (!activeCombat && canvas?.scene?.id && typeof CombatDocumentClass?.create === "function") {
                    activeCombat = await CombatDocumentClass.create({ scene: canvas.scene.id });
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
                await this.#generateMarketOfferBoard();
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

        this.render({ force: false });
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

    async #generateMarketOfferBoard() {
        if (!game.user?.isGM) {
            ui.notifications?.warn("Only the GM can generate market boards.");
            return;
        }

        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        if (!scene) {
            ui.notifications?.warn("No active scene is available for market generation.");
            return;
        }

        const offers = await this.#buildGeneratedMarketOffers();
        if (!offers.length) {
            ui.notifications?.warn("Unable to generate market offers from compendium items.");
            return;
        }

        const seedsApi = game.turnOfTheCentury?.seeds;
        const factionMap = seedsApi?.factionMetadata ?? {};
        const factionKeys = Object.keys(factionMap);
        const fallbackFaction = "frontier-raiders";
        const factionKey = this.#randomFrom(factionKeys) ?? fallbackFaction;
        const narrative = seedsApi?.getNarrative?.(factionKey) ?? {};

        const marketState = {
            id: foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10),
            title: `${scene.name ?? "Current Scene"} Market`,
            summary: narrative.victory ?? "A broker offers scarce goods at a risky premium.",
            generatedAt: Date.now(),
            generatedBy: game.user?.id ?? null,
            buyMarkup: 1.2,
            sellRate: 0.55,
            offers
        };

        await scene.setFlag?.(game.system?.id ?? "turn-of-the-century", MARKET_SCENE_FLAG_KEY, marketState);

        const lines = [
            `Scene: ${scene.name ?? "Unknown scene"}`,
            `${offers.length} offers are now available in the Market panel.`
        ];
        await this.#announceGamemasterGeneratedContent({ title: "Market Generated", lines });
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

    async #buildMarketPanelModel({ scene = null, controlledTokens = [], panelState = {}, compendiumItems = [] } = {}) {
        const actors = this.#getMarketEligibleActors(controlledTokens);
        const requestedActorId = String(panelState?.selectedBuyerActorId ?? "");
        const selectedActor = actors.find((actor) => actor.id === requestedActorId)
            ?? actors[0]
            ?? null;
        if (selectedActor?.id && selectedActor.id !== requestedActorId) {
            await this.#setMarketPanelStatePatch({ selectedBuyerActorId: selectedActor.id });
        }

        const marketState = this.#normalizeSceneMarketState(scene?.getFlag?.(game.system?.id, MARKET_SCENE_FLAG_KEY) ?? null);
        const walletValue = Number(selectedActor?.system?.economy?.wallet?.gbp ?? 0);
        const wallet = Number.isFinite(walletValue) ? walletValue : 0;

        const offers = (marketState?.offers ?? []).map((offer) => {
            const price = Number(offer.price ?? 0);
            const stock = Math.max(0, Number(offer.stock ?? 0));
            const hasActor = Boolean(selectedActor);
            const maxAffordableQty = price > 0
                ? Math.max(0, Math.floor(wallet / price))
                : stock;
            const maxBuyQty = hasActor ? Math.max(0, Math.min(stock, maxAffordableQty || (price <= 0 ? stock : 0))) : 0;
            const canBuy = hasActor && maxBuyQty > 0;
            return {
                id: String(offer.id),
                name: String(offer.name ?? "Unnamed Item"),
                packLabel: String(offer.packLabel ?? "Market Stock"),
                stockLabel: `Stock ${stock}`,
                priceLabel: this.#formatCurrency(price, offer.currency),
                maxBuyQty,
                canBuy,
                buyHint: !hasActor
                    ? "Select an eligible actor first."
                    : (stock <= 0
                        ? "Out of stock."
                        : (maxBuyQty <= 0
                            ? "Not enough funds."
                            : `Purchase up to ${maxBuyQty} unit${maxBuyQty === 1 ? "" : "s"}.`))
            };
        });

        const sellableItems = this.#getMarketSellableItems(selectedActor, marketState);
        const fallbackSummary = compendiumItems.length
            ? `${compendiumItems.length} compendium items are available for market generation.`
            : "Generate a market from the GM panel to begin trading.";

        return {
            hasMarket: Boolean(marketState),
            canGenerate: Boolean(game.user?.isGM),
            title: marketState?.title ?? "Market",
            summary: marketState?.summary ?? fallbackSummary,
            updatedLabel: marketState?.generatedAt ? new Date(marketState.generatedAt).toLocaleString() : "Not generated",
            walletLabel: this.#formatCurrency(wallet, "pounds"),
            actors: actors.map((actor) => ({
                id: actor.id,
                name: actor.name ?? "Unnamed Actor",
                selected: actor.id === selectedActor?.id
            })),
            offers,
            sellableItems
        };
    }

    #getMarketEligibleActors(controlledTokens = []) {
        const controlledActorIds = new Set((controlledTokens ?? []).map((token) => token?.actor?.id).filter(Boolean));
        const allActors = game.actors?.contents ?? [];
        const visibleActors = allActors.filter((actor) => {
            if (!actor) return false;
            if (game.user?.isGM) return true;
            return actor.isOwner;
        });

        const sorted = [...visibleActors].sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? ""), undefined, { sensitivity: "base" }));
        sorted.sort((left, right) => {
            const leftControlled = controlledActorIds.has(left.id) ? 0 : 1;
            const rightControlled = controlledActorIds.has(right.id) ? 0 : 1;
            return leftControlled - rightControlled;
        });

        return sorted;
    }

    #normalizeSceneMarketState(value) {
        if (!value || typeof value !== "object") return null;
        const offers = Array.isArray(value.offers)
            ? value.offers
                .map((offer) => ({
                    id: String(offer?.id ?? ""),
                    uuid: String(offer?.uuid ?? ""),
                    name: String(offer?.name ?? "Unnamed Item"),
                    type: String(offer?.type ?? "item"),
                    packLabel: String(offer?.packLabel ?? "Market Stock"),
                    price: Math.max(0, Number(offer?.price ?? 0)),
                    basePrice: Math.max(0, Number(offer?.basePrice ?? offer?.price ?? 0)),
                    currency: String(offer?.currency ?? "pounds"),
                    stock: Math.max(0, Math.floor(Number(offer?.stock ?? 0)))
                }))
                .filter((offer) => offer.id && offer.stock > 0 && this.#isMarketTradableItemType(offer.type))
            : [];
        if (!offers.length) return null;

        return {
            id: String(value.id ?? foundry?.utils?.randomID?.() ?? "market"),
            title: String(value.title ?? "Market"),
            summary: String(value.summary ?? ""),
            generatedAt: Number(value.generatedAt ?? Date.now()),
            generatedBy: value.generatedBy ?? null,
            buyMarkup: Math.max(1, Number(value.buyMarkup ?? 1.2)),
            sellRate: Math.max(0, Number(value.sellRate ?? 0.55)),
            offers
        };
    }

    #formatCurrency(value, currency = "pounds") {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        const rounded = Math.round(amount * 100) / 100;
        const suffix = String(currency ?? "pounds");
        return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${suffix}`;
    }

    #getMarketSellableItems(actor, marketState) {
        if (!actor) return [];
        const sellRate = Math.max(0, Number(marketState?.sellRate ?? 0.55));
        const items = (actor.items?.contents ?? []).filter((item) => this.#isMarketTradableItemType(item?.type));

        return items
            .map((item) => {
                const basePrice = Math.max(0, Number(item?.system?.value?.price ?? 0));
                const currency = String(item?.system?.value?.currency ?? "pounds");
                const quantity = Math.max(0, Math.floor(Number(item?.system?.physical?.quantity ?? 1)));
                const sellPrice = Math.max(0, Math.round(basePrice * sellRate * 100) / 100);
                return {
                    id: String(item?.id ?? ""),
                    name: String(item?.name ?? "Unnamed Item"),
                    quantity,
                    basePrice,
                    currency,
                    basePriceLabel: this.#formatCurrency(basePrice, currency),
                    sellPrice,
                    sellPriceLabel: this.#formatCurrency(sellPrice, currency),
                    maxSellQty: quantity,
                    canSell: quantity > 0 && sellPrice > 0,
                    sellHint: quantity <= 0
                        ? "No quantity available."
                        : (sellPrice > 0
                            ? `Sell up to ${quantity} unit${quantity === 1 ? "" : "s"} to the market.`
                            : "Item has no sell value.")
                };
            })
            .filter((entry) => entry.id)
            .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" }));
    }

    #parseMarketQuantityInput(input, { fallback = 1, max = 1 } = {}) {
        const parsed = Math.floor(Number(input?.value ?? fallback));
        const minValue = 1;
        const maxValue = Math.max(minValue, Math.floor(Number(max) || minValue));
        const clamped = Math.min(maxValue, Math.max(minValue, Number.isFinite(parsed) ? parsed : fallback));
        if (input) {
            input.value = String(clamped);
        }
        return clamped;
    }

    async #buildGeneratedMarketOffers() {
        const items = await this.#getUnifiedCompendiumItems();
        const pool = items.filter((entry) => this.#isMarketTradableItemType(entry?.type));
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const selected = pool.slice(0, Math.min(10, pool.length));
        const offers = [];
        for (const entry of selected) {
            let basePrice = 1;
            let currency = "pounds";
            let type = String(entry?.type ?? "item");
            try {
                const document = await fromUuid(entry.uuid);
                basePrice = Math.max(0, Number(document?.system?.value?.price ?? basePrice));
                currency = String(document?.system?.value?.currency ?? currency);
                type = String(document?.type ?? type);
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to resolve market item uuid", entry?.uuid, error);
            }

            if (!this.#isMarketTradableItemType(type)) {
                continue;
            }

            const buyPrice = Math.max(1, Math.round(basePrice * (1.1 + Math.random() * 0.45) * 100) / 100);
            const stock = 1 + Math.floor(Math.random() * 4);
            offers.push({
                id: foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10),
                uuid: String(entry?.uuid ?? ""),
                name: String(entry?.name ?? "Unnamed Item"),
                type,
                packLabel: String(entry?.packLabel ?? "Market Stock"),
                basePrice,
                price: buyPrice,
                currency,
                stock
            });
        }

        return offers;
    }

    #resolveSelectedMarketActor() {
        const panelState = this.#getMarketPanelState();
        const actorId = String(panelState?.selectedBuyerActorId ?? "");
        if (!actorId) return null;
        return game.actors?.get?.(actorId) ?? null;
    }

    #canUserManageMarketActor(actor) {
        if (!actor) return false;
        if (game.user?.isGM) return true;
        return Boolean(actor.isOwner);
    }

    async #handleMarketBuy(offerId, requestedQuantity = 1) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        if (!scene) return;

        const marketState = this.#normalizeSceneMarketState(scene.getFlag?.(game.system?.id, MARKET_SCENE_FLAG_KEY) ?? null);
        if (!marketState) {
            ui.notifications?.warn("No generated market is active in this scene.");
            return;
        }

        const buyer = this.#resolveSelectedMarketActor();
        if (!this.#canUserManageMarketActor(buyer)) {
            ui.notifications?.warn("Select an actor you can manage before buying.");
            return;
        }

        const offer = marketState.offers.find((entry) => entry.id === offerId);
        if (!offer) {
            ui.notifications?.warn("This market offer is no longer available.");
            return;
        }
        if (!this.#isMarketTradableItemType(offer.type)) {
            ui.notifications?.warn("This market offer is not a tradable item type.");
            return;
        }

        const wallet = Math.max(0, Number(buyer.system?.economy?.wallet?.gbp ?? 0));
        const unitPrice = Math.max(0, Number(offer.price ?? 0));
        const stock = Math.max(0, Math.floor(Number(offer.stock ?? 0)));
        const maxAffordableQty = unitPrice > 0
            ? Math.max(0, Math.floor(wallet / unitPrice))
            : stock;
        const maxBuyQty = Math.max(0, Math.min(stock, maxAffordableQty || (unitPrice <= 0 ? stock : 0)));
        if (maxBuyQty <= 0) {
            ui.notifications?.warn(`${buyer.name} does not have enough funds.`);
            return;
        }
        const quantityToBuy = Math.max(1, Math.min(Math.floor(Number(requestedQuantity) || 1), maxBuyQty));
        const totalPrice = unitPrice * quantityToBuy;

        let itemData = null;
        if (offer.uuid) {
            try {
                const document = await fromUuid(offer.uuid);
                if (document?.toObject) {
                    itemData = document.toObject();
                }
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to import market item", offer.uuid, error);
            }
        }

        if (!itemData) {
            itemData = {
                name: offer.name,
                type: offer.type || "item",
                system: {
                    physical: { quantity: 1 },
                    value: { price: offer.basePrice, currency: offer.currency }
                }
            };
        }

        delete itemData._id;
        itemData.system ??= {};
        itemData.system.physical ??= {};
        itemData.system.value ??= {};
        itemData.system.physical.quantity = quantityToBuy;
        itemData.system.value.price = Math.max(0, Number(itemData.system.value.price ?? offer.basePrice ?? unitPrice));
        itemData.system.value.currency = String(itemData.system.value.currency ?? offer.currency ?? "pounds");

        const existing = buyer.items?.find?.((item) => item.name === itemData.name && item.type === itemData.type);
        if (existing) {
            const quantity = Math.max(0, Math.floor(Number(existing.system?.physical?.quantity ?? 1)));
            await existing.update({ "system.physical.quantity": quantity + quantityToBuy });
        } else {
            await buyer.createEmbeddedDocuments("Item", [itemData]);
        }

        await buyer.update({ "system.economy.wallet.gbp": Math.max(0, wallet - totalPrice) });

        offer.stock = Math.max(0, offer.stock - quantityToBuy);
        marketState.offers = marketState.offers.filter((entry) => entry.stock > 0);
        await scene.setFlag?.(game.system?.id ?? "turn-of-the-century", MARKET_SCENE_FLAG_KEY, marketState.offers.length ? marketState : null);

        ui.notifications?.info(`${buyer.name} purchased ${quantityToBuy} ${offer.name} for ${this.#formatCurrency(totalPrice, offer.currency)}.`);
        this.render({ force: false });
    }

    async #handleMarketSell(itemId, requestedQuantity = 1) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        if (!scene) return;

        const marketState = this.#normalizeSceneMarketState(scene.getFlag?.(game.system?.id, MARKET_SCENE_FLAG_KEY) ?? null);
        if (!marketState) {
            ui.notifications?.warn("No generated market is active in this scene.");
            return;
        }

        const actor = this.#resolveSelectedMarketActor();
        if (!this.#canUserManageMarketActor(actor)) {
            ui.notifications?.warn("Select an actor you can manage before selling.");
            return;
        }

        const item = actor.items?.get?.(itemId) ?? null;
        if (!item) {
            ui.notifications?.warn("This item is no longer available on the selected actor.");
            return;
        }
        if (!this.#isMarketTradableItemType(item.type)) {
            ui.notifications?.warn("Only physical goods can be sold at the market.");
            return;
        }

        const quantity = Math.max(0, Math.floor(Number(item.system?.physical?.quantity ?? 1)));
        const basePrice = Math.max(0, Number(item.system?.value?.price ?? 0));
        const currency = String(item.system?.value?.currency ?? "pounds");
        const sellRate = Math.max(0, Number(marketState.sellRate ?? 0.55));
        const unitSellPrice = Math.max(0, Math.round(basePrice * sellRate * 100) / 100);
        if (quantity <= 0 || unitSellPrice <= 0) {
            ui.notifications?.warn("This item cannot be sold.");
            return;
        }
        const quantityToSell = Math.max(1, Math.min(Math.floor(Number(requestedQuantity) || 1), quantity));
        const totalSellPrice = Math.round(unitSellPrice * quantityToSell * 100) / 100;

        if (quantity <= quantityToSell) {
            await item.delete();
        } else {
            await item.update({ "system.physical.quantity": quantity - quantityToSell });
        }

        const wallet = Math.max(0, Number(actor.system?.economy?.wallet?.gbp ?? 0));
        await actor.update({ "system.economy.wallet.gbp": wallet + totalSellPrice });

        const existingOffer = marketState.offers.find((offer) => offer.name === item.name && offer.type === item.type && offer.currency === currency && Math.abs(Number(offer.basePrice ?? 0) - basePrice) < 0.001);
        if (existingOffer) {
            existingOffer.stock = Math.max(0, Number(existingOffer.stock ?? 0) + quantityToSell);
        } else {
            const buyPrice = Math.max(1, Math.round(basePrice * Math.max(1, Number(marketState.buyMarkup ?? 1.2)) * 100) / 100);
            marketState.offers.push({
                id: foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10),
                uuid: "",
                name: String(item.name ?? "Sold Item"),
                type: String(item.type ?? "item"),
                packLabel: "Party Stock",
                price: buyPrice,
                basePrice,
                currency,
                stock: quantityToSell
            });
        }

        await scene.setFlag?.(game.system?.id ?? "turn-of-the-century", MARKET_SCENE_FLAG_KEY, marketState);
        ui.notifications?.info(`${actor.name} sold ${quantityToSell} ${item.name} for ${this.#formatCurrency(totalSellPrice, currency)}.`);
        this.render({ force: false });
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
                this.mapViewportController.beginPan({
                    pointerId: event.pointerId,
                    viewport,
                    image,
                    clientX: event.clientX,
                    clientY: event.clientY
                });

                this._onMapPanPointerMove ??= this.#onMapPanPointerMove.bind(this);
                this._onMapPanPointerUp ??= this.#onMapPanPointerUp.bind(this);
                document.addEventListener("pointermove", this._onMapPanPointerMove);
                document.addEventListener("pointerup", this._onMapPanPointerUp);
            });

            viewport.addEventListener("wheel", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.mapViewportController.applyWheelZoom(viewport, image, event);
            }, { passive: false });

            if (image.complete && Number.isFinite(image.naturalWidth) && image.naturalWidth > 0) {
                this.mapViewportController.syncViewport(viewport, image);
            } else {
                image.addEventListener("load", () => {
                    this.mapViewportController.syncViewport(viewport, image);
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
            const panelDef = this.#resolvePanelDefinition(panelId);
            if (!panelDef) {
                this.#hideGhost();
                return;
            }

            const intent = this.interactionController.getIntent();
            const nextLayout = this.layoutEngine.applyDropIntent(panelDef, intent ?? { kind: "edge", dockId: "centerDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);

            this.interactionController.clearIntent();
            this.#hideGhost();
            this.render({ force: false });
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
                this.render({ force: false });
                return;
            }
        }

        await this.stateStore?.setUserLayout?.(this.layoutEngine.getLayout());
        this.interactionController.clearIntent();
        this.#hideGhost();
        this.render({ force: false });
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
                this.render({ force: false });
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

        const leftTrack = leftOccupied && layout.root.leftDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${leftOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.left * 100))}fr)`;
        const rightTrack = rightOccupied && layout.root.rightDock?.collapsed
            ? `${COLLAPSED_LEFT_RIGHT_DOCK_WIDTH}px`
            : `minmax(${rightOccupied ? `${MIN_LEFT_RIGHT_DOCK_WIDTH}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.right * 100))}fr)`;
        const topTrack = topOccupied && layout.root.topDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${topOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.top * 100))}fr)`;
        const bottomTrack = bottomOccupied && layout.root.bottomDock?.collapsed
            ? `${COLLAPSED_TOP_BOTTOM_DOCK_HEIGHT}px`
            : `minmax(${bottomOccupied ? `${MIN_TOP_BOTTOM_DOCK_HEIGHT}px` : "0px"}, ${Math.max(1, Math.round(dockWeights.bottom * 100))}fr)`;

        host.style.gridTemplateColumns = `${leftTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerX ?? 0.64) * 100))}fr) ${rightTrack}`;
        host.style.gridTemplateRows = `${topTrack} minmax(0, ${Math.max(1, Math.round((dockWeights.centerY ?? 0.64) * 100))}fr) ${bottomTrack}`;

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

        this.#syncMapViewportTransforms();
    }

    #syncMapViewportTransforms() {
        const viewports = [...(this.element?.querySelectorAll("[data-action='map-viewport']") ?? [])];
        for (const viewport of viewports) {
            const image = viewport.querySelector("[data-action='map-image']");
            if (!(image instanceof HTMLImageElement)) continue;
            if (!image.complete || !Number.isFinite(image.naturalWidth) || image.naturalWidth <= 0) continue;
            this.mapViewportController.syncViewport(viewport, image);
        }
    }

    #onMapPanPointerMove(event) {
        this.mapViewportController.movePan(event);
    }

    #onMapPanPointerUp(event) {
        if (event.pointerId !== this.mapViewportController.panSession?.pointerId) return;
        this.#endMapPanSession();
    }

    #endMapPanSession() {
        this.mapViewportController.endPan();
        document.removeEventListener("pointermove", this._onMapPanPointerMove);
        document.removeEventListener("pointerup", this._onMapPanPointerUp);
    }

    #isDesignLensActive(panelId) {
        return Boolean(panelId && this.activeDesignLensPanelIds.has(panelId));
    }

    #getPrimaryActivePanel(layout = this.layoutEngine.getLayout()) {
        const centerDock = layout?.root?.centerDock;
        const centerStack = centerDock?.stacks?.[0];
        const activePanelId = centerStack?.activePanelId;
        const activePanel = centerStack?.panels?.find((panel) => panel.id === activePanelId) ?? centerStack?.panels?.[0];
        if (activePanel) return activePanel;

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const stack = layout?.root?.[dockId]?.stacks?.[0];
            const fallbackActiveId = stack?.activePanelId;
            const fallbackPanel = stack?.panels?.find((panel) => panel.id === fallbackActiveId) ?? stack?.panels?.[0];
            if (fallbackPanel) return fallbackPanel;
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Grid calibration
    // -----------------------------------------------------------------------

    /**
     * Open the grid calibration tool for the current scene.
     * Called by the scene.grid design action execute function.
     *
     * @param {{ scene: object|null }} opts
     */
    _openGridCalibration({ scene = null } = {}) {
        const liveScene = scene ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        this.gridCalibrationController.open({ scene: liveScene });
        this.render({ force: false });
    }

    /** Close and tear down the grid calibration tool without saving. */
    #closeGridCalibration() {
        this.gridCalibrationController.close();
        this.render({ force: false });
    }

    /**
     * Wire click listeners for the calibration dialog and the map viewport
     * corner-picking interaction.  Called from _onRender each render cycle.
     */
    #wireGridCalibrationHandlers() {
        // Dialog button wiring -------------------------------------------------

        this.element?.querySelectorAll("[data-action='grid-cal-cancel']")?.forEach((btn) => {
            btn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#closeGridCalibration();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-reset']")?.forEach((btn) => {
            btn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.gridCalibrationController.resetCorners();
                this.render({ force: false });
            });
        });

        // Number inputs update state + redraw the overlay without a full render
        this.element?.querySelectorAll("[data-action='grid-cal-cell-w']")?.forEach((input) => {
            input.addEventListener("input", () => {
                this.gridCalibrationController.setCellWidth(input.value);
                this.#drawGridCalibrationOverlay();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-cell-h']")?.forEach((input) => {
            input.addEventListener("input", () => {
                this.gridCalibrationController.setCellHeight(input.value);
                this.#drawGridCalibrationOverlay();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-offset-x']")?.forEach((input) => {
            input.addEventListener("input", () => {
                this.gridCalibrationController.setOffsetX(input.value);
                this.#drawGridCalibrationOverlay();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-offset-y']")?.forEach((input) => {
            input.addEventListener("input", () => {
                this.gridCalibrationController.setOffsetY(input.value);
                this.#drawGridCalibrationOverlay();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-confirm']")?.forEach((btn) => {
            btn.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#applyGridCalibration();
            });
        });

        // Map viewport corner-picking ------------------------------------------
        if (!this.gridCalibrationController.active) return;

        const viewport = this.element?.querySelector("[data-map-viewport='true']");
        if (!viewport) return;

        viewport.addEventListener("pointerdown", (event) => {
            // Only intercept left-button clicks while in corner-picking phase
            if (event.button !== 0) return;
            const state = this.gridCalibrationController.state;
            if (!state?.active || (state.corner1 && state.corner2)) return;

            event.preventDefault();
            event.stopPropagation();

            const vRect = viewport.getBoundingClientRect();
            const { scale, offsetX: imgX, offsetY: imgY } = this.mapViewportController.state;
            const point = {
                x: Math.round((event.clientX - vRect.left - imgX) / scale),
                y: Math.round((event.clientY - vRect.top  - imgY) / scale)
            };

            const pickResult = this.gridCalibrationController.pickCorner(point);
            if (pickResult.phase === "pick-second") {
                // Imperatively update the hint text — avoids a full re-render
                const hint = this.element?.querySelector(".totc-v2-grid-cal__hint");
                if (hint) hint.innerHTML = GRID_CAL_PHASE_HINTS["pick-second"];
                this.#drawGridCalibrationOverlay();
            } else if (pickResult.phase === "adjust") {
                this.#drawGridCalibrationOverlay();
                // Full render to show the adjust controls
                this.render({ force: false });
            }
        });

        // Draw initial overlay (covers the case where we re-render mid-adjust)
        this.#drawGridCalibrationOverlay();
    }

    /**
     * Imperatively draw (or redraw) the SVG grid overlay over the map viewport.
     * Called after corner picks and after each input change.
     */
    #drawGridCalibrationOverlay() {
        const overlay = this.element?.querySelector("[data-grid-overlay='true']");
        if (!(overlay instanceof SVGElement)) return;

        const viewport = overlay.closest("[data-map-viewport='true']");
        if (!viewport) return;
        const state = this.gridCalibrationController.active
            ? this.gridCalibrationController.state
            : buildSceneGridOverlayState({
                shiftX: Number(viewport.dataset.gridShiftX ?? 0),
                shiftY: Number(viewport.dataset.gridShiftY ?? 0),
                grid: {
                    type: Number(viewport.dataset.gridType ?? 0),
                    size: Number(viewport.dataset.gridSize ?? 0)
                }
            });
        if (!state?.active) {
            overlay.innerHTML = "";
            return;
        }

        const vRect = viewport.getBoundingClientRect();
        const W = vRect.width;
        const H = vRect.height;

        const { scale, offsetX, offsetY } = this.mapViewportController.state;
        const overlayModel = buildGridCalibrationOverlayModel({
            state,
            viewport: { width: W, height: H },
            transform: { scale, offsetX, offsetY }
        });

        overlay.setAttribute("width", W);
        overlay.setAttribute("height", H);
        overlay.setAttribute("viewBox", `0 0 ${W} ${H}`);

        let inner = "";

        // Grid lines — only shown once both corners have been picked and we
        // have a valid cell size.
        for (const x of overlayModel.verticalLines) {
            const rounded = x.toFixed(1);
            inner += `<line x1="${rounded}" y1="0" x2="${rounded}" y2="${H}" class="totc-v2-grid-overlay__vline"/>`;
        }

        for (const y of overlayModel.horizontalLines) {
            const rounded = y.toFixed(1);
            inner += `<line x1="0" y1="${rounded}" x2="${W}" y2="${rounded}" class="totc-v2-grid-overlay__hline"/>`;
        }

        if (overlayModel.cellRef) {
            inner += `<rect x="${overlayModel.cellRef.x.toFixed(1)}" y="${overlayModel.cellRef.y.toFixed(1)}" width="${overlayModel.cellRef.width.toFixed(1)}" height="${overlayModel.cellRef.height.toFixed(1)}" class="totc-v2-grid-overlay__cell-ref"/>`;
        }

        // Corner markers
        for (const corner of overlayModel.corners) {
            const cx = corner.x.toFixed(1);
            const cy = corner.y.toFixed(1);
            inner += `<circle cx="${cx}" cy="${cy}" r="7" class="totc-v2-grid-overlay__corner-ring"/>`;
            inner += `<circle cx="${cx}" cy="${cy}" r="2.5" class="totc-v2-grid-overlay__corner-dot"/>`;
        }

        overlay.innerHTML = inner;
    }

    /**
     * Apply the calibrated grid values to the Foundry scene document and
     * close the calibration tool.
     */
    async #applyGridCalibration() {
        const state = this.gridCalibrationController.state;
        if (!state?.active) return;

        const scene = state.sceneId
            ? game.scenes?.get(state.sceneId)
            : (canvas?.scene ?? game.scenes?.viewed ?? null);

        if (!scene) {
            ui.notifications?.warn("No active scene — cannot apply grid calibration.");
            return;
        }

        const updateData = buildGridCalibrationSceneUpdate({
            cellW: state.cellW ?? 100,
            offsetX: state.offsetX ?? 0,
            offsetY: state.offsetY ?? 0
        });
        const size = updateData["grid.size"];

        try {
            await scene.update(updateData);
            ui.notifications?.info(`Grid updated: ${size} px per cell (shift ${updateData.shiftX}, ${updateData.shiftY}).`);
        } catch (err) {
            console.error("[turn-of-the-century] Grid calibration apply failed", err);
            ui.notifications?.error("Failed to apply grid — see console for details.");
            return;
        }

        this.gridCalibrationController.close();
        this.render({ force: false });
    }

    #wireDebouncedTextInputHandlers() {
        this.element?.addEventListener("input", (event) => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;

            const action = String(input.dataset.action ?? "").trim();
            if (!action || !isWorkspaceDebouncedTextInputTarget(input)) return;

            const existingTimer = this._textInputDebounceTimers.get(action);
            if (existingTimer) clearTimeout(existingTimer);

            const value = String(input.value ?? "");
            if (action === "scene-properties-name") {
                const scene = this.#getScenePropertiesScene();
                this._scenePropertiesState = buildScenePropertiesNameInputState(this._scenePropertiesState, scene, value);
            }

            const timer = setTimeout(async () => {
                this._textInputDebounceTimers.delete(action);
                await this.#handleDebouncedTextInput(action, value);
            }, TEXT_INPUT_DEBOUNCE_MS);
            this._textInputDebounceTimers.set(action, timer);
        });
    }

    async #handleDebouncedTextInput(action, value) {
        switch (action) {
            case "compendium-search": {
                this.compendiumSearchQuery = value;
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "compendium-search");
                break;
            }
            case "design-command-palette-search": {
                this.designCommandPaletteQuery = value;
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "design-command-palette-search");
                break;
            }
            case "gm-search-actions": {
                await this.#setGamemasterPanelStatePatch({ actionSearchQuery: value });
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "gm-search-actions");
                break;
            }
            case "scene-properties-name": {
                const scene = this.#getScenePropertiesScene();
                this._scenePropertiesState = buildScenePropertiesNameInputState(this._scenePropertiesState, scene, value);
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "scene-properties-name");
                break;
            }
            default:
                break;
        }
    }

    async _openScenePropertiesPanel() {
        const panelDef = this.panelRegistry.get("scene-properties");
        if (!panelDef) return;

        this._scenePropertiesState = {
            sceneId: "",
            sceneName: null,
            selectedFilename: "",
            backgroundPath: "",
            createMode: false,
            status: "",
            error: ""
        };

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
    }

    async _createSceneDesignScene() {
        const result = await createSceneDesignScene({
            SceneClass: foundry?.documents?.Scene,
            foundry,
            ui
        });
        if (!result?.ok || !result.scene) return result;

        const scene = result.scene;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (!sceneId) {
            return {
                ok: false,
                level: "warn",
                message: "The new scene was created but could not be bound to the workspace."
            };
        }

        this.#openSceneMapPanel(sceneId);
        const panelDef = this.panelRegistry.get("scene-properties");
        let nextLayout = this.layoutEngine.getLayout();
        if (panelDef) {
            nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        }

        this._scenePropertiesState = {
            sceneId,
            sceneName: "",
            selectedFilename: "",
            backgroundPath: "",
            createMode: true,
            status: "New scene created. Enter a name, then upload a background image.",
            error: ""
        };
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });

        return {
            ok: true,
            silent: true,
            scene,
            name: result.name,
            message: "Scene draft created."
        };
    }

    #wireScenePropertiesHandlers() {
        this.element?.querySelectorAll("[data-action='scene-properties-background-upload']")?.forEach((input) => {
            input.addEventListener("change", async () => {
                const file = input.files?.[0] ?? null;
                if (!file) return;

                const scene = this.#getScenePropertiesScene();
                const sceneName = String(this._scenePropertiesState.sceneName ?? scene?.name ?? "").trim();
                const target = buildSceneBackgroundUploadTarget({
                    sceneName,
                    filename: file.name
                });

                this._scenePropertiesState = {
                    ...this._scenePropertiesState,
                    sceneId: scene?.id ?? scene?._id ?? "",
                    sceneName,
                    selectedFilename: file.name,
                    backgroundPath: "",
                    createMode: Boolean(this._scenePropertiesState.createMode),
                    status: target.valid ? `Uploading ${target.filename}...` : "",
                    error: target.valid ? "" : "Choose a supported image after entering a scene name."
                };
                this.render({ force: false });

                if (!target.valid) return;

                const result = await uploadSceneBackgroundFile({
                    file,
                    target,
                    overwrite: true,
                    foundry,
                    ui
                });

                if (!result?.ok) {
                    this._scenePropertiesState = {
                        ...this._scenePropertiesState,
                        backgroundPath: "",
                        createMode: Boolean(this._scenePropertiesState.createMode),
                        status: "",
                        error: result?.message ?? "Scene background upload failed."
                    };
                    this.render({ force: false });
                    return;
                }

                this._scenePropertiesState = {
                    ...this._scenePropertiesState,
                    backgroundPath: result.path,
                    createMode: Boolean(this._scenePropertiesState.createMode),
                    status: `Uploaded ${result.filename}.`,
                    error: ""
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='scene-properties-reset']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                const scene = this.#getScenePropertiesScene();
                this._scenePropertiesState = {
                    sceneId: scene?.id ?? scene?._id ?? "",
                    sceneName: null,
                    selectedFilename: "",
                    backgroundPath: "",
                    createMode: false,
                    status: "",
                    error: ""
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='scene-properties-delete']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const scene = this.#getScenePropertiesScene();
                if (!scene) {
                    this._scenePropertiesState = {
                        ...this._scenePropertiesState,
                        status: "",
                        createMode: Boolean(this._scenePropertiesState.createMode),
                        error: "No viewed scene is available to delete."
                    };
                    this.render({ force: false });
                    return;
                }

                const sceneName = String(scene.name ?? "this scene");
                const confirmed = globalThis.confirm?.(`Delete scene "${sceneName}"? This cannot be undone.`) ?? false;
                if (!confirmed) return;

                try {
                    if (typeof scene.delete !== "function") throw new Error("Scene deletion is not available.");
                    await scene.delete();
                    await this.#removeDeletedSceneMapPanel(scene);
                } catch (error) {
                    console.error("[turn-of-the-century] Scene delete failed", error);
                    this._scenePropertiesState = {
                        ...this._scenePropertiesState,
                        status: "",
                        createMode: Boolean(this._scenePropertiesState.createMode),
                        error: "Scene delete failed - see console for details."
                    };
                    this.render({ force: false });
                    return;
                }

                this._scenePropertiesState = {
                    sceneId: "",
                    sceneName: null,
                    selectedFilename: "",
                    backgroundPath: "",
                    createMode: false,
                    status: `Deleted ${sceneName}.`,
                    error: ""
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='scene-properties-activate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const scene = this.#getScenePropertiesScene();
                await this.#activateScene(scene);
            });
        });

        this.element?.querySelectorAll("[data-action='scene-properties-save']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const scene = this.#getScenePropertiesScene();
                if (!scene) {
                    this._scenePropertiesState = {
                        ...this._scenePropertiesState,
                        status: "",
                        createMode: Boolean(this._scenePropertiesState.createMode),
                        error: "No viewed scene is available to save."
                    };
                    this.render({ force: false });
                    return;
                }

                const model = buildScenePropertiesPanelModel({
                    ...this._scenePropertiesState,
                    scene
                });
                const updateData = buildScenePropertiesUpdateData(model);

                try {
                    await scene.update(updateData);
                } catch (error) {
                    console.error("[turn-of-the-century] Scene properties save failed", error);
                    this._scenePropertiesState = {
                        ...this._scenePropertiesState,
                        status: "",
                        createMode: Boolean(this._scenePropertiesState.createMode),
                        error: "Scene save failed - see console for details."
                    };
                    this.render({ force: false });
                    return;
                }

                this._scenePropertiesState = {
                    sceneId: scene.id ?? scene._id ?? "",
                    sceneName: null,
                    selectedFilename: "",
                    backgroundPath: "",
                    createMode: false,
                    status: model.backgroundChanged
                        ? "Scene saved. Grid calibration was cleared for the new background."
                        : "Scene saved.",
                    error: ""
                };
                this.render({ force: false });
            });
        });
    }

    async #executeDesignAction(actionId, { panelId = "" } = {}) {
        const action = this.designActionRegistry.get(actionId);
        if (!action) return;
        const sourcePanel = panelId ? this.#resolvePanelDefinition(panelId) : this.#getPrimaryActivePanel();

        try {
            const result = await action.execute({
                app: this,
                panel: this.#getPrimaryActivePanel(),
                sourcePanel,
                scene: canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null,
                canvas,
                ui,
                combat: game.combats?.active ?? game.combat ?? null,
                controlledTokens: canvas?.tokens?.controlled ?? []
            });

            if (result?.level === "warn") {
                ui.notifications?.warn(result.message ?? `${action.label} is not available right now.`);
            } else if (result?.silent) {
                // Action handled its own UI (e.g. opened a dialog) — no notification needed.
            } else if (result?.message) {
                ui.notifications?.info(result.message);
            } else if (result?.name) {
                ui.notifications?.info(`Created ${result.name}.`);
            } else {
                ui.notifications?.info(`${action.label} design action is not wired yet.`);
            }
        } catch (error) {
            console.error("[turn-of-the-century] Design action failed", { actionId, error });
            ui.notifications?.error(error?.message ?? `${action.label} failed.`);
        }
    }

    /**
     * Navigate the GM to the entity or layer implicated by a design issue.
     * Each navigateAction key maps to a lightweight Foundry API call.
     */
    async #executeDesignIssueNavigation(navigateAction, { subjectId = "", subjectType = "" } = {}) {
        try {
            switch (navigateAction) {
                case "navigate.actor": {
                    const actor = subjectId ? game.actors?.get(subjectId) : null;
                    if (actor) renderFoundryApplication(actor.sheet, { force: true });
                    else ui.notifications?.warn("Actor not found.");
                    break;
                }
                case "navigate.scene.config": {
                    const scene = subjectId ? game.scenes?.get(subjectId) : (canvas?.scene ?? null);
                    if (scene) renderFoundryApplication(scene.sheet, { force: true });
                    else ui.notifications?.warn("Scene not found.");
                    break;
                }
                case "navigate.scene.walls":
                    canvas?.walls?.activate?.();
                    break;
                case "navigate.scene.lights":
                    canvas?.lighting?.activate?.();
                    break;
                case "navigate.scene.tokens":
                    canvas?.tokens?.activate?.();
                    break;
                case "navigate.combat":
                    renderFoundryApplication(ui.combat, { force: true });
                    break;
                default:
                    console.warn("[turn-of-the-century] Unknown navigate action:", navigateAction);
            }
        } catch (error) {
            console.error("[turn-of-the-century] Design issue navigation failed", { navigateAction, subjectId, error });
            ui.notifications?.error("Navigation failed — see console for details.");
        }
    }

    #isDockOccupied(dock) {
        return Boolean(dock?.stacks?.some((stack) => (stack?.panels?.length ?? 0) > 0));
    }

    #enforceRequiredDocking() {
        const mapPanel = this.panelRegistry.get("map");
        const compendiumPanel = this.panelRegistry.get("compendium");
        const scenesPanel = this.panelRegistry.get("scenes");
        if (!mapPanel || !compendiumPanel || !scenesPanel) return null;

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

        const layoutAfterCompendium = this.layoutEngine.getLayout();
        if (!this.#dockHasPanel(layoutAfterCompendium, "leftDock", "scenes")) {
            this.#dockPanelWithPanel(scenesPanel, {
                targetPanelId: "gamemaster",
                preferredDockId: "leftDock"
            });
            changed = true;
        }

        return changed ? this.layoutEngine.getLayout() : null;
    }

    #dockPanelWithPanel(panelDef, { targetPanelId, preferredDockId } = {}) {
        const layout = this.layoutEngine.getLayout();
        let targetDockId = preferredDockId;
        let targetStack = null;

        const dockIds = preferredDockId ? [preferredDockId] : WORKSPACE_V2_DOCK_IDS;
        for (const dockId of dockIds) {
            const dock = layout?.root?.[dockId];
            const stack = dock?.stacks?.find((entry) => (entry?.panels ?? []).some((panel) => panel.id === targetPanelId));
            if (!stack) continue;
            targetDockId = dockId;
            targetStack = stack;
            break;
        }

        if (targetDockId && targetStack?.id) {
            const activePanelId = targetStack.activePanelId;
            this.layoutEngine.applyDropIntent(panelDef, {
                kind: "local",
                dockId: targetDockId,
                stackId: targetStack.id,
                zone: "local-center"
            });
            if (activePanelId) this.layoutEngine.setActivePanel(targetDockId, targetStack.id, activePanelId);
            return this.layoutEngine.getLayout();
        }

        return this.layoutEngine.applyDropIntent(panelDef, { kind: "edge", dockId: preferredDockId ?? panelDef.defaultDock ?? "leftDock" });
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
            const result = await this._compendiumItemsPromise;
            const entries = Array.isArray(result?.entries) ? result.entries : [];
            if (entries.length || result?.ready) {
                this._compendiumItemEntries = entries;
                this._compendiumHydrationRetries = 0;
                this.#clearCompendiumHydrationRetry();
            } else {
                this.#scheduleCompendiumHydrationRetry();
            }
            return entries;
        } finally {
            this._compendiumItemsPromise = null;
        }
    }

    #scheduleCompendiumHydrationRetry() {
        if (this._compendiumHydrationRetryTimer || this._compendiumHydrationRetries >= COMPENDIUM_STARTUP_RETRY_LIMIT) return;

        const retryNumber = this._compendiumHydrationRetries + 1;
        const delay = Math.min(COMPENDIUM_STARTUP_RETRY_BASE_MS * retryNumber, 2000);
        this._compendiumHydrationRetries = retryNumber;
        this._compendiumHydrationRetryTimer = setTimeout(() => {
            this._compendiumHydrationRetryTimer = null;
            this._compendiumItemsPromise = null;
            if (this.rendered) {
                this.render({ force: false });
            } else {
                void this.#getUnifiedCompendiumItems();
            }
        }, delay);
    }

    #clearCompendiumHydrationRetry() {
        if (!this._compendiumHydrationRetryTimer) return;
        clearTimeout(this._compendiumHydrationRetryTimer);
        this._compendiumHydrationRetryTimer = null;
    }

    async #loadUnifiedCompendiumItems() {
        return loadUnifiedCompendiumItems({
            packs: this.#getCompendiumPacks(),
            gameReady: Boolean(game?.ready),
            logger: console
        });
    }

    #getCompendiumPacks() {
        return getCompendiumPacks(game?.packs);
    }

    #isMarketTradableItemType(itemType) {
        const normalizedType = String(itemType ?? "").trim().toLowerCase();
        return MARKET_TRADABLE_ITEM_TYPES.has(normalizedType);
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
