import { buildEncounterPlanner } from "../encounters/planner-context.mjs";
import {
    ADVERSARY_PROFILES,
    FACTION_METADATA,
    TERRAIN_FEATURES,
    ESCALATION_TRIGGERS,
    instantiateEncounterSeed,
    getEscalationTrigger,
    getTerrainFeature,
    getNarrativeHooks,
    getFactionMetadata,
    rollLoot,
    buildEncounterContext
} from "../encounters/enhanced-seeds.mjs";
import { createCombatEncounterWithNpcs, getNpcDetails } from "../encounters/npc-instantiation.mjs";
import { TotcTabGroupManager, TabGroupConsoleAPI } from "./tab-group-manager.mjs";
import {
    rollRegionAwareCampEvent,
    getDetailedCampEventReport,
    CAMP_SEASONS,
    REGIONS
} from "../camps/region-aware-events.mjs";

const UI_MODES = Object.freeze({
    DESIGN: "design",
    PLAY: "play"
});

const UI_CONTEXTS = Object.freeze({
    TRAVEL: "travel",
    ENCOUNTER: "encounter",
    MARKET: "market",
    CAMP: "camp"
});

const PLAY_ALLOWED_CONTEXTS = new Set(Object.values(UI_CONTEXTS));

const BLOCKED_WINDOW_APP_NAMES = new Set([
    "ActorSheet",
    "ItemSheet",
    "CombatTracker",
    "JournalSheet",
    "RollTableSheet",
    "Compendium",
    "CompendiumDirectory",
    "JournalPageSheet",
    "SceneConfig",
    "TokenConfig",
    "MeasuredTemplateConfig",
    "DrawingConfig",
    "TileConfig",
    "AmbientLightConfig",
    "AmbientSoundConfig",
    "WallConfig",
    "SettingsConfig",
    "UserConfig",
    "PlaylistConfig",
    "MacroConfig",
    "RollTableConfig"
]);

const BLOCKED_WINDOW_ID_FRAGMENTS = [
    "sheet",
    "compendium",
    "journal",
    "rolltable",
    "config",
    "macro",
    "playlist"
];

const ALLOWED_WINDOW_APP_NAMES = new Set([
    "Dialog",
    "DialogV2",
    "Prompt"
]);

function getApplicationV2BaseClass() {
    return globalThis?.foundry?.applications?.api?.ApplicationV2 ?? null;
}

function getDialogV2BaseClass() {
    return globalThis?.foundry?.applications?.api?.DialogV2 ?? null;
}

function getDialogV1BaseClass() {
    return globalThis?.foundry?.appv1?.api?.Dialog ?? globalThis?.Dialog ?? null;
}

function isDialogApp(app) {
    if (!app) return false;

    const DialogV2Base = getDialogV2BaseClass();
    if (DialogV2Base && app instanceof DialogV2Base) return true;

    const DialogV1Base = getDialogV1BaseClass();
    if (DialogV1Base && app instanceof DialogV1Base) return true;

    const ctorName = String(app.constructor?.name ?? "");
    return ctorName.includes("Dialog");
}

function getAppIdentifiers(app) {
    return {
        id: String(app?.id ?? app?.appId ?? "").toLowerCase(),
        constructorName: String(app?.constructor?.name ?? "")
    };
}

function isFloatingWindowCandidate(app) {
    if (!app) return false;

    return Boolean(
        app.options?.popOut === true
        || app.options?.window?.frame === true
        || app.options?.window?.positioned === true
        || app.hasFrame === true
    );
}

function isAllowedPromptLikeWindow(app) {
    if (!app) return false;
    if (isDialogApp(app)) return true;

    const { constructorName } = getAppIdentifiers(app);
    if (ALLOWED_WINDOW_APP_NAMES.has(constructorName)) return true;
    if (constructorName.includes("Prompt")) return true;
    if (app.options?.window?.modal === true) return true;

    return false;
}

function isExplicitlyBlockedWindow(app) {
    if (!app) return false;

    const { id, constructorName } = getAppIdentifiers(app);
    if (BLOCKED_WINDOW_APP_NAMES.has(constructorName)) return true;

    const lowerCtor = constructorName.toLowerCase();
    if (lowerCtor.endsWith("sheet") || lowerCtor.endsWith("config")) return true;

    return BLOCKED_WINDOW_ID_FRAGMENTS.some((fragment) => id.includes(fragment));
}

function normalizeContext(value, fallback = UI_CONTEXTS.TRAVEL) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (PLAY_ALLOWED_CONTEXTS.has(normalized)) return normalized;
    return fallback;
}

function titleCase(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return "";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function resolveWorkspaceActorToken() {
    const controlledToken = canvas?.tokens?.controlled?.[0] ?? null;
    if (controlledToken?.actor) {
        return {
            actor: controlledToken.actor,
            tokenDocument: controlledToken.document
        };
    }

    if (game.user?.character) {
        return {
            actor: game.user.character,
            tokenDocument: null
        };
    }

    const combatant = game.combat?.combatant ?? null;
    if (combatant?.actor) {
        return {
            actor: combatant.actor,
            tokenDocument: combatant.token ?? null
        };
    }

    return {
        actor: null,
        tokenDocument: null
    };
}

function getControlledActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? null;
}

function readSelectedAction(selectElement) {
    const selectedOption = selectElement?.selectedOptions?.[0];
    if (!selectedOption) return null;

    return {
        id: selectedOption.dataset.id,
        actionId: selectedOption.dataset.actionId,
        type: selectedOption.dataset.type,
        label: selectedOption.dataset.label,
        apCost: Number(selectedOption.dataset.apCost || 1),
        apMin: Number(selectedOption.dataset.apMin || selectedOption.dataset.apCost || 1),
        apMax: Number(selectedOption.dataset.apMax || selectedOption.dataset.apCost || 1),
        variableAp: selectedOption.dataset.variableAp === "true",
        requiresToHit: selectedOption.dataset.requiresToHit === "true",
        toHitBonus: Number(selectedOption.dataset.toHitBonus || 0),
        movementFeet: Number(selectedOption.dataset.movementFeet || 0),
        movementFeetPerAp: Number(selectedOption.dataset.movementFeetPerAp || 0),
        itemId: selectedOption.dataset.itemId || null,
        img: selectedOption.dataset.img || null,
        targetId: null
    };
}

function finalizeActionData(actionData, apCost, targetId) {
    const min = Math.max(1, Number(actionData.apMin || 1));
    const max = Math.max(min, Number(actionData.apMax || min));
    const cost = Math.max(min, Math.min(max, Number(apCost) || min));
    const result = { ...actionData, apCost: cost, targetId: targetId || null };
    if (result.type === "movement") {
        const feetPerAp = Number(result.movementFeetPerAp || 10);
        result.movementFeet = feetPerAp * cost;
    }
    return result;
}

const WORKSPACE_FLAG_SCOPE = "workspace";
const DEFAULT_TRAVEL_STATE = Object.freeze({
    day: 1,
    watch: 1,
    pace: "standard",
    weather: "clear",
    milesCovered: 0,
    lastEvent: "",
    region: "frontier"
});
const TRAVEL_WEATHER_STATES = ["clear", "rain", "fog", "storm"];
const TRAVEL_REGIONS = ["frontier", "urban", "industrial", "wilds"];
const TRAVEL_EVENT_TABLES = Object.freeze({
    frontier: [
        { min: 1, max: 7, outcome: "quiet", description: "Quiet roads. The party makes steady progress." },
        { min: 8, max: 12, outcome: "delay", description: "Rutted wagon trails force a slower approach." },
        { min: 13, max: 16, outcome: "opportunity", description: "A local guide marks a safer route ahead." },
        { min: 17, max: 20, outcome: "encounter", description: "Hostile scouts close in on the convoy path." }
    ],
    urban: [
        { min: 1, max: 7, outcome: "quiet", description: "Street patrol routes remain calm and orderly." },
        { min: 8, max: 12, outcome: "delay", description: "Checkpoint inspections delay your crossing." },
        { min: 13, max: 16, outcome: "opportunity", description: "A civic contact shares a useful shortcut." },
        { min: 17, max: 20, outcome: "encounter", description: "A rival faction stages an ambush in narrow streets." }
    ],
    industrial: [
        { min: 1, max: 7, outcome: "quiet", description: "Factory roads are clear and traffic remains light." },
        { min: 8, max: 12, outcome: "delay", description: "Rail congestion causes a schedule bottleneck." },
        { min: 13, max: 16, outcome: "opportunity", description: "A rail foreman secures priority passage." },
        { min: 17, max: 20, outcome: "encounter", description: "Saboteurs strike near a critical junction." }
    ],
    wilds: [
        { min: 1, max: 7, outcome: "quiet", description: "No signs of trouble in the untamed routes." },
        { min: 8, max: 12, outcome: "delay", description: "Fog and rough terrain split the marching line." },
        { min: 13, max: 16, outcome: "opportunity", description: "Fresh tracks reveal useful game and clean water." },
        { min: 17, max: 20, outcome: "encounter", description: "Predatory movement forces immediate battle readiness." }
    ]
});
const ENCOUNTER_SEED_TEMPLATES = Object.freeze({
    frontier: [
        {
            id: "frontier-raiders",
            title: "Roadside Raiders",
            objective: "Protect the caravan and break the ambush line.",
            adversaries: ["Bandit Lookout", "Bandit Rifleman", "Mounted Cutthroat"],
            terrain: "Broken ridgeline with wagon cover.",
            escalationHint: "Reinforcement horn after 3 rounds if not silenced."
        },
        {
            id: "frontier-beasts",
            title: "Predator Pack",
            objective: "Drive off the pack before they scatter supplies.",
            adversaries: ["Dire Hound", "Alpha Stalker"],
            terrain: "Narrow pass with low-visibility brush.",
            escalationHint: "A second pack emerges from the rear if noise escalates."
        }
    ],
    urban: [
        {
            id: "urban-rival-cell",
            title: "Rival Cell Intercept",
            objective: "Secure the courier and avoid civilian panic.",
            adversaries: ["Street Enforcer", "Lookout", "Saboteur"],
            terrain: "Dense alleys with elevated rooftops.",
            escalationHint: "City watch arrives on round 4 unless bribed or signaled."
        },
        {
            id: "urban-riot-breakout",
            title: "Riot Breakout",
            objective: "Extract allies through a hostile crowd surge.",
            adversaries: ["Agitator", "Militia Skirmisher"],
            terrain: "Crowded market square and barricaded lanes.",
            escalationHint: "Fire spreads each round, reducing safe zones."
        }
    ],
    industrial: [
        {
            id: "industrial-saboteurs",
            title: "Rail Sabotage Team",
            objective: "Secure the switching station before detonation.",
            adversaries: ["Saboteur Engineer", "Guard Gunner"],
            terrain: "Rail yard with catwalks and steam vents.",
            escalationHint: "Boiler pressure vents create hazard zones on round 3."
        },
        {
            id: "industrial-strikebreakers",
            title: "Strikebreaker Clash",
            objective: "Control the chokepoint and protect worker leaders.",
            adversaries: ["Strikebreaker", "Foreman Brute"],
            terrain: "Factory gate with heavy machinery cover.",
            escalationHint: "A loading crane can collapse if hit repeatedly."
        }
    ],
    wilds: [
        {
            id: "wilds-nest",
            title: "Nest Disturbance",
            objective: "Contain hostile fauna and secure retreat path.",
            adversaries: ["Feral Stalker", "Brood Matriarch"],
            terrain: "Rocky basin with unstable ledges.",
            escalationHint: "Egg clusters hatch if combat exceeds 5 rounds."
        },
        {
            id: "wilds-pursuit",
            title: "Predator Pursuit",
            objective: "Outmaneuver pursuing hunters and avoid encirclement.",
            adversaries: ["Pack Hunter", "Tracker Alpha"],
            terrain: "Foggy treeline and shallow marsh channels.",
            escalationHint: "Visibility drops each round unless signal flares are used."
        }
    ]
});
const MARKET_PRICE_MODIFIERS = Object.freeze({
    standard: 1,
    favorable: 0.85,
    scarce: 1.25
});
const LEGACY_MERCHANT_ROLE_FLAG = "merchantRole";
const LEGACY_WALLET_FLAG = "wallet";
const DEFAULT_MARKET_STATE = Object.freeze({
    treasuryGbp: 0,
    splitMode: "buyer"
});
const BUYBACK_RATE = 0.5;
const UI_DEBUG_WINDOW_POLICY_SETTING = "uiDebugWindowPolicy";
const TRAVEL_ENCOUNTER_SEED_POLICY_SETTING = "travelEncounterSeedPolicy";
const ENCOUNTER_SEED_POLICIES = Object.freeze({
    APPEND: "append",
    RESET: "reset",
    REPLACE: "replace"
});
const DEFAULT_CAMP_STATE = Object.freeze({
    day: 1,
    morale: "normal",
    supplies: 10,
    water: 10,
    firewood: 5,
    lastEvent: "",
    currentActivity: "rest"
});
const CAMP_ACTIVITIES = Object.freeze({
    REST: "rest",
    PREPARE: "prepare",
    SCOUT: "scout",
    TRAIN: "train",
    FORAGE: "forage"
});
const CAMP_MORALE_STATES = ["low", "normal", "high"];
const CAMP_EVENT_OUTCOMES = Object.freeze({
    low: [
        { min: 1, max: 8, outcome: "quarrel", description: "Party members bicker over camp chores and rations." },
        { min: 9, max: 15, outcome: "watchfall", description: "A sentry falls asleep; hazard nearly breaches perimeter." },
        { min: 16, max: 20, outcome: "sickness", description: "A party member develops a fever from tainted water." }
    ],
    normal: [
        { min: 1, max: 6, outcome: "uneventful", description: "A quiet night with routine watch rotations." },
        { min: 7, max: 13, outcome: "wildlife", description: "Nocturnal creatures skirt the perimeter, then fade." },
        { min: 14, max: 18, outcome: "discovery", description: "Scouts find a cache of abandoned supplies nearby." },
        { min: 19, max: 20, outcome: "threat", description: "A distant campfire is spotted on the horizon." }
    ],
    high: [
        { min: 1, max: 5, outcome: "bonding", description: "Tales and song strengthen party resolve." },
        { min: 6, max: 12, outcome: "preparation", description: "Team spends evening sharpening gear and refining tactics." },
        { min: 13, max: 18, outcome: "opportunity", description: "A traveling merchant passes through with rare goods." },
        { min: 19, max: 20, outcome: "reinforcement", description: "A friendly scout arrives with intel about the route ahead." }
    ]
});

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getWorkspaceScene() {
    return canvas?.scene ?? game.scenes?.current ?? null;
}

