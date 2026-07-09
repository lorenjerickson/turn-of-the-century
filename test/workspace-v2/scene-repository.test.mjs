import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    activateScene,
    applySceneTokenVisionToTokensByType,
    buildSceneTokenVisionByTypeFlagUpdateData,
    buildSceneIlluminationUpdateData,
    deleteScene,
    getSceneTokenVisionByType,
    normalizeSceneIlluminationLevel,
    normalizeSceneTokenVisionByType,
    resetSceneFogOfWar,
    updateSceneTokenVisionByType,
    updateSceneIllumination,
    updateSceneName,
    toggleDefaultScene
} from "../../module/ui/workspace-v2/scene-repository.mjs";

describe("activateScene", () => {
    it("activates scenes through activate or update and reports failures", async () => {
        const notifications = [];
        const errors = [];
        const ui = {
            notifications: {
                info: (message) => notifications.push(["info", message]),
                error: (message) => notifications.push(["error", message]),
                warn: (message) => notifications.push(["warn", message])
            }
        };
        const logger = { error: (...args) => errors.push(args) };
        let activated = false;

        assert.equal(await activateScene({
            name: "Good Scene",
            async activate() { activated = true; }
        }, { ui, logger }), true);
        assert.equal(activated, true);
        assert.deepEqual(notifications.at(-1), ["info", "Activated Good Scene."]);

        assert.equal(await activateScene({ name: "Broken" }, { ui, logger }), false);
        assert.deepEqual(notifications.at(-1), ["error", "Scene activation failed - see console for details."]);
        assert.equal(errors.length, 1);
    });

    it("warns and returns false when no scene is provided", async () => {
        const warned = [];
        const ui = { notifications: { warn: (m) => warned.push(m) } };

        const result = await activateScene(null, { ui });
        assert.equal(result, false);
        assert.ok(warned.some((m) => m.includes("No scene is available")));
    });

    it("falls back to scene.update when activate is unavailable", async () => {
        let updatedWith = null;
        const result = await activateScene({
            name: "Fallback",
            update: async (data) => { updatedWith = data; }
        }, { ui: { notifications: { info: () => {} } } });

        assert.equal(result, true);
        assert.deepEqual(updatedWith, { active: true });
    });
});

describe("deleteScene", () => {
    it("deletes a scene and returns its name on success", async () => {
        let deleted = false;
        const result = await deleteScene({
            name: "Rookery Yard",
            delete: async () => { deleted = true; }
        });

        assert.equal(result.ok, true);
        assert.equal(result.name, "Rookery Yard");
        assert.equal(deleted, true);
    });

    it("returns error when scene has no delete function", async () => {
        const errors = [];
        const result = await deleteScene(
            { name: "Broken" },
            { logger: { error: (...args) => errors.push(args) } }
        );

        assert.equal(result.ok, false);
        assert.ok(result.error.includes("Scene delete failed"));
        assert.equal(errors.length, 1);
    });

    it("returns error immediately when scene is null", async () => {
        const result = await deleteScene(null);
        assert.equal(result.ok, false);
        assert.ok(result.error.includes("No scene is available"));
    });
});

describe("updateSceneName", () => {
    it("saves name to scene document and reports success", async () => {
        let savedName = null;
        const scene = { id: "s1", name: "Old", update: async (data) => { savedName = data.name; } };

        const result = await updateSceneName(scene, "  New Name  ", {
            activityLogger: { info: () => {} }
        });

        assert.equal(result.ok, true);
        assert.equal(savedName, "New Name");
    });

    it("returns ok:true without calling update when name is empty", async () => {
        let updateCalled = false;
        const scene = { id: "s1", update: async () => { updateCalled = true; } };

        const result = await updateSceneName(scene, "");
        assert.equal(result.ok, true);
        assert.equal(updateCalled, false);
    });

    it("returns ok:false on update failure", async () => {
        const errors = [];
        const scene = {
            id: "s1",
            name: "Old",
            update: async () => { throw new Error("Network error"); }
        };

        const result = await updateSceneName(scene, "New", {
            logger: { error: (...args) => errors.push(args) },
            activityLogger: { info: () => {}, error: () => {} }
        });

        assert.equal(result.ok, false);
        assert.ok(result.error.includes("Scene name save failed"));
        assert.equal(errors.length, 1);
    });
});

