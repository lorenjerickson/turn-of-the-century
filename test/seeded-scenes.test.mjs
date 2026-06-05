import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    TOTC_LOBBY_SCENE_BACKGROUND,
    TOTC_LOBBY_SCENE_DATA,
    TOTC_LOBBY_SCENE_ID,
    ensureTotcLobbyScene,
    getTotcLobbyScene
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
});
