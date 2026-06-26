import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";
import { GridCalibrationController } from "./grid-calibration-controller.mjs";
import { LayoutEngine } from "./layout-engine.mjs";
import { WorkspacePanelRegistry } from "./panel-registry.mjs";
import { openFoundrySettingsView } from "./workspace-system-menu.mjs";
import {
    focusWorkspaceTextInputAtEnd,
    isWorkspaceDebouncedTextInputTarget
} from "./workspace-text-inputs.mjs";
import {
    buildInspectorPanelModel
} from "./panels/inspector-panel.mjs";
import { MediaFeature } from "./controllers/media-feature.mjs";
import { getSceneBackgroundSource } from "./scene-background-source.mjs";
import { totcLogger } from "./logger.mjs";
import {
    buildLoggingPanelModel,
    formatLoggingPanelEntriesForClipboard
} from "./panels/logging-panel.mjs";
import { WorkspaceDesignActionRegistry } from "./design-action-registry.mjs";
import {
    getCompendiumPacks,
    loadUnifiedCompendiumItems
} from "./compendium-items.mjs";
const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

import {
    CompendiumCacheController
} from "./controllers/compendium-cache-controller.mjs";
import {
    SceneActorDropController
} from "./controllers/scene-actor-drop-controller.mjs";
import {
    SceneWorkspaceController
} from "./controllers/scene-workspace-controller.mjs";
import {
    WorkspacePanelHost
} from "./controllers/workspace-panel-host.mjs";
import {
    WorkspaceHooksController
} from "./controllers/workspace-hooks-controller.mjs";
import { MarketFeature } from "./controllers/market-feature.mjs";


import {
    buildEncounterManagerPanelModel
} from "./panels/encounter-manager-panel.mjs";
import { LLMService } from "../../services/llm-service.mjs";
import {
    requireActorDocumentClass,
    renderFoundryApplication,
    requireApplicationV2,
    requireCombatDocumentClass,
    requireItemDocumentClass
} from "../../foundry-v14-runtime.mjs";
import { WorkspaceFeature } from "./workspace-feature.mjs";
import { EncounterPlanningFeature } from "./controllers/encounter-planning-feature.mjs";
import { SceneDesignFeature } from "./controllers/scene-design-feature.mjs";
import { CampaignFeature } from "./controllers/campaign-feature.mjs";
import { ActorManagementFeature } from "./controllers/actor-management-feature.mjs";
import { RollRequestFeature } from "./controllers/roll-request-feature.mjs";
import { WorkspaceLayoutFeature } from "./controllers/workspace-layout-feature.mjs";

const ApplicationV2Base = requireApplicationV2();
const CombatDocumentClass = requireCombatDocumentClass();
const ActorDocumentClass = requireActorDocumentClass();
const ItemDocumentClass = requireItemDocumentClass();