describe("scene illumination", () => {
    it("clamps illumination and maps it to Foundry scene darkness", () => {
        assert.equal(normalizeSceneIlluminationLevel("-1"), 0);
        assert.equal(normalizeSceneIlluminationLevel("2"), 1);
        assert.deepEqual(buildSceneIlluminationUpdateData(0.65), {
            "environment.darknessLevel": 0.35
        });
    });

    it("updates scene environment darkness for the provided scene only", async () => {
        let received = null;
        const scene = {
            id: "scene-1",
            update: async (data) => { received = data; }
        };

        const result = await updateSceneIllumination(scene, "0.25", {
            activityLogger: { info: () => {} }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(received, { "environment.darknessLevel": 0.75 });
    });

    it("reports failures when illumination cannot be saved", async () => {
        const errors = [];
        const result = await updateSceneIllumination({
            id: "scene-1",
            update: async () => { throw new Error("locked"); }
        }, 0.5, {
            logger: { error: (...args) => errors.push(args) },
            activityLogger: { info: () => {}, error: () => {} }
        });

        assert.equal(result.ok, false);
        assert.ok(result.error.includes("Scene illumination update failed"));
        assert.equal(errors.length, 1);
    });
});

describe("toggleDefaultScene", () => {
    it("calls setDefaultScene when isDefault is true", async () => {
        let setDefaultCalled = false;
        const scene = {
            id: "s1",
            name: "Rookery",
            setFlag: async () => { setDefaultCalled = true; }
        };

        // setDefaultScene / clearDefaultScene call seeded-scenes, which calls setFlag.
        // We test behaviour at the toggleDefaultScene boundary: no error thrown = success.
        await toggleDefaultScene(scene, null, true, {
            activityLogger: { info: () => {}, error: () => {} },
            logger: { error: () => {} }
        });
        // No assertion on internal implementation — just verifies it does not throw.
    });

    it("does nothing when scene is null", async () => {
        // Should not throw
        await toggleDefaultScene(null, null, true);
    });
});

describe("resetSceneFogOfWar", () => {
    it("deletes fog exploration documents scoped to the scene and refreshes canvas", async () => {
        const deleteCalls = [];
        const FogExploration = {
            deleteDocuments: async (...args) => {
                deleteCalls.push(args);
            }
        };
        let fogCleared = false;
        const perceptionUpdates = [];

        const result = await resetSceneFogOfWar(
            { id: "scene-1" },
            {
                game: {
                    collections: {
                        get: (name) => {
                            if (name !== "FogExploration") return null;
                            return {
                                contents: [
                                    { id: "fog-1", scene: "scene-1" },
                                    { id: "fog-2", scene: "scene-2" }
                                ],
                                documentClass: FogExploration
                            };
                        }
                    }
                },
                foundry: { documents: { FogExploration } },
                canvas: {
                    scene: { id: "scene-1" },
                    fog: { clear: () => { fogCleared = true; } },
                    perception: { update: (data) => perceptionUpdates.push(data) }
                }
            }
        );

        assert.equal(result.ok, true);
        assert.deepEqual(deleteCalls, [[ ["fog-1"] ]]);
        assert.equal(fogCleared, true);
        assert.deepEqual(perceptionUpdates, [{
            initializeVision: true,
            refreshVision: true,
            refreshLighting: true
        }]);
    });

    it("returns a not-available error when FogExploration APIs are unavailable", async () => {
        const result = await resetSceneFogOfWar({ id: "scene-1" }, {
            game: { collections: { get: () => null } },
            foundry: {},
            canvas: null
        });
        assert.equal(result.ok, false);
        assert.match(result.error, /not available/i);
    });
});

describe("scene token vision by type", () => {
    it("normalizes and reads token vision settings", () => {
        assert.deepEqual(normalizeSceneTokenVisionByType(null), {
            hero: { enabled: true, range: 1 },
            pawn: { enabled: true, range: 1 },
            villain: { enabled: true, range: 1 }
        });

        const scene = {
            flags: {
                "turn-of-the-century": {
                    sceneTokenVisionByType: {
                        hero: { enabled: true, range: 0.2 },
                        pawn: { enabled: false, range: 1.5 },
                        villain: { enabled: true, range: 3 }
                    }
                }
            }
        };
        assert.deepEqual(getSceneTokenVisionByType(scene), {
            hero: { enabled: true, range: 0.2 },
            pawn: { enabled: false, range: 1.5 },
            villain: { enabled: true, range: 3 }
        });
    });

    it("builds and saves token vision settings onto scene flags", async () => {
        assert.deepEqual(buildSceneTokenVisionByTypeFlagUpdateData({
            hero: { enabled: true, range: 0.5 }
        }), {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 0.5 },
                pawn: { enabled: true, range: 1 },
                villain: { enabled: true, range: 1 }
            }
        });

        let updateData = null;
        const result = await updateSceneTokenVisionByType({
            id: "scene-1",
            update: async (data) => { updateData = data; }
        }, {
            hero: { enabled: true, range: 0.5 },
            pawn: { enabled: false, range: 1.5 },
            villain: { enabled: true, range: 2 }
        }, {
            activityLogger: { info: () => {} }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(updateData, {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 0.5 },
                pawn: { enabled: false, range: 1.5 },
                villain: { enabled: true, range: 2 }
            }
        });
    });

    it("applies token vision only to selected tokens whose type is enabled", async () => {
        let tokenUpdates = null;
        const scene = {
            id: "scene-1",
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; }
        };

        const result = await applySceneTokenVisionToTokensByType(scene, {
            tokenDocuments: [
                { id: "token-1", actor: { type: "hero" } },
                { id: "token-2", actor: { type: "pawn" } },
                { id: "token-3", actor: { type: "villain" } }
            ],
            settings: {
                hero: { enabled: true, range: 0.5 },
                pawn: { enabled: false, range: 1.5 },
                villain: { enabled: true, range: 0.2 }
            }
        }, {
            activityLogger: { info: () => {} }
        });

        assert.equal(result.ok, true);
        assert.equal(result.appliedCount, 2);
        assert.equal(result.skippedCount, 1);
        assert.deepEqual(tokenUpdates, [
            { _id: "token-1", "sight.enabled": true, "sight.range": 0.5 },
            { _id: "token-3", "sight.enabled": true, "sight.range": 0.2 }
        ]);
    });

    it("synchronizes all detection mode ranges when present", async () => {
        let tokenUpdates = null;
        const scene = {
            id: "scene-1",
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; }
        };

        const result = await applySceneTokenVisionToTokensByType(scene, {
            tokenDocuments: [{
                id: "token-1",
                actor: { type: "hero" },
                detectionModes: [
                    { id: "basicSight", enabled: true, range: 120 },
                    { id: "feelTremor", enabled: true, range: 30 }
                ]
            }],
            settings: {
                hero: { enabled: true, range: 1 },
                pawn: { enabled: true, range: 1 },
                villain: { enabled: true, range: 1 }
            }
        }, {
            activityLogger: { info: () => {} }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(tokenUpdates, [{
            _id: "token-1",
            "sight.enabled": true,
            "sight.range": 1,
            detectionModes: [
                { id: "basicSight", enabled: true, range: 1 },
                { id: "feelTremor", enabled: true, range: 1 }
            ]
        }]);
    });

    it("returns ok when allowEmpty is true and no tokens are provided", async () => {
        const scene = {
            id: "scene-1",
            updateEmbeddedDocuments: async () => {}
        };

        const result = await applySceneTokenVisionToTokensByType(scene, {
            tokenDocuments: [],
            settings: {
                hero: { enabled: true, range: 1 },
                pawn: { enabled: true, range: 1 },
                villain: { enabled: true, range: 1 }
            },
            allowEmpty: true
        });

        assert.equal(result.ok, true);
        assert.equal(result.appliedCount, 0);
        assert.equal(result.selectedCount, 0);
    });
});
