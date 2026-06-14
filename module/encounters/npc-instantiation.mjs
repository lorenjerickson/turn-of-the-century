/**
 * NPC Instantiation System
 * 
 * Converts adversary profiles into actual Foundry Actor documents for combat use.
 * Handles dynamic NPC generation with profile-based stats, items, and behaviors.
 */

import { ADVERSARY_PROFILES, instantiateEncounterSeed } from "./enhanced-seeds.mjs";
import {
    requireActorDocumentClass,
    requireCombatDocumentClass,
    requireFolderDocumentClass
} from "../foundry-v14-runtime.mjs";

const NPC_ACTOR_TYPE = "pawn";
const DEFAULT_NPC_FOLDER_NAME = "Combat NPCs";
const ActorDocumentClass = requireActorDocumentClass();
const CombatDocumentClass = requireCombatDocumentClass();
const FolderDocumentClass = requireFolderDocumentClass();

/**
 * Get or create the Combat NPCs folder for temporary actors
 * @returns {Promise<Folder>} The Combat NPCs folder
 */
async function getOrCreateNpcFolder() {
    const folderName = DEFAULT_NPC_FOLDER_NAME;
    let folder = game.folders?.find((f) => f.name === folderName && f.type === "Actor");

    if (!folder) {
        folder = await FolderDocumentClass.create({
            name: folderName,
            type: "Actor",
            parent: null
        });
    }

    return folder;
}

/**
 * Create a temporary NPC actor from an adversary profile
 * @param {Object} profile - Adversary profile object
 * @param {Folder} folder - Folder to place the actor in
 * @param {Object} options - Additional options
 * @param {string} options.suffix - Suffix for actor name (e.g., " #1")
 * @param {boolean} options.temporary - Mark as temporary (default: true)
 * @returns {Promise<Actor>} The created actor
 */
async function createNpcActorFromProfile(profile, folder = null, options = {}) {
    const { suffix = "", temporary = true } = options;

    // Get folder
    const targetFolder = folder ?? (await getOrCreateNpcFolder());

    // Build actor data
    const actorData = {
        name: `${profile.name}${suffix}`,
        type: NPC_ACTOR_TYPE,
        folder: targetFolder.id,
        system: {
            // Profile metadata
            profile: {
                role: String(profile.role ?? "combatant"),
                faction: String(profile.faction ?? "unknown"),
                difficulty: String(profile.difficulty ?? "standard")
            },
            // Health scaling
            physical: {
                health: {
                    max: toNumber(profile.healthBonus ?? 0, 0) + 3,
                    current: toNumber(profile.healthBonus ?? 0, 0) + 3
                }
            },
            // Skills from profile
            skills: profile.skills ? foundry.utils.deepClone(profile.skills) : {},
            // Temporary flag
            ...(temporary && { temporary: true })
        },
        items: [],
        flags: {
            "turn-of-the-century": {
                profileName: profile.name,
                isNpcFromProfile: true,
                equipmentList: profile.equipment ?? [],
                notes: profile.notes ?? ""
            }
        }
    };

    // Create the actor
    const actor = await ActorDocumentClass.create(actorData);
    return actor;
}

/**
 * Create multiple NPCs from an encounter seed
 * @param {Object} seed - Encounter seed with adversary names
 * @param {string} difficulty - Difficulty level (standard, hard)
 * @param {Folder} folder - Folder to place actors in
 * @returns {Promise<Array<Actor>>} Created actor documents
 */
async function createNpcsFromEncounterSeed(seed, difficulty = "standard", folder = null) {
    const targetFolder = folder ?? (await getOrCreateNpcFolder());

    const adversaryNames = seed.adversaries ?? [];
    if (!Array.isArray(adversaryNames) || adversaryNames.length === 0) {
        console.warn("[NPC Instantiation] No adversaries in seed:", seed);
        return [];
    }

    // Instantiate profiles with difficulty scaling
    const profiles = instantiateEncounterSeed(seed, difficulty);

    // Group by name to add suffixes if duplicates
    const nameGroups = {};
    adversaryNames.forEach((name) => {
        nameGroups[name] = (nameGroups[name] ?? 0) + 1;
    });

    // Create actors
    const createdActors = [];
    const nameCounts = {};

    for (const name of adversaryNames) {
        const profile = ADVERSARY_PROFILES[name];
        if (!profile) {
            console.warn(`[NPC Instantiation] Unknown profile: ${name}`);
            continue;
        }

        // Add suffix if this name appears multiple times
        nameCounts[name] = (nameCounts[name] ?? 0) + 1;
        const suffix = nameGroups[name] > 1 ? ` #${nameCounts[name]}` : "";

        try {
            const actor = await createNpcActorFromProfile(profile, targetFolder, { suffix });
            createdActors.push(actor);
        } catch (err) {
            console.error(`[NPC Instantiation] Failed to create actor for ${name}:`, err);
        }
    }

    return createdActors;
}

/**
 * Add created NPCs to combat as combatants
 * @param {Combat} combat - Combat to add to
 * @param {Array<Actor>} actors - Actors to add
 * @param {Object} options - Combat creation options
 * @returns {Promise<Array<Combatant>>} Created combatants
 */
async function addActorsToCombat(combat, actors, options = {}) {
    if (!combat || !Array.isArray(actors)) return [];

    const combatantData = actors.map((actor) => ({
        actorId: actor.id,
        tokenId: null,
        hidden: false,
        defeated: false
    }));

    const combatants = await combat.createEmbeddedDocuments("Combatant", combatantData);
    return combatants;
}

