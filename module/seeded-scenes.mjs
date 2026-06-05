import { requireSceneDocumentClass } from "./foundry-v14-runtime.mjs";

export const TOTC_LOBBY_SCENE_ID = "totclobbyscene01";
export const TOTC_LOBBY_SCENE_NAME = "Lobby";
export const TOTC_LOBBY_SCENE_BACKGROUND = "systems/turn-of-the-century/assets/images/scenes/lobby.jpg";

export const TOTC_LOBBY_SCENE_DATA = Object.freeze({
    _id: TOTC_LOBBY_SCENE_ID,
    name: TOTC_LOBBY_SCENE_NAME,
    active: false,
    navigation: true,
    navOrder: 0,
    width: 1200,
    height: 672,
    padding: 0,
    shiftX: 0,
    shiftY: 0,
    background: {
        src: TOTC_LOBBY_SCENE_BACKGROUND
    },
    texture: {
        src: TOTC_LOBBY_SCENE_BACKGROUND
    },
    grid: {
        type: 0,
        size: 100,
        distance: 5,
        units: "ft"
    },
    drawings: [],
    lights: [],
    notes: [],
    sounds: [],
    templates: [],
    tiles: [],
    tokens: [],
    walls: [],
    flags: {
        "turn-of-the-century": {
            seededLobby: true
        }
    }
});

function clone(value) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    return structuredClone(value);
}

export function getTotcLobbyScene(scenes = globalThis.game?.scenes) {
    return scenes?.get?.(TOTC_LOBBY_SCENE_ID)
        ?? (scenes?.contents ?? []).find((scene) => scene?.flags?.["turn-of-the-century"]?.seededLobby)
        ?? (scenes?.contents ?? []).find((scene) => scene?.name === TOTC_LOBBY_SCENE_NAME)
        ?? null;
}

export async function ensureTotcLobbyScene({ SceneClass = null } = {}) {
    if (!globalThis.game?.ready || !game.user?.isGM) return getTotcLobbyScene();

    const existing = getTotcLobbyScene();
    if (existing) return existing;

    const ResolvedSceneClass = SceneClass ?? requireSceneDocumentClass();
    return ResolvedSceneClass.create(clone(TOTC_LOBBY_SCENE_DATA));
}