function getWorkspaceState(scene) {
    return foundry.utils.deepClone(scene?.getFlag("turn-of-the-century", WORKSPACE_FLAG_SCOPE) ?? {});
}

function hasMerchantRole(actor) {
    if (!actor) return false;
    if (Boolean(actor.system?.economy?.isMerchant)) return true;
    if (Boolean(actor.getFlag("turn-of-the-century", LEGACY_MERCHANT_ROLE_FLAG))) return true;

    const tags = actor.system?.profile?.tags ?? [];
    return Array.isArray(tags) && tags.includes("merchant");
}

function getWalletState(actor, fallbackGbp = 0) {
    const wallet = foundry.utils.deepClone(actor?.system?.economy?.wallet ?? actor?.getFlag("turn-of-the-century", LEGACY_WALLET_FLAG) ?? {});
    return {
        gbp: Math.max(0, toNumber(wallet.gbp, fallbackGbp))
    };
}

async function setWalletState(actor, walletPatch = {}) {
    if (!actor) return;
    const current = getWalletState(actor, 0);
    const next = foundry.utils.mergeObject(current, walletPatch, { inplace: false, recursive: true });
    next.gbp = Math.max(0, Math.round(toNumber(next.gbp, 0) * 100) / 100);
    await actor.update({
        "system.economy.wallet.gbp": next.gbp
    });
}

async function adjustWalletBalance(actor, delta, fallback = 0) {
    if (!actor) return 0;
    const wallet = getWalletState(actor, fallback);
    const next = Math.max(0, Math.round((wallet.gbp + toNumber(delta, 0)) * 100) / 100);
    await setWalletState(actor, { gbp: next });
    return next;
}

function getActorById(id) {
    return id ? game.actors?.get(id) ?? null : null;
}

function getEncounterSeedPolicy() {
    const raw = String(game.settings?.get("turn-of-the-century", TRAVEL_ENCOUNTER_SEED_POLICY_SETTING) ?? ENCOUNTER_SEED_POLICIES.APPEND).toLowerCase();
    if (raw === ENCOUNTER_SEED_POLICIES.RESET) return ENCOUNTER_SEED_POLICIES.RESET;
    if (raw === ENCOUNTER_SEED_POLICIES.REPLACE) return ENCOUNTER_SEED_POLICIES.REPLACE;
    return ENCOUNTER_SEED_POLICIES.APPEND;
}

function pickEncounterSeed(region) {
    const key = TRAVEL_REGIONS.includes(String(region ?? "")) ? String(region) : DEFAULT_TRAVEL_STATE.region;
    const templates = ENCOUNTER_SEED_TEMPLATES[key] ?? ENCOUNTER_SEED_TEMPLATES.frontier;
    const index = Math.floor(Math.random() * templates.length);
    const seed = templates[index] ?? templates[0];
    return foundry.utils.deepClone(seed);
}

function getLikelyPartyTokenDocuments(scene) {
    const controlled = canvas?.tokens?.controlled?.map((token) => token.document).filter(Boolean) ?? [];
    if (controlled.length) return controlled;

    const characterActorId = game.user?.character?.id;
    if (characterActorId) {
        const characterTokens = (scene?.tokens?.contents ?? []).filter((token) => token.actorId === characterActorId);
        if (characterTokens.length) return characterTokens;
    }

    const heroTokens = (scene?.tokens?.contents ?? []).filter((token) => {
        const actor = token.actor;
        const actorType = String(actor?.type ?? "").toLowerCase();
        return actorType === "hero";
    });
    if (heroTokens.length) return heroTokens;

    return (scene?.tokens?.contents ?? []).filter((token) => Number(token.disposition ?? 0) >= 0);
}

function buildSeededCombatants(scene, template) {
    const combatants = [];
    const seen = new Set();

    const pushCombatant = ({ tokenId = null, actorId = null }) => {
        const key = `${tokenId ?? "none"}:${actorId ?? "none"}`;
        if (seen.has(key)) return;
        seen.add(key);

        combatants.push({
            tokenId,
            actorId,
            sceneId: scene?.id ?? null,
            hidden: false
        });
    };

    for (const token of getLikelyPartyTokenDocuments(scene)) {
        pushCombatant({ tokenId: token.id, actorId: token.actorId ?? token.actor?.id ?? null });
    }

    for (const adversaryName of template?.adversaries ?? []) {
        const matchingActor = (game.actors?.contents ?? []).find((actor) => String(actor.name ?? "").toLowerCase() === String(adversaryName).toLowerCase()) ?? null;
        const actorId = matchingActor?.id ?? null;
        const sceneToken = (scene?.tokens?.contents ?? []).find((token) => token.actorId === actorId) ?? null;

        if (sceneToken) {
            pushCombatant({ tokenId: sceneToken.id, actorId: actorId ?? sceneToken.actor?.id ?? null });
            continue;
        }

        if (actorId) {
            pushCombatant({ actorId });
        }
    }

    return combatants;
}

async function ensureSeededEncounterFromTravelPayload(payload = {}) {
    if (!game.user?.isGM) return null;

    const seed = payload?.encounterSeed?.template ?? null;
    if (!seed) return null;

    const scene = getWorkspaceScene();
    if (!scene) return null;

    const policy = getEncounterSeedPolicy();
    const sceneCombats = (game.combats?.contents ?? []).filter((entry) => entry.scene?.id === scene.id);
    const activeSceneCombat = sceneCombats.find((entry) => entry.active) ?? null;

    let combat = game.combat?.scene?.id === scene.id ? game.combat : activeSceneCombat;

    if (policy === ENCOUNTER_SEED_POLICIES.REPLACE) {
        for (const existing of sceneCombats) {
            if (existing.active) {
                await existing.update({ active: false });
            }
        }

        combat = await Combat.create({
            scene: scene.id,
            active: true
        });
    } else {
        if (!combat) {
            combat = sceneCombats[0] ?? null;
        }

        if (!combat) {
            combat = await Combat.create({
                scene: scene.id,
                active: true
            });
        } else if (!combat.active) {
            await combat.update({ active: true });
        }

        if (policy === ENCOUNTER_SEED_POLICIES.RESET) {
            const combatantIds = (combat.combatants?.contents ?? []).map((entry) => entry.id).filter(Boolean);
            if (combatantIds.length) {
                await combat.deleteEmbeddedDocuments("Combatant", combatantIds);
            }
        }
    }

    const existingKeys = new Set(
        (combat.combatants?.contents ?? []).map((combatant) => `${combatant.tokenId ?? "none"}:${combatant.actorId ?? combatant.actor?.id ?? "none"}`)
    );
    const plannedCombatants = buildSeededCombatants(scene, seed)
        .filter((entry) => {
            const key = `${entry.tokenId ?? "none"}:${entry.actorId ?? "none"}`;
            return !existingKeys.has(key);
        });

    if (plannedCombatants.length) {
        await combat.createEmbeddedDocuments("Combatant", plannedCombatants);
    }

    // Auto-create NPCs from encounter seed if enabled
    const autoCreateNpcs = game.settings?.get("turn-of-the-century", "AUTO_CREATE_ENCOUNTER_NPCS_SETTING") ?? true;
    if (autoCreateNpcs && seed?.adversaries && Array.isArray(seed.adversaries) && seed.adversaries.length > 0) {
        try {
            const npcDifficulty = String(payload?.difficulty ?? "standard");
            const npcResult = await createCombatEncounterWithNpcs(seed, npcDifficulty, combat);
            if (npcResult?.actors && npcResult.actors.length > 0) {
                // Log created NPCs to chat
                const npcSummary = npcResult.actors
                    .map((a) => {
                        const details = getNpcDetails(a);
                        return `${details.name} (${details.role} - HP ${details.health.max})`;
                    })
                    .join(", ");

                await ChatMessage.create({
                    content: `<div class="totc-encounter-npcs"><strong>Encounter NPCs:</strong> ${escapeHTML(npcSummary)}</div>`,
                    flags: { "turn-of-the-century": { npcSummary: true } }
                }).catch(() => null);
            }
        } catch (err) {
            console.error("[ensureSeededEncounter] NPC creation failed:", err);
        }
    }

    // Build enhanced seed context with all metadata
    const region = String(payload?.region ?? "frontier");
    const encounterContext = buildEncounterContext(seed, region);

    // Store comprehensive encounter data in combat flags
    const seedFlag = {
        ...payload,
        template: seed,
        policy,
        seededAt: Date.now(),
        // Enhanced seed data
        context: {
            region,
            difficulty: encounterContext.difficulty,
            factionKey: encounterContext.faction?.name,
            terrain: encounterContext.terrain?.name,
            escalationTrigger: encounterContext.escalation?.name
        },
        escalation: encounterContext.escalation ? {
            name: encounterContext.escalation.name,
            trigger: encounterContext.escalation.triggerCondition,
            effect: encounterContext.escalation.effect,
            counterplay: encounterContext.escalation.counterplay
        } : null,
        faction: encounterContext.faction ? {
            name: encounterContext.faction.name,
            objective: encounterContext.faction.objective,
            alignment: encounterContext.faction.alignment,
            cruelty: encounterContext.faction.cruelty
        } : null,
        terrain: encounterContext.terrain ? {
            name: encounterContext.terrain.name,
            coverBonus: encounterContext.terrain.coverBonus,
            mobilityPenalty: encounterContext.terrain.mobilityPenalty,
            features: encounterContext.terrain.features,
            hazards: encounterContext.terrain.hazards
        } : null,
        narrative: encounterContext.narrative ? {
            preEncounter: encounterContext.narrative.preEncounter,
            combat: encounterContext.narrative.combat,
            victory: encounterContext.narrative.victory,
            defeat: encounterContext.narrative.defeat
        } : null,
        loot: encounterContext.loot
    };

    await combat.setFlag("turn-of-the-century", "travelEncounterSeed", seedFlag);

    // Optional: log narrative pre-encounter hook to chat
    if (encounterContext.narrative?.preEncounter) {
        await ChatMessage.create({
            content: `<div class="totc-encounter-narrative"><em>${escapeHTML(encounterContext.narrative.preEncounter)}</em></div>`,
            flags: { "turn-of-the-century": { narrativeHook: true } }
        }).catch(() => null);
    }

    if (typeof combat.initializeEncounterRound === "function") {
        await combat.initializeEncounterRound({ phase: "planning" });
    }

    return combat;
}

