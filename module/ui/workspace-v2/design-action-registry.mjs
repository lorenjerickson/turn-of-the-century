import { createNpcDesignActor } from "./design-actions/actor-actions.mjs";
import {
    activateSceneWallDesignMode,
    createSceneDesignScene,
    detectSceneWalls
} from "./design-actions/scene-actions.mjs";

const DEFAULT_RELEVANCE = 50;

function normalizeStringArray(value = []) {
    return Array.isArray(value)
        ? [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
        : [];
}

function normalizePanelContextId(panelId = "") {
    const id = String(panelId ?? "").trim();
    if (id.startsWith("map:")) return "map";
    return id;
}

function cloneAction(action) {
    return {
        id: action.id,
        label: action.label,
        description: action.description,
        domain: action.domain,
        contexts: [...action.contexts],
        requiredRole: action.requiredRole,
        relevance: action.relevance,
        execute: action.execute
    };
}

function normalizeAction(action = {}) {
    const id = String(action.id ?? "").trim();
    const label = String(action.label ?? "").trim();
    if (!id || !label) {
        throw new Error("Design actions require an id and label.");
    }

    const relevance = Number(action.relevance);
    return {
        id,
        label,
        description: String(action.description ?? "").trim(),
        domain: String(action.domain ?? "general").trim(),
        contexts: normalizeStringArray(action.contexts),
        requiredRole: String(action.requiredRole ?? "gm").trim(),
        relevance: Number.isFinite(relevance) ? relevance : DEFAULT_RELEVANCE,
        execute: typeof action.execute === "function" ? action.execute : async () => null
    };
}

export const DEFAULT_DESIGN_ACTIONS = Object.freeze([
    {
        id: "scene.create",
        label: "Create Scene",
        description: "Create a Foundry scene from an organized battle-map image.",
        domain: "scene",
        contexts: ["gamemaster", "map"],
        relevance: 98,
        execute: async (context = {}) => createSceneDesignScene(context)
    },
    {
        id: "scene.grid",
        label: "Grid",
        description: "Calibrate the grid cell size and offset for this scene.",
        domain: "scene",
        contexts: ["map"],
        relevance: 93,
        execute: async (context = {}) => {
            if (typeof context.app?._openGridCalibration === "function") {
                context.app._openGridCalibration({ scene: context.scene });
                return { ok: true, silent: true };
            }
            return { ok: false, level: "warn", message: "Grid calibration is not available." };
        }
    },
    {
        id: "scene.detectWalls",
        label: "Detect Walls",
        description: "Detect grid-aligned wall segments from this scene map.",
        domain: "scene",
        contexts: ["map"],
        relevance: 96,
        execute: async (context = {}) => detectSceneWalls(context)
    },
    {
        id: "scene.walls",
        label: "Walls",
        description: "Draw or revise scene boundaries.",
        domain: "scene",
        contexts: ["map"],
        relevance: 95,
        execute: async (context = {}) => activateSceneWallDesignMode(context)
    },
    {
        id: "scene.lights",
        label: "Lights",
        description: "Place lamps, lanterns, and atmospheric sources.",
        domain: "scene",
        contexts: ["map"],
        relevance: 88
    },
    {
        id: "scene.tokens",
        label: "Tokens",
        description: "Stage actors and hazards on the current map.",
        domain: "scene",
        contexts: ["map"],
        relevance: 82
    },
    {
        id: "scene.notes",
        label: "Notes",
        description: "Pin investigative clues and private GM annotations.",
        domain: "scene",
        contexts: ["map"],
        relevance: 76
    },
    {
        id: "compendium.createItem",
        label: "Create Item",
        description: "Draft a new item for the active library.",
        domain: "compendium",
        contexts: ["compendium"],
        relevance: 90
    },
    {
        id: "compendium.import",
        label: "Import",
        description: "Bring selected world content into a pack.",
        domain: "compendium",
        contexts: ["compendium"],
        relevance: 75
    },
    {
        id: "compendium.validate",
        label: "Validate Pack",
        description: "Check required fields and period tone.",
        domain: "compendium",
        contexts: ["compendium"],
        relevance: 70
    },
    {
        id: "actor.createNpc",
        label: "Create NPC",
        description: "Create a supporting character from the current actor context.",
        domain: "actor",
        contexts: ["player", "encounter"],
        relevance: 86,
        execute: async (context = {}) => createNpcDesignActor({
            actorClass: context.actorClass,
            foundry: context.foundry,
            actors: context.actors ?? context.game?.actors,
            sourcePanelId: context.sourcePanel?.id ?? context.panel?.id ?? ""
        })
    },
    {
        id: "actor.tokenDefaults",
        label: "Token Defaults",
        description: "Review token display and disposition defaults.",
        domain: "actor",
        contexts: ["player"],
        relevance: 68
    },
    {
        id: "encounter.seed",
        label: "Seed Encounter",
        description: "Build opposition from the current scene context.",
        domain: "encounter",
        contexts: ["encounter"],
        relevance: 84
    },
    {
        id: "market.stock",
        label: "Add Stock",
        description: "Add goods or curiosities to the local market.",
        domain: "market",
        contexts: ["market"],
        relevance: 86
    },
    {
        id: "market.prices",
        label: "Price Audit",
        description: "Review affordability and treasury effects.",
        domain: "market",
        contexts: ["market"],
        relevance: 70
    },
    {
        id: "inspect.context",
        label: "Inspect",
        description: "Review design details for the active view.",
        domain: "inspection",
        contexts: ["*"],
        relevance: 30
    },
    {
        id: "design.issues",
        label: "Issues",
        description: "Surface missing data and likely preparation gaps.",
        domain: "inspection",
        contexts: ["*"],
        relevance: 25
    }
]);

export class WorkspaceDesignActionRegistry {
    constructor({ actions = DEFAULT_DESIGN_ACTIONS } = {}) {
        this.#actions = [];
        this.#actionMap = new Map();
        for (const action of actions) this.register(action);
    }

    #actions;
    #actionMap;

    register(action) {
        const normalized = normalizeAction(action);
        if (this.#actionMap.has(normalized.id)) {
            throw new Error(`Duplicate design action id: ${normalized.id}`);
        }

        this.#actions.push(normalized);
        this.#actionMap.set(normalized.id, normalized);
        return cloneAction(normalized);
    }

    get(actionId) {
        const action = this.#actionMap.get(String(actionId ?? "").trim());
        return action ? cloneAction(action) : null;
    }

    getAll() {
        return this.#actions.map(cloneAction);
    }

    getApplicableActions({ panelId = "", isGM = false } = {}) {
        const activePanelId = normalizePanelContextId(panelId);
        return this.#actions
            .filter((action) => this.#isActionAllowed(action, { panelId: activePanelId, isGM }))
            .sort((a, b) => b.relevance - a.relevance || a.label.localeCompare(b.label))
            .map(cloneAction);
    }

    #isActionAllowed(action, { panelId, isGM }) {
        if (action.requiredRole === "gm" && !isGM) return false;
        if (!panelId) return action.contexts.includes("*");
        return action.contexts.includes("*") || action.contexts.includes(panelId);
    }
}

export const DEFAULT_DESIGN_ACTION_REGISTRY = new WorkspaceDesignActionRegistry();
