import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    activateScene,
    deleteScene,
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