function getSplitModeLabel(mode) {
    if (mode === "party") return "Party Treasury";
    if (mode === "split") return "Split (50/50)";
    return "Buyer Wallet";
}

function getMarketState(scene) {
    const state = getWorkspaceState(scene);
    return {
        ...DEFAULT_MARKET_STATE,
        ...(state.market ?? {})
    };
}

function calculateFundingBreakdown(total, splitMode, buyerFunds, treasuryFunds) {
    const amount = Math.max(0, Math.round(toNumber(total, 0) * 100) / 100);
    const mode = String(splitMode ?? "buyer");

    if (mode === "party") {
        return {
            buyerPortion: 0,
            treasuryPortion: amount,
            affordable: treasuryFunds >= amount
        };
    }

    if (mode === "split") {
        const treasuryPortion = Math.round((amount / 2) * 100) / 100;
        const buyerPortion = Math.round((amount - treasuryPortion) * 100) / 100;
        return {
            buyerPortion,
            treasuryPortion,
            affordable: buyerFunds >= buyerPortion && treasuryFunds >= treasuryPortion
        };
    }

    return {
        buyerPortion: amount,
        treasuryPortion: 0,
        affordable: buyerFunds >= amount
    };
}

async function updateWorkspaceState(patch) {
    const scene = getWorkspaceScene();
    if (!scene) return null;

    const current = getWorkspaceState(scene);
    const next = foundry.utils.mergeObject(current, patch, { inplace: false, recursive: true });
    await scene.setFlag("turn-of-the-century", WORKSPACE_FLAG_SCOPE, next);
    return next;
}

function getActorRationCount(actor) {
    if (!actor) return 0;
    const rationItems = actor.items.filter((item) => {
        const name = String(item.name ?? "").toLowerCase();
        const tags = item.system?.properties?.tags ?? [];
        return item.type === "consumable" && (name.includes("ration") || name.includes("provision") || tags.includes("ration"));
    });

    return rationItems.reduce((total, item) => total + Math.max(0, toNumber(item.system?.physical?.quantity, 1)), 0);
}

function buildTravelPanelContext(actor) {
    const scene = getWorkspaceScene();
    const state = getWorkspaceState(scene);
    const travel = { ...DEFAULT_TRAVEL_STATE, ...(state.travel ?? {}) };
    const region = TRAVEL_REGIONS.includes(String(travel.region ?? ""))
        ? String(travel.region)
        : DEFAULT_TRAVEL_STATE.region;
    const survivalBonus = toNumber(actor?.system?.skills?.survival?.value, 0);
    const perceptionBonus = toNumber(actor?.system?.skills?.perception?.value, 0);

    return {
        sceneName: scene?.name ?? "No Active Scene",
        day: Math.max(1, toNumber(travel.day, 1)),
        watch: Math.max(1, toNumber(travel.watch, 1)),
        pace: String(travel.pace ?? "standard"),
        region,
        weather: String(travel.weather ?? "clear"),
        milesCovered: Math.max(0, toNumber(travel.milesCovered, 0)),
        leaderName: actor?.name ?? "No party leader selected",
        survivalBonus,
        perceptionBonus,
        rationCount: getActorRationCount(actor),
        lastEvent: String(travel.lastEvent ?? ""),
        lastEncounterSeed: travel.lastEncounterSeed ?? null
    };
}

function getCandidateMerchants(primaryActor) {
    const combatantActors = (canvas?.tokens?.placeables ?? [])
        .map((token) => token.actor)
        .filter((actor) => actor && actor.id !== primaryActor?.id);
    const worldActors = (game.actors?.contents ?? []).filter((actor) => actor.id !== primaryActor?.id);
    const unique = new Map();

    for (const actor of [...combatantActors, ...worldActors]) {
        if (!actor) continue;
        if (!hasMerchantRole(actor)) continue;
        if (!actor.items?.size) continue;
        unique.set(actor.id, actor);
    }

    return [...unique.values()].sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function getPriceModifierLabel(value) {
    const key = String(value ?? "standard");
    if (key === "favorable") return "Favorable (-15%)";
    if (key === "scarce") return "Scarce (+25%)";
    return "Standard (0%)";
}

function buildMarketPanelContext(actor) {
    const scene = getWorkspaceScene();
    const marketState = getMarketState(scene);
    const merchants = getCandidateMerchants(actor);
    const selectedMerchantId = marketState.merchantActorId && merchants.some((merchant) => merchant.id === marketState.merchantActorId)
        ? marketState.merchantActorId
        : merchants[0]?.id ?? "";
    const merchant = selectedMerchantId ? game.actors?.get(selectedMerchantId) ?? null : null;
    const marketItems = (merchant?.items?.contents ?? []).filter((item) => {
        if (!["item", "weapon", "armor", "consumable", "equipment", "tool"].includes(item.type)) return false;
        return toNumber(item.system?.physical?.quantity, 1) > 0;
    });

    const selectedItemId = marketState.itemId && marketItems.some((item) => item.id === marketState.itemId)
        ? marketState.itemId
        : marketItems[0]?.id ?? "";
    const selectedItem = selectedItemId ? merchant?.items?.get(selectedItemId) ?? null : null;
    const quantity = Math.max(1, toNumber(marketState.quantity, 1));
    const buyerItems = (actor?.items?.contents ?? []).filter((item) => {
        if (!["item", "weapon", "armor", "consumable", "equipment", "tool"].includes(item.type)) return false;
        return toNumber(item.system?.physical?.quantity, 1) > 0;
    });
    const selectedSaleItemId = marketState.saleItemId && buyerItems.some((item) => item.id === marketState.saleItemId)
        ? marketState.saleItemId
        : buyerItems[0]?.id ?? "";
    const selectedSaleItem = selectedSaleItemId ? actor?.items?.get(selectedSaleItemId) ?? null : null;
    const saleQuantity = Math.max(1, toNumber(marketState.saleQuantity, 1));
    const modifier = MARKET_PRICE_MODIFIERS[String(marketState.priceModifier)]
        ? String(marketState.priceModifier)
        : "standard";

    const basePrice = Math.max(0, toNumber(selectedItem?.system?.value?.price, 0));
    const totalPrice = Math.round(basePrice * quantity * MARKET_PRICE_MODIFIERS[modifier] * 100) / 100;
    const saleBasePrice = Math.max(0, toNumber(selectedSaleItem?.system?.value?.price, 0));
    const saleTotal = Math.round(saleBasePrice * saleQuantity * BUYBACK_RATE * 100) / 100;

    const buyerFunds = getWalletState(actor, 100).gbp;
    const treasuryFunds = Math.max(0, toNumber(marketState.treasuryGbp, 0));
    const splitMode = ["buyer", "party", "split"].includes(String(marketState.splitMode ?? "buyer"))
        ? String(marketState.splitMode)
        : "buyer";
    const merchantFunds = getWalletState(merchant, 500).gbp;
    const funding = calculateFundingBreakdown(totalPrice, splitMode, buyerFunds, treasuryFunds);
    const canAffordBuy = funding.affordable;
    const canMerchantAffordSale = merchantFunds >= saleTotal;

    return {
        buyerName: actor?.name ?? "No buyer selected",
        buyer: actor ?? null,
        buyerId: actor?.id ?? "",
        isGm: Boolean(game.user?.isGM),
        buyerFunds,
        treasuryFunds,
        merchantFunds,
        splitMode,
        splitModeLabel: getSplitModeLabel(splitMode),
        funding,
        canAffordBuy,
        canMerchantAffordSale,
        merchants: merchants.map((entry) => ({ id: entry.id, name: entry.name })),
        merchant,
        marketItems,
        buyerItems,
        selectedMerchantId,
        selectedItemId,
        selectedItem,
        quantity,
        modifier,
        modifierLabel: getPriceModifierLabel(modifier),
        totalPrice,
        basePrice,
        selectedSaleItemId,
        selectedSaleItem,
        saleQuantity,
        saleTotal,
        saleBasePrice
    };
}

async function addItemToActorInventory(actor, sourceItem, quantity) {
    if (!actor || !sourceItem || quantity <= 0) return;

    const existing = actor.items.find((item) => item.type === sourceItem.type && item.name === sourceItem.name);
    if (existing) {
        const current = Math.max(0, toNumber(existing.system?.physical?.quantity, 1));
        await existing.update({ "system.physical.quantity": current + quantity });
        return;
    }

    const itemData = sourceItem.toObject();
    itemData.system ??= {};
    itemData.system.physical ??= {};
    itemData.system.physical.quantity = quantity;
    delete itemData._id;
    await actor.createEmbeddedDocuments("Item", [itemData]);
}

async function removeItemQuantity(item, quantity) {
    if (!item || quantity <= 0) return;
    const current = Math.max(0, toNumber(item.system?.physical?.quantity, 1));
    const next = Math.max(0, current - quantity);
    if (next <= 0) {
        await item.delete();
        return;
    }

    await item.update({ "system.physical.quantity": next });
}

function buildCampPanelContext(actor) {
    const scene = getWorkspaceScene();
    const state = getWorkspaceState(scene);
    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
    const morale = CAMP_MORALE_STATES.includes(String(camp.morale ?? ""))
        ? String(camp.morale)
        : "normal";

    return {
        sceneName: scene?.name ?? "No Active Scene",
        day: Math.max(1, toNumber(camp.day, 1)),
        morale,
        region: String(camp.region ?? "frontier"),
        season: String(camp.season ?? "summer"),
        supplies: Math.max(0, toNumber(camp.supplies, 10)),
        water: Math.max(0, toNumber(camp.water, 10)),
        firewood: Math.max(0, toNumber(camp.firewood, 5)),
        currentActivity: String(camp.currentActivity ?? "rest"),
        lastEvent: String(camp.lastEvent ?? ""),
        leaderName: actor?.name ?? "No party leader selected",
        actorId: actor?.id ?? ""
    };
}

function renderEncounterPanel(encounterPlanner) {
    if (!encounterPlanner) {
        return `
<section class="totc-workspace-encounter">
    <h3>Encounter Panel</h3>
    <p>No active encounter context is available for your current actor.</p>
</section>`;
    }

    const actionOptions = (encounterPlanner.availableActions ?? [])
        .map((action) => {
            const variableTag = action.variableAp ? ` (${action.apMin}-${action.apMax} AP)` : ` (${action.apCost} AP)`;
            return `<option
                value="${escapeHTML(action.id)}"
                data-id="${escapeHTML(action.id)}"
                data-action-id="${escapeHTML(action.actionId)}"
                data-type="${escapeHTML(action.type)}"
                data-label="${escapeHTML(action.label)}"
                data-ap-cost="${escapeHTML(action.apCost)}"
                data-ap-min="${escapeHTML(action.apMin)}"
                data-ap-max="${escapeHTML(action.apMax)}"
                data-variable-ap="${escapeHTML(Boolean(action.variableAp))}"
                data-requires-to-hit="${escapeHTML(Boolean(action.requiresToHit))}"
                data-to-hit-bonus="${escapeHTML(action.toHitBonus ?? 0)}"
                data-item-id="${escapeHTML(action.itemId ?? "")}" 
                data-movement-feet="${escapeHTML(action.movementFeet ?? 0)}"
                data-movement-feet-per-ap="${escapeHTML(action.movementFeetPerAp ?? 0)}"
                data-img="${escapeHTML(action.img ?? "")}">
                ${escapeHTML(action.label)}${escapeHTML(variableTag)}
            </option>`;
        })
        .join("");

    const targetOptions = (encounterPlanner.targetOptions ?? [])
        .map((target) => `<option value="${escapeHTML(target.id)}">${escapeHTML(target.name)}</option>`)
        .join("");

    const queueRows = (encounterPlanner.queue ?? [])
        .map((action, index) => {
            const targetText = action.targetId ? ` target=${escapeHTML(action.targetId)}` : "";
            return `<li>
                <span>${escapeHTML(action.label)} (${escapeHTML(action.apCost)} AP${targetText})</span>
                <button type="button" data-action="encounter-remove-action" data-action-index="${index}" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}" ${encounterPlanner.canEditPlan ? "" : "disabled"}>Remove</button>
            </li>`;
        })
        .join("");

    return `
<section class="totc-workspace-encounter" data-combat-id="${escapeHTML(encounterPlanner.combatId)}" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}">
    <header class="totc-workspace-encounter__header">
        <h3>${escapeHTML(encounterPlanner.encounterName)} - Round ${escapeHTML(encounterPlanner.round)}</h3>
        <div>Phase: ${escapeHTML(encounterPlanner.phase)} | AP: ${escapeHTML(encounterPlanner.plannedAp)}/${escapeHTML(encounterPlanner.apBudget)} | Time Left: ${escapeHTML(encounterPlanner.planningTimeDisplay)}</div>
    </header>

    <div class="totc-workspace-encounter__gm-controls">
        <button type="button" data-action="encounter-init-round">Initialize Round</button>
        <button type="button" data-action="encounter-roll-all-initiative">Roll Missing Initiative</button>
        <button type="button" data-action="encounter-resolve-round">Resolve Round</button>
    </div>

    <div class="totc-workspace-encounter__editor" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}">
        <select class="totc-workspace-encounter__action-select">
            ${actionOptions}
        </select>
        <input class="totc-workspace-encounter__ap-input" type="number" min="1" value="1" step="1" ${encounterPlanner.canEditPlan ? "" : "disabled"} />
        <select class="totc-workspace-encounter__target-select">
            <option value="">No target</option>
            ${targetOptions}
        </select>
        <button type="button" data-action="encounter-add-action" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}" ${encounterPlanner.canEditPlan ? "" : "disabled"}>Add Action</button>
        ${encounterPlanner.canRollInitiative ? `<button type="button" data-action="encounter-roll-initiative" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}">Roll Initiative</button>` : ""}
    </div>

    <div class="totc-workspace-encounter__queue">
        <h4>Planned Actions</h4>
        <ul>
            ${queueRows || "<li>No planned actions</li>"}
        </ul>
    </div>

    <footer class="totc-workspace-encounter__footer">
        <button type="button" data-action="encounter-clear-plan" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}" ${encounterPlanner.canEditPlan ? "" : "disabled"}>Clear Actions</button>
        <button type="button" data-action="encounter-toggle-ready" data-combatant-id="${escapeHTML(encounterPlanner.combatantId)}" data-ready="${escapeHTML(encounterPlanner.ready)}" ${encounterPlanner.canCommit ? "" : "disabled"}>${encounterPlanner.ready ? "Committed" : "Commit"}</button>
    </footer>
