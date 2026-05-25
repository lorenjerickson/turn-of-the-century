import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    ActorDesignService,
    buildDesignNpcActorData,
    createNpcDesignActor,
    createUniqueNpcName
} from "../../module/ui/workspace-v2/design-actions/actor-actions.mjs";

describe("actor design actions", () => {
    it("creates unique NPC names against existing actors", () => {
        const actors = [
            { name: "New NPC" },
            { name: "New NPC 2" }
        ];

        assert.equal(createUniqueNpcName("New NPC", actors), "New NPC 3");
        assert.equal(createUniqueNpcName("Consulting Detective", actors), "Consulting Detective");
    });

    it("builds pawn actor data with NPC classification and design flags", () => {
        const actorData = buildDesignNpcActorData({
            name: "Street Informant",
            folderId: "folder-1",
            sourcePanelId: "player"
        });

        assert.equal(actorData.name, "Street Informant");
        assert.equal(actorData.type, "pawn");
        assert.equal(actorData.folder, "folder-1");
        assert.equal(actorData.system.classification.category, "npc");
        assert.equal(actorData.system.pawn.role, "Supporting NPC");
        assert.equal(actorData.flags["turn-of-the-century"].designCreated, true);
        assert.equal(actorData.flags["turn-of-the-century"].sourcePanelId, "player");
    });

    it("creates the actor and opens its sheet", async () => {
        let createdData = null;
        let sheetRendered = false;
        const actorClass = {
            create: async (data) => {
                createdData = data;
                return {
                    name: data.name,
                    sheet: {
                        render: (options) => {
                            sheetRendered = options;
                        }
                    }
                };
            }
        };

        const actor = await createNpcDesignActor({
            actorClass,
            actors: [{ name: "New NPC" }],
            sourcePanelId: "tracker"
        });

        assert.equal(actor.name, "New NPC 2");
        assert.equal(createdData.name, "New NPC 2");
        assert.equal(createdData.flags["turn-of-the-century"].sourcePanelId, "tracker");
        assert.deepEqual(sheetRendered, { force: true });
    });

    it("encapsulates NPC creation behind ActorDesignService", async () => {
        let createdData = null;
        const service = new ActorDesignService({
            actors: [{ name: "New NPC" }, { name: "New NPC 2" }],
            actorClass: {
                create: async (data) => {
                    createdData = data;
                    return { name: data.name };
                }
            },
            renderApplication: () => {}
        });

        const actor = await service.createNpc({ sourcePanelId: "inspector", renderSheet: false });

        assert.equal(actor.name, "New NPC 3");
        assert.equal(createdData.name, "New NPC 3");
        assert.equal(createdData.flags["turn-of-the-century"].sourcePanelId, "inspector");
    });
});
