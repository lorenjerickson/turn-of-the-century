import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    getFoundryWelcomeScene,
    TOTC_LOBBY_SCENE_BACKGROUND,
    TOTC_LOBBY_SCENE_DATA,
    TOTC_LOBBY_SCENE_ID,
    ensureTotcLobbyScene,
    getTotcLobbyScene,
    isFoundryWelcomeScene
} from "../module/seeded-scenes.mjs";
import { TOTC_SAMPLE_COMPENDIUMS, TOTC_SAMPLE_SCENES } from "../module/sample-content.mjs";

const originalGame = globalThis.game;
const originalFoundry = globalThis.foundry;

afterEach(() => {
    globalThis.game = originalGame;
    globalThis.foundry = originalFoundry;
});

describe("seeded scenes", () => {
    it("includes the Lobby scene in sample scene content and starter pack mapping", () => {
        assert.equal(TOTC_SAMPLE_COMPENDIUMS.scenes, "starter-scenes");
        assert.deepEqual(TOTC_SAMPLE_SCENES, [TOTC_LOBBY_SCENE_DATA]);
        assert.equal(TOTC_LOBBY_SCENE_DATA._id, TOTC_LOBBY_SCENE_ID);
        assert.equal(TOTC_LOBBY_SCENE_DATA.background.src, TOTC_LOBBY_SCENE_BACKGROUND);
        assert.equal(TOTC_LOBBY_SCENE_DATA.texture.src, TOTC_LOBBY_SCENE_BACKGROUND);
    });

    it("resolves existing Lobby scenes by id, seed flag, or name", () => {
        const byId = { id: TOTC_LOBBY_SCENE_ID, name: "Different" };
        assert.equal(getTotcLobbyScene({ get: () => byId, contents: [] }), byId);

        const byFlag = { id: "other", flags: { "turn-of-the-century": { seededLobby: true } } };
        assert.equal(getTotcLobbyScene({ get: () => null, contents: [byFlag] }), byFlag);

        const byName = { id: "named", name: "Lobby" };
        assert.equal(getTotcLobbyScene({ get: () => null, contents: [byName] }), byName);
    });

    it("recognizes Foundry welcome scenes as adoptable Lobby candidates", () => {
        const activeWelcome = { id: "welcome-active", name: "Welcome to Foundry Virtual Tabletop", active: true };
        const inactiveWelcome = { id: "welcome-inactive", name: "Welcome", active: false };
        const userLobby = { id: "named", name: "Lobby" };

        assert.equal(isFoundryWelcomeScene(activeWelcome), true);
        assert.equal(isFoundryWelcomeScene(userLobby), false);
        assert.equal(
            getFoundryWelcomeScene({ get: () => null, contents: [inactiveWelcome, activeWelcome] }),
            activeWelcome
        );
        assert.equal(
            getTotcLobbyScene({ get: () => null, contents: [userLobby, activeWelcome] }),
            activeWelcome
        );
    });

    it("creates the Lobby scene for GMs when no Lobby exists", async () => {
        let createdData = null;
        globalThis.game = {
            ready: true,
            user: { isGM: true },
            scenes: {
                get: () => null,
                contents: []
            }
        };
        globalThis.foundry = {
            utils: {
                deepClone: (value) => structuredClone(value)
            }
        };

        const createdScene = { id: TOTC_LOBBY_SCENE_ID, name: "Lobby" };
        const result = await ensureTotcLobbyScene({
            SceneClass: {
                create: async (data) => {
                    createdData = data;
                    return createdScene;
                }
            }
        });

        assert.equal(result, createdScene);
        assert.equal(createdData._id, TOTC_LOBBY_SCENE_ID);
        assert.equal(createdData.background.src, TOTC_LOBBY_SCENE_BACKGROUND);
    });

    it("adopts an existing Foundry welcome scene as the Lobby scene", async () => {
        let updateData = null;
        const welcomeScene = {
            id: "foundry-welcome",
            name: "Welcome to Foundry Virtual Tabletop",
            active: true,
            background: { src: "" },
            update: async (data) => {
                updateData = data;
                return { ...welcomeScene, ...data };
            }
        };

        globalThis.game = {
            ready: true,
            user: { isGM: true },
            scenes: {
                get: () => null,
                contents: [welcomeScene]
            }
        };
        globalThis.foundry = {
            utils: {
                deepClone: (value) => structuredClone(value)
            }
        };

        const result = await ensureTotcLobbyScene();

        assert.equal(result.name, "Lobby");
        assert.equal(updateData._id, undefined);
        assert.equal(updateData.active, undefined);
        assert.equal(updateData.background.src, TOTC_LOBBY_SCENE_BACKGROUND);
        assert.equal(updateData.texture.src, TOTC_LOBBY_SCENE_BACKGROUND);
        assert.equal(updateData.flags["turn-of-the-century"].seededLobby, true);
    });

    it("repairs an existing Lobby scene that is missing the shipped background", async () => {
        let updateData = null;
        const lobbyScene = {
            id: TOTC_LOBBY_SCENE_ID,
            name: "Lobby",
            background: { src: "" },
            update: async (data) => {
                updateData = data;
                return { ...lobbyScene, ...data };
            }
        };

        globalThis.game = {
            ready: true,
            user: { isGM: true },
            scenes: {
                get: () => lobbyScene,
                contents: [lobbyScene]
            }
        };
        globalThis.foundry = {
            utils: {
                deepClone: (value) => structuredClone(value)
            }
        };

        const result = await ensureTotcLobbyScene();

        assert.equal(result.name, "Lobby");
        assert.equal(updateData.background.src, TOTC_LOBBY_SCENE_BACKGROUND);
        assert.equal(updateData.texture.src, TOTC_LOBBY_SCENE_BACKGROUND);
        assert.equal(updateData.flags["turn-of-the-century"].seededLobby, true);
    });

    it("does not overwrite an existing Lobby scene with a saved world background", async () => {
        let updateCalled = false;
        const lobbyScene = {
            id: TOTC_LOBBY_SCENE_ID,
            name: "Lobby",
            background: { src: "assets/images/scenes/lobby.jpg" },
            flags: { "turn-of-the-century": { seededLobby: true } },
            update: async () => {
                updateCalled = true;
                return lobbyScene;
            }
        };

        globalThis.game = {
            ready: true,
            user: { isGM: true },
            scenes: {
                get: () => lobbyScene,
                contents: [lobbyScene]
            }
        };

        const result = await ensureTotcLobbyScene();

        assert.equal(result, lobbyScene);
        assert.equal(updateCalled, false);
    });
});