</section>`;
}

function renderTravelPanel(travelContext) {
    const regionOptions = TRAVEL_REGIONS
        .map((region) => `<option value="${region}" ${region === travelContext.region ? "selected" : ""}>${escapeHTML(titleCase(region))}</option>`)
        .join("");
    const lastSeed = travelContext.lastEncounterSeed;

    return `
<section class="totc-workspace-travel">
    <header class="totc-workspace-travel__header">
        <h3>Travel Panel</h3>
        <div>${escapeHTML(travelContext.sceneName)} | Day ${escapeHTML(travelContext.day)} | Watch ${escapeHTML(travelContext.watch)} | Pace: ${escapeHTML(titleCase(travelContext.pace))} | Region: ${escapeHTML(titleCase(travelContext.region))}</div>
    </header>

    <div class="totc-workspace-travel__status">
        <div><strong>Weather:</strong> ${escapeHTML(titleCase(travelContext.weather))}</div>
        <div><strong>Miles Covered:</strong> ${escapeHTML(travelContext.milesCovered)}</div>
        <div><strong>Leader:</strong> ${escapeHTML(travelContext.leaderName)}</div>
        <div><strong>Rations:</strong> ${escapeHTML(travelContext.rationCount)}</div>
    </div>

    <div class="totc-workspace-travel__controls">
        <h4>Pace</h4>
        <button type="button" data-action="travel-set-pace" data-pace="cautious" ${travelContext.pace === "cautious" ? "disabled" : ""}>Cautious</button>
        <button type="button" data-action="travel-set-pace" data-pace="standard" ${travelContext.pace === "standard" ? "disabled" : ""}>Standard</button>
        <button type="button" data-action="travel-set-pace" data-pace="forced" ${travelContext.pace === "forced" ? "disabled" : ""}>Forced</button>
        <label>
            Region
            <select data-action="travel-set-region">
                ${regionOptions}
            </select>
        </label>
    </div>

    <div class="totc-workspace-travel__controls">
        <h4>Travel Actions</h4>
        <button type="button" data-action="travel-advance-watch">Advance Watch</button>
        <button type="button" data-action="travel-add-miles" data-miles="1">+1 Mile</button>
        <button type="button" data-action="travel-add-miles" data-miles="5">+5 Miles</button>
        <button type="button" data-action="travel-toggle-weather">Shift Weather</button>
        <button type="button" data-action="travel-scout-hazard" data-skill="survival" data-bonus="${escapeHTML(travelContext.survivalBonus)}">Scout (Survival)</button>
        <button type="button" data-action="travel-scout-hazard" data-skill="perception" data-bonus="${escapeHTML(travelContext.perceptionBonus)}">Scout (Perception)</button>
        <button type="button" data-action="travel-roll-event">Roll Travel Event</button>
        <button type="button" data-action="travel-start-encounter">Escalate To Encounter</button>
    </div>

    <div class="totc-workspace-travel__event">
        <strong>Latest Event:</strong> ${escapeHTML(travelContext.lastEvent || "No event logged yet.")}
    </div>

    <div class="totc-workspace-travel__seed">
        <strong>Encounter Seed:</strong> ${lastSeed ? escapeHTML(lastSeed.title) : "None"}
        ${lastSeed ? `<div>Objective: ${escapeHTML(lastSeed.objective)}</div>` : ""}
        ${lastSeed ? `<div>Adversaries: ${escapeHTML((lastSeed.adversaries ?? []).join(", "))}</div>` : ""}
        ${lastSeed ? `<div>Terrain: ${escapeHTML(lastSeed.terrain)}</div>` : ""}
        ${lastSeed ? `<div>Escalation: ${escapeHTML(lastSeed.escalationHint)}</div>` : ""}
        ${lastSeed ? "<button type=\"button\" data-action=\"travel-launch-seeded-encounter\">Launch Seeded Encounter</button>" : ""}
    </div>
</section>`;
}

function renderMarketPanel(marketContext) {
    const merchantOptions = marketContext.merchants
        .map((merchant) => `<option value="${escapeHTML(merchant.id)}" ${merchant.id === marketContext.selectedMerchantId ? "selected" : ""}>${escapeHTML(merchant.name)}</option>`)
        .join("");

    const itemOptions = (marketContext.marketItems ?? [])
        .map((item) => {
            const quantity = Math.max(0, toNumber(item.system?.physical?.quantity, 1));
            const price = Math.max(0, toNumber(item.system?.value?.price, 0));
            return `<option value="${escapeHTML(item.id)}" ${item.id === marketContext.selectedItemId ? "selected" : ""}>${escapeHTML(item.name)} (GBP ${escapeHTML(price)} ea, stock ${escapeHTML(quantity)})</option>`;
        })
        .join("");

    const modifierOptions = Object.keys(MARKET_PRICE_MODIFIERS)
        .map((modifier) => `<option value="${modifier}" ${modifier === marketContext.modifier ? "selected" : ""}>${escapeHTML(getPriceModifierLabel(modifier))}</option>`)
        .join("");
    const splitModeOptions = ["buyer", "party", "split"]
        .map((mode) => `<option value="${mode}" ${mode === marketContext.splitMode ? "selected" : ""}>${escapeHTML(getSplitModeLabel(mode))}</option>`)
        .join("");

    return `
