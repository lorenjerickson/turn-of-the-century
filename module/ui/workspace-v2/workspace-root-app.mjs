// --- Compendium Preflight Check ---
import { migrateTotcStarterCompendiums } from "../../migrations/starter-compendiums.mjs";
// Utility: Check if any system compendium pack has entries.
// Scoped to this system's own packs so that content from installed modules
// does not mask a genuinely empty system compendium set.
async function hasAnyCompendiumData() {
    if (!game?.ready) return false;
    const systemId = game.system?.id ?? "turn-of-the-century";
    const allPacks = Array.from(game.packs.values?.() ?? game.packs ?? []);
    const systemPacks = allPacks.filter((p) => {
        const collection = String(p.collection ?? p.metadata?.id ?? "");
        const packageName = String(p.metadata?.packageName ?? p.metadata?.package ?? "");
        return collection.startsWith(`${systemId}.`) || packageName === systemId;
    });
    if (!systemPacks.length) return false;
    for (const pack of systemPacks) {
        try {
            const index = await pack.getIndex();
            const count = Array.isArray(index) ? index.length : (index?.size ?? 0);
            if (count > 0) return true;
        } catch { /* ignore individual pack errors */ }
    }
    return false;
}

// Utility: Show a modal dialog to the GM with a repair button
function showCompendiumRepairModal(onRepair) {
    if (!game.user?.isGM) return;
    const safeOnRepair = typeof onRepair === "function" ? onRepair : () => {};
    // DialogV2 (Foundry v13+) requires buttons as an array and title under window:{title}.
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (DialogV2) {
        new DialogV2({
            window: { title: "Compendium Data Missing" },
            content: `<p>No compendium data was found for this system. This can break core features.</p>`
                + `<p><strong>Repair will repopulate the starter compendiums. Existing world data will not be affected.</strong></p>`,
            buttons: [
                {
                    action: "repair",
                    label: "Repair Compendiums",
                    default: true,
                    callback: () => safeOnRepair()
                },
                {
                    action: "cancel",
                    label: "Cancel"
                }
            ]
        }).render(true);
    } else {
        // Foundry version too old to support DialogV2 — surface a notification instead.
        ui.notifications?.error(
            "Turn of the Century: compendium data is missing. Please reload and allow the repair prompt, or contact your system maintainer."
        );
    }
}

// Main preflight: Run after game.ready, before UI panels.
// On a fresh install all packs are empty LevelDB databases; auto-populate from
// the bundled sample content so the compendium panel works immediately.
Hooks.once("ready", async () => {
    if (await hasAnyCompendiumData()) return;
    if (!game.user?.isGM) return;

    ui.notifications?.info("Turn of the Century: Populating starter content…");
    try {
        await migrateTotcStarterCompendiums({ overwrite: false, notify: false });
        ui.notifications?.info("Turn of the Century: Starter content ready.");
        Hooks.callAll?.("totcStarterCompendiumsReady");
    } catch (e) {
        ui.notifications?.error("Turn of the Century: Starter content population failed — " + (e?.message ?? e));
        console.error("[turn-of-the-century] Starter compendium population error", e);
    }
});
import { dieRollRequestManager } from "../../die-roll-request-manager.mjs";
import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";
import { InteractionController } from "./interaction-controller.mjs";
import { GridCalibrationController } from "./grid-calibration-controller.mjs";
import { LayoutEngine } from "./layout-engine.mjs";
import { WorkspacePanelRegistry } from "./panel-registry.mjs";
import { getDieRollRequestHostPanelId } from "./die-roll-request-routing.mjs";
import { openFoundrySettingsView } from "./workspace-system-menu.mjs";
import {
    focusWorkspaceTextInputAtEnd,
    isWorkspaceDebouncedTextInputTarget
} from "./workspace-text-inputs.mjs";
import {
    buildDiceRollFeedPanelModel
} from "./panels/dice-roll-feed-panel.mjs";
import {
    buildDieRollRequestPanelModel,
    renderDieRollRequestPanel
} from "./panels/die-roll-request-panel.mjs";
import {
    buildDesignCommandPaletteModel,
    renderDesignCommandPalette
} from "./panels/design-command-palette.mjs";
import {
    buildInspectorPanelModel
} from "./panels/inspector-panel.mjs";
import {
    browseAssetMedia,
    buildMediaBrowserPanelModel
} from "./panels/media-browser-panel.mjs";
import { getSceneBackgroundSource } from "./scene-background-source.mjs";
import {
    getNativeCanvasEventScenePoint,
    isPrimaryPointerButton,
    listenForNativeCanvasPointerDown,
    previewNativeCanvasGrid
} from "./native-canvas-grid-calibration.mjs";
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
import {
    buildDesignIssuesPanelModel
} from "./panels/design-issues-panel.mjs";
import {
    addWallSegmentToScene,
    advanceWallPlacementSequence,
    buildWallEditingGrid,
    findWallsIntersectingBounds,
    findWallsWithinBounds,
    getControlledWallIds,
    getJoinableWallIds,
    joinWallSegmentsById,
    removeWallSegmentsById,
    snapPointToGridIntersection,
    splitWallSegmentAtPoint,
    wallDocumentId
} from "./scene-wall-editing.mjs";
import {
    buildSceneWallOverlayState
} from "./scene-wall-detection.mjs";
import {
    buildEncounterMovementOverlayModel,
    findEncounterMovementOverlayCellAtPoint
} from "./encounter-movement-overlay.mjs";
import {
    buildEncounterTargetingOverlayModel
} from "./encounter-targeting-overlay.mjs";

const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";
import {
    buildScenePropertiesPanelModel,
} from "./panels/scene-properties-panel.mjs";
import {
    buildScenesPanelModel
} from "./panels/scenes-panel.mjs";
import {
    buildActorEditorPanelModel,
    buildActorListPanelModel,
    buildActorUpdateDataFromFormData,
    buildGeneratedActorDocumentData
} from "./panels/actor-management-panel.mjs";
import {
    CompendiumCacheController
} from "./controllers/compendium-cache-controller.mjs";
import {
    SceneActorDropController
} from "./controllers/scene-actor-drop-controller.mjs";
import {
    ActorWorkspaceController
} from "./controllers/actor-workspace-controller.mjs";
import {
    SceneWorkspaceController
} from "./controllers/scene-workspace-controller.mjs";
import {
    WorkspacePanelHost
} from "./controllers/workspace-panel-host.mjs";
import {
    WorkspaceHooksController
} from "./controllers/workspace-hooks-controller.mjs";
import {
    MarketController,
    normalizeMarketPanelState
} from "./controllers/market-controller.mjs";
import {
    buildCampaignBuilderPanelModel
} from "./panels/campaign-builder-panel.mjs";

const WORKSPACE_PANEL_DRAG_MIME = "application/x-totc-workspace-panel";

function dataTransferHasType(dataTransfer, mimeType) {
    const types = dataTransfer?.types;
    if (typeof types?.contains === "function") return types.contains(mimeType);
    return Array.from(types ?? []).includes(mimeType);
}

import {
    buildScenarioBuilderPanelModel
} from "./panels/scenario-builder-panel.mjs";
import {
    buildEncounterManagerPanelModel
} from "./panels/encounter-manager-panel.mjs";
import {
    buildPlayerEncounterPanelModel
} from "./panels/player-encounter-panel.mjs";
import {
    buildCampaignViewDeletePlan,
    buildCampaignViewMovePlan,
    buildCampaignViewPanelModel,
    getCampaignViewDropMode
} from "./panels/campaign-view-panel.mjs";
import {
    buildGMAssistantDocumentSystemData,
    buildGMAssistantPanelModel
} from "./panels/gm-assistant-panel.mjs";
import { LLMService } from "../../services/llm-service.mjs";
import {
    buildEncounterPlannerForCombatant
} from "../../encounters/planner-context.mjs";
import {
    findCombatantForToken
} from "../../encounters/combatant-token-matching.mjs";
import {
    requireActorDocumentClass,
    renderFoundryApplication,
    requireApplicationV2,
    requireCombatDocumentClass,
    requireItemDocumentClass
} from "../../foundry-v14-runtime.mjs";

