import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
    slugifyActorName,
    generatedTokenPath,
    isEligibleForTokenArtUpdate,
    migrateTotcStarterActorTokenArt
} from "../../module/migrations/starter-actor-token-art.mjs";
import { TOTC_SAMPLE_COMPENDIUMS } from "../../module/compendiums/manifest.mjs";

// ---------------------------------------------------------------------------
// slugifyActorName
// ---------------------------------------------------------------------------

describe("slugifyActorName", () => {
    it("lowercases and hyphenates names", () => {
        assert.equal(slugifyActorName("Inspector Eleanor Thorne"), "inspector-eleanor-thorne");
    });

    it("strips apostrophes without adding hyphens", () => {
        assert.equal(slugifyActorName("O'Brien's Guard"), "obriens-guard");
    });

    it("handles empty input", () => {
        assert.equal(slugifyActorName(""), "");
        assert.equal(slugifyActorName(null), "");
    });

    it("collapses multiple non-alpha-numeric chars to a single hyphen", () => {
        assert.equal(slugifyActorName("Brother  Lucien--March"), "brother-lucien-march");
    });
});

// ---------------------------------------------------------------------------
// generatedTokenPath
// ---------------------------------------------------------------------------

describe("generatedTokenPath", () => {
    it("returns the expected Foundry-relative path for a given actor name", () => {
        assert.equal(
            generatedTokenPath("Ada Kingsley"),
            "systems/turn-of-the-century/assets/images/actors/tokens/ada-kingsley.png"
        );
    });

    it("returns null for an empty name", () => {
        assert.equal(generatedTokenPath(""), null);
        assert.equal(generatedTokenPath(null), null);
    });
});

// ---------------------------------------------------------------------------
// isEligibleForTokenArtUpdate
// ---------------------------------------------------------------------------

describe("isEligibleForTokenArtUpdate", () => {
    it("treats the default mystery-man icon as eligible", () => {
        assert.equal(isEligibleForTokenArtUpdate("icons/svg/mystery-man.svg"), true);
    });

    it("treats the cowled fallback icon as eligible", () => {
        assert.equal(isEligibleForTokenArtUpdate("icons/svg/cowled.svg"), true);
    });

    it("treats DiceBear avatar URLs as eligible", () => {
        assert.equal(isEligibleForTokenArtUpdate("https://api.dicebear.com/9.x/adventurer/svg?seed=foo"), true);
    });

    it("treats existing generated token paths as eligible (re-apply updated art)", () => {
        assert.equal(
            isEligibleForTokenArtUpdate("systems/turn-of-the-century/assets/images/actors/tokens/ada-kingsley.png"),
            true
        );
    });

    it("treats empty string as eligible", () => {
        assert.equal(isEligibleForTokenArtUpdate(""), true);
    });

    it("treats custom user-uploaded art as not eligible", () => {
        assert.equal(isEligibleForTokenArtUpdate("worlds/my-world/actor-tokens/custom-hero.png"), false);
        assert.equal(isEligibleForTokenArtUpdate("assets/images/custom/npc.png"), false);
    });
});

// ---------------------------------------------------------------------------
// migrateTotcStarterActorTokenArt
// ---------------------------------------------------------------------------

let originalFetch;

function makeActor({
    id = "A1",
    name = "Ada Kingsley",
    type = "hero",
    img = "icons/svg/mystery-man.svg"
} = {}) {
    const actor = {
        id,
        name,
        type,
        img,
        system: { classification: { category: "" } },
        updates: []
    };
    actor.update = async (data) => {
        actor.updates.push(data);
        actor.img = data.img ?? actor.img;
    };
    return actor;
}

function makeActorPack(packName, actors) {
    const packId = `turn-of-the-century.${packName}`;
    return {
        id: packId,
        collection: packId,
        documentName: "Actor",
        locked: true,
        lockChanges: [],
        async configure({ locked }) {
            this.lockChanges.push(locked);
            this.locked = locked;
        },
        async getDocuments() {
            return actors;
        }
    };
}

beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.game = {
        ready: true,
        user: { isGM: true },
        system: { id: "turn-of-the-century" },
        packs: new Map()
    };
    globalThis.ui = { notifications: { info: () => {} } };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.game;
    delete globalThis.ui;
});

