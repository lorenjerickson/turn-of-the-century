import {
    renderFoundryApplication,
    requireActorDocumentClass
} from "../../../foundry-v14-runtime.mjs";

const DEFAULT_NPC_NAME = "New NPC";
const NPC_ACTOR_TYPE = "pawn";
const SYSTEM_ID = "turn-of-the-century";

function normalizeActorNames(actors) {
    const contents = actors?.contents ?? actors ?? [];
    return new Set(Array.from(contents).map((actor) => String(actor?.name ?? "")).filter(Boolean));
}

export function createUniqueNpcName(baseName = DEFAULT_NPC_NAME, actors = []) {
    const rootName = String(baseName || DEFAULT_NPC_NAME).trim() || DEFAULT_NPC_NAME;
    const existingNames = normalizeActorNames(actors);
    if (!existingNames.has(rootName)) return rootName;

    let index = 2;
    while (existingNames.has(`${rootName} ${index}`)) index += 1;
    return `${rootName} ${index}`;
}

export function buildDesignNpcActorData({
    name = DEFAULT_NPC_NAME,
    folderId = null,
    sourcePanelId = ""
} = {}) {
    return {
        name: String(name || DEFAULT_NPC_NAME).trim() || DEFAULT_NPC_NAME,
        type: NPC_ACTOR_TYPE,
        ...(folderId ? { folder: folderId } : {}),
        system: {
            classification: {
                category: "npc",
                species: "Human",
                size: "med"
            },
            profile: {
                role: "Supporting NPC",
                faction: "",
                summary: "Created from the workspace design tools.",
                tags: ["design-created"]
            },
            pawn: {
                role: "Supporting NPC",
                disposition: "neutral",
                squad: ""
            }
        },
        flags: {
            [SYSTEM_ID]: {
                designCreated: true,
                sourcePanelId: String(sourcePanelId ?? "")
            }
        }
    };
}

export async function createNpcDesignActor({
    actorClass = null,
    foundry = globalThis.foundry,
    actors = globalThis.game?.actors,
    folderId = null,
    sourcePanelId = "",
    renderSheet = true
} = {}) {
    actorClass ??= requireActorDocumentClass({ foundry });
    if (!actorClass?.create) {
        throw new Error("Actor creation is not available.");
    }

    const name = createUniqueNpcName(DEFAULT_NPC_NAME, actors);
    const actorData = buildDesignNpcActorData({ name, folderId, sourcePanelId });
    const actor = await actorClass.create(actorData);
    if (renderSheet) renderFoundryApplication(actor?.sheet, { force: true });
    return actor;
}