<section class="totc-workspace-market">
    <header class="totc-workspace-market__header">
        <h3>Market Panel</h3>
        <div>Buyer: ${escapeHTML(marketContext.buyerName)} | Buyer Funds: GBP ${escapeHTML(marketContext.buyerFunds)} | Party Treasury: GBP ${escapeHTML(marketContext.treasuryFunds)} | Merchant Funds: GBP ${escapeHTML(marketContext.merchantFunds)}</div>
    </header>

    <div class="totc-workspace-market__merchant-tools">
        <button type="button" data-action="market-tag-controlled">Mark Controlled Token As Merchant</button>
        <button type="button" data-action="market-untag-selected" ${marketContext.selectedMerchantId ? "" : "disabled"}>Remove Merchant Role</button>
    </div>

    <div class="totc-workspace-market__editor">
        <label>
            Merchant
            <select data-action="market-set-merchant">
                ${merchantOptions || "<option value=''>No merchants available</option>"}
            </select>
        </label>
        <label>
            Item
            <select data-action="market-set-item" ${marketContext.selectedMerchantId ? "" : "disabled"}>
                ${itemOptions || "<option value=''>No stock available</option>"}
            </select>
        </label>
        <label>
            Quantity
            <input type="number" min="1" step="1" value="${escapeHTML(marketContext.quantity)}" data-action="market-set-quantity" />
        </label>
        <label>
            Pricing
            <select data-action="market-set-modifier">
                ${modifierOptions}
            </select>
        </label>
    </div>

    <div class="totc-workspace-market__quote">
        <div><strong>Base Price:</strong> GBP ${escapeHTML(marketContext.basePrice)}</div>
        <div><strong>Modifier:</strong> ${escapeHTML(marketContext.modifierLabel)}</div>
        <div><strong>Total Quote:</strong> GBP ${escapeHTML(marketContext.totalPrice)}</div>
        <div><strong>Funding:</strong> ${escapeHTML(marketContext.splitModeLabel)} (Buyer GBP ${escapeHTML(marketContext.funding.buyerPortion)} / Treasury GBP ${escapeHTML(marketContext.funding.treasuryPortion)})</div>
        <div><strong>Affordable:</strong> ${marketContext.canAffordBuy ? "Yes" : "No"}</div>
    </div>

    <div class="totc-workspace-market__treasury">
        <label>
            Payment Source
            <select data-action="market-set-split-mode">
                ${splitModeOptions}
            </select>
        </label>
        <button type="button" data-action="market-adjust-treasury" data-delta="10">Treasury +10</button>
        <button type="button" data-action="market-adjust-treasury" data-delta="-10">Treasury -10</button>
    </div>

    ${marketContext.isGm ? `
    <div class="totc-workspace-market__admin">
        <h4>Economy Admin (GM)</h4>
        <label>
            Buyer Wallet (GBP)
            <input type="number" step="1" min="0" value="${escapeHTML(marketContext.buyerFunds)}" data-role="market-admin-buyer-wallet" />
        </label>
        <button type="button" data-action="market-admin-set-wallet" data-target="buyer" ${marketContext.buyerId ? "" : "disabled"}>Apply Buyer Wallet</button>

        <label>
            Merchant Wallet (GBP)
            <input type="number" step="1" min="0" value="${escapeHTML(marketContext.merchantFunds)}" data-role="market-admin-merchant-wallet" />
        </label>
        <button type="button" data-action="market-admin-set-wallet" data-target="merchant" ${marketContext.selectedMerchantId ? "" : "disabled"}>Apply Merchant Wallet</button>

        <label>
            Party Treasury (GBP)
            <input type="number" step="1" min="0" value="${escapeHTML(marketContext.treasuryFunds)}" data-role="market-admin-treasury" />
        </label>
        <button type="button" data-action="market-admin-set-treasury">Apply Treasury</button>
    </div>` : ""}

    <div class="totc-workspace-market__sell">
        <label>
            Sell Item
            <select data-action="market-set-sale-item" ${marketContext.buyerItems.length ? "" : "disabled"}>
                ${(marketContext.buyerItems ?? []).map((item) => {
                    const qty = Math.max(0, toNumber(item.system?.physical?.quantity, 1));
                    const price = Math.max(0, toNumber(item.system?.value?.price, 0));
                    return `<option value="${escapeHTML(item.id)}" ${item.id === marketContext.selectedSaleItemId ? "selected" : ""}>${escapeHTML(item.name)} (stock ${escapeHTML(qty)}, base GBP ${escapeHTML(price)})</option>`;
                }).join("") || "<option value=''>No sellable inventory</option>"}
            </select>
        </label>
        <label>
            Sell Quantity
            <input type="number" min="1" step="1" value="${escapeHTML(marketContext.saleQuantity)}" data-action="market-set-sale-quantity" />
        </label>
        <div><strong>Buyback Quote:</strong> GBP ${escapeHTML(marketContext.saleTotal)} (${escapeHTML(Math.round(BUYBACK_RATE * 100))}% of base)</div>
        <div><strong>Merchant Can Pay:</strong> ${marketContext.canMerchantAffordSale ? "Yes" : "No"}</div>
    </div>

    <div class="totc-workspace-market__controls">
        <button type="button" data-action="market-generate-quote" ${marketContext.selectedItem ? "" : "disabled"}>Post Offer</button>
        <button type="button" data-action="market-buy-item" ${(marketContext.selectedItem && marketContext.canAffordBuy) ? "" : "disabled"}>Buy Item</button>
        <button type="button" data-action="market-sell-item" ${(marketContext.selectedSaleItem && marketContext.canMerchantAffordSale) ? "" : "disabled"}>Sell Item</button>
        <button type="button" data-action="market-refresh">Refresh Stock</button>
    </div>
</section>`;
}

function renderCampPanel(campContext) {
    const activityOptions = Object.values(CAMP_ACTIVITIES)
        .map((activity) => `<option value="${activity}" ${activity === campContext.currentActivity ? "selected" : ""}>${escapeHTML(titleCase(activity))}</option>`)
        .join("");
    const moraleOptions = CAMP_MORALE_STATES
        .map((morale) => `<option value="${morale}" ${morale === campContext.morale ? "selected" : ""}>${escapeHTML(titleCase(morale))}</option>`)
        .join("");

    const regionOptions = REGIONS
        .map((region) => `<option value="${region}" ${region === campContext.region ? "selected" : ""}>${escapeHTML(titleCase(region))}</option>`)
        .join("");

    const seasonOptions = ["spring", "summer", "autumn", "winter"]
        .map((season) => `<option value="${season}" ${season === campContext.season ? "selected" : ""}>${escapeHTML(titleCase(season))}</option>`)
        .join("");

    return `
<section class="totc-workspace-camp">
    <header class="totc-workspace-camp__header">
        <h3>Camp Panel</h3>
        <div>${escapeHTML(campContext.sceneName)} | Day ${escapeHTML(campContext.day)} | Leader: ${escapeHTML(campContext.leaderName)} | Morale: ${escapeHTML(titleCase(campContext.morale))}</div>
    </header>

    <div class="totc-workspace-camp__resources">
        <h4>Resources</h4>
        <div><strong>Supplies:</strong> ${escapeHTML(campContext.supplies)}</div>
        <div><strong>Water:</strong> ${escapeHTML(campContext.water)}</div>
        <div><strong>Firewood:</strong> ${escapeHTML(campContext.firewood)}</div>
    </div>

    <div class="totc-workspace-camp__location">
        <h4>Location & Season</h4>
        <label>
            Region
            <select data-action="camp-set-region">
                ${regionOptions}
            </select>
        </label>
        <label>
            Season
            <select data-action="camp-set-season">
                ${seasonOptions}
            </select>
        </label>
    </div>

    <div class="totc-workspace-camp__morale">
        <h4>Party Morale</h4>
        <label>
            Morale Level
            <select data-action="camp-set-morale">
                ${moraleOptions}
            </select>
        </label>
        <button type="button" data-action="camp-boost-morale">Boost Morale</button>
        <button type="button" data-action="camp-lower-morale">Lower Morale</button>
    </div>

    <div class="totc-workspace-camp__activities">
        <h4>Camp Activities</h4>
        <label>
            Current Activity
            <select data-action="camp-set-activity">
                ${activityOptions}
            </select>
        </label>
        <button type="button" data-action="camp-perform-rest">Perform Rest</button>
        <button type="button" data-action="camp-perform-prepare">Prepare Equipment</button>
        <button type="button" data-action="camp-perform-scout">Scout Perimeter</button>
        <button type="button" data-action="camp-perform-train">Train Skill</button>
        <button type="button" data-action="camp-perform-forage">Forage for Supplies</button>
    </div>

    <div class="totc-workspace-camp__resources-controls">
        <h4>Resource Management</h4>
        <div class="totc-workspace-camp__resource-row">
            <span>Supplies</span>
            <button type="button" data-action="camp-adjust-supplies" data-delta="-1">-1</button>
            <button type="button" data-action="camp-adjust-supplies" data-delta="1">+1</button>
            <button type="button" data-action="camp-adjust-supplies" data-delta="5">+5</button>
        </div>
        <div class="totc-workspace-camp__resource-row">
            <span>Water</span>
            <button type="button" data-action="camp-adjust-water" data-delta="-1">-1</button>
            <button type="button" data-action="camp-adjust-water" data-delta="1">+1</button>
            <button type="button" data-action="camp-adjust-water" data-delta="5">+5</button>
        </div>
        <div class="totc-workspace-camp__resource-row">
            <span>Firewood</span>
            <button type="button" data-action="camp-adjust-firewood" data-delta="-1">-1</button>
            <button type="button" data-action="camp-adjust-firewood" data-delta="1">+1</button>
            <button type="button" data-action="camp-adjust-firewood" data-delta="5">+5</button>
        </div>
    </div>

    <div class="totc-workspace-camp__event">
        <strong>Latest Event:</strong> ${escapeHTML(campContext.lastEvent || "No event logged yet.")}
    </div>

    <div class="totc-workspace-camp__controls">
        <button type="button" data-action="camp-roll-event">Roll Camp Event</button>
        <button type="button" data-action="camp-advance-day">Advance Day</button>
    </div>
</section>`;
}

function renderMainPanel(context, panelContext) {
    if (context === UI_CONTEXTS.ENCOUNTER) {
        return renderEncounterPanel(panelContext?.encounterPlanner ?? null);
    }

    if (context === UI_CONTEXTS.TRAVEL) {
        return renderTravelPanel(panelContext?.travelContext ?? buildTravelPanelContext(null));
    }

    if (context === UI_CONTEXTS.MARKET) {
        return renderMarketPanel(panelContext?.marketContext ?? buildMarketPanelContext(null));
    }

    if (context === UI_CONTEXTS.CAMP) {
        return renderCampPanel(panelContext?.campContext ?? buildCampPanelContext(null));
    }

    return `
<section class="totc-workspace-context-placeholder">
    <h3>${titleCase(context)} Panel</h3>
    <p>This area will host the primary ${context} workflow.</p>
</section>`;
}

/**
 * Render tab group interface
 */
function renderTabGroups(tabGroupManager) {
    const groups = tabGroupManager.getGroups();
    if (!groups || groups.length === 0) return "";

    const groupsHtml = groups
        .map((group) => {
            const tabsHtml = group.tabs
                ?.map((tab) => {
                    const isActive = group.activeTab === tab.id ? "is-active" : "";
                    return `<button type="button" class="totc-tab ${isActive}" data-action="switchTab" data-group-id="${group.id}" data-tab-id="${tab.id}" title="${tab.label}">${tab.label}</button>`;
                })
                .join("") ?? "";

            return `
<div class="totc-tab-group" data-group-id="${group.id}">
    <div class="totc-tab-group__name" title="Click to rename">${group.name}</div>
    <div class="totc-tab-group__tabs" role="tablist">
        ${tabsHtml}
    </div>
</div>`;
        })
        .join("");

    return `
<section class="totc-tab-groups" aria-label="Tab Groups">
    ${groupsHtml}
</section>`;
}

function renderShellContent({ context, mode, encounterPlanner = null, travelContext = null, marketContext = null, campContext = null, debugWindowPolicyEnabled = false, tabGroups = null }) {
    const contextButtons = Object.values(UI_CONTEXTS)
        .map((key) => {
            const activeClass = key === context ? "is-active" : "";
            return `<button type="button" class="totc-context-button ${activeClass}" data-action="setContext" data-context="${key}">${titleCase(key)}</button>`;
        })
        .join("");

    const tabGroupsHtml = tabGroups ? renderTabGroups(tabGroups) : "";

    return `