const TEXT_INPUT_DEBOUNCE_MS = 300;
const GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS = 100;
const GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS = 500;
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
        keywords: ["combat", "encounter", "start"],
        isRelevant: (snapshot) => !snapshot.hasActiveCombat
    },
    {
        id: "gm-open-combat-tracker",
        label: "Open Combat Tracker",
        description: "Open the combat tracker popout for detailed round control.",
        groupId: "encounter-control",
        keywords: ["combat", "tracker", "round"],
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

const ROLL_LOCKED_ACTIONS = Object.freeze(new Set([
    "actor-create-npc",
    "actor-editor-generate",
    "actor-editor-save",
    "actor-list-new",
    "design-lens-action",
    "gm-create-scene",
    "gm-end-combat",
    "gm-next-turn",
    "gm-start-encounter",
    "grid-cal-confirm",
    "inspector-design-action",
    "scene-properties-activate",
    "scene-actors-add-heroes",
    "scene-actors-add-selected",
    "scene-properties-delete",
    "scene-properties-set-default",
    "scenes-create-scene"
]));

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
        this.features = [];
        this.stateStore = stateStore;
        this.governor = governor;
        this.panelRegistry = new WorkspacePanelRegistry();
        this.designActionRegistry = new WorkspaceDesignActionRegistry();
        this.panels = this.panelRegistry.getAll();
        this.layoutEngine = new LayoutEngine({
            layout: this.stateStore?.getUserLayout?.(),
            panels: this.panels
        });
        this.selectedTokenIds = new Set();
        this._nativeCanvasViewSceneId = "";
        this._activePlanEditSlot = null;
        this._wiredElement = null;
        this.compendiumSearchQuery = "";

        this._textInputDebounceTimers = new Map();
        this._gridCalibrationPreviewTimer = null;
        this.compendiumCacheController = new CompendiumCacheController({
            load: () => loadUnifiedCompendiumItems({
                packs: getCompendiumPacks(game?.packs),
                gameReady: Boolean(game?.ready),
                logger: console
            }),
            onRetry: () => {
                if (this.rendered) {
                    this.render({ force: false });
                } else {
                    void this.compendiumCacheController.getItems();
                }
            }
        });
        this.actorManagementFeature = new ActorManagementFeature({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            render: (options) => this.render(options),
            getSelectedTokenIds: () => this.selectedTokenIds
        });
        this.sceneWorkspaceController = new SceneWorkspaceController({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            sceneResolver: (id) => game.scenes?.get?.(id)
                ?? (game.scenes?.contents ?? []).find((scene) => String(scene?.id ?? scene?._id ?? "") === String(id ?? "").trim())
                ?? null,
            scenesCollection: () => game.scenes,
            getCurrentScene: () => canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null,
            getViewedScene: () => game.scenes?.viewed ?? canvas?.scene ?? game.scenes?.active ?? null,
            getActivePanel: () => this.#getPrimaryActivePanel(),
            render: () => {
                if (this.rendered) this.render({ force: false });
            },
            foundryRef: () => foundry,
            uiRef: () => ui
        });
        this.sceneActorDropController = new SceneActorDropController({
            getRoot: () => this.element,
            getSelectedActorIds: () => this.actorManagementFeature.getSelectedActorIds(),
            getActorById: (id) => this.#getActorDocumentByReference(id),
            getSceneById: (id) => this.#getSceneDocumentById(id),
            getFallbackScene: () => this.sceneWorkspaceController.getScenePropertiesScene(),
            setScenePropertiesState: (patch) => {
                this.sceneWorkspaceController.patchState(patch);
            },
            render: () => this.render({ force: false }),
            escapeHTML: (value) => this.#escapeHTML(value),
            logger: totcLogger
        });
        this.panelHost = new WorkspacePanelHost({
            getFeatures: () => this.features,
            designActionRegistry: this.designActionRegistry,
            escapeHTML: (value) => this.#escapeHTML(value),
            isGM: () => Boolean(game.user?.isGM),
            isDesignLensActive: (panelId) => this.workspaceLayoutFeature?.isDesignLensActive(panelId) ?? false,
            isMapPanel: (panel) => this.#isMapPanel(panel),
            getMapPanelScene: (panel, context) => this.#getMapPanelScene(panel, context),
            getPanelSceneId: (panel, context) => this.#getPanelSceneId(panel, context),
            gridCalibrationState: () => this.gridCalibrationController.state,
            getSceneGridOverlayState: (scene) => this.sceneDesignFeature?.getSceneGridOverlayState(scene),
            getSceneWallOverlayState: (scene) => this.sceneDesignFeature?.getSceneDetectedWallOverlayState(scene),
            getEncounterMovementOverlayState: (scene) => this.encounterPlanningFeature?.getMovementOverlayState(scene),
            getEncounterTargetOverlayState: (scene) => this.encounterPlanningFeature?.getTargetOverlayState(scene),
            getMapPanelToolbarState: (panel) => this.sceneDesignFeature?.getMapPanelToolbarState(panel),
            renderGamemasterPanel: (gmPanel, gmSnapshot, dieRollRequestPanel) => this.#renderGamemasterPanel(gmPanel, gmSnapshot, dieRollRequestPanel),
            getSelectedTokenIds: () => this.selectedTokenIds
        });
        this.encounterPlanningFeature = new EncounterPlanningFeature({
            panelRegistry: this.panelRegistry,
            layoutEngine: this.layoutEngine,
            stateStore: this.stateStore,
            render: (options) => this.render(options),
            escapeHTML: (value) => this.#escapeHTML(value),
            getSelectedTokenIds: () => this.selectedTokenIds
        });
        this.registerFeature(this.encounterPlanningFeature);
        this.marketFeature = new MarketFeature({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            compendiumCacheController: this.compendiumCacheController,
            render: (options) => this.render(options),
            announce: (message) => this.#announceGamemasterGeneratedContent(message)
        });
        this.registerFeature(this.marketFeature);
        this.mediaFeature = new MediaFeature({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            render: (options) => this.render(options)
        });
        this.registerFeature(this.mediaFeature);
        this.rollRequestFeature = new RollRequestFeature({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            render: (options) => this.render(options)
        });
        this.registerFeature(this.rollRequestFeature);
        this.gridCalibrationController = new GridCalibrationController({
            sceneResolver: (state) => state.sceneId
                ? game.scenes?.get(state.sceneId)
                : (canvas?.scene ?? game.scenes?.viewed ?? null),
            notifications: globalThis.ui?.notifications,
            logger: console
        });
        this.sceneDesignFeature = new SceneDesignFeature({
            gridCalibrationController: this.gridCalibrationController,
            sceneWorkspaceController: this.sceneWorkspaceController,
            encounterPlanningFeature: this.encounterPlanningFeature,
            designActionRegistry: this.designActionRegistry,
            hooksController: this.hooksController,
            render: (options) => this.render(options),
            notifications: globalThis.ui?.notifications,
            getActors: () => Array.from(game.actors?.contents ?? []),
            addActorsToScene: (actors) => this.#addActorsToScene(actors),
            centerSceneMapOnToken: ({ sceneId, x, y }) => this.#centerSceneMapOnToken({ sceneId, x, y }),
            confirmRef: () => globalThis.confirm,
            uiRef: () => ui,
            foundryRef: () => foundry,
            activityLogger: totcLogger,
            logger: console
        });
        this.registerFeature(this.sceneDesignFeature);
        this.campaignFeature = new CampaignFeature({
            layoutEngine: this.layoutEngine,
            panelRegistry: this.panelRegistry,
            stateStore: this.stateStore,
            render: (options) => this.render(options),
            announce: (message) => this.#announceGamemasterGeneratedContent(message)
        });
        this.registerFeature(this.campaignFeature);
        this.registerFeature(this.actorManagementFeature);
        this.workspaceLayoutFeature = new WorkspaceLayoutFeature({
            layoutEngine: this.layoutEngine,
            stateStore: this.stateStore,
            panelRegistry: this.panelRegistry,
            panelHost: this.panelHost,
            sceneWorkspaceController: this.sceneWorkspaceController,
            designActionRegistry: this.designActionRegistry,
            executeDesignAction: (actionId, options) => this.sceneDesignFeature.executeDesignAction(actionId, options),
            render: (options) => this.render(options),
            escapeHTML: (value) => this.#escapeHTML(value),
            isGM: () => Boolean(game.user?.isGM),
            isRollLocked: () => this.features.some((f) => typeof f.hasOutstandingRequests === "function" && f.hasOutstandingRequests()),
            openFoundrySettings: () => openFoundrySettingsView({ game, ui, foundry }),
            shutDown: async () => game.shutDown?.()
        });
        this.registerFeature(this.workspaceLayoutFeature);
        this._playerPanelSectionSnapshotInitialized = false;
        this._playerPanelVisibleSectionIds = new Set();
        this._sceneRefreshHandler = (scene, changes) => {
            // Log detailed scene update info when called from updateScene hook (has args).
            if (scene && changes) {
                totcLogger.debug("[hook:updateScene] Scene updated — re-rendering workspace", {
                    sceneId: scene?.id,
                    sceneName: scene?.name,
                    changes,
                    "scene.img": scene?.img ?? null,
                    "_source.img": scene?._source?.img ?? null,
                    "_source.background.src": scene?._source?.background?.src ?? null,
                    "_source.texture.src": scene?._source?.texture?.src ?? null,
                    "getSceneBackgroundSource()": getSceneBackgroundSource(scene)
                });
            } else if (scene && !changes) {
                // Called from canvasReady or canvasTearDown — scene arg may be the canvas/scene object
                totcLogger.debug("[hook:canvas] Canvas hook fired — re-rendering workspace", {
                    hookScene: scene?.id ? { id: scene.id, name: scene.name } : null
                });
            }
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._deletedSceneHandler = (scene) => {
            void this.#removeDeletedSceneMapPanel(scene);
        };
        this._compendiumRefreshHandler = () => {
            this.compendiumCacheController.invalidate();
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
        this._actorRefreshHandler = () => {
            if (this.rendered) {
                this.render({ force: false });
            }
        };
        this._wallSelectionRefreshHandler = () => {
            const scene = canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.active ?? null;
            this.sceneDesignFeature.syncSelectedWallsFromCanvas(scene, { clearWhenEmpty: true });
            if (scene) this.sceneDesignFeature.refreshSceneWallOverlay(scene);
            if (this.rendered) this.render({ force: false });
        };
        this._loggerUnsubscribe = totcLogger.subscribe(() => {
            if (this.rendered) this.render({ force: false });
        });
        this.hooksController = new WorkspaceHooksController({
            hooks: Hooks,
            gameReady: () => Boolean(game.ready),
            onCompendiumReady: this._compendiumRefreshHandler
        });
        this.hooksController.registerFamily("scene", [
            { event: "canvasReady", handler: this._sceneRefreshHandler },
            { event: "canvasTearDown", handler: this._sceneRefreshHandler },
            { event: "updateScene", handler: this._sceneRefreshHandler },
            { event: "createScene", handler: this._sceneRefreshHandler },
            { event: "deleteScene", handler: this._deletedSceneHandler },
            { event: "controlWall", handler: this._wallSelectionRefreshHandler }
        ]);
        this.hooksController.registerFamily("compendium", [
            { event: "createCompendium", handler: this._compendiumRefreshHandler },
            { event: "updateCompendium", handler: this._compendiumRefreshHandler },
            { event: "deleteCompendium", handler: this._compendiumRefreshHandler },
            { event: "createItem", handler: this._compendiumDocumentMutationHandler },
            { event: "updateItem", handler: this._compendiumDocumentMutationHandler },
            { event: "deleteItem", handler: this._compendiumDocumentMutationHandler },
            { event: "totcStarterCompendiumsReady", handler: this._compendiumRefreshHandler }
        ]);
        this.hooksController.registerFamily("gamemaster", [
            { event: "createCombat", handler: this._gamemasterRefreshHandler },
            { event: "deleteCombat", handler: this._gamemasterRefreshHandler },
            { event: "updateCombat", handler: this._gamemasterRefreshHandler },
            { event: "controlToken", handler: this._gamemasterRefreshHandler },
            { event: "pauseGame", handler: this._gamemasterRefreshHandler }
        ]);
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

    /**
     * Register a new Workspace feature.
     *
     * @param {WorkspaceFeature} feature - The feature to register.
     */
    registerFeature(feature) {
        if (!(feature instanceof WorkspaceFeature)) {
            throw new TypeError("feature must be an instance of WorkspaceFeature");
        }
        this.features.push(feature);
        if (this.rendered && this.element) {
            feature.bind(this.element);
        }
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
        const viewedScene = this.sceneWorkspaceController.getViewedSceneDocument();
        const scene = canvas?.scene ?? game.scenes?.active ?? viewedScene;
        const combat = game.combats?.active ?? game.combat ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const pinnedEncounterSceneId = this.encounterPlanningFeature?.selectedSceneId ?? "";
        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        const isCanvasSceneMatch = canvas?.ready && canvasSceneId && canvasSceneId === String(scene?.id ?? scene?._id ?? "").trim();
        const canSyncTokenSelectionFromCanvas = isCanvasSceneMatch && (!pinnedEncounterSceneId || !canvasSceneId || pinnedEncounterSceneId === canvasSceneId);
        if (canSyncTokenSelectionFromCanvas && (controlledTokens.length > 0 || this.selectedTokenIds.size > 0)) {
            const controlledIds = new Set(controlledTokens.map((t) => t.id).filter(Boolean));
            let mismatch = controlledIds.size !== this.selectedTokenIds.size;
            if (!mismatch) {
                for (const id of this.selectedTokenIds) {
                    if (!controlledIds.has(id)) {
                        mismatch = true;
                        break;
                    }
                }
            }
            if (mismatch) {
                this.selectedTokenIds = controlledIds;
            }
        }

        const gmPanelState = this.#getGamemasterPanelState();
        const gmSnapshot = buildGamemasterContextSnapshot({ scene, combat, controlledTokens });
        const gmPanel = buildGamemasterPanelModel({
            snapshot: gmSnapshot,
            panelState: gmPanelState
        });
        const compendiumItems = await this.compendiumCacheController.getItems();
        const inspectorPanel = buildInspectorPanelModel({
            activePanel: activeWorkspacePanel,
            scene,
            combat,
            controlledTokens,
            isGM: Boolean(game.user?.isGM),
            registry: this.designActionRegistry
        });
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

        const isGMUser = Boolean(game.user?.isGM);
        const panelVisibility = this.panelRegistry.getVisibilityModel(visiblePanels, { isGM: isGMUser });
        if (!isGMUser) {
            for (const panelId of visiblePanels) {
                if (panelVisibility.some((panel) => panel.id === panelId)) continue;
                const panelDef = this.panelRegistry.get(panelId);
                if (!panelDef || panelDef.roleAccess?.internalOnly) continue;
                panelVisibility.push({
                    id: panelDef.id,
                    title: panelDef.title,
                    visible: true
                });
            }
        }
        const context = {
            enabled: policy.enabled,
            debugGovernance: policy.debugGovernance,
            hasUserLayout: Boolean(this.stateStore?.getUserLayout?.()),
            panels: this.panels,
            panelVisibility,
            layout: activeLayout,
            dockWeights: this.layoutEngine.getDockWeightLayout(),
            compendiumSearchQuery: this.compendiumSearchQuery,
            compendiumItems,

            compendiumLoadingState: this.compendiumCacheController.loadingFailureMessage,
            mediaBrowserPanel: null,
            diceRollFeedPanel: null,
            dieRollRequestPanel: null,
            inspectorPanel,
            gm: gmSnapshot,
            gmPanel: highlightedGmPanel,
            marketPanel: null,
            playerEncounterPanel: null,
            designIssuesPanel: null,
            loggingPanel: buildLoggingPanelModel({ entries: totcLogger.getEntries() }),
            encounterManagerPanel: buildEncounterManagerPanelModel({
                combat
            })
        };

        for (const feature of this.features) {
            if (typeof feature.prepareContext === "function") {
                await feature.prepareContext(context);
            }
        }

        return context;
    }

    async _renderHTML(context) {
        return this.workspaceLayoutFeature.renderShell(context);
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.hooksController.bindAll();
        this.#syncNativeCanvasScene();

        this.#wireDebouncedTextInputHandlers();

        this.sceneActorDropController.wireActorListDragHandlers(this.element);

        this.#wireEncounterManagerPanelHandlers();

        this.element?.querySelectorAll("[data-action='design-lens-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(button.dataset.designActionId ?? "").trim();
                const panelId = String(button.dataset.panelId ?? "").trim();
                await this.sceneDesignFeature.executeDesignAction(actionId, { panelId });
            });
        });

        this.element?.querySelectorAll("[data-action='inspector-design-action']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionId = String(button.dataset.designActionId ?? "").trim();
                const panelId = String(button.dataset.panelId ?? "").trim();
                await this.sceneDesignFeature.executeDesignAction(actionId, { panelId });
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

        this.#wireLoggingPanelHandlers();

        for (const feature of this.features) {
            if (typeof feature.bind === "function") {
                feature.bind(this.element);
            }
        }
    }

    async close(options = {}) {
        for (const feature of this.features) {
            if (typeof feature.dispose === "function") {
                try {
                    feature.dispose();
                } catch (e) {
                    console.error("[turn-of-the-century] Error disposing feature:", e);
                }
            }
        }
        this.hooksController.unbindAll();
        this.compendiumCacheController.dispose();
        this.sceneActorDropController.clearDragImage();
        this.gridCalibrationController.close();
        this._loggerUnsubscribe?.();
        return await super.close?.(options);
    }

    #getEncounterCombatById(combatId = "") {
        return this.#collectionGet(game.combats, combatId)
            ?? (String(game.combats?.active?.id ?? "") === String(combatId ?? "") ? game.combats.active : null)
            ?? (String(game.combat?.id ?? "") === String(combatId ?? "") ? game.combat : null)
            ?? (String(ui.combat?.viewed?.id ?? "") === String(combatId ?? "") ? ui.combat.viewed : null);
    }

    #getEncounterCombat(element = null) {
        const combatId = String(element?.closest?.(".totc-v2-encounter-panel")?.dataset?.combatId ?? "").trim();
        if (combatId) return this.#getEncounterCombatById(combatId) ?? ui.combat?.viewed ?? game.combat ?? game.combats?.active ?? null;
        return ui.combat?.viewed ?? game.combat ?? game.combats?.active ?? null;
    }

    #wireEncounterManagerPanelHandlers() {
        this.element?.querySelectorAll("[data-action='encounter-manager-start-round']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const combat = this.#getEncounterCombat();
                if (!combat?.initializeEncounterRound) return;
                await combat.initializeEncounterRound();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='encounter-manager-set-phase']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const phase = String(button.dataset.phase ?? "").trim();
                const combat = this.#getEncounterCombat();
                if (!phase || !combat?.setEncounterPhase) return;
                await combat.setEncounterPhase(phase);
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='encounter-manager-resolve-round']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const combat = this.#getEncounterCombat();
                if (!combat?.beginEncounterResolution) return;
                await combat.beginEncounterResolution();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='encounter-manager-step-tick']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const combat = this.#getEncounterCombat();
                if (!combat?.stepEncounterResolution) return;
                const direction = Number(button.dataset.direction ?? 1) >= 0 ? 1 : -1;
                await combat.stepEncounterResolution(direction);
                this.render({ force: false });
            });
        });
    }

    #collectionContents(collection) {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection;
        if (Array.isArray(collection.contents)) return collection.contents;
        if (typeof collection.values === "function") return Array.from(collection.values());
        if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
        return [];
    }

    #collectionGet(collection, id = "") {
        const key = String(id ?? "").trim();
        if (!key) return null;
        return collection?.get?.(key) ?? this.#collectionContents(collection).find((entry) => (
            String(entry?.id ?? entry?._id ?? entry?.document?.id ?? "").trim() === key
        )) ?? null;
    }

    #isMapPanel(panel) {
        return this.sceneWorkspaceController.isMapPanel(panel);
    }

    #getSceneDocumentById(sceneId) {
        return this.sceneWorkspaceController.getSceneDocumentById(sceneId);
    }

    #getActorDocumentByReference(reference) {
        const id = String(reference ?? "").trim();
        if (!id) return null;
        return game.actors?.get?.(id)
            ?? (game.actors?.contents ?? []).find((actor) => {
                const actorId = String(actor?.id ?? actor?._id ?? "").trim();
                const actorUuid = String(actor?.uuid ?? (actorId ? `Actor.${actorId}` : "")).trim();
                return id === actorId || id === actorUuid || id === `Actor.${actorId}`;
            })
            ?? null;
    }

    #getItemDocumentById(itemId) {
        const id = String(itemId ?? "").trim();
        if (!id) return null;
        return game.items?.get?.(id)
            ?? (game.items?.contents ?? []).find((item) => String(item?.id ?? item?._id ?? "") === id)
            ?? null;
    }



    #buildSceneViewModel(scene, fallback = {}) {
        return this.sceneWorkspaceController.buildSceneViewModel(scene, fallback);
    }

    #getMapPanelScene(panel, context = {}) {
        return this.sceneWorkspaceController.getMapPanelScene(panel, context);
    }

    #getDesignActionScene(sourcePanel = null, currentScene = null) {
        return this.sceneWorkspaceController.getDesignActionScene(sourcePanel, currentScene);
    }

    #getPanelSceneId(panel, context = {}) {
        return this.sceneWorkspaceController.getPanelSceneId(panel, context);
    }

    #makeSceneMapPanelDef(scene) {
        return this.sceneWorkspaceController.makeSceneMapPanelDef(scene);
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
        return await this.sceneWorkspaceController.removeDeletedSceneMapPanel(scene);
    }

    #openSceneMapPanel(sceneId) {
        return this.sceneWorkspaceController.openSceneMapPanel(sceneId);
    }

    #getDefaultCenterScene() {
        return this.sceneWorkspaceController.getDefaultCenterScene();
    }

    async #activateScene(scene) {
        return await this.sceneWorkspaceController.activateScene(scene);
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
        this.hooksController.bindFamily("scene");
    }

    #bindCompendiumHooks() {
        this.hooksController.bindFamily("compendium");
    }

    #unbindSceneHooks() {
        this.hooksController.unbindFamily("scene");
    }

    #unbindCompendiumHooks() {
        this.compendiumCacheController.dispose();
        this.hooksController.unbindFamily("compendium");
    }

    #bindGamemasterHooks() {
        this.hooksController.bindFamily("gamemaster");
    }

    #unbindGamemasterHooks() {
        this.hooksController.unbindFamily("gamemaster");
    }

    #getGamemasterPanelState() {
        return this.stateStore?.getUserScopedState?.(GM_PANEL_STATE_KEY, normalizeGamemasterPanelState)
            ?? normalizeGamemasterPanelState();
    }



    async #setGamemasterPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(GM_PANEL_STATE_KEY, patch, normalizeGamemasterPanelState);
    }



    #syncSelectionToCanvas(scene = null) {
        if (!canvas?.ready || !canvas?.tokens) return;
        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        const targetSceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (targetSceneId && canvasSceneId !== targetSceneId) return;
        const currentControlledIds = new Set(canvas.tokens.controlled.map(t => t.id).filter(Boolean));

        for (const token of canvas.tokens.controlled) {
            if (token && token.id && !this.selectedTokenIds.has(token.id)) {
                token.release();
            }
        }

        for (const id of this.selectedTokenIds) {
            if (!currentControlledIds.has(id)) {
                const token = canvas.tokens.get(id);
                token?.control({ releaseOthers: false });
            }
        }
    }



    #renderGamemasterPanel(gmPanel = {}, gmSnapshot = {}, dieRollRequestPanel = {}) {
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
        const dieRollRequestsMarkup = this.rollRequestFeature.renderRollRequests(dieRollRequestPanel);

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
            <article class="totc-v2-gm-panel__roll-requests">
                <div class="totc-v2-gm-panel__group-header">
                    <span>Die Roll Requests</span>
                    <span class="totc-v2-gm-panel__group-meta">${Number(dieRollRequestPanel?.requests?.length ?? 0)}</span>
                </div>
                <div class="totc-v2-gm-panel__roll-requests-body">
                    ${dieRollRequestsMarkup}
                </div>
            </article>
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
                await this.sceneDesignFeature.executeDesignAction("scene.create", { panelId: "gamemaster" });
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
                await this.#showEncounterManagerPanel();
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
        await this.marketFeature.generateOfferBoard();
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

    #wireDebouncedTextInputHandlers() {
        this.element?.addEventListener("input", (event) => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;

            const action = String(input.dataset.action ?? "").trim();
            if (!action || !isWorkspaceDebouncedTextInputTarget(input)) return;

            const existingTimer = this._textInputDebounceTimers.get(action);
            if (existingTimer) clearTimeout(existingTimer);

            const value = String(input.value ?? "");
            if (action === "media-browser-search") {
                this.mediaFeature.setSearchQuery(value);
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
            case "actor-list-search": {
                this.actorManagementFeature.actorWorkspaceController.setSearchQuery(value);
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "actor-list-search");
                break;
            }
            case "gm-search-actions": {
                await this.#setGamemasterPanelStatePatch({ actionSearchQuery: value });
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "gm-search-actions");
                break;
            }

            case "media-browser-search": {
                this.mediaFeature.setSearchQuery(value);
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "media-browser-search");
                break;
            }
            case "scene-properties-name": {
                await this.sceneDesignFeature.saveSceneName(value);
                focusWorkspaceTextInputAtEnd(this.element, "scene-properties-name");
                break;
            }
            default:
                break;
        }
    }

    async #openActorEditorPanel() {
        const panelDef = this.panelRegistry.get("actor-editor");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });

        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
    }

    #wireLoggingPanelHandlers() {
        this.element?.querySelectorAll("[data-action='logging-copy']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const text = formatLoggingPanelEntriesForClipboard(totcLogger.getEntries());
                if (!text) {
                    ui.notifications?.warn?.("No debug log entries to copy.");
                    return;
                }

                try {
                    await this.#copyTextToClipboard(text);
                    ui.notifications?.info?.("Debug log copied to clipboard.");
                } catch (error) {
                    console.error("[turn-of-the-century] Debug log copy failed", error);
                    ui.notifications?.error?.("Unable to copy debug log - see console.");
                }
            });
        });
        this.element?.querySelectorAll("[data-action='logging-clear']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                totcLogger.clear();
                this.render({ force: false });
            });
        });
    }

    async #copyTextToClipboard(text) {
        if (globalThis.navigator?.clipboard?.writeText) {
            await globalThis.navigator.clipboard.writeText(text);
            return;
        }

        const documentRef = globalThis.document;
        if (!documentRef?.body?.append || typeof documentRef.createElement !== "function") {
            throw new Error("Clipboard API is not available.");
        }

        const textarea = documentRef.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        documentRef.body.append(textarea);
        textarea.select();

        try {
            const copied = documentRef.execCommand?.("copy");
            if (!copied) throw new Error("Clipboard copy command failed.");
        } finally {
            textarea.remove();
        }
    }

    async #addActorsToScene(actors = [], { scene = null, anchorPosition = null } = {}) {
        await this.sceneActorDropController.addActorsToScene(actors, { scene, anchorPosition });
    }

    async #centerSceneMapOnToken({ sceneId = "", x = 0, y = 0 } = {}) {
        const targetSceneId = String(sceneId ?? "").trim();
        if (!targetSceneId) return false;
        const tokenX = Number(x);
        const tokenY = Number(y);
        if (!Number.isFinite(tokenX) || !Number.isFinite(tokenY)) return false;

        const scene = this.#getSceneDocumentById(targetSceneId);
        if (!scene) return false;

        const currentSceneId = String(canvas?.scene?.id ?? game.scenes?.viewed?.id ?? "").trim();
        if (currentSceneId !== targetSceneId) {
            await scene.view?.();
        }

        if (typeof canvas?.animatePan === "function") {
            await canvas.animatePan({ x: tokenX, y: tokenY });
        } else if (typeof canvas?.pan === "function") {
            canvas.pan({ x: tokenX, y: tokenY });
        }
        return true;
    }

    #isDockOccupied(dock) {
        return Boolean(dock?.stacks?.some((stack) => (stack?.panels?.length ?? 0) > 0));
    }

    #enforceRequiredDocking() {
        const compendiumPanel = this.panelRegistry.get("compendium");
        const scenesPanel = this.panelRegistry.get("scenes");
        if (!compendiumPanel || !scenesPanel) return null;

        let changed = false;
        const initialLayout = this.layoutEngine.getLayout();
        if (this.#dockHasPanel(initialLayout, "centerDock", "map")) {
            this.layoutEngine.removePanel("map");
            changed = true;
        }

        const layoutAfterMapRemoval = this.layoutEngine.getLayout();
        if (!this.#dockHasAnyMapPanel(layoutAfterMapRemoval, "centerDock")) {
            const defaultCenterPanel = this.#makeSceneMapPanelDef(this.#getDefaultCenterScene());
            if (defaultCenterPanel) {
                this.layoutEngine.applyDropIntent(defaultCenterPanel, { kind: "edge", dockId: "centerDock" });
                changed = true;
            }
        }

        const layoutAfterCenterMap = this.layoutEngine.getLayout();
        if (!this.#dockHasPanel(layoutAfterCenterMap, "rightDock", "compendium")) {
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

    #dockHasAnyMapPanel(layout, dockId) {
        const dock = layout?.root?.[dockId];
        if (!dock?.stacks?.length) return false;

        return dock.stacks.some((stack) => (stack?.panels ?? []).some((panel) => this.#isMapPanel(panel)));
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

    async _openMediaBrowserPanel({ mode = "browse", selectedPaths = [], onSelect = null } = {}) {
        await this.mediaFeature.openMediaBrowserPanel({ mode, selectedPaths, onSelect });
    }

    async #showEncounterManagerPanel() {
        const panelDef = this.panelRegistry.get("encounter-manager");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "leftDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
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
            const fallbackPanel = stack?.panels?.find((panel) => fallbackActiveId === panel.id) ?? stack?.panels?.[0];
            if (fallbackPanel) return fallbackPanel;
        }

        return null;
    }

    #syncNativeCanvasScene() {
        const panel = this.workspaceLayoutFeature.getActiveCenterMapPanel();
        const sceneId = this.#getPanelSceneId(panel);
        if (!sceneId) {
            this._nativeCanvasViewSceneId = "";
            return;
        }

        const currentSceneId = String(canvas?.scene?.id ?? game.scenes?.viewed?.id ?? "").trim();
        if (currentSceneId === sceneId) {
            this._nativeCanvasViewSceneId = sceneId;
            return;
        }

        if (this._nativeCanvasViewSceneId === sceneId) return;

        const scene = this.#getSceneDocumentById(sceneId);
        if (!scene?.view) return;

        this._nativeCanvasViewSceneId = sceneId;
        void scene.view().catch((error) => {
            this._nativeCanvasViewSceneId = "";
            console.error("[turn-of-the-century] Failed to view workspace scene", error);
        });
    }
}
