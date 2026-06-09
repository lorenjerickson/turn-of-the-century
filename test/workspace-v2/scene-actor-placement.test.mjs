import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildSceneActorPlacementCandidates,
    buildSceneActorDropPreview,
    buildSceneActorPlacementPanelModel,
    buildSceneActorPlacements,
    buildSceneActorTokenData
} from "../../module/ui/workspace-v2/scene-actor-placement.mjs";

function actor(id, type, name = id, extra = {}) {
    return {
        id,
        name,
        type,
        img: `${id}.webp`,
        ...extra
    };
}

describe("scene actor placement", () => {
    it("groups available actors by system actor type for the scene panel", () => {
        const model = buildSceneActorPlacementPanelModel({
            scene: { id: "scene-1", name: "The Yard" },
            actors: [
                actor("v1", "villain", "Moriarty"),
                actor("h1", "hero", "Ada"),
                actor("p1", "pawn", "Constable"),
                actor("i1", "item", "Not an Actor")
            ]
        });

        assert.equal(model.sceneId, "scene-1");
        assert.deepEqual(model.heroes.map((entry) => entry.id), ["h1"]);
        assert.deepEqual(model.pawns.map((entry) => entry.id), ["p1"]);
        assert.deepEqual(model.villains.map((entry) => entry.id), ["v1"]);
    });

    it("groups heroes near one side and villains far from them", () => {
        const placements = buildSceneActorPlacements({
            scene: { width: 2000, height: 1200, grid: { size: 100 } },
            actors: [
                actor("h1", "hero"),
                actor("h2", "hero"),
                actor("v1", "villain"),
                actor("v2", "villain")
            ]
        });

        const heroes = placements.filter((placement) => placement.role === "hero");
        const villains = placements.filter((placement) => placement.role === "villain");

        assert.ok(heroes.every((placement) => placement.position.x < 350));
        assert.ok(villains.every((placement) => placement.position.x > 1600));
        assert.ok(villains.every((placement) => placement.position.y > 850));
    });

    it("scatters pawns using injected randomness", () => {
        const rolls = [0, 0.5, 1, 0.25];
        const placements = buildSceneActorPlacements({
            scene: { width: 1000, height: 800, grid: { size: 100 } },
            actors: [actor("p1", "pawn"), actor("p2", "pawn")],
            rng: () => rolls.shift() ?? 0
        });

        assert.deepEqual(placements.map((placement) => placement.position), [
            { x: 50, y: 350 },
            { x: 850, y: 200 }
        ]);
    });

    it("builds a grid-snapped map drop preview around an anchor point", () => {
        const preview = buildSceneActorDropPreview({
            scene: { width: 1000, height: 800, grid: { size: 100 }, shiftX: -25, shiftY: -50 },
            actors: [
                actor("h1", "hero", "Ada"),
                actor("p1", "pawn", "Smog Wretch", { prototypeToken: { width: 2, height: 1 } }),
                actor("v1", "villain", "Moriarty")
            ],
            anchorPosition: { x: 267, y: 324 }
        });

        assert.deepEqual(preview.map((entry) => ({ x: entry.x, y: entry.y, width: entry.width, height: entry.height })), [
            { x: 225, y: 350, width: 100, height: 100 },
            { x: 325, y: 350, width: 200, height: 100 },
            { x: 225, y: 450, width: 100, height: 100 }
        ]);
    });

    it("skips proper-name actors already present in the scene", () => {
        const candidates = buildSceneActorPlacementCandidates({
            scene: {
                tokens: {
                    contents: [
                        { actorId: "h1", name: "Ada" },
                        { actorId: "v1", name: "Moriarty" }
                    ]
                }
            },
            actors: [
                actor("h1", "hero", "Ada"),
                actor("h1", "hero", "Ada"),
                actor("v1", "villain", "Moriarty"),
                actor("h2", "hero", "Elias")
            ]
        });

        assert.deepEqual(candidates.map((entry) => entry.id), ["h2"]);
    });

    it("allows repeatable pawns and indexes token names when multiples exist", async () => {
        const tokens = await buildSceneActorTokenData({
            scene: {
                width: 1000,
                height: 800,
                grid: { size: 100 },
                tokens: { contents: [{ actorId: "p1", name: "Smog Wretch (1)" }] }
            },
            actors: [
                actor("p1", "pawn", "Smog Wretch"),
                actor("p1", "pawn", "Smog Wretch")
            ],
            rng: () => 0
        });

        assert.equal(tokens.length, 2);
        assert.deepEqual(tokens.map((token) => token.name), ["Smog Wretch (2)", "Smog Wretch (3)"]);
    });

    it("indexes pawns created together from an empty scene", async () => {
        const tokens = await buildSceneActorTokenData({
            scene: { width: 1000, height: 800, grid: { size: 100 }, tokens: { contents: [] } },
            actors: [
                actor("p1", "pawn", "Smog Wretch"),
                actor("p1", "pawn", "Smog Wretch")
            ],
            rng: () => 0
        });

        assert.deepEqual(tokens.map((token) => token.name), ["Smog Wretch (1)", "Smog Wretch (2)"]);
    });

    it("builds token data from actor token defaults at computed positions", async () => {
        const tokens = await buildSceneActorTokenData({
            scene: { width: 1000, height: 800, grid: { size: 100 } },
            actors: [
                actor("h1", "hero", "Ada", {
                    prototypeToken: {
                        width: 1,
                        height: 1,
                        texture: { src: "token.webp" }
                    }
                })
            ]
        });

        assert.equal(tokens.length, 1);
        assert.equal(tokens[0].actorId, "h1");
        assert.equal(tokens[0].name, "Ada");
        assert.equal(tokens[0].texture.src, "token.webp");
        assert.equal(tokens[0].x, 100);
    });

    it("builds token data from the same anchored grid preview used for map drops", async () => {
        const tokens = await buildSceneActorTokenData({
            scene: { width: 1000, height: 800, grid: { size: 100 }, shiftX: -25, shiftY: -50 },
            actors: [
                actor("h1", "hero", "Ada"),
                actor("p1", "pawn", "Smog Wretch")
            ],
            anchorPosition: { x: 267, y: 324 }
        });

        assert.deepEqual(tokens.map((token) => ({ name: token.name, x: token.x, y: token.y })), [
            { name: "Ada", x: 225, y: 350 },
            { name: "Smog Wretch", x: 325, y: 350 }
        ]);
    });
});