<section class="totc-workspace-shell" data-context="${context}" data-mode="${mode}">
    <header class="totc-workspace-shell__header">
        <h2 class="totc-workspace-shell__title">Turn of the Century Workspace</h2>
        <div class="totc-workspace-shell__meta-wrap">
            <div class="totc-workspace-shell__meta">Mode: ${titleCase(mode)} | Context: ${titleCase(context)}</div>
            ${debugWindowPolicyEnabled ? "<span class=\"totc-workspace-shell__debug-badge\" title=\"Window policy debug logging is enabled\">Window Policy Debug: ON</span>" : ""}
        </div>
    </header>
    ${tabGroupsHtml}
    <nav class="totc-workspace-shell__contexts" aria-label="Play Contexts">
        ${contextButtons}
    </nav>
    <div class="totc-workspace-shell__layout">
        <aside class="totc-workspace-shell__dock totc-workspace-shell__dock--left">
            <h3>Left Dock</h3>
            <p>Context tools and party controls appear here.</p>
        </aside>
        <main class="totc-workspace-shell__main">
            ${renderMainPanel(context, { encounterPlanner, travelContext, marketContext, campContext })}
        </main>
        <aside class="totc-workspace-shell__dock totc-workspace-shell__dock--right">
            <h3>Right Dock</h3>
            <p>Reference data and actions appear here.</p>
        </aside>
    </div>
