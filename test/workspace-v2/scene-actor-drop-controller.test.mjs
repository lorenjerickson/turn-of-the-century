import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SceneActorDropController } from "../../module/ui/workspace-v2/controllers/scene-actor-drop-controller.mjs";

function actor(id, type = "pawn", name = id) {
    return { id, type, name, img: `${id}.webp` };
}

describe("SceneActorDropController", () => {
    it("creates scene tokens through the extracted placement workflow", async () => {
        const statuses = [];
        let renderCount = 0;
        let createdType = "";
        let createdTokens = [];
        const scene = {
            name: "Rookery Yard",
            width: 1000,
            height: 800,
            grid: { size: 100 },
            tokens: { contents: [] },
            async createEmbeddedDocuments(type, documents) {
                createdType = type;
                createdTokens = documents;
                return documents;
            }
        };
        const controller = new SceneActorDropController({
            setScenePropertiesState: (patch) => statuses.push(patch),
            render: () => {
                renderCount += 1;
            },
            logger: { error: () => {} }
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada"), actor("p", "pawn", "Porter")], {
            scene,
            anchorPosition: { x: 120, y: 240 }
        });

        assert.equal(createdType, "Token");
        assert.deepEqual(createdTokens.map((token) => ({ actorId: token.actorId, x: token.x, y: token.y })), [
            { actorId: "a", x: 100, y: 200 },
            { actorId: "p", x: 200, y: 200 }
        ]);
        assert.deepEqual(statuses.at(-1), {
            status: "Added 2 actors to Rookery Yard.",
            error: ""
        });
        assert.equal(renderCount, 1);
    });

    it("reports placement errors through injected state and render callbacks", async () => {
        const statuses = [];
        let renderCount = 0;
        const controller = new SceneActorDropController({
            setScenePropertiesState: (patch) => statuses.push(patch),
            render: () => {
                renderCount += 1;
            },
            logger: { error: () => {} }
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada")], {
            scene: { name: "Broken Scene" }
        });

        assert.deepEqual(statuses.at(-1), {
            status: "",
            error: "Actor placement failed - see console."
        });
        assert.equal(renderCount, 1);
    });

    it("falls back to the injected scene when no explicit scene is supplied", async () => {
        let created = false;
        const fallbackScene = {
            name: "Fallback Scene",
            width: 1000,
            height: 800,
            grid: { size: 100 },
            tokens: { contents: [] },
            async createEmbeddedDocuments() {
                created = true;
                return [];
            }
        };
        const controller = new SceneActorDropController({
            getFallbackScene: () => fallbackScene,
            render: () => {}
        });

        await controller.addActorsToScene([actor("a", "hero", "Ada")]);

        assert.equal(created, true);
    });
});