describe("migrateTotcStarterActorTokenArt", () => {
    it("throws when game is not ready", async () => {
        globalThis.game.ready = false;
        await assert.rejects(
            () => migrateTotcStarterActorTokenArt({ notify: false }),
            /Game is not ready/
        );
    });

    it("throws when caller is not GM", async () => {
        globalThis.game.user.isGM = false;
        await assert.rejects(
            () => migrateTotcStarterActorTokenArt({ notify: false }),
            /Only a GM/
        );
    });

    it("skips all actors when the token images do not exist on the server", async () => {
        globalThis.fetch = async () => ({ ok: false, status: 404 });

        const actor = makeActor({ name: "Ada Kingsley", img: "icons/svg/mystery-man.svg" });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.scanned, 1);
        assert.equal(report.updated, 0);
        assert.equal(actor.updates.length, 0);
    });

    it("updates actors with default images when the token image exists", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const actor = makeActor({ name: "Ada Kingsley", img: "icons/svg/mystery-man.svg" });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.scanned, 1);
        assert.equal(report.updated, 1);
        assert.equal(actor.updates.length, 1);
        assert.equal(
            actor.updates[0].img,
            "systems/turn-of-the-century/assets/images/actors/tokens/ada-kingsley.png"
        );
        assert.equal(actor.updates[0].img, actor.updates[0]["prototypeToken.texture.src"]);
        assert.equal(actor.updates[0].img, actor.updates[0]["system.artwork.image"]);
        assert.equal(actor.updates[0].img, actor.updates[0]["system.tokenArtwork.image"]);
    });

    it("updates actors with DiceBear avatars when the token image exists", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const actor = makeActor({
            name: "Baron Ilya Soren",
            img: "https://api.dicebear.com/9.x/lorelei/svg?seed=Baron"
        });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.villains, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.updated, 1);
        assert.equal(
            actor.updates[0].img,
            "systems/turn-of-the-century/assets/images/actors/tokens/baron-ilya-soren.png"
        );
    });

    it("re-applies the correct path for actors already using a generated token path", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const wrongPath = "systems/turn-of-the-century/assets/images/actors/tokens/old-name.png";
        const actor = makeActor({ name: "Ada Kingsley", img: wrongPath });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.updated, 1);
        assert.equal(
            actor.updates[0].img,
            "systems/turn-of-the-century/assets/images/actors/tokens/ada-kingsley.png"
        );
    });

    it("skips actors where the image already matches the expected generated path", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const correctPath = "systems/turn-of-the-century/assets/images/actors/tokens/ada-kingsley.png";
        const actor = makeActor({ name: "Ada Kingsley", img: correctPath });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.skipped, 1);
        assert.equal(report.updated, 0);
        assert.equal(actor.updates.length, 0);
    });

    it("does not overwrite custom user-uploaded artwork", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const actor = makeActor({
            name: "Ada Kingsley",
            img: "worlds/my-world/custom-portraits/ada.png"
        });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.updated, 0);
        assert.equal(actor.updates.length, 0);
    });

    it("unlocks locked packs before updating and re-locks them after", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const actor = makeActor({ name: "Ada Kingsley", img: "icons/svg/mystery-man.svg" });
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [actor]);
        game.packs.set(pack.id, pack);

        await migrateTotcStarterActorTokenArt({ notify: false });

        assert.deepEqual(pack.lockChanges, [false, true]);
    });

    it("returns a structured report with scanned, updated, and skipped counts", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const actors = [
            makeActor({ id: "A1", name: "Ada Kingsley", img: "icons/svg/mystery-man.svg" }),
            makeActor({ id: "A2", name: "Baron Ilya Soren", img: "worlds/my-world/baron.png" }),
            makeActor({
                id: "A3",
                name: "Brassbound Hound",
                img: "systems/turn-of-the-century/assets/images/actors/tokens/brassbound-hound.png"
            })
        ];
        const pack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.monsters, actors);
        game.packs.set(pack.id, pack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.scanned, 3);
        assert.equal(report.updated, 1);  // Ada updated
        assert.equal(report.skipped, 2);  // Baron (custom art), Brassbound (already correct)
    });

    it("processes all starter actor packs not just one", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const heroPack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.heroes, [
            makeActor({ id: "H1", name: "Ada Kingsley", img: "icons/svg/mystery-man.svg" })
        ]);
        const villainPack = makeActorPack(TOTC_SAMPLE_COMPENDIUMS.villains, [
            makeActor({ id: "V1", name: "Baron Ilya Soren", img: "icons/svg/mystery-man.svg" })
        ]);
        game.packs.set(heroPack.id, heroPack);
        game.packs.set(villainPack.id, villainPack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.scanned, 2);
        assert.equal(report.updated, 2);
    });

    it("skips item packs", async () => {
        globalThis.fetch = async () => ({ ok: true, status: 200 });

        const itemPack = {
            id: "turn-of-the-century.starter-items",
            collection: "turn-of-the-century.starter-items",
            documentName: "Item",
            locked: false,
            async getDocuments() { return []; }
        };
        game.packs.set(itemPack.id, itemPack);

        const report = await migrateTotcStarterActorTokenArt({ notify: false });

        assert.equal(report.scanned, 0);
    });
});

// ---------------------------------------------------------------------------
// Entrypoint wiring
// ---------------------------------------------------------------------------

describe("starter-actor-token-art migration entrypoint wiring", () => {
    const mainSource = readFileSync(
        new URL("../../turn-of-the-century.mjs", import.meta.url),
        "utf8"
    );
    const runnerSource = readFileSync(
        new URL("../../module/migrations/runner.mjs", import.meta.url),
        "utf8"
    );

    it("exports migrateTotcStarterActorTokenArt from the main module", () => {
        assert.equal(mainSource.includes("migrateTotcStarterActorTokenArt"), true);
    });

    it("passes migrateStarterActorTokenArt to runTotcMigrations", () => {
        assert.equal(mainSource.includes("migrateStarterActorTokenArt: migrateTotcStarterActorTokenArt"), true);
    });

    it("runner schema version is bumped to 17", () => {
        assert.match(runnerSource, /TOTC_WORLD_SCHEMA_VERSION = 17/);
    });

    it("runner requires migrateStarterActorTokenArt as an injected dependency", () => {
        assert.match(runnerSource, /migrateStarterActorTokenArt/);
        assert.match(runnerSource, /requires a migrateStarterActorTokenArt function/);
    });

    it("runner includes the v17 migration step for starter-actor-token-art", () => {
        assert.match(runnerSource, /appliedVersion < 17/);
        assert.match(runnerSource, /starter-actor-token-art/);
    });
});
