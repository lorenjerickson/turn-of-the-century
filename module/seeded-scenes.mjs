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

const FOUNDRY_WELCOME_NAME_PATTERN = /(?:\bwelcome\b.*\bfoundry\b|\bfoundry\b.*\bwelcome\b|^welcome$)/i;

function clone(value) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    return structuredClone(value);
}

function sceneName(scene) {
    return String(scene?.name ?? scene?._source?.name ?? "");
}

function sceneBackgroundSrc(scene) {
    return scene?.background?.src
        ?? scene?.texture?.src
        ?? scene?._source?.background?.src
        ?? scene?._source?.texture?.src
        ?? scene?._source?.img
        ?? "";
}

function isSeededLobbyScene(scene) {
    return Boolean(scene?.flags?.["turn-of-the-century"]?.seededLobby
        ?? scene?._source?.flags?.["turn-of-the-century"]?.seededLobby);
}

function hasSceneBackground(scene) {
    return Boolean(sceneBackgroundSrc(scene));
}

function makeLobbySceneUpdateData() {
    const data = clone(TOTC_LOBBY_SCENE_DATA);
    delete data._id;
    delete data.active;
    return data;
}

function sceneCollectionContents(scenes) {
    return scenes?.contents ?? [];
}

export function isFoundryWelcomeScene(scene) {
    const name = sceneName(scene);
    if (!name || name === TOTC_LOBBY_SCENE_NAME || isSeededLobbyScene(scene)) return false;
    return FOUNDRY_WELCOME_NAME_PATTERN.test(name);
}

export function getFoundryWelcomeScene(scenes = globalThis.game?.scenes) {
    const contents = sceneCollectionContents(scenes);
    return contents.find((scene) => isFoundryWelcomeScene(scene) && scene?.active)
        ?? contents.find((scene) => isFoundryWelcomeScene(scene))
        ?? null;
}

export function getTotcLobbyScene(scenes = globalThis.game?.scenes) {
    return scenes?.get?.(TOTC_LOBBY_SCENE_ID)
        ?? sceneCollectionContents(scenes).find((scene) => isSeededLobbyScene(scene))
        ?? getFoundryWelcomeScene(scenes)
        ?? sceneCollectionContents(scenes).find((scene) => sceneName(scene) === TOTC_LOBBY_SCENE_NAME)
        ?? null;
}

async function updateSceneAsLobby(scene) {
    if (typeof scene?.update !== "function") return scene;
    return scene.update(makeLobbySceneUpdateData());
}

export async function ensureTotcLobbyScene({ SceneClass = null } = {}) {
    if (!globalThis.game?.ready || !game.user?.isGM) return getTotcLobbyScene();

    const existing = getTotcLobbyScene();
    if (existing) {
        if (isFoundryWelcomeScene(existing) || !hasSceneBackground(existing) || !isSeededLobbyScene(existing)) {
            return updateSceneAsLobby(existing);
        }
        return existing;
    }

    const ResolvedSceneClass = SceneClass ?? requireSceneDocumentClass();
    return ResolvedSceneClass.create(clone(TOTC_LOBBY_SCENE_DATA));
}