/**
 * Create combat encounter with NPCs from seed
 * @param {Object} seed - Encounter seed
 * @param {string} difficulty - Difficulty (standard, hard)
 * @param {Combat} baseCombat - Existing combat to add to (optional)
 * @returns {Promise<Object>} Result object with combat and created actors
 */
async function createCombatEncounterWithNpcs(seed, difficulty = "standard", baseCombat = null) {
    const targetFolder = await getOrCreateNpcFolder();

    // Create NPCs from seed
    const actors = await createNpcsFromEncounterSeed(seed, difficulty, targetFolder);

    if (actors.length === 0) {
        console.warn("[NPC Instantiation] No NPCs created from seed");
        return { combat: baseCombat, actors: [] };
    }

    // Use existing combat or create new
    let combat = baseCombat ?? game.combat;
    if (!combat) {
        const combatData = {
            scene: game.scenes.current?.id ?? null
        };
        combat = await CombatDocumentClass.create(combatData);
    }

    // Add NPCs to combat
    const combatants = await addActorsToCombat(combat, actors);

    console.log(`[NPC Instantiation] Created ${actors.length} NPCs and ${combatants.length} combatants`);

    return {
        combat,
        actors,
        combatants
    };
}

/**
 * Clean up temporary NPC actors (called after encounter ends)
 * @param {Array<Actor>} actors - Actors to delete
 * @returns {Promise<Array>} Deleted actor IDs
 */
async function cleanupTemporaryNpcs(actors = null) {
    let targetsToDelete;

    if (actors) {
        // Delete specific actors
        targetsToDelete = Array.isArray(actors) ? actors : [actors];
    } else {
        // Delete all temporary NPCs
        const folder = game.folders?.find((f) => f.name === DEFAULT_NPC_FOLDER_NAME && f.type === "Actor");
        if (!folder) return [];

        targetsToDelete = game.actors?.filter(
            (a) => a.folder?.id === folder.id && a.getFlag("turn-of-the-century", "isNpcFromProfile")
        ) ?? [];
    }

    const deletedIds = [];
    for (const actor of targetsToDelete) {
        try {
            await actor.delete();
            deletedIds.push(actor.id);
        } catch (err) {
            console.error(`[NPC Instantiation] Failed to delete actor ${actor.id}:`, err);
        }
    }

    return deletedIds;
}

/**
 * Get all active temporary NPCs
 * @returns {Array<Actor>} Actors marked as temporary NPCs
 */
function getActiveTemporaryNpcs() {
    const folder = game.folders?.find((f) => f.name === DEFAULT_NPC_FOLDER_NAME && f.type === "Actor");
    if (!folder) return [];

    return (
        game.actors?.filter(
            (a) => a.folder?.id === folder.id && a.getFlag("turn-of-the-century", "isNpcFromProfile")
        ) ?? []
    );
}

/**
 * Get NPC details for display
 * @param {Actor} actor - NPC actor to get details for
 * @returns {Object} Display object with name, role, faction, health
 */
function getNpcDetails(actor) {
    if (!actor) return null;

    const profile = actor.system?.profile ?? {};
    const health = actor.system?.physical?.health ?? { current: 0, max: 0 };

    return {
        name: actor.name,
        role: profile.role ?? "Combatant",
        faction: profile.faction ?? "Unknown",
        difficulty: profile.difficulty ?? "Standard",
        health: {
            current: toNumber(health.current, 0),
            max: toNumber(health.max, 0)
        },
        healthPercent: Math.max(0, Math.round(((toNumber(health.current, 0) / toNumber(health.max, 1)) * 100) | 0)),
        skills: actor.system?.skills ?? {},
        notes: actor.getFlag("turn-of-the-century", "notes") ?? ""
    };
}

/**
 * Console API for NPC instantiation
 */
export class NpcInstantiationConsoleAPI {
    /**
     * Create NPCs from a seed
     */
    static async createFromSeed(seed, difficulty = "standard") {
        const result = await createCombatEncounterWithNpcs(seed, difficulty);
        console.log(`Created ${result.actors.length} NPCs`);
        result.actors.forEach((a) => {
            const details = getNpcDetails(a);
            console.log(` - ${details.name} (${details.role})`);
        });
        return result;
    }

    /**
     * List active temporary NPCs
     */
    static listActive() {
        const npcs = getActiveTemporaryNpcs();
        console.log(`=== Active Temporary NPCs (${npcs.length}) ===`);
        npcs.forEach((npc) => {
            const details = getNpcDetails(npc);
            console.log(
                `${details.name}: ${details.role} (${details.faction}) - HP: ${details.health.current}/${details.health.max}`
            );
        });
        return npcs;
    }

    /**
     * Get details for a specific NPC
     */
    static getDetails(actor) {
        const details = getNpcDetails(actor);
        if (details) {
            console.log(JSON.stringify(details, null, 2));
        }
        return details;
    }

    /**
     * Clean up all temporary NPCs
     */
    static async cleanup() {
        const deleted = await cleanupTemporaryNpcs();
        console.log(`Cleaned up ${deleted.length} temporary NPCs`);
        return deleted;
    }
}

export {
    getOrCreateNpcFolder,
    createNpcActorFromProfile,
    createNpcsFromEncounterSeed,
    addActorsToCombat,
    createCombatEncounterWithNpcs,
    cleanupTemporaryNpcs,
    getActiveTemporaryNpcs,
    getNpcDetails
};