const ApplicationV2Base = requireApplicationV2();
const CombatDocumentClass = requireCombatDocumentClass();
const ActorDocumentClass = requireActorDocumentClass();
const ItemDocumentClass = requireItemDocumentClass();

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
const GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS = 100;
const GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS = 500;
const ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER = "totc-encounter-movement";
const GM_PANEL_STATE_KEY = "gmPanelState";
const MARKET_PANEL_STATE_KEY = "marketPanelState";
const MARKET_SCENE_FLAG_KEY = "workspaceV2Market";

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
        this.selectedTokenIds = new Set();
        this._nativeCanvasViewSceneId = "";
        this._activePlanEditSlot = null;
        this._wiredElement = null;
        this.designCommandPaletteOpen = false;
        this.designCommandPaletteQuery = "";
        this.compendiumSearchQuery = "";
        this._mediaBrowserEntries = null;
        this._mediaBrowserEntriesPromise = null;
        this._mediaBrowserSelectCallback = null;
        this._mediaBrowserState = {
            query: "",
            type: "all",
            view: "list",
            sortKey: "filename",
            sortDirection: "asc",
            mode: "browse",
            selectedPaths: [],
            error: ""
        };
        this._resizeSession = null;
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
        this.actorWorkspaceController = new ActorWorkspaceController({
            getActorById: (id) => game.actors?.get?.(id) ?? null,
            createActor: (data) => ActorDocumentClass.create(data),
            generate: (prompt, options) => LLMService.generate(prompt, options),
            buildGeneratedActorDocumentData,
            buildActorUpdateDataFromFormData,
            openActorEditor: () => this.#openActorEditorPanel(),
            render: () => this.render({ force: false }),
            logger: console
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
            getActors: () => Array.from(game.actors?.contents ?? []),
            addActorsToScene: (actors) => this.#addActorsToScene(actors),
            centerSceneMapOnToken: ({ sceneId, x, y }) => this.#centerSceneMapOnToken({ sceneId, x, y }),
            executeDesignAction: (actionId, options) => this.#executeDesignAction(actionId, options),
            render: () => {
                if (this.rendered) this.render({ force: false });
            },
            foundryRef: () => foundry,
            uiRef: () => ui,
            confirmRef: () => globalThis.confirm,
            logger: console,
            activityLogger: totcLogger
        });
        this.sceneActorDropController = new SceneActorDropController({
            getRoot: () => this.element,
            getSelectedActorIds: () => this.actorWorkspaceController.getSelectedActorIds(),
            getActorById: (id) => this.#getActorDocumentByReference(id),
            getSceneById: (id) => this.#getSceneDocumentById(id),
            getFallbackScene: () => this.#getScenePropertiesScene(),
            setScenePropertiesState: (patch) => {
                this.sceneWorkspaceController.patchState(patch);
            },
            render: () => this.render({ force: false }),
            escapeHTML: (value) => this.#escapeHTML(value),
            logger: totcLogger
        });
        this.panelHost = new WorkspacePanelHost({
            designActionRegistry: this.designActionRegistry,
            escapeHTML: (value) => this.#escapeHTML(value),
            isGM: () => Boolean(game.user?.isGM),
            isDesignLensActive: (panelId) => this.#isDesignLensActive(panelId),
            isMapPanel: (panel) => this.#isMapPanel(panel),
            getMapPanelScene: (panel, context) => this.#getMapPanelScene(panel, context),
            getPanelSceneId: (panel, context) => this.#getPanelSceneId(panel, context),
            gridCalibrationState: () => this.gridCalibrationController.state,
            getSceneGridOverlayState: (scene) => this.#getSceneGridOverlayState(scene),
            getSceneWallOverlayState: (scene) => this.#getSceneDetectedWallOverlayState(scene),
            getEncounterMovementOverlayState: (scene) => this.#getEncounterMovementOverlayState(scene),
            getEncounterTargetOverlayState: (scene) => this.#getEncounterTargetOverlayState(scene),
            getMapPanelToolbarState: (panel) => this.#getMapPanelToolbarState(panel),
            renderMarketPanel: (marketPanel) => this.#renderMarketPanel(marketPanel),
            renderGamemasterPanel: (gmPanel, gmSnapshot, dieRollRequestPanel) => this.#renderGamemasterPanel(gmPanel, gmSnapshot, dieRollRequestPanel),
            getSelectedTokenIds: () => this.selectedTokenIds
        });
        this.marketController = new MarketController({
            getScene: () => canvas?.scene ?? game.scenes?.viewed ?? null,
            getActors: () => game.actors?.contents ?? [],
            getControlledTokens: () => canvas?.tokens?.controlled ?? [],
            getUser: () => game.user,
            getSystemId: () => game.system?.id ?? "turn-of-the-century",
            getPanelState: () => this.#getMarketPanelState(),
            setPanelStatePatch: (patch) => this.#setMarketPanelStatePatch(patch),
            getCompendiumItems: () => this.compendiumCacheController.getItems(),
            getSeedsApi: () => game.turnOfTheCentury?.seeds,
            fromUuid: (uuid) => fromUuid(uuid),
            foundryRef: () => foundry,
            uiRef: () => ui,
            render: () => this.render({ force: false }),
            announce: (message) => this.#announceGamemasterGeneratedContent(message),
            random: () => Math.random(),
            logger: console
        });
        this.gridCalibrationController = new GridCalibrationController({
            sceneResolver: (state) => state.sceneId
                ? game.scenes?.get(state.sceneId)
                : (canvas?.scene ?? game.scenes?.viewed ?? null),
            notifications: globalThis.ui?.notifications,
            logger: console
        });
        this._appliedGridOverlayStates = new Map();
        this._detectedWallOverlayStates = new Map();
        this._mapPanelToolbarStates = new Map();
        this._encounterPlannerSelection = null;
        this._encounterMovementInteraction = null;
        this._encounterMovementCanvasCleanup = null;
        this._encounterMovementCanvasRef = null;
        this._encounterTargetingInteraction = null;
        this._selectedWallIdsByScene = new Map();
        this._joinableWallIdsByScene = new Map();
        this._wallAddSequence = null;
        this._wallCommandCanvasCleanup = null;
        this._wallCommandCanvasRef = null;
        this._gridCalibrationCanvasCleanup = null;
        this._gridCalibrationCanvasRef = null;
        this._onWallEditKeyDown = this.#onWallEditKeyDown.bind(this);
        this._gmAssistantState = {
            elementType: "campaign",
            actorType: "pawn",
            prompt: "",
            promptTextareaHeight: 0,
            parentLocationId: "",
            campaignId: "",
            scenarioId: "",
            isGenerating: false,
            result: null,
            error: null
        };
        this._campaignViewState = {
            selectedId: "",
            expandedIds: new Set()
        };
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
        this._designIssuesRefreshHandler = () => {
            if (this.rendered) this.render({ force: false });
        };
        this._wallSelectionRefreshHandler = () => {
            const scene = canvas?.scene ?? game.scenes?.viewed ?? game.scenes?.active ?? null;
            this.#syncSelectedWallsFromCanvas(scene, { clearWhenEmpty: true });
            if (scene) this.#refreshSceneWallOverlay(scene);
            if (this.rendered) this.render({ force: false });
        };
        this._dieRollRequestUnsubscribe = dieRollRequestManager.onChange((change) => {
            void this.#handleDieRollRequestChange(change);
        });
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
        this.hooksController.registerFamily("designIssues", [
            { event: "updateScene", handler: this._designIssuesRefreshHandler },
            { event: "canvasReady", handler: this._designIssuesRefreshHandler },
            { event: "createWall", handler: this._designIssuesRefreshHandler },
            { event: "deleteWall", handler: this._designIssuesRefreshHandler },
            { event: "createAmbientLight", handler: this._designIssuesRefreshHandler },
            { event: "deleteAmbientLight", handler: this._designIssuesRefreshHandler },
            { event: "createToken", handler: this._designIssuesRefreshHandler },
            { event: "updateToken", handler: this._designIssuesRefreshHandler },
            { event: "deleteToken", handler: this._designIssuesRefreshHandler },
            { event: "createActor", handler: this._designIssuesRefreshHandler },
            { event: "updateActor", handler: this._designIssuesRefreshHandler },
            { event: "deleteActor", handler: this._designIssuesRefreshHandler },
            { event: "createItem", handler: this._designIssuesRefreshHandler },
            { event: "deleteItem", handler: this._designIssuesRefreshHandler },
            { event: "createCombatant", handler: this._designIssuesRefreshHandler },
            { event: "updateCombatant", handler: this._designIssuesRefreshHandler },
            { event: "deleteCombatant", handler: this._designIssuesRefreshHandler }
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

    #getWorkspaceUsers() {
        const users = game.users?.contents
            ?? (typeof game.users?.values === "function" ? Array.from(game.users.values()) : game.users)
            ?? [];
        return Array.from(users).map((user) => ({
            id: String(user?.id ?? ""),
            name: String(user?.name ?? user?.id ?? "Unknown User"),
            isGM: Boolean(user?.isGM)
        })).filter((user) => user.id);
    }

    async #handleDieRollRequestChange() {
        const userId = String(game.user?.id ?? "");
        const isGM = Boolean(game.user?.isGM);
        const hasRelevantPendingRequest = dieRollRequestManager
            .getVisibleRequests({ userId, isGM })
            .some((request) => request.isPending && (isGM || !request.hasResult(userId)));

        if (hasRelevantPendingRequest) {
            const panelDef = this.panelRegistry.get(getDieRollRequestHostPanelId({ isGM }));
            if (panelDef) {
                const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "bottomDock" });
                await this.stateStore?.setUserLayout?.(nextLayout);
            }
        }

        if (this.rendered) this.render({ force: false });
    }

    #wireDieRollRequestHandlers() {
        this.element?.querySelectorAll("[data-action='die-roll-request-create']")?.forEach((form) => {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                event.stopPropagation();

                const data = new FormData(form);
                const recipientId = String(data.get("recipientId") ?? "").trim();
                if (!recipientId) {
                    ui.notifications?.warn?.("Choose a player before requesting a roll.");
                    return;
                }

                const label = String(data.get("label") ?? "Requested Roll").trim() || "Requested Roll";
                const rollMode = String(data.get("rollMode") ?? "normal");
                const modifier = Number(data.get("modifier") ?? 0) || 0;
                dieRollRequestManager.sendRequest({
                    initiatorId: game.user?.id ?? "",
                    requestor: {
                        id: game.user?.id ?? "",
                        name: game.user?.name ?? "GM",
                        type: "gm"
                    },
                    recipientIds: [recipientId],
                    rollType: String(data.get("rollType") ?? "custom"),
                    rollSubType: label,
                    label,
                    dice: rollMode === "advantage"
                        ? [{ count: 2, faces: 20, keep: "highest" }]
                        : rollMode === "disadvantage"
                            ? [{ count: 2, faces: 20, keep: "lowest" }]
                            : [{ count: 1, faces: 20 }],
                    modifiers: modifier ? [{ label: "Requested modifier", value: modifier, source: "gm" }] : []
                });
            });
        });

        this.element?.querySelectorAll("[data-action='die-roll-adjust']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.adjustModifier(
                    button.dataset.requestId,
                    game.user?.id,
                    Number(button.dataset.delta ?? 0) || 0
                );
            });
        });

        this.element?.querySelectorAll("[data-action='die-roll-request-roll']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.rollRequestForRecipient(button.dataset.requestId, game.user?.id);
            });
        });

        this.element?.querySelectorAll("[data-action='die-roll-request-cancel']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                dieRollRequestManager.sendCancel(button.dataset.requestId, { cancelledBy: game.user?.id ?? "" });
            });
        });
    }

    #wireRollLockGuard() {
        this.element?.addEventListener("click", (event) => {
            if (!dieRollRequestManager.hasOutstandingRequests()) return;
            const target = event.target?.closest?.("[data-action]");
            const action = String(target?.dataset?.action ?? "");
            if (!ROLL_LOCKED_ACTIONS.has(action)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            ui.notifications?.warn?.("Resolve or cancel outstanding roll requests before changing combat, scenes, or actors.");
        }, { capture: true });
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
        const scenePropertiesScene = this.#getScenePropertiesScene(activeWorkspacePanel, { viewedScene, defaultScene: scene });
        const scenePropertiesState = this.sceneWorkspaceController.propertiesState;
        const combat = game.combats?.active ?? game.combat ?? null;
        const controlledTokens = canvas?.tokens?.controlled ?? [];
        const pinnedEncounterSceneId = String(this._encounterPlannerSelection?.sceneId ?? "").trim();
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
        this.#syncActorDetailsToTokenSelection(scene);
        const gmPanelState = this.#getGamemasterPanelState();
        const gmSnapshot = buildGamemasterContextSnapshot({ scene, combat, controlledTokens });
        const gmPanel = buildGamemasterPanelModel({
            snapshot: gmSnapshot,
            panelState: gmPanelState
        });
        const workspaceUsers = this.#getWorkspaceUsers();
        // Die Roll Request Panel context
        const dieRollRequestPanel = buildDieRollRequestPanelModel({
            userId: game.user?.id,
            isGM: Boolean(game.user?.isGM),
            users: workspaceUsers
        });
        const compendiumItems = await this.compendiumCacheController.getItems();
        const mediaBrowserEntries = visiblePanels.has("media-browser")
            ? await this.#getMediaBrowserEntries()
            : (this._mediaBrowserEntries ?? []);
        const diceRollFeedPanel = buildDiceRollFeedPanelModel({
            messages: game.messages?.contents ?? game.messages ?? [],
            rollRequests: dieRollRequestManager.getVisibleRequests({
                userId: game.user?.id,
                isGM: Boolean(game.user?.isGM)
            }),
            users: workspaceUsers,
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
        const encounterPlannerSelection = this.#resolveEncounterPlannerSelection({
            combat,
            scene
        });

        const selectedEncounterActor = encounterPlannerSelection?.actor ?? null;
        const selectedEncounterToken = encounterPlannerSelection?.token ?? null;
        const playerEncounterPlanner = encounterPlannerSelection?.combatant?.id
            ? buildEncounterPlannerForCombatant({
                actor: selectedEncounterActor,
                tokenDocument: selectedEncounterToken,
                combat: encounterPlannerSelection.combat ?? combat,
                combatantId: encounterPlannerSelection.combatant.id
            })
            : null;
        const playerEncounterPanel = buildPlayerEncounterPanelModel({
            actor: selectedEncounterActor,
            planner: playerEncounterPlanner,
            combat,
            activePlanEditSlot: this._activePlanEditSlot
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
        const actorWorkspaceState = this.actorWorkspaceController.state;
        const selectedActor = this.actorWorkspaceController.getSelectedActor();
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
            panelVisibility,
            designCommandPalette: buildDesignCommandPaletteModel({
                active: this.designCommandPaletteOpen,
                activePanel: activeWorkspacePanel,
                isGM: isGMUser,
                query: this.designCommandPaletteQuery,
                registry: this.designActionRegistry
            }),
            layout: activeLayout,
            dockWeights: this.layoutEngine.getDockWeightLayout(),
            compendiumSearchQuery: this.compendiumSearchQuery,
            compendiumItems,
            actorListPanel: buildActorListPanelModel({
                actors: worldActors,
                query: actorWorkspaceState.searchQuery,
                typeFilter: actorWorkspaceState.typeFilter,
                selectedActorId: actorWorkspaceState.editorState.actorId,
                selectedActorIds: actorWorkspaceState.selectedActorIds,
                showCreate: actorWorkspaceState.editorState.mode === "create"
            }),
            actorEditorPanel: buildActorEditorPanelModel({
                actor: selectedActor,
                state: actorWorkspaceState.editorState,
                users: game.users,
                isGM: isGMUser
            }),
            compendiumLoadingState: this.compendiumCacheController.loadingFailureMessage,
            mediaBrowserPanel: buildMediaBrowserPanelModel({
                entries: mediaBrowserEntries,
                state: this._mediaBrowserState
            }),
            diceRollFeedPanel,
            dieRollRequestPanel,
            inspectorPanel,
            scene: {
                id: scene?.id ?? null,
                name: scene?.name ?? game.scenes?.viewed?.name ?? "Current Scene",
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
            playerEncounterPanel,
            designIssuesPanel,
            scenePropertiesPanel: buildScenePropertiesPanelModel({
                scene: scenePropertiesScene,
                actors: worldActors,
                gridCalibrationState: this.gridCalibrationController.state,
                sceneToolsState: scenePropertiesScene
                    ? this.#getMapPanelToolbarState({
                        id: `map:${scenePropertiesScene.id ?? scenePropertiesScene._id}`,
                        baseId: "map",
                        sceneId: scenePropertiesScene.id ?? scenePropertiesScene._id
                    })
                    : {},
                sceneToolActions: scenePropertiesScene
                    ? this.designActionRegistry.getApplicableActions({
                        panelId: `map:${scenePropertiesScene.id ?? scenePropertiesScene._id}`,
                        isGM: isGMUser
                    })
                    : [],
                status: scenePropertiesState.status,
                error: scenePropertiesState.error
            }),
            loggingPanel: buildLoggingPanelModel({ entries: totcLogger.getEntries() }),
            campaignBuilderPanel: buildCampaignBuilderPanelModel({
                campaigns: Array.from(game.items?.contents || []).filter(i => i.type === "campaign")
            }),
            scenarioBuilderPanel: buildScenarioBuilderPanelModel({
                scenarios: Array.from(game.items?.contents || []).filter(i => i.type === "scenario")
            }),
            encounterManagerPanel: buildEncounterManagerPanelModel({
                combat
            }),
            campaignViewPanel: buildCampaignViewPanelModel({
                items: Array.from(game.items?.contents || []),
                selectedId: this._campaignViewState.selectedId,
                expandedIds: this._campaignViewState.expandedIds
            }),
            gmAssistantPanel: buildGMAssistantPanelModel({
                ...this._gmAssistantState,
                parentLocationOptions: Array.from(game.items?.contents || [])
                    .filter((item) => item.type === "location")
                    .map((item) => ({ value: item.id, label: item.name }))
                    .sort((a, b) => a.label.localeCompare(b.label))
            })
        };
    }

    async _renderHTML(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-v2-root");
        if (dieRollRequestManager.hasOutstandingRequests()) {
            root.classList.add("is-roll-locked");
            root.setAttribute("data-roll-lock", "true");
        }
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
        const nativeCanvasShellClass = this.#getActiveCenterMapPanel(context.layout) ? " has-native-canvas-aperture" : "";
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
<section class="totc-workspace-v2-shell${nativeCanvasShellClass}">
    <div class="totc-workspace-v2-shell__emergency">
        <div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-panel-menu-toggle" title="Show visible panels" aria-label="Show visible panels" aria-expanded="false">
                <i class="fa-solid fa-window-maximize" aria-hidden="true"></i>
            </button>
            <div class="totc-v2-command-menu totc-v2-panel-menu" data-panel-menu="true" hidden>
                <section class="totc-v2-command-menu__panel-list" aria-label="Visible panels">
                    ${panelToggleMarkup}
                </section>
            </div>
        </div>
        ${game.user?.isGM ? `<div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="toggle-design-command-palette" title="Open design command palette" aria-label="Open design command palette" aria-expanded="${context.designCommandPalette?.active ? "true" : "false"}">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            </button>
            ${renderDesignCommandPalette(context.designCommandPalette ?? {}, { escapeHTML: (value) => this.#escapeHTML(value) })}
        </div>` : ""}
        <div class="totc-v2-floating-control">
            <button type="button" class="totc-v2-emergency-button" data-action="totc-v2-command-menu-toggle" title="Open workspace menu" aria-label="Open workspace menu" aria-expanded="false">
                <i class="fas fa-gear" aria-hidden="true"></i>
            </button>
            <div class="totc-v2-command-menu" data-command-menu="true" hidden>
                <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-open-foundry-settings">Foundry Settings</button>
                <button type="button" class="totc-v2-command-menu__item" data-action="totc-v2-exit-world">Return to Setup</button>
            </div>
        </div>
    </div>
    <main class="totc-workspace-v2-shell__main">
        <section class="totc-v2-layout${nativeCanvasShellClass}" data-layout-root="true" style="grid-template-columns:${columnTemplate};grid-template-rows:${rowTemplate};">
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
        this.hooksController.bindAll();
        this.#syncNativeCanvasScene();
        this.#syncGridCalibrationCanvasListener();

        this.#wireRollLockGuard();
        this.#wireDieRollRequestHandlers();

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
                const panelMenu = this.element?.querySelector("[data-panel-menu='true']");
                const toggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
                const panelToggleButton = this.element?.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (menu) menu.hidden = true;
                if (panelMenu) panelMenu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
                panelToggleButton?.setAttribute("aria-expanded", "false");
            });
        });

        this.#wireDebouncedTextInputHandlers();

        this.marketController.wireHandlers(this.element);

        this.actorWorkspaceController.wireHandlers(this.element);

        this.sceneActorDropController.wireActorListDragHandlers(this.element);

        this.#wirePlayerEncounterPanelHandlers();
        this.#wireEncounterManagerPanelHandlers();

        this.element?.querySelectorAll("[data-action='media-browser-filter-type']")?.forEach((select) => {
            select.addEventListener("change", () => {
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    type: String(select.value ?? "all")
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-view']")?.forEach((select) => {
            select.addEventListener("change", () => {
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    view: String(select.value ?? "list")
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-refresh']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._mediaBrowserEntries = null;
                this._mediaBrowserEntriesPromise = null;
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-sort']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    sortKey: String(button.dataset.sortKey ?? "filename"),
                    sortDirection: String(button.dataset.sortDirection ?? "asc")
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-toggle-selection']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", (event) => {
                event.stopPropagation();
                const mediaPath = String(checkbox.dataset.mediaPath ?? "").trim();
                if (!mediaPath) return;

                const selected = new Set(this._mediaBrowserState.selectedPaths ?? []);
                if (checkbox.checked) selected.add(mediaPath);
                else selected.delete(mediaPath);
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    selectedPaths: [...selected]
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-clear-selection']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    selectedPaths: []
                };
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='media-browser-confirm-selection']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#confirmMediaBrowserSelection();
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

        this.element?.querySelectorAll("[data-action='map-mode-select']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user?.isGM) return;
                const panelId = String(button.dataset.mapPanelId ?? "").trim();
                const mode = String(button.dataset.mode ?? "").trim();
                const current = this.#getMapPanelToolbarState(this.panelRegistry?.get?.(panelId) ?? { id: panelId });
                const nextMode = current.mode === mode ? null : mode;
                this.#patchMapPanelToolbarState(panelId, { mode: nextMode });
                if (nextMode === "walls") {
                    await this.#executeDesignAction("scene.walls", { panelId });
                } else if (mode === "walls") {
                    await this.#deactivateWallModeForPanel(panelId);
                }
                this.#syncWallCommandCanvasListener();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='map-wall-command']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user?.isGM) return;
                const panelId = String(button.dataset.mapPanelId ?? "").trim();
                const command = String(button.dataset.command ?? "").trim();
                this.#cancelWallAddSequence({ notify: false });
                if (command === "remove") {
                    await this.#deleteSelectedWallsForPanel(panelId);
                    return;
                }
                if (command === "join") {
                    await this.#joinSelectedWallsForPanel(panelId);
                    return;
                }
                this.#patchMapPanelToolbarState(panelId, { wallCommand: command });
                this.#syncWallCommandCanvasListener();
                if (command === "detect") {
                    await this.#executeDesignAction("scene.detectWalls", { panelId });
                }
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='map-wall-type']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!game.user?.isGM) return;
                const panelId = String(button.dataset.mapPanelId ?? "").trim();
                const wallType = String(button.dataset.wallType ?? "").trim();
                this.#patchMapPanelToolbarState(panelId, { wallType });
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-start']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#startGridCalibrationFromSceneProperties();
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-cancel']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.gridCalibrationController.close();
                this.#clearGridCalibrationPreviewTimer();
                this.#clearGridCalibrationCanvasListener();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-reset']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.gridCalibrationController.resetCorners();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='grid-cal-confirm']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#syncGridCalibrationStateFromInputs();
                await this.#flushGridCalibrationPreview();
                const result = await this.gridCalibrationController.apply();
                if (result?.ok) {
                    this.#clearGridCalibrationPreviewTimer();
                    this.#clearGridCalibrationCanvasListener();
                }
                this.render({ force: false });
            });
        });

        const gridCalibrationInputSelector = "[data-action='grid-cal-cell-w'], [data-action='grid-cal-cell-h'], [data-action='grid-cal-offset-x'], [data-action='grid-cal-offset-y'], [data-action='grid-cal-color']";
        this.element?.querySelectorAll(gridCalibrationInputSelector)?.forEach((input) => {
            input.addEventListener("keydown", async (event) => {
                event.stopPropagation();
                if (event.key === "Tab" || event.key === "Enter") {
                    this.#syncGridCalibrationStateFromInputs();
                    await this.#flushGridCalibrationPreview();
                }
                if (event.key === "Tab") {
                    event.preventDefault();
                    this.#focusAdjacentGridCalibrationInput(input, { backwards: event.shiftKey });
                }
            }, { capture: true });
            input.addEventListener("keyup", (event) => {
                event.stopPropagation();
            }, { capture: true });
            input.addEventListener("input", async () => {
                this.#syncGridCalibrationStateFromInputs();
                this.#scheduleGridCalibrationPreview({ geometry: input.dataset.action !== "grid-cal-color" });
            });
            input.addEventListener("change", async () => {
                this.#syncGridCalibrationStateFromInputs();
                await this.#flushGridCalibrationPreview();
                this.render({ force: false });
            });
            input.addEventListener("focusout", async () => {
                this.#syncGridCalibrationStateFromInputs();
                await this.#flushGridCalibrationPreview();
            });
        });

        this.element?.querySelectorAll("[data-action='toggle-design-command-palette']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const menu = this.element?.querySelector("[data-command-menu='true']");
                const panelMenu = this.element?.querySelector("[data-panel-menu='true']");
                const menuToggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
                const panelToggleButton = this.element?.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (menu) menu.hidden = true;
                if (panelMenu) panelMenu.hidden = true;
                menuToggleButton?.setAttribute("aria-expanded", "false");
                panelToggleButton?.setAttribute("aria-expanded", "false");
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
                const panelMenu = this.element?.querySelector("[data-panel-menu='true']");
                const panelToggleButton = this.element?.querySelector("[data-action='totc-v2-panel-menu-toggle']");
                if (!menu) return;

                const expanded = !menu.hidden;
                menu.hidden = expanded;
                button.setAttribute("aria-expanded", expanded ? "false" : "true");
                if (!expanded && panelMenu) {
                    panelMenu.hidden = true;
                    panelToggleButton?.setAttribute("aria-expanded", "false");
                }
            });
        });

        this.element?.querySelectorAll("[data-action='totc-v2-panel-menu-toggle']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const panelMenu = this.element?.querySelector("[data-panel-menu='true']");
                const menu = this.element?.querySelector("[data-command-menu='true']");
                const commandToggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
                if (!panelMenu) return;

                const expanded = !panelMenu.hidden;
                panelMenu.hidden = expanded;
                button.setAttribute("aria-expanded", expanded ? "false" : "true");
                if (!expanded && menu) {
                    menu.hidden = true;
                    commandToggleButton?.setAttribute("aria-expanded", "false");
                }
            });
        });

        this.element?.addEventListener("click", (event) => {
            const menu = this.element?.querySelector("[data-command-menu='true']");
            const panelMenu = this.element?.querySelector("[data-panel-menu='true']");
            const toggleButton = this.element?.querySelector("[data-action='totc-v2-command-menu-toggle']");
            const panelToggleButton = this.element?.querySelector("[data-action='totc-v2-panel-menu-toggle']");
            const commandPalette = this.element?.querySelector("[data-design-command-palette='true']");
            const commandPaletteToggle = this.element?.querySelector("[data-action='toggle-design-command-palette']");

            const target = event.target;
            if (!(target instanceof Node)) return;

            if (menu && !menu.hidden && !menu.contains(target) && !toggleButton?.contains(target)) {
                menu.hidden = true;
                toggleButton?.setAttribute("aria-expanded", "false");
            }

            if (panelMenu && !panelMenu.hidden && !panelMenu.contains(target) && !panelToggleButton?.contains(target)) {
                panelMenu.hidden = true;
                panelToggleButton?.setAttribute("aria-expanded", "false");
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

        this.sceneWorkspaceController.wireSceneListHandlers(this.element);

        this.element?.querySelectorAll("[data-action='create-campaign']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Campaign", type: "campaign" });
                if (item?.sheet) item.sheet.render(true);
            });
        });

        this.element?.querySelectorAll("[data-action='create-scenario']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Scenario", type: "scenario" });
                if (item?.sheet) item.sheet.render(true);
            });
        });

        this.element?.querySelectorAll("[data-action='create-encounter']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const item = await ItemDocumentClass.create({ name: "New Encounter", type: "encounter-design" });
                if (item?.sheet) item.sheet.render(true);
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-toggle']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const itemId = String(button.dataset.itemId ?? "").trim();
                if (!itemId) return;
                if (this._campaignViewState.expandedIds.has(itemId)) {
                    this._campaignViewState.expandedIds.delete(itemId);
                } else {
                    this._campaignViewState.expandedIds.add(itemId);
                }
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-select']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._campaignViewState.selectedId = String(button.dataset.itemId ?? "").trim();
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-create-root']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#createCampaignViewItem({ type: "campaign" });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-generate-root']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#prepareCampaignViewGeneration({ type: "campaign" });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-create-child']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#createCampaignViewItem({
                    type: String(button.dataset.childType ?? "").trim(),
                    parentId: String(button.dataset.parentId ?? "").trim()
                });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-generate-child']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#prepareCampaignViewGeneration({
                    type: String(button.dataset.childType ?? "").trim(),
                    parentId: String(button.dataset.parentId ?? "").trim()
                });
            });
        });

        this.element?.querySelectorAll("[data-action='campaign-view-delete']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#deleteCampaignViewItem(String(button.dataset.itemId ?? "").trim());
            });
        });

        this.element?.querySelectorAll("[data-campaign-view-draggable='true']")?.forEach((row) => {
            row.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                const itemId = String(row.dataset.campaignViewItemId ?? "").trim();
                const itemType = String(row.dataset.campaignViewItemType ?? "").trim();
                if (!itemId || !itemType) return;
                this._campaignViewDragState = { itemId, itemType };
                if (event.dataTransfer) {
                    event.dataTransfer.setData("application/x-totc-campaign-view-item", JSON.stringify({ itemId, itemType }));
                    event.dataTransfer.setData("text/plain", itemId);
                    event.dataTransfer.effectAllowed = "move";
                }
                row.classList.add("is-dragging");
            });
            row.addEventListener("dragend", () => {
                row.classList.remove("is-dragging");
                this._campaignViewDragState = null;
                this.#clearCampaignViewDropTargets();
            });
            row.addEventListener("dragover", (event) => {
                const dragged = this._campaignViewDragState;
                if (!dragged?.itemId || dragged.itemId === row.dataset.campaignViewItemId) return;
                const rect = row.getBoundingClientRect();
                const pointerRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
                const dropMode = getCampaignViewDropMode({
                    draggedType: dragged.itemType,
                    targetType: String(row.dataset.campaignViewItemType ?? "").trim(),
                    pointerRatio
                });
                if (!dropMode) return;
                event.preventDefault();
                event.stopPropagation();
                this.#clearCampaignViewDropTargets(row);
                row.dataset.campaignViewDropMode = dropMode;
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            });
            row.addEventListener("dragleave", (event) => {
                const related = event.relatedTarget;
                if (related && row.contains(related)) return;
                delete row.dataset.campaignViewDropMode;
            });
            row.addEventListener("drop", async (event) => {
                const dragged = this._campaignViewDragState;
                if (!dragged?.itemId) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = row.getBoundingClientRect();
                const pointerRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
                const dropMode = row.dataset.campaignViewDropMode || getCampaignViewDropMode({
                    draggedType: dragged.itemType,
                    targetType: String(row.dataset.campaignViewItemType ?? "").trim(),
                    pointerRatio
                });
                await this.#moveCampaignViewItem({
                    draggedId: dragged.itemId,
                    targetId: String(row.dataset.campaignViewItemId ?? "").trim(),
                    dropMode
                });
                this._campaignViewDragState = null;
                this.#clearCampaignViewDropTargets();
            });
        });

        this.element?.querySelectorAll("[data-action='gm-assistant-set-type']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                this._gmAssistantState.elementType = event.target.value;
                if (this._gmAssistantState.elementType !== "location") {
                    this._gmAssistantState.parentLocationId = "";
                }
                this._gmAssistantState.campaignId = "";
                this._gmAssistantState.scenarioId = "";
                this._gmAssistantState.result = null;
                this._gmAssistantState.error = null;
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='gm-assistant-set-actor-type']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                this._gmAssistantState.actorType = event.target.value;
                this._gmAssistantState.result = null;
                this._gmAssistantState.error = null;
                this.render({ force: false });
            });
        });

        this.element?.querySelectorAll("[data-action='gm-assistant-set-parent-location']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                this._gmAssistantState.parentLocationId = event.target.value;
                this._gmAssistantState.result = null;
                this._gmAssistantState.error = null;
                this.render({ force: false });
            });
        });

        const handleGenerate = async () => {
            if (this._gmAssistantState.isGenerating || !this._gmAssistantState.prompt) return;
            const promptInput = this.element?.querySelector("[data-action='gm-assistant-set-prompt']");
            if (promptInput instanceof HTMLTextAreaElement) {
                this._gmAssistantState.promptTextareaHeight = promptInput.offsetHeight || promptInput.clientHeight || 0;
            }
            this._gmAssistantState.isGenerating = true;
            this._gmAssistantState.error = null;
            this._gmAssistantState.result = null;
            this.render({ force: false });

            try {
                const parentLocation = this._gmAssistantState.elementType === "location" && this._gmAssistantState.parentLocationId
                    ? game.items?.get?.(this._gmAssistantState.parentLocationId)
                    : null;
                const generationContext = {};
                if (this._gmAssistantState.elementType === "actor") {
                    generationContext.actorType = this._gmAssistantState.actorType;
                }
                if (parentLocation) {
                    generationContext.parentLocation = {
                        id: parentLocation.id,
                        name: parentLocation.name,
                        locationType: parentLocation.system?.locationType ?? "",
                        description: parentLocation.system?.description ?? "",
                        notes: parentLocation.system?.notes ?? ""
                    };
                }

                const result = await LLMService.generate(this._gmAssistantState.prompt, {
                    elementType: this._gmAssistantState.elementType,
                    generationContext
                });
                this._gmAssistantState.result = result;
            } catch (err) {
                this._gmAssistantState.error = err.message;
            } finally {
                this._gmAssistantState.isGenerating = false;
                this.render({ force: false });
            }
        };

        this.element?.querySelectorAll("[data-action='gm-assistant-generate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                await handleGenerate();
            });
        });

        this.element?.querySelectorAll("[data-action='gm-assistant-regenerate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                await handleGenerate();
            });
        });

        this.element?.querySelectorAll("[data-action='gm-assistant-accept']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const { result, elementType, actorType } = this._gmAssistantState;
                if (!result) return;

                const isActor = elementType === "actor";
                const documentData = {
                    name: result.name || "Generated Element",
                    type: isActor ? actorType : elementType,
                    system: buildGMAssistantDocumentSystemData(result.system || {}, elementType)
                };
                if (elementType === "location" && this._gmAssistantState.parentLocationId) {
                    documentData.system.parentLocationId = this._gmAssistantState.parentLocationId;
                }
                if (elementType === "scenario" && this._gmAssistantState.campaignId) {
                    documentData.system.campaignId = this._gmAssistantState.campaignId;
                }
                if (elementType === "encounter-design" && this._gmAssistantState.scenarioId) {
                    documentData.system.scenarioId = this._gmAssistantState.scenarioId;
                }

                const doc = await (isActor ? ActorDocumentClass : ItemDocumentClass).create(documentData);
                if (doc?.sheet) doc.sheet.render(true);

                const docId = String(doc?.id ?? doc?._id ?? "").trim();
                if (docId && (elementType === "scenario" || elementType === "encounter-design")) {
                    this._campaignViewState.selectedId = docId;
                }
                if (this._gmAssistantState.campaignId) this._campaignViewState.expandedIds.add(this._gmAssistantState.campaignId);
                if (this._gmAssistantState.scenarioId) this._campaignViewState.expandedIds.add(this._gmAssistantState.scenarioId);
                this._gmAssistantState.result = null;
                this._gmAssistantState.prompt = "";
                this._gmAssistantState.campaignId = "";
                this._gmAssistantState.scenarioId = "";
                this.render({ force: false });
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

        document.addEventListener("keydown", this._onWallEditKeyDown);
        this.#wireScenePropertiesHandlers();
        this.#wireLoggingPanelHandlers();

        this.#wireInteractionHandlers();
        this.#wireResizeHandlers();
    }

    async close(options = {}) {
        this.hooksController.unbindAll();
        this.compendiumCacheController.dispose();
        this.sceneActorDropController.clearDragImage();
        this.gridCalibrationController.close();
        this.#clearGridCalibrationCanvasListener();
        this.#clearWallCommandCanvasListener();
        this.#clearEncounterMovementNativeOverlay();
        this._loggerUnsubscribe?.();
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
        const nativeCanvasClass = dockId === "centerDock" && (dock?.stacks ?? []).some((stack) => {
            const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
            return this.#isMapPanel(activePanel);
        }) ? " is-native-canvas-aperture" : "";

        return `
        <section class="totc-v2-dock totc-v2-dock--${dockId} ${orientationClass} ${collapsedClass}${nativeCanvasClass}" data-dock-id="${dockId}" data-collapsed="${collapsed ? "true" : "false"}">
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
        const nativeCanvasAperture = dockId === "centerDock" && this.#isMapPanel(activePanel);
        const panelContent = collapsed || nativeCanvasAperture ? "" : this.#renderPanelContent(activePanel, context);
        const designLensActive = this.#isDesignLensActive(activePanel?.id);
        const designButtonTitle = designLensActive ? "Close design lens" : "Open design lens";
        const canCollapseDock = dockId !== "centerDock";
        const collapseTitle = collapsed ? "Restore dock" : "Minimize dock";
        const nativeCanvasClass = nativeCanvasAperture ? " is-native-canvas-aperture" : "";

        return `
        <article class="totc-v2-stack ${collapsed ? "is-collapsed" : ""}${nativeCanvasClass}" data-dock-id="${dockId}" data-stack-id="${stack.id}" style="flex-grow:${Number(stack.size) || 1};">
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
                    name: game.scenes?.viewed?.name ?? "Current Scene"
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
        return this.panelHost.renderPanelContent(panel, context);
    }

    #renderPanelBodyContent(panel, context = {}) {
        return this.panelHost.renderPanelBodyContent(panel, context);
    }

    #readEncounterActionData(element = null) {
        if (!element) return null;
        const apMin = Math.max(1, Number(element.dataset.apMin ?? element.dataset.apCost ?? 1));
        const apMax = Math.max(apMin, Number(element.dataset.apMax ?? element.dataset.apCost ?? apMin));
        const apCost = Math.max(apMin, Math.min(apMax, Number(element.dataset.apCost ?? apMin)));
        return {
            id: String(element.dataset.id ?? element.dataset.actionId ?? "").trim(),
            actionId: String(element.dataset.actionId ?? element.dataset.id ?? "").trim(),
            type: String(element.dataset.type ?? "action").trim(),
            label: String(element.dataset.label ?? element.value ?? "Action").trim(),
            apCost,
            apMin,
            apMax,
            variableAp: element.dataset.variableAp === "true",
            requiresToHit: element.dataset.requiresToHit === "true",
            requiresTarget: element.dataset.requiresTarget === "true",
            rangeType: String(element.dataset.rangeType ?? "melee").trim().toLowerCase(),
            toHitBonus: Number(element.dataset.toHitBonus ?? 0),
            targetingRangeFeet: Number(element.dataset.targetingRangeFeet ?? 0),
            movementFeet: Number(element.dataset.movementFeet ?? 0),
            movementFeetPerAp: Number(element.dataset.movementFeetPerAp ?? 0),
            itemId: String(element.dataset.itemId ?? "").trim() || null,
            img: String(element.dataset.img ?? "").trim()
        };
    }

    #findEncounterActionOption(input = null) {
        const value = String(input?.value ?? "").trim();
        if (!value || !input?.list?.options) return null;
        return Array.from(input.list.options).find((option) => String(option.value ?? "").trim() === value) ?? null;
    }

    #findEncounterActionOptionWithSearch(input = null) {
        const value = String(input?.value ?? "").trim().toLowerCase();
        if (!value || !input?.list?.options) return null;
        const options = Array.from(input.list.options);

        const exact = options.find((opt) => String(opt.value ?? "").trim().toLowerCase() === value);
        if (exact) return exact;

        const prefix = options.find((opt) => String(opt.value ?? "").trim().toLowerCase().startsWith(value));
        if (prefix) return prefix;

        const contains = options.find((opt) => String(opt.value ?? "").trim().toLowerCase().includes(value));
        if (contains) return contains;

        return null;
    }

    #getEncounterPanelCombatantId(element = null) {
        return String(element?.closest?.(".totc-v2-encounter-panel")?.dataset?.combatantId ?? "").trim();
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

    async #moveEncounterAction(combat = null, combatantId = "", fromIndex = -1, toIndex = -1) {
        if (!combatantId || !combat?.setCombatantPlan) return;
        const plan = [...(combat.getCombatantPlan?.(combatantId) ?? [])];
        if (fromIndex < 0 || fromIndex >= plan.length) return;
        const [moved] = plan.splice(fromIndex, 1);
        const target = Math.max(0, Math.min(plan.length, toIndex));
        plan.splice(target, 0, moved);
        await combat.setCombatantPlan(combatantId, plan);
        this.render({ force: false });
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

    #getEncounterCombatants(combat = null, actor = null) {
        const actorIds = [
            actor?.id,
            actor?._id,
            actor?.baseActor?.id,
            actor?.baseActor?._id
        ].filter(Boolean);
        const entries = [
            ...this.#collectionContents(combat?.combatants),
            ...this.#collectionContents(combat?.turns),
            ...actorIds.flatMap((actorId) => this.#collectionContents(combat?.getCombatantsByActor?.(actorId))),
            combat?.combatant
        ].filter(Boolean);

        return entries.filter((entry, index, list) => {
            const id = String(entry?.id ?? entry?._id ?? "");
            if (!id) return true;
            return list.findIndex((candidate) => String(candidate?.id ?? candidate?._id ?? "") === id) === index;
        });
    }

    #getEncounterCombatant(combat = null, combatantId = "") {
        const key = String(combatantId ?? "").trim();
        if (!key) return null;
        return this.#collectionGet(combat?.combatants, key)
            ?? this.#getEncounterCombatants(combat).find((entry) => String(entry?.id ?? entry?._id ?? "") === key)
            ?? null;
    }

    #getTokenCombatant(token = null) {
        return token?.combatant ?? token?.object?.combatant ?? null;
    }

    #getEncounterCombatantForToken(combat = null, token = null) {
        if (!combat || !token) return null;
        const tokenCombatant = this.#getTokenCombatant(token);
        if (tokenCombatant && (tokenCombatant.combat === combat || tokenCombatant.parent === combat || tokenCombatant.combat?.id === combat.id || tokenCombatant.parent?.id === combat.id)) {
            return tokenCombatant;
        }
        const actor = this.#resolveTokenActor(token);
        return findCombatantForToken({
            combatants: this.#getEncounterCombatants(combat, actor),
            token,
            actor
        });
    }

    #getEncounterCombatForToken(token = null) {
        const tokenCombatant = this.#getTokenCombatant(token);
        const tokenCombat = tokenCombatant?.combat ?? tokenCombatant?.parent;
        if (tokenCombat) {
            return tokenCombat;
        }

        const candidates = [
            ui.combat?.viewed,
            game.combat,
            game.combats?.active,
            ...this.#collectionContents(game.combats)
        ]
            .filter(Boolean)
            .filter((combat, index, list) => list.findIndex((entry) => entry?.id === combat?.id) === index);

        return candidates.find((combat) => (
            this.#getEncounterCombatantForToken(combat, token)
        )) ?? null;
    }

    #isEncounterPlanningAvailable(combat = null) {
        return Boolean(combat?.getCombatantPlan && combat?.getAvailableActionsForCombatant && (combat?.encounterState?.initialized ?? combat?.encounter?.state?.initialized));
    }

    #canPlanEncounterToken({ combat = null, token = null, actor = null } = {}) {
        if (!combat) return false;
        const combatant = this.#getEncounterCombatantForToken(combat, token);
        if (!combatant) return false;
        const resolvedActor = actor ?? combatant.actor ?? this.#resolveTokenActor(token);
        const isOwner = game.user?.isGM || resolvedActor?.isOwner;
        if (!isOwner) return false;

        const initialized = Boolean(combat?.encounterState?.initialized ?? combat?.encounter?.state?.initialized);
        if (!initialized && !game.user?.isGM) return false;

        return true;
    }

    #canViewEncounterToken({ token = null, actor = null, combatant = null } = {}) {
        if (!token && !combatant) return false;
        const resolvedActor = actor ?? combatant?.actor ?? this.#resolveTokenActor(token);
        return Boolean(game.user?.isGM || resolvedActor?.isOwner);
    }

    #resolveTokenActor(token = null) {
        return token?.actor ?? token?.object?.actor ?? game.actors?.get?.(token?.actorId ?? token?.document?.actorId) ?? null;
    }

    #getSelectedEncounterToken(scene = null) {
        if (this.selectedTokenIds.size !== 1) return null;
        const tokenId = [...this.selectedTokenIds][0];
        return this.#collectionGet(scene?.tokens, tokenId);
    }

    #buildEncounterPlannerSelectionForToken({ combat = null, token = null, actor = null, source = "" } = {}) {
        // Prefer the token-resolved encounter combat so player planning remains interactive
        // when the viewed/active combat differs from the token's combat.
        const tokenCombat = this.#getEncounterCombatForToken(token);
        const selectedCombat = tokenCombat ?? combat ?? this.#getEncounterCombat();
        const combatant = selectedCombat ? this.#getEncounterCombatantForToken(selectedCombat, token) : null;
        const resolvedActor = actor ?? combatant?.actor ?? this.#resolveTokenActor(token);
        if (!this.#canViewEncounterToken({ token, actor: resolvedActor, combatant })) return null;
        return {
            actor: resolvedActor ?? null,
            token,
            combat: selectedCombat,
            combatant,
            source
        };
    }

    #resolveEncounterPlannerSelection({ combat = null, scene = null } = {}) {
        const selection = this._encounterPlannerSelection;
        if (selection) {
            const selectedCombat = this.#collectionGet(game.combats, selection.combatId) ?? selection.combat ?? combat;
            const selectedScene = this.#collectionGet(game.scenes, selection.sceneId) ?? selection.scene ?? scene;
            const token = selection.token ?? this.#collectionGet(selectedScene?.tokens, selection.tokenId);
            const resolved = this.#buildEncounterPlannerSelectionForToken({
                combat: selectedCombat,
                token,
                actor: selection.actor ?? this.#resolveTokenActor(token),
                source: "pinned"
            });
            if (resolved) return resolved;
            this._encounterPlannerSelection = null;
        }

        const selectedToken = this.#getSelectedEncounterToken(scene);
        const resolved = this.#buildEncounterPlannerSelectionForToken({
            combat,
            token: selectedToken,
            actor: this.#resolveTokenActor(selectedToken),
            source: "selected-token"
        });
        if (resolved) return resolved;

        return null;
    }

    async #showEncounterPanelForToken({ combat = null, scene = null, token = null, actor = null } = {}) {
        const combatant = this.#getEncounterCombatantForToken(combat, token);
        const canView = this.#canViewEncounterToken({ token, actor, combatant });
        const canPlan = this.#canPlanEncounterToken({ combat, token, actor });
        if (!canView) return false;
        this._encounterPlannerSelection = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatant?.id ?? ""),
            sceneId: String(scene?.id ?? scene?._id ?? ""),
            tokenId: String(token?.id ?? token?._id ?? token?.document?.id ?? ""),
            actorId: String(actor?.id ?? actor?._id ?? combatant?.actor?.id ?? ""),
            combat,
            scene,
            token,
            actor
        };
        await this.#showEncounterPanel();
        return true;
    }

    #getEncounterMovementToken({ combat = null, combatantId = "", scene = canvas?.scene ?? game.scenes?.viewed ?? null } = {}) {
        const combatant = this.#getEncounterCombatant(combat, combatantId);
        const tokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? "").trim();
        const directToken = this.#collectionGet(scene?.tokens, tokenId);
        if (directToken) return directToken;

        const actorId = String(combatant?.actorId ?? combatant?.actor?.id ?? combatant?.token?.actorId ?? "").trim();
        if (!actorId) return null;
        return this.#collectionContents(scene?.tokens).find((token) => (
            String(token?.actorId ?? token?.actor?.id ?? token?.document?.actorId ?? "").trim() === actorId
        )) ?? null;
    }

    #projectEncounterTokenForPlan({ token = null, combat = null, combatantId = "", beforeActionIndex = Infinity } = {}) {
        if (!token || !combatantId) return token;

        const plan = this.#collectionContents(combat?.getCombatantPlan?.(combatantId));
        const limit = Number.isFinite(Number(beforeActionIndex)) ? Math.max(0, Number(beforeActionIndex)) : plan.length;
        let projectedX = Number(token?.x ?? token?.document?.x ?? 0);
        let projectedY = Number(token?.y ?? token?.document?.y ?? 0);
        let changed = false;

        for (let index = 0; index < Math.min(limit, plan.length); index += 1) {
            const action = plan[index];
            if (String(action?.type ?? "") !== "movement") continue;
            const x = Number(action?.movementTargetX);
            const y = Number(action?.movementTargetY);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            projectedX = x;
            projectedY = y;
            changed = true;
        }

        if (!changed) return token;
        return {
            ...token,
            x: projectedX,
            y: projectedY,
            document: token.document
                ? {
                    ...token.document,
                    x: projectedX,
                    y: projectedY
                }
                : token.document
        };
    }

    #beginEncounterMovementInteraction({ combat = null, combatantId = "", actionIndex = -1, maxAp = 0, feetPerAp = 10 } = {}) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#getEncounterMovementToken({ combat, combatantId, scene });
        if (!scene || !token || Number(maxAp) <= 0) {
            this._encounterMovementInteraction = null;
            this.#clearEncounterMovementNativeOverlay();
            return;
        }

        this._encounterMovementInteraction = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatantId ?? ""),
            actionIndex: Number(actionIndex),
            sceneId: String(scene.id ?? scene._id ?? ""),
            tokenId: String(token.id ?? token._id ?? token.document?.id ?? ""),
            maxAp: Math.max(1, Math.floor(Number(maxAp) || 1)),
            feetPerAp: Math.max(1, Number(feetPerAp) || 10)
        };
        this._encounterTargetingInteraction = null;
        this.#syncEncounterMovementNativeOverlay();
        this.#syncEncounterMovementCanvasListener();
    }

    #getNativeGridHighlightLayer() {
        return canvas?.interface?.grid ?? canvas?.grid ?? null;
    }

    #clearEncounterMovementNativeOverlay() {
        const gridLayer = this.#getNativeGridHighlightLayer();
        gridLayer?.clearHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        this._encounterMovementCanvasCleanup?.();
        this._encounterMovementCanvasCleanup = null;
        this._encounterMovementCanvasRef = null;
    }

    #syncEncounterMovementNativeOverlay() {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const model = this.#getEncounterMovementOverlayState(scene);
        const gridLayer = this.#getNativeGridHighlightLayer();
        if (!model?.active || !gridLayer) {
            this.#clearEncounterMovementNativeOverlay();
            return;
        }

        gridLayer.clearHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        gridLayer.addHighlightLayer?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER);
        for (const cell of model.cells ?? []) {
            gridLayer.highlightPosition?.(ENCOUNTER_MOVEMENT_HIGHLIGHT_LAYER, {
                x: cell.left,
                y: cell.top,
                color: cell.origin ? 0x38bdf8 : 0x22c55e,
                border: cell.origin ? 0x0ea5e9 : 0x16a34a,
                alpha: cell.origin ? 0.28 : 0.18
            });
        }
    }

    #syncEncounterMovementCanvasListener() {
        if (!this._encounterMovementInteraction) {
            this.#clearEncounterMovementNativeOverlay();
            return;
        }
        if (this._encounterMovementCanvasRef === canvas && this._encounterMovementCanvasCleanup) return;

        this._encounterMovementCanvasCleanup?.();
        this._encounterMovementCanvasRef = canvas;
        this._encounterMovementCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            void this.#handleEncounterMovementCanvasPointerDown(event);
        });
    }

    async #handleEncounterMovementCanvasPointerDown(event = {}) {
        if (!this._encounterMovementInteraction) return;
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const model = this.#getEncounterMovementOverlayState(scene);
        const point = getNativeCanvasEventScenePoint(event, canvas);
        const cell = findEncounterMovementOverlayCellAtPoint(model, point);
        if (!cell) {
            await this.#cancelEncounterMovementInteraction();
            return;
        }

        event?.preventDefault?.();
        event?.stopPropagation?.();
        await this.#finishEncounterMovementInteraction(cell);
    }

    #resolveEncounterActionRangeFeet(action = null, actor = null) {
        const explicitRangeFeet = Number(action?.targetingRangeFeet ?? 0);
        if (Number.isFinite(explicitRangeFeet) && explicitRangeFeet > 0) {
            return explicitRangeFeet;
        }

        const rangeType = String(action?.rangeType ?? "melee").toLowerCase();
        const item = action?.itemId ? actor?.items?.get?.(action.itemId) : null;
        const normal = Number(item?.system?.physical?.range?.normal ?? (rangeType === "melee" ? 5 : 30));
        const long = Number(item?.system?.physical?.range?.long ?? Math.max(normal, 60));

        if (rangeType === "long") return Math.max(5, long || normal || 60);
        if (rangeType === "normal") return Math.max(5, normal || 30);
        return 5;
    }

    #beginEncounterTargetingInteraction({ combat = null, combatantId = "", actionIndex = -1, action = null } = {}) {
        const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#getEncounterMovementToken({ combat, combatantId, scene });
        const combatant = this.#getEncounterCombatant(combat, combatantId);
        const rangeFeet = this.#resolveEncounterActionRangeFeet(action, combatant?.actor ?? null);
        const rangeType = String(action?.rangeType ?? "melee").toLowerCase();

        if (!scene || !token || !combat || Number(actionIndex) < 0 || !Number.isFinite(rangeFeet) || rangeFeet <= 0) {
            this._encounterTargetingInteraction = null;
            return;
        }

        this._encounterTargetingInteraction = {
            combatId: String(combat?.id ?? ""),
            combatantId: String(combatantId ?? ""),
            actionIndex: Number(actionIndex),
            sceneId: String(scene?.id ?? scene?._id ?? ""),
            tokenId: String(token?.id ?? token?._id ?? token?.document?.id ?? ""),
            rangeFeet: Math.max(1, Math.round(rangeFeet)),
            rangeType
        };
        this._encounterMovementInteraction = null;
    }

    #getEncounterMovementOverlayState(scene = null) {
        const interaction = this._encounterMovementInteraction;
        if (!interaction || !scene) return null;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (sceneId && interaction.sceneId && sceneId !== interaction.sceneId) return null;
        const token = this.#collectionGet(scene.tokens, interaction.tokenId);
        if (!token) return null;
        const projectedToken = this.#projectEncounterTokenForPlan({
            token,
            combat: this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat(),
            combatantId: interaction.combatantId,
            beforeActionIndex: interaction.actionIndex
        });
        return buildEncounterMovementOverlayModel({
            token: projectedToken,
            scene,
            maxAp: interaction.maxAp,
            feetPerAp: interaction.feetPerAp || 10,
            feetPerSquare: Number(scene.grid?.distance ?? 5) || 5,
            gridSize: Number(scene.grid?.size ?? 100) || 100
        });
    }

    #getEncounterTargetOverlayState(scene = null) {
        const interaction = this._encounterTargetingInteraction;
        if (!interaction || !scene) return null;
        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        if (sceneId && interaction.sceneId && sceneId !== interaction.sceneId) return null;

        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        if (!combat) return null;

        const sourceToken = this.#collectionGet(scene.tokens, interaction.tokenId);
        if (!sourceToken) return null;
        const projectedSourceToken = this.#projectEncounterTokenForPlan({
            token: sourceToken,
            combat,
            combatantId: interaction.combatantId,
            beforeActionIndex: interaction.actionIndex
        });

        const targetTokens = this.#collectionContents(scene.tokens).filter((token) => {
            const tokenId = String(token?.id ?? token?._id ?? token?.document?.id ?? "").trim();
            if (!tokenId || tokenId === interaction.tokenId) return false;
            const targetCombatant = this.#getEncounterCombatantForToken(combat, token);
            if (!targetCombatant?.id) return false;
            return String(targetCombatant.id) !== String(interaction.combatantId);
        });

        return buildEncounterTargetingOverlayModel({
            scene,
            sourceToken: projectedSourceToken,
            targetTokens,
            maxRangeFeet: interaction.rangeFeet,
            rangeType: interaction.rangeType
        });
    }

    async #finishEncounterMovementInteraction(selectedCell = null) {
        const interaction = this._encounterMovementInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        const scene = game.scenes?.get?.(interaction.sceneId) ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#collectionGet(scene?.tokens, interaction.tokenId);
        this._encounterMovementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        if (!combat?.setCombatantPlan || !token) {
            this.render({ force: false });
            return;
        }

        const requiredAp = Number(selectedCell?.requiredAp ?? selectedCell);
        const cost = Math.max(1, Number.isFinite(requiredAp) ? requiredAp : 1);
        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        if (!entry) {
            this.render({ force: false });
            return;
        }

        const gridSize = Number(scene?.grid?.size ?? 100) || 100;
        const offsetX = -Number(scene?.shiftX ?? 0);
        const offsetY = -Number(scene?.shiftY ?? 0);
        const row = Number(selectedCell?.row ?? 0);
        const col = Number(selectedCell?.col ?? 0);
        const cellLeft = Number(selectedCell?.left);
        const cellTop = Number(selectedCell?.top);
        const targetX = Number.isFinite(cellLeft) ? cellLeft : (col * gridSize) + offsetX;
        const targetY = Number.isFinite(cellTop) ? cellTop : (row * gridSize) + offsetY;
        const originX = Number(token?.x ?? token?.document?.x ?? 0);
        const originY = Number(token?.y ?? token?.document?.y ?? 0);

        const movementFeetPerAp = Math.max(1, Number(entry.movementFeetPerAp ?? interaction.feetPerAp ?? 10) || 10);
        plan[index] = {
            ...entry,
            apCost: cost,
            movementFeet: movementFeetPerAp * cost,
            movementFeetPerAp,
            movementTargetRow: row,
            movementTargetCol: col,
            movementTargetX: targetX,
            movementTargetY: targetY,
            movementOriginX: Number.isFinite(originX) ? originX : null,
            movementOriginY: Number.isFinite(originY) ? originY : null
        };

        await combat.setCombatantPlan(interaction.combatantId, plan);
        const tokenDocument = token?.document ?? token;
        await tokenDocument?.update?.({ x: targetX, y: targetY });
        this.render({ force: false });
    }

    async #cancelEncounterMovementInteraction() {
        const interaction = this._encounterMovementInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this._encounterMovementInteraction = null;
        this.#clearEncounterMovementNativeOverlay();
        if (combat?.removeCombatantAction) {
            await combat.removeCombatantAction(interaction.combatantId, interaction.actionIndex);
        }
        this.render({ force: false });
    }

    async #finishEncounterTargetingInteraction(tokenId = "") {
        const interaction = this._encounterTargetingInteraction;
        if (!interaction) return;

        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        const scene = game.scenes?.get?.(interaction.sceneId) ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        const token = this.#collectionGet(scene?.tokens, tokenId);
        const targetCombatant = token ? this.#getEncounterCombatantForToken(combat, token) : null;
        if (!combat || !targetCombatant?.id || String(targetCombatant.id) === String(interaction.combatantId)) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        const plan = [...(combat.getCombatantPlan?.(interaction.combatantId) ?? [])];
        const index = Number(interaction.actionIndex);
        const entry = plan[index];
        if (!entry || (!entry.requiresToHit && !entry.requiresTarget) || !combat.setCombatantPlan) {
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        plan[index] = {
            ...entry,
            targetId: targetCombatant.id
        };

        this._encounterTargetingInteraction = null;
        await combat.setCombatantPlan(interaction.combatantId, plan);
        this.render({ force: false });
    }

    async #cancelEncounterTargetingInteraction() {
        const interaction = this._encounterTargetingInteraction;
        if (!interaction) return;
        const combat = this.#getEncounterCombatById(interaction.combatId) ?? this.#getEncounterCombat();
        this._encounterTargetingInteraction = null;
        if (combat?.removeCombatantAction) {
            await combat.removeCombatantAction(interaction.combatantId, interaction.actionIndex);
        }
        this.render({ force: false });
    }

    #wirePlayerEncounterPanelHandlers() {
        if (this._wiredElement === this.element) {
            return;
        }
        this._wiredElement = this.element;

        // Click interaction capture guard for cancelling movement/targeting
        this.element?.addEventListener("click", (event) => {
            if (!this._encounterMovementInteraction) return;
            if (event.target?.closest?.("[data-action='encounter-move-square']")) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            void this.#cancelEncounterMovementInteraction();
        }, { capture: true });

        this.element?.addEventListener("click", (event) => {
            if (!this._encounterTargetingInteraction) return;
            const scene = canvas?.scene ?? game.scenes?.viewed ?? null;
            const overlay = this.#getEncounterTargetOverlayState(scene);
            const tokenEl = event.target?.closest?.("[data-action='map-token']");
            const tokenId = String(tokenEl?.dataset?.tokenId ?? "").trim();
            const valid = tokenId && (overlay?.targetTokenIds ?? []).includes(tokenId);
            if (valid) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            void this.#cancelEncounterTargetingInteraction();
        }, { capture: true });

        // Delegated clicks for panel actions
        this.element?.addEventListener("click", async (event) => {
            const target = event.target;
            // Click plan segments or empty slots to open action popup
            const el = event.target?.closest?.("[data-action='encounter-plan-segment'], [data-action='encounter-edit-plan-slot']");
            if (el) {
                if (event.target?.closest?.("[data-action='encounter-remove-action'], [data-action='encounter-resize-action']")) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();

                const combatantId = this.#getEncounterPanelCombatantId(el);
                const combat = this.#getEncounterCombat(el);
                if (!combatantId || !combat) return;

                const startTick = Number(el.dataset.startTick ?? 1);
                const actionIndex = Number(el.dataset.actionIndex ?? 0);
                const apBudget = Number(combat.apBudget ?? 6);
                const remainingAp = apBudget - startTick + 1;

                this._activePlanEditSlot = {
                    index: actionIndex,
                    startTick,
                    remainingAp
                };
                this.render({ force: false });
                return;
            }

            // Close popup
            const buttonClose = event.target?.closest?.("[data-action='encounter-close-popup']");
            if (buttonClose) {
                event.preventDefault();
                event.stopPropagation();
                this._activePlanEditSlot = null;
                this.render({ force: false });
                return;
            }

            // Select popup action
            const button = event.target?.closest?.("[data-action='encounter-select-popup-action']");
            if (button) {
                event.preventDefault();
                event.stopPropagation();

                const combatantId = this.#getEncounterPanelCombatantId(button);
                const combat = this.#getEncounterCombat(button);
                if (!combatantId || !combat?.setCombatantPlan) return;

                const actionData = this.#readEncounterActionData(button);
                if (!actionData) return;

                const actionIndex = Number(button.dataset.actionIndex);
                if (Number.isNaN(actionIndex)) return;

                const remainingSlotAp = Math.max(1, Math.floor(Number(this._activePlanEditSlot?.remainingAp ?? (Number(combat.apBudget ?? 6) - actionIndex)) || 1));
                const movementFeetPerAp = Math.max(1, Number(actionData.movementFeetPerAp ?? 10) || 10);
                const planAction = actionData.type === "movement"
                    ? {
                        ...actionData,
                        apCost: remainingSlotAp,
                        apMax: Math.max(Number(actionData.apMax ?? 1), remainingSlotAp),
                        movementFeet: movementFeetPerAp * remainingSlotAp,
                        movementFeetPerAp
                    }
                    : actionData;
                const currentPlan = combat.getCombatantPlan?.(combatantId) ?? [];
                const nextPlan = [...currentPlan.slice(0, actionIndex), planAction];
                await combat.setCombatantPlan(combatantId, nextPlan);

                if (planAction.requiresTarget) {
                    this.#beginEncounterTargetingInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        action: planAction
                    });
                } else if (planAction.type === "movement") {
                    this.#beginEncounterMovementInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        maxAp: remainingSlotAp,
                        feetPerAp: movementFeetPerAp
                    });
                } else if (planAction.requiresToHit && ["melee", "normal", "long"].includes(String(planAction.rangeType ?? "").toLowerCase())) {
                    this.#beginEncounterTargetingInteraction({
                        combat,
                        combatantId,
                        actionIndex,
                        action: planAction
                    });
                } else {
                    this._encounterMovementInteraction = null;
                    this._encounterTargetingInteraction = null;
                }

                this._activePlanEditSlot = null;
                this.render({ force: false });
                return;
            }

            // Remove action button on plan segments
            const buttonRemove = event.target?.closest?.("[data-action='encounter-remove-action']");
            if (buttonRemove) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonRemove);
                const actionIndex = Number(buttonRemove.dataset.actionIndex);
                const combat = this.#getEncounterCombat(buttonRemove);
                if (!combatantId || Number.isNaN(actionIndex) || !combat?.removeCombatantAction) return;
                if (this._encounterTargetingInteraction && String(this._encounterTargetingInteraction.combatantId) === String(combatantId)) {
                    this._encounterTargetingInteraction = null;
                }
                await combat.removeCombatantAction(combatantId, actionIndex);
                this.render({ force: false });
                return;
            }

            // Clear plan
            const buttonClear = event.target?.closest?.("[data-action='encounter-clear-plan']");
            if (buttonClear) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonClear);
                const combat = this.#getEncounterCombat(buttonClear);
                if (!combatantId || !combat?.clearCombatantPlan) return;
                if (this._encounterTargetingInteraction && String(this._encounterTargetingInteraction.combatantId) === String(combatantId)) {
                    this._encounterTargetingInteraction = null;
                }
                await combat.clearCombatantPlan(combatantId);
                this.render({ force: false });
                return;
            }

            // Toggle ready state
            const buttonReady = event.target?.closest?.("[data-action='encounter-toggle-ready']");
            if (buttonReady) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(buttonReady);
                const combat = this.#getEncounterCombat(buttonReady);
                if (!combatantId || !combat?.setCombatantReady) return;
                if (this._encounterTargetingInteraction && String(this._encounterTargetingInteraction.combatantId) === String(combatantId)) {
                    this._encounterTargetingInteraction = null;
                }
                await combat.setCombatantReady(combatantId, buttonReady.dataset.ready !== "true");
                this.render({ force: false });
                return;
            }
        });

        // Delegated drag and drop events
        this.element?.addEventListener("dragstart", (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            if (!segment) return;
            if (!event.dataTransfer) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-totc-encounter-action-index", String(segment.dataset.actionIndex ?? ""));
        });

        this.element?.addEventListener("dragover", (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            const bar = event.target?.closest?.("[data-action='encounter-plan-bar']");
            if (segment || bar) {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            }
        });

        this.element?.addEventListener("drop", async (event) => {
            const segment = event.target?.closest?.("[data-action='encounter-plan-segment']");
            if (segment) {
                event.preventDefault();
                event.stopPropagation();
                const combatantId = this.#getEncounterPanelCombatantId(segment);
                const combat = this.#getEncounterCombat(segment);
                const fromIndex = Number(event.dataTransfer?.getData("application/x-totc-encounter-action-index"));
                const toIndex = Number(segment.dataset.actionIndex);
                await this.#moveEncounterAction(combat, combatantId, fromIndex, toIndex);
                return;
            }

            const bar = event.target?.closest?.("[data-action='encounter-plan-bar']");
            if (bar) {
                event.preventDefault();
                event.stopPropagation();
                if (event.target?.closest?.("[data-action='encounter-plan-segment']")) return;
                const combatantId = this.#getEncounterPanelCombatantId(bar);
                const fromIndex = Number(event.dataTransfer?.getData("application/x-totc-encounter-action-index"));
                const combat = this.#getEncounterCombat(bar);
                const planLength = combat?.getCombatantPlan?.(combatantId)?.length ?? 0;
                await this.#moveEncounterAction(combat, combatantId, fromIndex, planLength);
                return;
            }
        });

        // Delegated resize pointers
        this.element?.addEventListener("pointerdown", (event) => {
            const handle = event.target?.closest?.("[data-action='encounter-resize-action']");
            if (!handle) return;

            event.preventDefault();
            event.stopPropagation();
            const segment = handle.closest("[data-action='encounter-plan-segment']");
            const bar = handle.closest("[data-action='encounter-plan-bar']");
            const combatantId = this.#getEncounterPanelCombatantId(handle);
            const actionIndex = Number(handle.dataset.actionIndex);
            const combat = this.#getEncounterCombat(handle);
            const plan = combat?.getCombatantPlan?.(combatantId) ?? [];
            const action = plan[actionIndex];
            if (!segment || !bar || !combatantId || !combat?.setCombatantActionApCost || !action) return;

            const apBudget = Math.max(1, Number(bar.dataset.apBudget ?? 1));
            const rect = bar.getBoundingClientRect();
            const cellWidth = rect.width / apBudget;
            const priorAp = plan.slice(0, actionIndex).reduce((sum, entry) => sum + Math.max(1, Number(entry.apCost ?? 1)), 0);
            const apMin = Math.max(1, Number(action.apMin ?? action.apCost ?? 1));
            const apMax = Math.max(apMin, Number(action.apMax ?? action.apCost ?? apMin));
            const remainingAfter = plan.slice(actionIndex + 1).reduce((sum, entry) => sum + Math.max(1, Number(entry.apCost ?? 1)), 0);
            const maxByBudget = Math.max(apMin, apBudget - priorAp - remainingAfter);
            const upper = Math.min(apMax, maxByBudget);
            let nextCost = Math.max(apMin, Math.min(upper, Number(action.apCost ?? apMin)));

            const onPointerMove = (moveEvent) => {
                const relativeX = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
                const endBoundary = Math.round(relativeX / cellWidth);
                nextCost = Math.max(apMin, Math.min(upper, endBoundary - priorAp));
                segment.style.gridColumn = `span ${nextCost}`;
                const detail = segment.querySelector("small");
                if (detail) detail.textContent = `${nextCost} AP`;
            };

            const onPointerUp = async () => {
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", onPointerUp);
                await combat.setCombatantActionApCost(combatantId, actionIndex, nextCost);
                this.render({ force: false });
            };

            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onPointerUp);
        });
    }



    #getViewedScene() {
        return this.sceneWorkspaceController.getViewedSceneDocument();
    }

    #getScenePropertiesScene() {
        return this.sceneWorkspaceController.getScenePropertiesScene();
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

    #clearCampaignViewDropTargets(except = null) {
        this.element?.querySelectorAll("[data-campaign-view-drop-mode]")?.forEach((row) => {
            if (row !== except) delete row.dataset.campaignViewDropMode;
        });
    }

    async #moveCampaignViewItem({ draggedId = "", targetId = "", dropMode = "" } = {}) {
        const safeDraggedId = String(draggedId ?? "").trim();
        const safeTargetId = String(targetId ?? "").trim();
        const safeDropMode = String(dropMode ?? "").trim();
        if (!safeDraggedId || !safeTargetId || !safeDropMode) return null;

        const items = Array.from(game.items?.contents || []);
        const plan = buildCampaignViewMovePlan({
            items,
            draggedId: safeDraggedId,
            targetId: safeTargetId,
            dropMode: safeDropMode
        });
        if (!plan) return null;

        const movedItem = this.#getItemDocumentById(plan.itemId);
        const parent = this.#getItemDocumentById(plan.parentId);
        const previousParent = plan.previousParentId ? this.#getItemDocumentById(plan.previousParentId) : null;
        if (!movedItem || !parent) return null;

        const previousParentId = String(previousParent?.id ?? previousParent?._id ?? "").trim();
        const parentId = String(parent?.id ?? parent?._id ?? "").trim();
        if (previousParent && plan.previousParentUpdate && previousParentId !== parentId) {
            await previousParent.update(plan.previousParentUpdate);
        }
        await parent.update(plan.parentUpdate);
        await movedItem.update(plan.itemUpdate);

        this._campaignViewState.selectedId = plan.itemId;
        this._campaignViewState.expandedIds.add(plan.parentId);
        this.render({ force: false });
        return plan;
    }

    async #deleteCampaignViewItem(itemId = "") {
        const safeItemId = String(itemId ?? "").trim();
        if (!safeItemId) return null;

        const items = Array.from(game.items?.contents || []);
        const plan = buildCampaignViewDeletePlan({ items, itemId: safeItemId });
        if (!plan?.deleteIds?.length) return null;

        const childParts = [];
        if (plan.scenarioCount) childParts.push(`${plan.scenarioCount} scenario${plan.scenarioCount === 1 ? "" : "s"}`);
        if (plan.encounterCount) childParts.push(`${plan.encounterCount} encounter${plan.encounterCount === 1 ? "" : "s"}`);
        const childWarning = childParts.length
            ? `\n\nThis will also permanently delete ${childParts.join(" and ")} beneath it.`
            : "";
        const confirmed = globalThis.confirm?.(
            `Permanently delete ${plan.itemTypeLabel.toLowerCase()} "${plan.itemName}"?${childWarning}\n\nThis cannot be undone.`
        ) ?? false;
        if (!confirmed) return null;

        for (const parentUpdate of plan.parentUpdates) {
            const parent = this.#getItemDocumentById(parentUpdate.itemId);
            if (parent && typeof parent.update === "function") await parent.update(parentUpdate.update);
        }

        for (const deleteId of plan.deleteIds) {
            const item = this.#getItemDocumentById(deleteId);
            if (item && typeof item.delete === "function") await item.delete();
        }

        if (plan.deleteIds.includes(this._campaignViewState.selectedId)) {
            this._campaignViewState.selectedId = "";
        }
        for (const deleteId of plan.deleteIds) {
            this._campaignViewState.expandedIds.delete(deleteId);
        }
        this.render({ force: false });
        return plan;
    }

    async #createCampaignViewItem({ type = "", parentId = "" } = {}) {
        const safeType = String(type ?? "").trim();
        const safeParentId = String(parentId ?? "").trim();
        const parent = this.#getItemDocumentById(safeParentId);
        const isScenario = safeType === "scenario";
        const isEncounter = safeType === "encounter-design";
        const isCampaign = safeType === "campaign";
        if (!isCampaign && !isScenario && !isEncounter) return null;

        const documentData = {
            name: isCampaign ? "New Campaign" : isScenario ? "New Scenario" : "New Encounter",
            type: safeType,
            system: {}
        };
        if (isScenario && parent?.type === "campaign") {
            documentData.system.campaignId = safeParentId;
        }
        if (isEncounter && parent?.type === "scenario") {
            documentData.system.scenarioId = safeParentId;
        }

        const item = await ItemDocumentClass.create(documentData);
        const itemId = String(item?.id ?? item?._id ?? "").trim();
        if (itemId) {
            this._campaignViewState.selectedId = itemId;
            if (safeParentId) this._campaignViewState.expandedIds.add(safeParentId);
        }
        if (item?.sheet) item.sheet.render(true);
        this.render({ force: false });
        return item;
    }

    async #prepareCampaignViewGeneration({ type = "", parentId = "" } = {}) {
        const safeType = String(type ?? "").trim();
        const safeParentId = String(parentId ?? "").trim();
        const parent = this.#getItemDocumentById(safeParentId);
        const isCampaign = safeType === "campaign";
        const isScenario = safeType === "scenario";
        const isEncounter = safeType === "encounter-design";
        if (!isCampaign && !isScenario && !isEncounter) return;

        this._gmAssistantState = {
            ...this._gmAssistantState,
            elementType: safeType,
            actorType: "pawn",
            campaignId: isScenario && parent?.type === "campaign" ? safeParentId : "",
            scenarioId: isEncounter && parent?.type === "scenario" ? safeParentId : "",
            parentLocationId: "",
            result: null,
            error: null,
            prompt: isCampaign
                ? "Generate a campaign for Turn of the Century."
                : isScenario
                ? `Generate a scenario for the campaign "${parent?.name ?? "Untitled Campaign"}".`
                : `Generate an encounter for the scenario "${parent?.name ?? "Untitled Scenario"}".`
        };

        let nextLayout = this.layoutEngine.getLayout();
        const panelDef = this.panelRegistry.get("gm-assistant");
        if (panelDef) {
            nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
            await this.stateStore?.setUserLayout?.(nextLayout);
        }

        if (safeParentId) this._campaignViewState.expandedIds.add(safeParentId);
        this.render({ force: false });
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

    #getPanelTitle(panel, context = {}) {
        if (this.#isMapPanel(panel)) {
            return this.#getMapPanelScene(panel, context)?.name ?? panel?.title ?? "Map";
        }

        return panel?.title ?? "";
    }

    #getPanelSceneId(panel, context = {}) {
        return this.sceneWorkspaceController.getPanelSceneId(panel, context);
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
        return this.sceneWorkspaceController.makeSceneMapPanelDef(scene);
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
                    <img class="totc-v2-market-panel__entry-img" src="${this.#escapeHTML(offer.img || DEFAULT_ITEM_ICON)}" alt="">
                    <div class="totc-v2-market-panel__entry-copy">
                        <div class="totc-v2-market-panel__entry-name">${this.#escapeHTML(offer.name)}</div>
                        <div class="totc-v2-market-panel__entry-meta">${this.#escapeHTML(offer.type)} · ${this.#escapeHTML(offer.stockLabel)} · ${this.#escapeHTML(offer.packLabel)}</div>
                        ${offer.description ? `<div class="totc-v2-market-panel__entry-description">${this.#escapeHTML(offer.description)}</div>` : ""}
                    </div>
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
                    <img class="totc-v2-market-panel__entry-img" src="${this.#escapeHTML(entry.img || DEFAULT_ITEM_ICON)}" alt="">
                    <div class="totc-v2-market-panel__entry-copy">
                        <div class="totc-v2-market-panel__entry-name">${this.#escapeHTML(entry.name)}</div>
                        <div class="totc-v2-market-panel__entry-meta">${this.#escapeHTML(entry.type)} · Qty ${entry.quantity} · Base ${this.#escapeHTML(entry.basePriceLabel)}</div>
                        ${entry.description ? `<div class="totc-v2-market-panel__entry-description">${this.#escapeHTML(entry.description)}</div>` : ""}
                    </div>
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

    #bindDesignIssuesHooks() {
        this.hooksController.bindFamily("designIssues");
    }

    #unbindDesignIssuesHooks() {
        this.hooksController.unbindFamily("designIssues");
    }

    #getGamemasterPanelState() {
        return this.stateStore?.getUserScopedState?.(GM_PANEL_STATE_KEY, normalizeGamemasterPanelState)
            ?? normalizeGamemasterPanelState();
    }

    #getMarketPanelState() {
        return this.stateStore?.getUserScopedState?.(MARKET_PANEL_STATE_KEY, normalizeMarketPanelState)
            ?? normalizeMarketPanelState();
    }

    async #setGamemasterPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(GM_PANEL_STATE_KEY, patch, normalizeGamemasterPanelState);
    }

    async #setMarketPanelStatePatch(patch = {}) {
        return await this.stateStore?.setUserScopedStatePatch?.(MARKET_PANEL_STATE_KEY, patch, normalizeMarketPanelState);
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

    #resolveActorFromSelectedSceneTokens(scene = canvas?.scene ?? null) {
        if (this.selectedTokenIds.size !== 1) return null;
        const tokenId = [...this.selectedTokenIds][0];
        const tokenDoc = scene?.tokens?.get?.(tokenId) ?? null;
        const actor = tokenDoc?.actor ?? game.actors?.get?.(tokenDoc?.actorId) ?? null;
        if (!actor) return null;
        if (game.user?.isGM || actor.isOwner) return actor;
        return null;
    }

    #syncActorDetailsToTokenSelection(scene = canvas?.scene ?? null) {
        if (this.actorWorkspaceController.state.editorState.mode === "create") return;
        if (!this.selectedTokenIds.size) return;
        const actor = this.#resolveActorFromSelectedSceneTokens(scene);
        if (actor?.id) {
            this.actorWorkspaceController.openDetails(actor.id);
        } else {
            this.actorWorkspaceController.clearDetails();
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
        const dieRollRequestsMarkup = renderDieRollRequestPanel(dieRollRequestPanel, {
            escapeHTML: (value) => this.#escapeHTML(value)
        });

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
        await this.marketController.generateOfferBoard();
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
        return await this.marketController.buildPanelModel({ scene, controlledTokens, panelState, compendiumItems });
    }

    #getMarketEligibleActors(controlledTokens = []) {
        return this.marketController.getEligibleActors(controlledTokens);
    }

    #normalizeSceneMarketState(value) {
        return this.marketController.normalizeSceneMarketState(value);
    }

    #formatCurrency(value, currency = "pounds") {
        return this.marketController.formatCurrency(value, currency);
    }

    #getMarketSellableItems(actor, marketState) {
        return this.marketController.getSellableItems(actor, marketState);
    }

    #parseMarketQuantityInput(input, { fallback = 1, max = 1 } = {}) {
        return this.marketController.parseQuantityInput(input, { fallback, max });
    }

    async #buildGeneratedMarketOffers() {
        return await this.marketController.buildGeneratedOffers();
    }

    #resolveSelectedMarketActor() {
        return this.marketController.resolveSelectedActor();
    }

    #canUserManageMarketActor(actor) {
        return this.marketController.canManageActor(actor);
    }

    async #handleMarketBuy(offerId, requestedQuantity = 1) {
        await this.marketController.handleBuy(offerId, requestedQuantity);
    }

    async #handleMarketSell(itemId, requestedQuantity = 1) {
        await this.marketController.handleSell(itemId, requestedQuantity);
    }

    #wireInteractionHandlers() {
        const host = this.element?.querySelector("[data-layout-root='true']");
        if (!host) return;

        this.element?.querySelectorAll("[data-panel-id], [data-drag-panel-id]")?.forEach((panelButton) => {
            panelButton.addEventListener("dragstart", (event) => {
                const panelId = panelButton.dataset.panelId || panelButton.dataset.dragPanelId;
                event.dataTransfer?.setData(WORKSPACE_PANEL_DRAG_MIME, panelId ?? "");
                event.dataTransfer?.setData("text/plain", panelId ?? "");
                event.dataTransfer.effectAllowed = "move";
            });
            panelButton.addEventListener("dragend", () => {
                this.interactionController.clearIntent();
                this.#hideGhost();
            });
        });

        host.addEventListener("dragover", (event) => {
            if (!dataTransferHasType(event.dataTransfer, WORKSPACE_PANEL_DRAG_MIME)) return;
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
            if (!dataTransferHasType(event.dataTransfer, WORKSPACE_PANEL_DRAG_MIME)) return;
            event.preventDefault();
            const panelId = event.dataTransfer?.getData(WORKSPACE_PANEL_DRAG_MIME);
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

    }

    async #onWallEditKeyDown(event) {
        if (event.key === "Escape" && this._encounterTargetingInteraction) {
            event.preventDefault();
            await this.#cancelEncounterTargetingInteraction();
            return;
        }

        const activeWallCommand = this.#getActiveWallCommandPanel();
        if (event.key === "Escape" && game.user?.isGM && activeWallCommand?.command === "add") {
            event.preventDefault();
            event.stopPropagation();
            this.#stopWallAddMode(activeWallCommand.panel);
            return;
        }

        if (!game.user?.isGM) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;

        const panel = this.#getPrimaryActivePanel();
        if (!this.#isMapPanel(panel)) return;

        const panelId = String(panel?.id ?? "").trim();
        if (!panelId) return;

        const state = this.#getMapPanelToolbarState(panel);
        const key = String(event.key ?? "").toLowerCase();
        const wallsActive = state.mode === "walls";

        if (key === "w") {
            event.preventDefault();
            if (wallsActive) {
                this.#patchMapPanelToolbarState(panelId, { mode: null });
                await this.#deactivateWallModeForPanel(panelId);
            } else {
                this.#patchMapPanelToolbarState(panelId, { mode: "walls" });
                await this.#executeDesignAction("scene.walls", { panelId });
            }
            this.#syncWallCommandCanvasListener();
            this.render({ force: false });
            return;
        }

        if (!wallsActive) return;

        if (key === "s") {
            event.preventDefault();
            this.#cancelWallAddSequence();
            this.#patchMapPanelToolbarState(panelId, { wallCommand: "split" });
            this.#syncWallCommandCanvasListener();
            this.render({ force: false });
            return;
        }

        if (key === "j") {
            event.preventDefault();
            await this.#joinSelectedWallsForPanel(panelId);
            return;
        }

        if (key === "delete") {
            if (Number(state.selectedWallCount ?? 0) <= 0) return;
            event.preventDefault();
            await this.#deleteSelectedWallsForPanel(panelId);
            return;
        }

        const wallTypeByKey = {
            1: "wall",
            2: "window",
            3: "door"
        };
        if (!wallTypeByKey[key]) return;

        event.preventDefault();
        this.#patchMapPanelToolbarState(panelId, { wallType: wallTypeByKey[key] });
        this.render({ force: false });
    }

    async #deactivateWallModeForPanel(panelId = "") {
        const panel = this.#resolvePanelDefinition(panelId) ?? { id: panelId };
        const scene = this.#getDesignActionScene(panel, canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null);
        this.#cancelWallAddSequence({ notify: false });
        this.#clearWallCommandCanvasListener();
        if (scene) {
            this.#setSelectedWallIds(scene, []);
            this.#setJoinableWallIds(scene, []);
            this.#setSceneDetectedWallOverlayState(scene, null);
        }

        try {
            if (typeof ui?.controls?.activate === "function") {
                await ui.controls.activate({ control: "tokens", tool: "select" });
                return;
            }
            if (typeof ui?.controls?.initialize === "function") {
                await ui.controls.initialize({ control: "tokens", tool: "select" });
                return;
            }
            await canvas?.tokens?.activate?.();
        } catch (error) {
            console.warn("[turn-of-the-century] Failed to deactivate native wall controls", error);
        }
    }

    async #deleteSelectedWallsForPanel(panelId = "") {
        const panel = this.#resolvePanelDefinition(panelId) ?? { id: panelId };
        const scene = this.#getDesignActionScene(panel, canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null);
        this.#syncSelectedWallsFromCanvas(scene);
        const selectedIds = this.#getSelectedWallIds(scene);
        if (!scene || !selectedIds.size) {
            ui.notifications?.warn?.("Select wall segments before deleting them.");
            return;
        }

        const result = await removeWallSegmentsById({ scene, ids: selectedIds });
        if (result?.ok) {
            this.#setSelectedWallIds(scene, []);
            this.#setJoinableWallIds(scene, []);
            this.#refreshSceneWallOverlay(scene);
        }
        this.#reportWallEditResult("remove", result);
    }

    async #joinSelectedWallsForPanel(panelId = "") {
        const panel = this.#resolvePanelDefinition(panelId) ?? { id: panelId };
        const scene = this.#getDesignActionScene(panel, canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null);
        this.#syncSelectedWallsFromCanvas(scene);
        const joinableIds = this.#getJoinableWallIds(scene);
        if (!scene || joinableIds.size < 2) {
            ui.notifications?.warn?.("Select two or more aligned adjacent wall segments before joining them.");
            return;
        }

        const result = await joinWallSegmentsById({ scene, ids: joinableIds });
        if (result?.ok) {
            this.#setSelectedWallIds(scene, []);
            this.#setJoinableWallIds(scene, []);
            this.#refreshSceneWallOverlay(scene);
        }
        this.#reportWallEditResult("join", result);
    }


    #cancelWallAddSequence({ notify = true } = {}) {
        if (!this._wallAddSequence) return;
        this._wallAddSequence = null;
        if (notify) ui.notifications?.info?.("Wall add cancelled.");
    }

    #stopWallAddMode(panel = null, { notify = true } = {}) {
        const panelId = String(panel?.id ?? "").trim();
        this.#cancelWallAddSequence({ notify: false });
        if (panelId) this.#patchMapPanelToolbarState(panelId, { wallCommand: "" });
        this.#syncWallCommandCanvasListener();
        if (notify) ui.notifications?.info?.("Wall placement ended. Click Add to begin again.");
        this.render({ force: false });
    }

    #clearWallCommandCanvasListener() {
        this._wallCommandCanvasCleanup?.();
        this._wallCommandCanvasCleanup = null;
        this._wallCommandCanvasRef = null;
    }

    #getActiveWallCommandPanel() {
        const panels = [
            this.#getPrimaryActivePanel(),
            this.#getActiveCenterMapPanel()
        ].filter(Boolean);

        for (const panel of panels) {
            if (!this.#isMapPanel(panel)) continue;
            const state = this.#getMapPanelToolbarState(panel);
            const command = String(state.wallCommand ?? "").trim();
            if (state.mode === "walls" && ["add", "split"].includes(command)) {
                return { panel, state, command };
            }
        }

        return null;
    }

    #syncWallCommandCanvasListener() {
        const active = this.#getActiveWallCommandPanel();
        if (!active) {
            this.#clearWallCommandCanvasListener();
            return;
        }

        if (this._wallCommandCanvasRef === canvas && this._wallCommandCanvasCleanup) return;

        this.#clearWallCommandCanvasListener();
        this._wallCommandCanvasRef = canvas;
        this._wallCommandCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            void this.#handleWallCommandCanvasPointerDown(event);
        });
    }

    async #handleWallCommandCanvasPointerDown(event = {}) {
        const active = this.#getActiveWallCommandPanel();
        if (!active || !game.user?.isGM) return;
        if (!isPrimaryPointerButton(event)) return;

        const point = getNativeCanvasEventScenePoint(event, canvas);
        if (!point) {
            ui.notifications?.warn?.("That wall click could not be converted to scene coordinates.");
            return;
        }

        event?.stopPropagation?.();
        event?.preventDefault?.();

        const scene = this.#getDesignActionScene(active.panel, canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null);
        const grid = buildWallEditingGrid(scene);
        const snapped = snapPointToGridIntersection(point, grid);
        if (!scene || !snapped) {
            ui.notifications?.warn?.("Wall editing requires a calibrated square grid.");
            return;
        }

        if (active.command === "add") {
            await this.#handleWallAddCanvasPoint({ scene, point: snapped, state: active.state });
            return;
        }

        if (active.command === "split") {
            const result = await splitWallSegmentAtPoint({ scene, point: snapped, grid });
            if (result?.ok) this.#refreshSceneWallOverlay(scene);
            this.#reportWallEditResult("split", result);
        }
    }

    async #handleWallAddCanvasPoint({ scene = null, point = null, state = {} } = {}) {
        if (!scene || !point) return;

        const previousSequence = this._wallAddSequence;
        const step = advanceWallPlacementSequence(previousSequence, {
            sceneId: String(scene.id ?? scene._id ?? ""),
            point
        });
        this._wallAddSequence = step.sequence;
        if (!step.segment) {
            ui.notifications?.info?.("Wall start set. Each left click adds the next segment. Press Esc to finish.");
            return;
        }

        const result = await addWallSegmentToScene({
            scene,
            start: step.segment.start,
            end: step.segment.end,
            wallType: state.wallType
        });
        if (result?.ok) {
            this.#refreshSceneWallOverlay(scene);
        } else {
            this._wallAddSequence = previousSequence;
        }
        this.#reportWallEditResult("add", result);
    }

    #reportWallEditResult(command, result = null) {
        if (result?.ok) {
            const deletedCount = Array.isArray(result.deleted) ? result.deleted.length : 0;
            const messages = {
                add: "Wall segment added.",
                remove: deletedCount > 1 ? `${deletedCount} wall segments removed.` : "Wall segment removed.",
                split: "Wall segment split.",
                join: "Wall segments joined."
            };
            ui.notifications?.info?.(messages[command] ?? "Wall edit applied.");
            this.render({ force: false });
            return;
        }

        const reasonMessages = {
            "wall-not-found": "No wall segment was found near that point.",
            "join-not-found": "No aligned wall segments were found near that join point.",
            "invalid-split-point": "That wall cannot be split at the selected grid point.",
            "invalid-wall-segment": "Choose two different grid intersections for a wall segment.",
            "wall-creation-unavailable": "This scene cannot create walls in the current Foundry session.",
            "wall-deletion-unavailable": "This scene cannot delete walls in the current Foundry session.",
            "wall-update-unavailable": "This scene cannot update walls in the current Foundry session."
        };
        ui.notifications?.warn?.(reasonMessages[result?.reason] ?? "Wall edit could not be applied.");
    }

    #refreshSceneWallOverlay(scene = null) {
        if (!scene) return;
        const walls = scene?.walls;
        const wallDocuments = Array.isArray(walls)
            ? walls
            : Array.isArray(walls?.contents)
                ? walls.contents
                : typeof walls?.values === "function"
                    ? Array.from(walls.values())
                    : typeof walls?.[Symbol.iterator] === "function"
                        ? Array.from(walls)
                        : [];
        const existingWallIds = new Set(wallDocuments.map((wall) => wallDocumentId(wall)).filter(Boolean));
        const selectedWallIds = [...this.#getSelectedWallIds(scene)].filter((id) => existingWallIds.has(id));
        const joinableWallIds = [...this.#getJoinableWallIds(scene)].filter((id) => existingWallIds.has(id));
        this.#setSelectedWallIds(scene, selectedWallIds);
        this.#setJoinableWallIds(scene, joinableWallIds);
        this.#setSceneDetectedWallOverlayState(scene, buildSceneWallOverlayState(scene, {
            selectedWallIds
        }));
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

    #getActiveCenterMapPanel(layout = this.layoutEngine.getLayout()) {
        const centerDock = layout?.root?.centerDock;
        for (const stack of centerDock?.stacks ?? []) {
            const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
            if (this.#isMapPanel(activePanel)) return activePanel;
        }
        return null;
    }

    #syncNativeCanvasScene() {
        const panel = this.#getActiveCenterMapPanel();
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

    // -----------------------------------------------------------------------
    // Grid calibration
    // -----------------------------------------------------------------------

    #getSceneGridOverlayState() {
        return null;
    }

    async #startGridCalibrationFromSceneProperties() {
        const activePanel = this.#getPrimaryActivePanel();
        const viewedScene = this.#getViewedScene();
        const defaultScene = canvas?.scene ?? game.scenes?.active ?? viewedScene ?? null;
        const scene = this.#getScenePropertiesScene(activePanel, { viewedScene, defaultScene });
        if (!scene) {
            ui.notifications?.warn?.("Open a scene before calibrating its grid.");
            return;
        }

        const sceneId = String(scene.id ?? scene._id ?? "").trim();
        const currentSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? game.scenes?.viewed?.id ?? "").trim();
        if (sceneId && currentSceneId !== sceneId && typeof scene.view === "function") {
            await scene.view();
        }

        this.gridCalibrationController.open({ scene });
        this.#syncGridCalibrationCanvasListener();
        ui.notifications?.info?.("Grid calibration started. Click two corners of the same visible grid cell on the scene.");
        this.render({ force: false });
    }

    #clearGridCalibrationCanvasListener() {
        this._gridCalibrationCanvasCleanup?.();
        this._gridCalibrationCanvasCleanup = null;
        this._gridCalibrationCanvasRef = null;
    }

    #syncGridCalibrationCanvasListener() {
        if (!this.gridCalibrationController.active) {
            this.#clearGridCalibrationCanvasListener();
            return;
        }

        const targetSceneId = String(this.gridCalibrationController.state?.sceneId ?? "").trim();
        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        if (targetSceneId && canvasSceneId && targetSceneId !== canvasSceneId) return;
        if (this._gridCalibrationCanvasRef === canvas && this._gridCalibrationCanvasCleanup) return;

        this.#clearGridCalibrationCanvasListener();
        this._gridCalibrationCanvasRef = canvas;
        this._gridCalibrationCanvasCleanup = listenForNativeCanvasPointerDown(canvas, (event) => {
            if (!this.gridCalibrationController.active) return;
            const point = getNativeCanvasEventScenePoint(event, canvas);
            if (!point) {
                ui.notifications?.warn?.("That canvas click could not be converted to scene coordinates.");
                return;
            }

            event?.stopPropagation?.();
            event?.preventDefault?.();
            const picked = this.gridCalibrationController.pickCorner({
                x: Math.round(point.x),
                y: Math.round(point.y)
            });
            if (picked.phase === "pick-second") {
                ui.notifications?.info?.("First grid corner set. Click the opposite corner of the same cell.");
            }
            if (picked.phase === "adjust") {
                ui.notifications?.info?.("Grid sample captured. Review the values and apply when ready.");
                void this.#previewGridCalibrationOnCanvas();
            }
            this.render({ force: false });
        });
    }

    #getSceneDetectedWallOverlayState(scene = null) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        return sceneId ? (this._detectedWallOverlayStates.get(sceneId) ?? null) : null;
    }

    #syncSelectedWallsFromCanvas(scene = null, { clearWhenEmpty = false } = {}) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return false;

        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        if (canvasSceneId && canvasSceneId !== sceneId) return false;

        const selectedIds = getControlledWallIds(canvas?.walls);
        if (selectedIds.length) {
            this.#setSelectedWallIds(scene, selectedIds);
            this.#setJoinableWallIds(scene, getJoinableWallIds(scene, selectedIds));
            return true;
        }

        if (clearWhenEmpty) {
            this.#setSelectedWallIds(scene, []);
            this.#setJoinableWallIds(scene, []);
        }
        return false;
    }

    #getSelectedWallIds(scene = null) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        return sceneId ? (this._selectedWallIdsByScene.get(sceneId) ?? new Set()) : new Set();
    }

    #setSelectedWallIds(scene = null, ids = []) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return;
        const selectedIds = new Set(Array.from(ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean));
        if (selectedIds.size) this._selectedWallIdsByScene.set(sceneId, selectedIds);
        else this._selectedWallIdsByScene.delete(sceneId);
    }

    #getJoinableWallIds(scene = null) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        return sceneId ? (this._joinableWallIdsByScene.get(sceneId) ?? new Set()) : new Set();
    }

    #setJoinableWallIds(scene = null, ids = []) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return;
        const joinableIds = new Set(Array.from(ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean));
        if (joinableIds.size) this._joinableWallIdsByScene.set(sceneId, joinableIds);
        else this._joinableWallIdsByScene.delete(sceneId);
    }

    #getMapPanelToolbarState(panel = null) {
        const panelId = String(panel?.id ?? "").trim();
        const sceneId = this.#getPanelSceneId(panel);
        if (sceneId) this.#syncSelectedWallsFromCanvas(this.#getSceneDocumentById(sceneId));
        const selectedWallCount = sceneId ? (this._selectedWallIdsByScene.get(sceneId)?.size ?? 0) : 0;
        const joinableWallCount = sceneId ? (this._joinableWallIdsByScene.get(sceneId)?.size ?? 0) : 0;
        const defaults = { mode: null, wallCommand: "detect", wallType: "wall", selectedWallCount, joinableWallCount };
        if (!panelId) return defaults;
        return { ...defaults, ...(this._mapPanelToolbarStates.get(panelId) ?? {}), selectedWallCount, joinableWallCount };
    }

    #patchMapPanelToolbarState(panelId = "", patch = {}) {
        const current = this._mapPanelToolbarStates.get(panelId) ?? { mode: null, wallCommand: "detect", wallType: "wall" };
        this._mapPanelToolbarStates.set(panelId, { ...current, ...patch });
    }

    #setSceneDetectedWallOverlayState(scene = null, overlayState = null) {
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (!sceneId) return;

        const segments = Array.isArray(overlayState?.segments)
            ? overlayState.segments.filter((segment) => {
                const values = [segment?.x1, segment?.y1, segment?.x2, segment?.y2].map((value) => Number(value));
                return values.every(Number.isFinite);
            }).map((segment) => ({
                id: String(segment.id ?? "").trim(),
                wallKind: ["door", "window"].includes(String(segment.wallKind ?? "").trim().toLowerCase())
                    ? String(segment.wallKind ?? "").trim().toLowerCase()
                    : "wall",
                x1: Math.round(Number(segment.x1)),
                y1: Math.round(Number(segment.y1)),
                x2: Math.round(Number(segment.x2)),
                y2: Math.round(Number(segment.y2)),
                selected: Boolean(segment.selected)
            }))
            : [];

        if (!segments.length) {
            this._detectedWallOverlayStates.delete(sceneId);
            return;
        }

        const intersections = Array.isArray(overlayState?.intersections)
            ? overlayState.intersections.filter((point) => [point?.x, point?.y].every((value) => Number.isFinite(Number(value)))).map((point) => ({
                x: Math.round(Number(point.x)),
                y: Math.round(Number(point.y))
            }))
            : [];

        this._detectedWallOverlayStates.set(sceneId, { segments, intersections });
    }

    #syncGridCalibrationStateFromInputs() {
        const root = this.element?.querySelector("[data-grid-calibration='true']");
        if (!root) return;

        const readNumber = (action) => root.querySelector(`[data-action='${action}']`)?.value;
        const cellW = readNumber("grid-cal-cell-w");
        const cellH = readNumber("grid-cal-cell-h");
        const offsetX = readNumber("grid-cal-offset-x");
        const offsetY = readNumber("grid-cal-offset-y");
        const color = root.querySelector("[data-action='grid-cal-color']")?.value;

        if (cellW !== undefined) this.gridCalibrationController.setCellWidth(cellW);
        if (cellH !== undefined) this.gridCalibrationController.setCellHeight(cellH);
        if (offsetX !== undefined) this.gridCalibrationController.setOffsetX(offsetX);
        if (offsetY !== undefined) this.gridCalibrationController.setOffsetY(offsetY);
        if (color !== undefined) this.gridCalibrationController.setColor(color);
    }

    #focusAdjacentGridCalibrationInput(currentInput, { backwards = false } = {}) {
        const root = this.element?.querySelector("[data-grid-calibration='true']");
        if (!root) return false;

        const inputs = Array.from(root.querySelectorAll("[data-action='grid-cal-cell-w'], [data-action='grid-cal-cell-h'], [data-action='grid-cal-offset-x'], [data-action='grid-cal-offset-y'], [data-action='grid-cal-color']"))
            .filter((input) => !input.disabled && input.offsetParent !== null);
        const currentIndex = inputs.indexOf(currentInput);
        if (!inputs.length || currentIndex < 0) return false;

        const delta = backwards ? -1 : 1;
        const nextInput = inputs[(currentIndex + delta + inputs.length) % inputs.length];
        nextInput?.focus?.();
        nextInput?.select?.();
        return Boolean(nextInput);
    }

    #scheduleGridCalibrationPreview({ geometry = true } = {}) {
        if (this._gridCalibrationPreviewTimer) clearTimeout(this._gridCalibrationPreviewTimer);
        const delay = geometry
            ? GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS
            : GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS;
        this._gridCalibrationPreviewTimer = setTimeout(() => {
            this._gridCalibrationPreviewTimer = null;
            void this.#previewGridCalibrationOnCanvas();
        }, delay);
    }

    #clearGridCalibrationPreviewTimer() {
        if (!this._gridCalibrationPreviewTimer) return;
        clearTimeout(this._gridCalibrationPreviewTimer);
        this._gridCalibrationPreviewTimer = null;
    }

    async #flushGridCalibrationPreview() {
        this.#clearGridCalibrationPreviewTimer();
        return this.#previewGridCalibrationOnCanvas();
    }

    async #previewGridCalibrationOnCanvas() {
        const state = this.gridCalibrationController.state;
        const updateData = this.gridCalibrationController.buildUpdateData();
        if (!state?.active || !updateData) return false;

        const scene = state.sceneId
            ? game.scenes?.get(state.sceneId)
            : (canvas?.scene ?? game.scenes?.viewed ?? null);
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        if (!scene || (sceneId && canvasSceneId && sceneId !== canvasSceneId)) return false;

        try {
            return await previewNativeCanvasGrid({ canvasRef: canvas, scene, updateData });
        } catch (error) {
            console.warn("[turn-of-the-century] Grid calibration preview failed", error);
            return false;
        }
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
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    query: value
                };
            }
            if (action === "gm-assistant-set-prompt") {
                this._gmAssistantState.prompt = value;
                this._gmAssistantState.promptTextareaHeight = input.offsetHeight || input.clientHeight || 0;
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
                this.actorWorkspaceController.setSearchQuery(value);
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "actor-list-search");
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
            case "gm-assistant-set-prompt": {
                this._gmAssistantState.prompt = value;
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "gm-assistant-set-prompt");
                break;
            }
            case "media-browser-search": {
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    query: value
                };
                await this.render({ force: false });
                focusWorkspaceTextInputAtEnd(this.element, "media-browser-search");
                break;
            }
            case "scene-properties-name": {
                await this.sceneWorkspaceController.saveSceneName(value);
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

    async _openScenePropertiesPanel() {
        await this.sceneWorkspaceController.openScenePropertiesPanel();
    }

    async _openSceneGridConfiguration({ scene = null } = {}) {
        const targetScene = scene ?? canvas?.scene ?? game.scenes?.viewed ?? null;
        if (!targetScene) {
            ui.notifications?.warn?.("Open a scene before editing the grid.");
            return;
        }

        const targetSceneId = String(targetScene?.id ?? targetScene?._id ?? "").trim();
        const currentSceneId = String(canvas?.scene?.id ?? game.scenes?.viewed?.id ?? "").trim();
        if (targetSceneId && currentSceneId !== targetSceneId) {
            await targetScene.view?.();
        }

        if (targetScene.sheet?.render) {
            targetScene.sheet.render(true);
        } else {
            ui.notifications?.warn?.("Scene configuration is not available in this Foundry session.");
        }
    }

    async _createSceneDesignScene() {
        return await this.sceneWorkspaceController.createSceneDesignScene();
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

    #wireScenePropertiesHandlers() {
        this.sceneWorkspaceController.wireScenePropertiesHandlers(this.element);
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

    async #executeDesignAction(actionId, { panelId = "" } = {}) {
        const action = this.designActionRegistry.get(actionId);
        if (!action) return;
        const sourcePanel = panelId ? this.#resolvePanelDefinition(panelId) : this.#getPrimaryActivePanel();
        const currentScene = canvas?.scene ?? game.scenes?.active ?? game.scenes?.viewed ?? null;
        const actionScene = this.#getDesignActionScene(sourcePanel, currentScene);

        try {
            const result = await action.execute({
                app: this,
                panel: this.#getPrimaryActivePanel(),
                sourcePanel,
                scene: actionScene,
                currentScene,
                canvas,
                ui,
                combat: game.combats?.active ?? game.combat ?? null,
                controlledTokens: canvas?.tokens?.controlled ?? []
            });

            if (actionId === "scene.walls" && result?.ok && actionScene) this.#refreshSceneWallOverlay(actionScene);

            if (actionId === "scene.detectWalls" && result?.ok && actionScene) {
                this.#setSceneDetectedWallOverlayState(actionScene, result.detectedWallOverlay ?? null);
                }

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

    async #getMediaBrowserEntries() {
        if (Array.isArray(this._mediaBrowserEntries)) return this._mediaBrowserEntries;
        if (this._mediaBrowserEntriesPromise) return await this._mediaBrowserEntriesPromise;

        this._mediaBrowserEntriesPromise = this.#loadMediaBrowserEntries();
        try {
            const result = await this._mediaBrowserEntriesPromise;
            this._mediaBrowserEntries = Array.isArray(result?.entries) ? result.entries : [];
            if (!result?.ok) {
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    error: result?.error ?? "Media browsing failed."
                };
            } else if (this._mediaBrowserState.error) {
                this._mediaBrowserState = {
                    ...this._mediaBrowserState,
                    error: ""
                };
            }
            return this._mediaBrowserEntries;
        } finally {
            this._mediaBrowserEntriesPromise = null;
        }
    }

    async #loadMediaBrowserEntries() {
        return browseAssetMedia({
            FilePickerClass: this.#getFilePickerClass()
        });
    }

    #getFilePickerClass() {
        return foundry?.applications?.apps?.FilePicker?.implementation
            ?? null;
    }

    async _openMediaBrowserPanel({ mode = "browse", selectedPaths = [], onSelect = null } = {}) {
        const panelDef = this.panelRegistry.get("media-browser");
        if (!panelDef) return;

        this._mediaBrowserState = {
            ...this._mediaBrowserState,
            mode: mode === "select" ? "select" : "browse",
            selectedPaths: Array.isArray(selectedPaths) ? selectedPaths.map(String) : []
        };
        this._mediaBrowserSelectCallback = typeof onSelect === "function" ? onSelect : null;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
    }

    async #showEncounterPanel() {
        const panelDef = this.panelRegistry.get("encounter");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "rightDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
    }

    async #showEncounterManagerPanel() {
        const panelDef = this.panelRegistry.get("encounter-manager");
        if (!panelDef) return;

        const nextLayout = this.layoutEngine.restorePanel(panelDef, { preferredDockId: panelDef.defaultDock ?? "leftDock" });
        await this.stateStore?.setUserLayout?.(nextLayout);
        this.render({ force: false });
    }

    async #confirmMediaBrowserSelection() {
        const selectedPaths = new Set(this._mediaBrowserState.selectedPaths ?? []);
        const entries = (await this.#getMediaBrowserEntries()).filter((entry) => selectedPaths.has(entry.path));

        try {
            await this._mediaBrowserSelectCallback?.(entries);
            globalThis.Hooks?.callAll?.("totcMediaBrowserSelected", entries);
        } finally {
            this._mediaBrowserSelectCallback = null;
            this._mediaBrowserState = {
                ...this._mediaBrowserState,
                mode: "browse",
                selectedPaths: []
            };

            const nextLayout = this.layoutEngine.closePanel("media-browser");
            await this.stateStore?.setUserLayout?.(nextLayout);
            this.render({ force: false });
        }
    }

    #isMarketTradableItemType(itemType) {
        return this.marketController.isTradableItemType(itemType);
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
