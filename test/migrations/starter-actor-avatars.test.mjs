import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
    buildActorAvatarUpdate,
    buildDiceBearAvatarUrl,
    migrateTotcStarterActorAvatars
} from "../../module/migrations/starter-actor-avatars.mjs";
import { TOTC_SAMPLE_COMPENDIUMS } from "../../module/sample-content.mjs";

function makeActor({
    id = "A1",
    name = "Test Actor",
    type = "pawn",
    category = "",
    img = "icons/svg/mystery-man.svg"
} = {}) {
    return {
        id,
        name,
        type,
        img,
        system: {
            classification: {
                category
            }
        }
    };
}

describe("starter actor avatars migration", () => {
    beforeEach(() => {
        globalThis.game = {
            ready: true,
            user: { isGM: true },
            system: { id: "turn-of-the-century" },
            packs: new Map()
        };
        globalThis.ui = { notifications: { info: () => {} } };
    });

    it("buildDiceBearAvatarUrl returns deterministic URLs per actor", () => {
        const actor = makeActor({ id: "H1", name: "Ada Lovelace", type: "hero" });
        const urlA = buildDiceBearAvatarUrl(actor);
        const urlB = buildDiceBearAvatarUrl(actor);

        assert.equal(urlA, urlB);
        assert.equal(urlA.startsWith("https://api.dicebear.com/9.x/"), true);
        assert.equal(urlA.includes("seed=Ada+Lovelace%3Ahero%3AH1"), true);
    });

    it("buildActorAvatarUpdate skips non-default custom actor art", () => {
        const actor = makeActor({ img: "assets/images/custom/npc.png" });

        const update = buildActorAvatarUpdate(actor);
        assert.equal(update, null);
    });

    it("buildActorAvatarUpdate sets actor and token artwork fields", () => {
        const actor = makeActor({ id: "V7", name: "Moriarty", type: "villain" });

        const update = buildActorAvatarUpdate(actor, { overwrite: true });
        assert.ok(update);
        assert.equal(typeof update.img, "string");
        assert.equal(typeof update["prototypeToken.texture.src"], "string");
        assert.equal(update.img, update["prototypeToken.texture.src"]);
        assert.equal(update.img, update["system.artwork.image"]);
        assert.equal(update.img, update["system.tokenArtwork.image"]);
    });

    it("migrateTotcStarterActorAvatars updates only actor packs", async () => {
        let updateCalls = 0;
        const packId = `turn-of-the-century.${TOTC_SAMPLE_COMPENDIUMS.heroes}`;

        const actorDocs = [
            {
                ...makeActor({ id: "H1", name: "Ada", type: "hero" }),
                async update(data) {
                    updateCalls += 1;
                    this.lastUpdate = data;
                }
            },
            {
                ...makeActor({ id: "H2", name: "Byron", type: "hero", img: "assets/images/custom/byron.png" }),
                async update() {
                    throw new Error("Should not update actors with custom artwork");
                }
            }
        ];

        const actorPack = {
            collection: packId,
            documentName: "Actor",
            locked: true,
            async configure({ locked }) {
                this.locked = locked;
            },
            async getDocuments() {
                return actorDocs;
            }
        };

        const itemPack = {
            collection: "turn-of-the-century.starter-items",
            documentName: "Item",
            locked: false,
            async getDocuments() {
                return [];
            }
        };

        game.packs.set(packId, actorPack);
        game.packs.set("turn-of-the-century.starter-items", itemPack);

        const report = await migrateTotcStarterActorAvatars({ notify: false });

        assert.equal(report.scanned, 2);
        assert.equal(report.updated, 1);
        assert.equal(updateCalls, 1);
    });
});