</section>`;
}

const ApplicationV2Base = getApplicationV2BaseClass();

export class TotcWorkspaceShell extends (ApplicationV2Base ?? class {}) {
    static get isSupported() {
        return Boolean(ApplicationV2Base);
    }

    static get DEFAULT_OPTIONS() {
        if (!ApplicationV2Base) return {};

        return {
            id: "totc-workspace-shell",
            classes: ["turn-of-the-century", "totc-workspace-shell-app"],
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
                title: "Turn of the Century Workspace"
            }
        };
    }

    constructor({ mode = UI_MODES.PLAY, context = UI_CONTEXTS.TRAVEL, manager } = {}) {
        super();
        this.mode = mode;
        this.context = normalizeContext(context);
        this.manager = manager;
        this.tabGroupManager = new TotcTabGroupManager(getWorkspaceScene());
    }

    async _prepareContext() {
        const { actor, tokenDocument } = resolveWorkspaceActorToken();
        const encounterPlanner = this.context === UI_CONTEXTS.ENCOUNTER && actor
            ? buildEncounterPlanner(actor, tokenDocument)
            : null;
        const travelContext = this.context === UI_CONTEXTS.TRAVEL
            ? buildTravelPanelContext(actor)
            : null;
        const marketContext = this.context === UI_CONTEXTS.MARKET
            ? buildMarketPanelContext(actor)
            : null;
        const campContext = this.context === UI_CONTEXTS.CAMP
            ? buildCampPanelContext(actor)
            : null;
        const debugWindowPolicyEnabled = this.mode === UI_MODES.PLAY
            && Boolean(game.settings?.get("turn-of-the-century", UI_DEBUG_WINDOW_POLICY_SETTING));

        return {
            mode: this.mode,
            context: this.context,
            encounterPlanner,
            travelContext,
            marketContext,
            campContext,
            debugWindowPolicyEnabled,
            tabGroups: this.tabGroupManager
        };
    }

    async _renderHTML(context) {
        const root = document.createElement("section");
        root.classList.add("totc-workspace-shell-root");
        root.innerHTML = renderShellContent(context);
        return root;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);

        this.element
            ?.querySelectorAll("[data-action='setContext']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const selectedContext = event.currentTarget?.dataset?.context;
                    if (!selectedContext || !this.manager) return;
                    await this.manager.setPlayContext(selectedContext);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-init-round']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!game.combat?.initializeEncounterRound) return;
                    await game.combat.initializeEncounterRound();
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-roll-all-initiative']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!game.combat?.rollAllMissingInitiatives) return;
                    await game.combat.rollAllMissingInitiatives();
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-resolve-round']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!game.combat?.resolveEncounterRound) return;
                    await game.combat.resolveEncounterRound();
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-roll-initiative']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const combatantId = event.currentTarget?.dataset?.combatantId;
                    if (!combatantId || !game.combat?.rollEncounterInitiative) return;
                    await game.combat.rollEncounterInitiative(combatantId);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-add-action']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const combatantId = event.currentTarget?.dataset?.combatantId;
                    if (!combatantId || !game.combat?.addCombatantAction) return;

                    const editor = event.currentTarget.closest(".totc-workspace-encounter__editor");
                    const actionSelect = editor?.querySelector(".totc-workspace-encounter__action-select");
                    const targetSelect = editor?.querySelector(".totc-workspace-encounter__target-select");
                    const apInput = editor?.querySelector(".totc-workspace-encounter__ap-input");

                    const selectedAction = readSelectedAction(actionSelect);
                    if (!selectedAction) return;

                    const finalized = finalizeActionData(selectedAction, apInput?.value, targetSelect?.value ?? null);
                    await game.combat.addCombatantAction(combatantId, finalized);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-remove-action']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const combatantId = event.currentTarget?.dataset?.combatantId;
                    const actionIndex = Number(event.currentTarget?.dataset?.actionIndex);
                    if (!combatantId || Number.isNaN(actionIndex) || !game.combat?.removeCombatantAction) return;

                    await game.combat.removeCombatantAction(combatantId, actionIndex);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-clear-plan']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const combatantId = event.currentTarget?.dataset?.combatantId;
                    if (!combatantId || !game.combat?.clearCombatantPlan) return;

                    await game.combat.clearCombatantPlan(combatantId);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='encounter-toggle-ready']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const combatantId = event.currentTarget?.dataset?.combatantId;
                    const currentReady = String(event.currentTarget?.dataset?.ready) === "true";
                    if (!combatantId || !game.combat?.setCombatantReady) return;

                    await game.combat.setCombatantReady(combatantId, !currentReady);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-set-pace']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const pace = String(event.currentTarget?.dataset?.pace ?? "standard");
                    await updateWorkspaceState({ travel: { pace } });
                    ui.notifications?.info(`Travel pace set to ${titleCase(pace)}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-set-region']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const region = String(event.currentTarget?.value ?? DEFAULT_TRAVEL_STATE.region);
                    const safeRegion = TRAVEL_REGIONS.includes(region) ? region : DEFAULT_TRAVEL_STATE.region;
                    await updateWorkspaceState({ travel: { region: safeRegion } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-add-miles']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const miles = Math.max(1, toNumber(event.currentTarget?.dataset?.miles, 1));
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const currentMiles = Math.max(0, toNumber(state.travel?.milesCovered, 0));
                    await updateWorkspaceState({ travel: { milesCovered: currentMiles + miles } });
                    ui.notifications?.info(`Travel log updated (+${miles} mile${miles === 1 ? "" : "s"}).`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-advance-watch']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const travel = { ...DEFAULT_TRAVEL_STATE, ...(state.travel ?? {}) };
                    const nextWatch = travel.watch >= 6 ? 1 : travel.watch + 1;
                    const nextDay = travel.watch >= 6 ? travel.day + 1 : travel.day;

                    await updateWorkspaceState({ travel: { day: nextDay, watch: nextWatch } });

                    if (game.time?.advance) {
                        await game.time.advance(4 * 60 * 60);
                    }

                    ui.notifications?.info(`Advanced to Day ${nextDay}, Watch ${nextWatch}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-toggle-weather']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const current = String(state.travel?.weather ?? "clear");
                    const index = TRAVEL_WEATHER_STATES.indexOf(current);
                    const nextWeather = TRAVEL_WEATHER_STATES[(index + 1 + TRAVEL_WEATHER_STATES.length) % TRAVEL_WEATHER_STATES.length];
                    await updateWorkspaceState({ travel: { weather: nextWeather } });
                    ui.notifications?.info(`Weather shifted to ${titleCase(nextWeather)}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-scout-hazard']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const skill = String(event.currentTarget?.dataset?.skill ?? "survival");
                    const bonus = toNumber(event.currentTarget?.dataset?.bonus, 0);
                    const roll = await (new Roll(`1d20 + ${bonus}`)).evaluate();
                    const total = toNumber(roll.total, 0);
                    const dc = 12;
                    const outcome = total >= dc ? "safe route identified" : "hazard discovered";

                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker(),
                        content: `Travel Scout Check (${titleCase(skill)}): ${total} vs DC ${dc} - ${outcome}.`
                    });

                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-roll-event']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();

                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const region = TRAVEL_REGIONS.includes(String(state.travel?.region ?? ""))
                        ? String(state.travel?.region)
                        : DEFAULT_TRAVEL_STATE.region;
                    const table = TRAVEL_EVENT_TABLES[region] ?? TRAVEL_EVENT_TABLES.frontier;
                    const roll = await (new Roll("1d20")).evaluate();
                    const total = Math.max(1, toNumber(roll.total, 1));
                    const entry = table.find((candidate) => total >= candidate.min && total <= candidate.max)
                        ?? table[0];
                    const message = `${entry.description} (Event Roll ${total})`;

                    await updateWorkspaceState({ travel: { region, lastEvent: message } });

                    const payload = {
                        roll: total,
                        region,
                        outcome: entry.outcome,
                        description: entry.description,
                        sceneId: scene?.id ?? null,
                        encounterSeed: entry.outcome === "encounter"
                            ? {
                                context: "travel",
                                region,
                                threatTier: region === "wilds" ? 3 : 2,
                                template: pickEncounterSeed(region)
                            }
                            : null
                    };

                    if (payload.encounterSeed?.template) {
                        await updateWorkspaceState({ travel: { lastEncounterSeed: payload.encounterSeed.template } });
                    }
                    Hooks.callAll("totcTravelEventResolved", payload);

                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker(),
                        content: `Travel Event: ${message}`
                    });

                    if (entry.outcome === "encounter") {
                        await ensureSeededEncounterFromTravelPayload(payload);
                        Hooks.callAll("totcTravelEncounterSeeded", payload);
                        if (this.manager) {
                            await this.manager.setPlayContext(UI_CONTEXTS.ENCOUNTER);
                            return;
                        }
                    }

                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-start-encounter']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!this.manager) return;
                    await this.manager.setPlayContext(UI_CONTEXTS.ENCOUNTER);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='travel-launch-seeded-encounter']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const region = TRAVEL_REGIONS.includes(String(state.travel?.region ?? ""))
                        ? String(state.travel?.region)
                        : DEFAULT_TRAVEL_STATE.region;
                    const seed = state.travel?.lastEncounterSeed ?? pickEncounterSeed(region);

                    const payload = {
                        roll: 0,
                        region,
                        outcome: "encounter",
                        description: "Manual seeded encounter launch.",
                        sceneId: scene?.id ?? null,
                        encounterSeed: {
                            context: "travel",
                            region,
                            threatTier: region === "wilds" ? 3 : 2,
                            template: seed
                        }
                    };

                    const seededCombat = await ensureSeededEncounterFromTravelPayload(payload);
                    if (!seededCombat) {
                        ui.notifications?.warn("Could not launch a seeded encounter in this scene.");
                        return;
                    }

                    Hooks.callAll("totcTravelEncounterSeeded", payload);
                    if (this.manager) {
                        await this.manager.setPlayContext(UI_CONTEXTS.ENCOUNTER);
                    }
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-tag-controlled']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const actor = getControlledActor();
                    if (!actor) {
                        ui.notifications?.warn("Select a token to assign merchant role.");
                        return;
                    }

                    await actor.update({ "system.economy.isMerchant": true });
                    if (toNumber(actor.system?.economy?.wallet?.gbp, 0) <= 0) {
                        await setWalletState(actor, { gbp: 500 });
                    }

                    ui.notifications?.info(`${actor.name} is now tagged as a merchant.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-untag-selected']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const state = getWorkspaceState(getWorkspaceScene());
                    const merchant = getActorById(state.market?.merchantActorId);
                    if (!merchant) return;

                    await merchant.update({ "system.economy.isMerchant": false });
                    await updateWorkspaceState({ market: { merchantActorId: "", itemId: "" } });
                    ui.notifications?.info(`${merchant.name} merchant role removed.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-split-mode']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const splitMode = String(event.currentTarget?.value ?? "buyer");
                    const safeMode = ["buyer", "party", "split"].includes(splitMode) ? splitMode : "buyer";
                    await updateWorkspaceState({ market: { splitMode: safeMode } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-admin-set-wallet']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!game.user?.isGM) {
                        ui.notifications?.warn("Only the GM may edit wallet balances.");
                        return;
                    }

                    const target = String(event.currentTarget?.dataset?.target ?? "");
                    const buyerInput = this.element?.querySelector("[data-role='market-admin-buyer-wallet']");
                    const merchantInput = this.element?.querySelector("[data-role='market-admin-merchant-wallet']");
                    const { actor: buyer } = resolveWorkspaceActorToken();
                    const state = getWorkspaceState(getWorkspaceScene());
                    const merchant = getActorById(state.market?.merchantActorId);

                    if (target === "buyer" && buyer) {
                        const value = Math.max(0, toNumber(buyerInput?.value, 0));
                        await setWalletState(buyer, { gbp: value });
                        ui.notifications?.info(`${buyer.name} wallet updated to GBP ${value}.`);
                    }

                    if (target === "merchant" && merchant) {
                        const value = Math.max(0, toNumber(merchantInput?.value, 0));
                        await setWalletState(merchant, { gbp: value });
                        ui.notifications?.info(`${merchant.name} wallet updated to GBP ${value}.`);
                    }

                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-admin-set-treasury']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    if (!game.user?.isGM) {
                        ui.notifications?.warn("Only the GM may edit treasury balance.");
                        return;
                    }

                    const treasuryInput = this.element?.querySelector("[data-role='market-admin-treasury']");
                    const value = Math.max(0, toNumber(treasuryInput?.value, 0));
                    await updateWorkspaceState({ market: { treasuryGbp: value } });
                    ui.notifications?.info(`Party treasury updated to GBP ${value}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-adjust-treasury']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const delta = toNumber(event.currentTarget?.dataset?.delta, 0);
                    const scene = getWorkspaceScene();
                    const market = getMarketState(scene);
                    const nextTreasury = Math.max(0, Math.round((toNumber(market.treasuryGbp, 0) + delta) * 100) / 100);
                    await updateWorkspaceState({ market: { treasuryGbp: nextTreasury } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-merchant']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const merchantActorId = String(event.currentTarget?.value ?? "");
                    await updateWorkspaceState({ market: { merchantActorId, itemId: "", quantity: 1, saleItemId: "", saleQuantity: 1 } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-item']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const itemId = String(event.currentTarget?.value ?? "");
                    await updateWorkspaceState({ market: { itemId } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-quantity']")
            ?.forEach((input) => {
                input.addEventListener("change", async (event) => {
                    const quantity = Math.max(1, toNumber(event.currentTarget?.value, 1));
                    await updateWorkspaceState({ market: { quantity } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-sale-item']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const saleItemId = String(event.currentTarget?.value ?? "");
                    await updateWorkspaceState({ market: { saleItemId } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-sale-quantity']")
            ?.forEach((input) => {
                input.addEventListener("change", async (event) => {
                    const saleQuantity = Math.max(1, toNumber(event.currentTarget?.value, 1));
                    await updateWorkspaceState({ market: { saleQuantity } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-set-modifier']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    const priceModifier = String(event.currentTarget?.value ?? "standard");
                    await updateWorkspaceState({ market: { priceModifier } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-generate-quote']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const { actor } = resolveWorkspaceActorToken();
                    const marketContext = buildMarketPanelContext(actor);
                    if (!marketContext.selectedItem || !marketContext.merchant) return;

                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker(),
                        content: `${marketContext.merchant.name} offers ${marketContext.quantity}x ${marketContext.selectedItem.name} to ${marketContext.buyerName} for GBP ${marketContext.totalPrice} (${marketContext.modifierLabel}).`
                    });
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-buy-item']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const { actor: buyer } = resolveWorkspaceActorToken();
                    const marketContext = buildMarketPanelContext(buyer);
                    const merchant = marketContext.merchant;
                    const item = marketContext.selectedItem;
                    if (!buyer || !merchant || !item) return;

                    const requested = Math.max(1, marketContext.quantity);
                    const stock = Math.max(0, toNumber(item.system?.physical?.quantity, 1));
                    const purchased = Math.min(requested, stock);
                    if (purchased <= 0) {
                        ui.notifications?.warn("Merchant is out of stock for that item.");
                        return;
                    }

                    const actualTotal = Math.round(toNumber(item.system?.value?.price, 0) * purchased * MARKET_PRICE_MODIFIERS[marketContext.modifier] * 100) / 100;
                    const funding = calculateFundingBreakdown(
                        actualTotal,
                        marketContext.splitMode,
                        marketContext.buyerFunds,
                        marketContext.treasuryFunds
                    );
                    if (!funding.affordable) {
                        ui.notifications?.warn("Insufficient funds for purchase.");
                        return;
                    }

                    await addItemToActorInventory(buyer, item, purchased);
                    await removeItemQuantity(item, purchased);

                    if (funding.buyerPortion > 0) {
                        await adjustWalletBalance(buyer, -funding.buyerPortion, 100);
                    }
                    if (funding.treasuryPortion > 0) {
                        await updateWorkspaceState({
                            market: {
                                treasuryGbp: Math.max(0, Math.round((marketContext.treasuryFunds - funding.treasuryPortion) * 100) / 100)
                            }
                        });
                    }
                    await adjustWalletBalance(merchant, actualTotal, 500);

                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker(),
                        content: `${buyer.name} purchased ${purchased}x ${item.name} from ${merchant.name} for GBP ${actualTotal} (Buyer GBP ${funding.buyerPortion}, Treasury GBP ${funding.treasuryPortion}).`
                    });

                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-sell-item']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const { actor: buyer } = resolveWorkspaceActorToken();
                    const marketContext = buildMarketPanelContext(buyer);
                    const merchant = marketContext.merchant;
                    const saleItem = marketContext.selectedSaleItem;
                    if (!buyer || !merchant || !saleItem) return;

                    const requested = Math.max(1, marketContext.saleQuantity);
                    const stock = Math.max(0, toNumber(saleItem.system?.physical?.quantity, 1));
                    const sold = Math.min(requested, stock);
                    if (sold <= 0) {
                        ui.notifications?.warn("No sellable stock available.");
                        return;
                    }

                    const payout = Math.round(toNumber(saleItem.system?.value?.price, 0) * sold * BUYBACK_RATE * 100) / 100;
                    const merchantFunds = getWalletState(merchant, 500).gbp;
                    if (merchantFunds < payout) {
                        ui.notifications?.warn("Merchant cannot afford this sale.");
                        return;
                    }

                    await addItemToActorInventory(merchant, saleItem, sold);
                    await removeItemQuantity(saleItem, sold);
                    await adjustWalletBalance(merchant, -payout, 500);

                    const saleSplitMode = marketContext.splitMode;
                    const buyerShare = saleSplitMode === "party" ? 0 : saleSplitMode === "split" ? Math.round((payout / 2) * 100) / 100 : payout;
                    const treasuryShare = Math.round((payout - buyerShare) * 100) / 100;

                    if (buyerShare > 0) {
                        await adjustWalletBalance(buyer, buyerShare, 100);
                    }
                    if (treasuryShare > 0) {
                        await updateWorkspaceState({
                            market: {
                                treasuryGbp: Math.max(0, Math.round((marketContext.treasuryFunds + treasuryShare) * 100) / 100)
                            }
                        });
                    }

                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker(),
                        content: `${buyer.name} sold ${sold}x ${saleItem.name} to ${merchant.name} for GBP ${payout} (Buyer GBP ${buyerShare}, Treasury GBP ${treasuryShare}).`
                    });

                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='market-refresh']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-set-morale']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    event.preventDefault();
                    const morale = String(event.currentTarget?.value ?? "normal");
                    if (!CAMP_MORALE_STATES.includes(morale)) return;
                    await updateWorkspaceState({ camp: { morale } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-set-activity']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    event.preventDefault();
                    const activity = String(event.currentTarget?.value ?? CAMP_ACTIVITIES.REST);
                    if (!Object.values(CAMP_ACTIVITIES).includes(activity)) return;
                    await updateWorkspaceState({ camp: { currentActivity: activity } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-set-region']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    event.preventDefault();
                    const region = String(event.currentTarget?.value ?? "frontier");
                    if (!REGIONS.includes(region)) return;
                    await updateWorkspaceState({ camp: { region } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-set-season']")
            ?.forEach((select) => {
                select.addEventListener("change", async (event) => {
                    event.preventDefault();
                    const season = String(event.currentTarget?.value ?? "summer");
                    const validSeasons = ["spring", "summer", "autumn", "winter"];
                    if (!validSeasons.includes(season)) return;
                    await updateWorkspaceState({ camp: { season } });
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-boost-morale']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
                    const currentIndex = CAMP_MORALE_STATES.indexOf(camp.morale ?? "normal");
                    const nextIndex = Math.min(CAMP_MORALE_STATES.length - 1, currentIndex + 1);
                    const newMorale = CAMP_MORALE_STATES[nextIndex];
                    await updateWorkspaceState({ camp: { morale: newMorale } });
                    ui.notifications?.info(`Party morale boosted to ${titleCase(newMorale)}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-lower-morale']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
                    const currentIndex = CAMP_MORALE_STATES.indexOf(camp.morale ?? "normal");
                    const nextIndex = Math.max(0, currentIndex - 1);
                    const newMorale = CAMP_MORALE_STATES[nextIndex];
                    await updateWorkspaceState({ camp: { morale: newMorale } });
                    ui.notifications?.info(`Party morale lowered to ${titleCase(newMorale)}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action^='camp-perform-']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const action = event.currentTarget?.dataset?.action?.replace("camp-perform-", "") ?? "";
                    if (!action) return;
                    
                    const activities = {
                        rest: "The party settles in for rest and recovery.",
                        prepare: "Equipment is checked and readied for travel.",
                        scout: "Scouts advance cautiously to survey the area.",
                        train: "The party spends time honing combat skills.",
                        forage: "Foragers search the surrounding area for supplies."
                    };
                    
                    const description = activities[action] ?? "An activity is underway.";
                    await updateWorkspaceState({ camp: { currentActivity: action, lastEvent: description } });
                    ui.notifications?.info(description);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action^='camp-adjust-supplies'], [data-action^='camp-adjust-water'], [data-action^='camp-adjust-firewood']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const action = String(event.currentTarget?.dataset?.action ?? "");
                    const resourceType = action.replace("camp-adjust-", "");
                    const delta = toNumber(event.currentTarget?.dataset?.delta, 0);
                    
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
                    const current = Math.max(0, toNumber(camp[resourceType], 0));
                    const next = Math.max(0, current + delta);
                    
                    await updateWorkspaceState({ camp: { [resourceType]: next } });
                    ui.notifications?.info(`${titleCase(resourceType)} adjusted to ${next}.`);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-roll-event']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
                    const morale = CAMP_MORALE_STATES.includes(String(camp.morale ?? "")) ? String(camp.morale) : "normal";
                    
                    // Get region and season from camp state or use defaults
                    const region = String(camp.region ?? "frontier").toLowerCase();
                    const season = String(camp.season ?? "summer").toLowerCase();
                    
                    // Roll region-aware camp event
                    const campEvent = rollRegionAwareCampEvent({ region, season, morale });
                    const eventDescription = `[Roll ${campEvent.roll}] ${campEvent.description}`;
                    
                    // Store event and update UI
                    await updateWorkspaceState({ camp: { lastEvent: eventDescription, lastEventOutcome: campEvent.outcome } });
                    
                    // Post to chat if there's a hazard or benefit
                    if (campEvent.hazard || campEvent.benefits) {
                        const chatContent = `<div class="totc-camp-event">
                            <strong>${titleCase(region)} Camp Event (${titleCase(season)})</strong><br/>
                            <em>${escapeHTML(campEvent.description)}</em><br/>
                            ${campEvent.hazard ? `<span class="hazard">⚠️ ${escapeHTML(campEvent.hazard)}</span><br/>` : ""}
                            ${campEvent.benefits ? `<span class="benefit">✓ ${escapeHTML(campEvent.benefits)}</span><br/>` : ""}
                        </div>`;
                        
                        await ChatMessage.create({
                            content: chatContent,
                            speaker: ChatMessage.getSpeaker(),
                            flags: { "turn-of-the-century": { campEvent: true } }
                        }).catch(() => null);
                    }
                    
                    ui.notifications?.info(eventDescription);
                    this.render(false);
                });
            });

        this.element
            ?.querySelectorAll("[data-action='camp-advance-day']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const scene = getWorkspaceScene();
                    const state = getWorkspaceState(scene);
                    const camp = { ...DEFAULT_CAMP_STATE, ...(state.camp ?? {}) };
                    const nextDay = Math.max(1, toNumber(camp.day, 1) + 1);
                    
                    await updateWorkspaceState({ camp: { day: nextDay, lastEvent: "" } });
                    ui.notifications?.info(`Advanced to Day ${nextDay}.`);
                    this.render(false);
                });
            });

        // Tab group event listeners
        this.element
            ?.querySelectorAll("[data-action='switchTab']")
            ?.forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const groupId = event.currentTarget?.dataset?.groupId;
                    const tabId = event.currentTarget?.dataset?.tabId;
                    if (!groupId || !tabId) return;

                    const success = await this.tabGroupManager.setActiveTab(groupId, tabId);
                    if (success) {
                        // Get the active tab's panel context
                        const activeTab = this.tabGroupManager.getActiveTab(groupId);
                        if (activeTab?.panelContext) {
                            // Switch to the panel context
                            if (this.manager) {
                                await this.manager.setPlayContext(activeTab.panelContext);
                            }
                        }
                        this.render(false);
                    }
                });
            });
    }
}

export class TotcWorkspaceManager {
    constructor({
        systemId,
        modeSettingKey,
        playContextSettingKey,
        blockFloatingWindowsSettingKey,
        debugWindowPolicySettingKey
    }) {
        this.systemId = systemId;
        this.modeSettingKey = modeSettingKey;
        this.playContextSettingKey = playContextSettingKey;
        this.blockFloatingWindowsSettingKey = blockFloatingWindowsSettingKey;
        this.debugWindowPolicySettingKey = debugWindowPolicySettingKey;

        this.shell = null;
        this.dismissedIds = new Set();
        this.windowPolicyDecisionLogKeys = new Set();
        this._onRenderApplicationV2 = this._onRenderApplicationV2.bind(this);
        this._onRenderApplicationV1 = this._onRenderApplicationV1.bind(this);
    }

    isPlayMode() {
        return game.settings.get(this.systemId, this.modeSettingKey) === UI_MODES.PLAY;
    }

    shouldBlockFloatingWindows() {
        return this.isPlayMode() && Boolean(game.settings.get(this.systemId, this.blockFloatingWindowsSettingKey));
    }

    shouldDebugWindowPolicy() {
        if (!this.debugWindowPolicySettingKey) return false;
        if (!this.isPlayMode()) return false;
        return Boolean(game.settings.get(this.systemId, this.debugWindowPolicySettingKey));
    }

    getPlayContext() {
        const value = game.settings.get(this.systemId, this.playContextSettingKey);
        return normalizeContext(value);
    }

    async initialize() {
        Hooks.on("renderApplicationV2", this._onRenderApplicationV2);
        Hooks.on("renderApplicationV1", this._onRenderApplicationV1);

        if (this.isPlayMode()) {
            await this.openShell();
            this.enforceWindowPolicy();
            return;
        }

        await this.closeShell();
    }

    async setMode(mode) {
        const nextMode = mode === UI_MODES.PLAY ? UI_MODES.PLAY : UI_MODES.DESIGN;
        await game.settings.set(this.systemId, this.modeSettingKey, nextMode);
        this.windowPolicyDecisionLogKeys.clear();

        if (nextMode === UI_MODES.PLAY) {
            await this.openShell(true);
            this.enforceWindowPolicy();
        } else {
            await this.closeShell();
        }
    }

    async setPlayContext(context) {
        const normalized = normalizeContext(context, this.getPlayContext());
        await game.settings.set(this.systemId, this.playContextSettingKey, normalized);
        if (this.shell) {
            this.shell.context = normalized;
            this.shell.render(false);
        }
    }

    async openShell(force = false) {
        if (!TotcWorkspaceShell.isSupported) {
            console.warn("[turn-of-the-century] ApplicationV2 is unavailable; workspace shell was not opened.");
            return;
        }

        if (!this.shell) {
            this.shell = new TotcWorkspaceShell({
                mode: this.isPlayMode() ? UI_MODES.PLAY : UI_MODES.DESIGN,
                context: this.getPlayContext(),
                manager: this
            });
        }

        this.shell.mode = this.isPlayMode() ? UI_MODES.PLAY : UI_MODES.DESIGN;
        this.shell.context = this.getPlayContext();
        await this.shell.render({ force: true, focus: true });

        if (force && typeof this.shell.bringToFront === "function") {
            this.shell.bringToFront();
        }
    }

    async closeShell() {
        if (!this.shell) return;
        if (!this.shell.rendered) return;
        await this.shell.close();
    }

    _isAllowedWindow(app) {
        if (!app) return true;
        if (app === this.shell) return true;
        if (isAllowedPromptLikeWindow(app)) return true;

        const appId = String(app.id ?? app.appId ?? "");
        if (appId === "totc-workspace-shell") return true;
        if (appId.startsWith("totc-workspace-shell")) return true;

        return false;
    }

    _getWindowPolicyDecision(app) {
        if (!this.shouldBlockFloatingWindows()) {
            return { shouldClose: false, reason: "policy-disabled" };
        }

        if (this._isAllowedWindow(app)) {
            return { shouldClose: false, reason: "allowed-window" };
        }

        if (!isFloatingWindowCandidate(app)) {
            return { shouldClose: false, reason: "non-floating-window" };
        }

        if (isExplicitlyBlockedWindow(app)) {
            return { shouldClose: true, reason: "explicitly-blocked-window" };
        }

        const ctorName = String(app?.constructor?.name ?? "");
        if (BLOCKED_WINDOW_APP_NAMES.has(ctorName)) {
            return { shouldClose: true, reason: "blocked-constructor" };
        }

        if (typeof app?.hasFrame === "boolean" && app.hasFrame) {
            return { shouldClose: true, reason: "framed-window" };
        }

        if (app?.options?.popOut === true) {
            return { shouldClose: true, reason: "popout-window" };
        }

        if (app?.options?.window?.frame === true) {
            return { shouldClose: true, reason: "window-frame-enabled" };
        }

        return { shouldClose: false, reason: "default-allow" };
    }

    _debugWindowPolicyDecision(app, decision) {
        if (!this.shouldDebugWindowPolicy()) return;

        const appId = String(app?.id ?? app?.appId ?? "unknown");
        const appName = String(app?.constructor?.name ?? "UnknownApp");
        const logKey = `${appId}:${decision.reason}:${decision.shouldClose}`;
        if (this.windowPolicyDecisionLogKeys.has(logKey)) return;
        this.windowPolicyDecisionLogKeys.add(logKey);

        const level = decision.shouldClose ? "warn" : "debug";
        console[level]("[turn-of-the-century] play-mode window policy", {
            action: decision.shouldClose ? "blocked" : "allowed",
            reason: decision.reason,
            appId,
            appName,
            title: app?.title ?? ""
        });
    }

    _shouldCloseWindow(app) {
        return this._getWindowPolicyDecision(app).shouldClose;
    }

    _closeDisallowedWindow(app) {
        const decision = this._getWindowPolicyDecision(app);
        this._debugWindowPolicyDecision(app, decision);
        if (!decision.shouldClose) return;
        if (app?.rendered === false) return;

        const key = String(app.id ?? app.appId ?? app.constructor?.name ?? "unknown");
        if (!this.dismissedIds.has(key)) {
            this.dismissedIds.add(key);
            ui.notifications?.info(`Play mode blocked window: ${app.title ?? app.constructor?.name ?? "Unknown"}`);
        }

        try {
            if (typeof app.close === "function") {
                void app.close();
            }
        } catch (error) {
            console.warn("[turn-of-the-century] Failed to close blocked window.", error);
        }
    }

    _onRenderApplicationV2(app) {
        this._closeDisallowedWindow(app);
    }

    _onRenderApplicationV1(app) {
        this._closeDisallowedWindow(app);
    }

    auditWindowPolicy({ closeBlocked = false, includeAllowed = true, notify = true } = {}) {
        const report = {
            playMode: this.isPlayMode(),
            policyEnabled: this.shouldBlockFloatingWindows(),
            total: 0,
            blocked: 0,
            allowed: 0,
            ignored: 0,
            entries: []
        };

        const windows = Object.values(ui.windows ?? {});
        for (const app of windows) {
            report.total += 1;

            const decision = this._getWindowPolicyDecision(app);
            const appId = String(app?.id ?? app?.appId ?? "unknown");
            const appName = String(app?.constructor?.name ?? "UnknownApp");
            const baseEntry = {
                appId,
                appName,
                title: String(app?.title ?? ""),
                reason: decision.reason,
                shouldClose: Boolean(decision.shouldClose)
            };

            if (decision.reason === "policy-disabled") {
                report.ignored += 1;
                if (includeAllowed) {
                    report.entries.push({ ...baseEntry, action: "ignored" });
                }
                continue;
            }

            if (decision.shouldClose) {
                report.blocked += 1;
                let closed = false;
                if (closeBlocked) {
                    try {
                        if (typeof app?.close === "function") {
                            void app.close();
                            closed = true;
                        }
                    } catch (error) {
                        console.warn("[turn-of-the-century] Failed to close blocked window during audit.", error);
                    }
                }

                report.entries.push({
                    ...baseEntry,
                    action: closeBlocked ? (closed ? "closed" : "failed-close") : "would-close"
                });
                continue;
            }

            report.allowed += 1;
            if (includeAllowed) {
                report.entries.push({ ...baseEntry, action: "allowed" });
            }
        }

        if (notify) {
            const prefix = closeBlocked ? "Window policy audit + enforcement" : "Window policy audit";
            ui.notifications?.info(
                `${prefix}: total=${report.total}, blocked=${report.blocked}, allowed=${report.allowed}, ignored=${report.ignored}.`
            );
        }

        return report;
    }

    enforceWindowPolicy() {
        if (!this.shouldBlockFloatingWindows()) return;

        for (const app of Object.values(ui.windows ?? {})) {
            this._closeDisallowedWindow(app);
        }
    }
}

export {
    UI_MODES,
    UI_CONTEXTS,
    TotcTabGroupManager,
    TabGroupConsoleAPI
};
