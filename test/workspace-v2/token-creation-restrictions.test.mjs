import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTokenCreationAllowed } from "../../module/ui/workspace-v2/scene-actor-placement.mjs";

function actor(id, type, name = id) {
    return {
        id,
        name,
        type
    };
}

function token(id, actorId) {
    return {
        id,
        actorId
    };
}

describe("token creation restrictions", () => {
    it("allows placing any pawn actor token, even if one already exists on the scene", () => {
        const scene = {
            tokens: [
                token("tok-p1", "p1")
            ]
        };
        const pawnActor = actor("p1", "pawn");
        const tokenDoc = {
            id: "tok-p2",
            actorId: "p1",
            actor: pawnActor,
            parent: scene
        };

        const allowed = isTokenCreationAllowed(tokenDoc, { scene, actor: pawnActor });
        assert.equal(allowed, true);
    });

    it("blocks placing duplicate tokens for hero actors", () => {
        const scene = {
            tokens: [
                token("tok-h1", "h1")
            ]
        };
        const heroActor = actor("h1", "hero");
        const tokenDoc = {
            id: "tok-h2",
            actorId: "h1",
            actor: heroActor,
            parent: scene
        };

        const allowed = isTokenCreationAllowed(tokenDoc, { scene, actor: heroActor });
        assert.equal(allowed, false);
    });

    it("blocks placing duplicate tokens for villain actors", () => {
        const scene = {
            tokens: [
                token("tok-v1", "v1")
            ]
        };
        const villainActor = actor("v1", "villain");
        const tokenDoc = {
            id: "tok-v2",
            actorId: "v1",
            actor: villainActor,
            parent: scene
        };

        const allowed = isTokenCreationAllowed(tokenDoc, { scene, actor: villainActor });
        assert.equal(allowed, false);
    });

    it("allows placing a hero/villain token if no token for that actor exists on the scene", () => {
        const scene = {
            tokens: [
                token("tok-h1", "h1")
            ]
        };
        const otherHeroActor = actor("h2", "hero");
        const tokenDoc = {
            id: "tok-h2",
            actorId: "h2",
            actor: otherHeroActor,
            parent: scene
        };

        const allowed = isTokenCreationAllowed(tokenDoc, { scene, actor: otherHeroActor });
        assert.equal(allowed, true);
    });

    it("handles missing scene gracefully", () => {
        const tokenDoc = {
            id: "tok-h2",
            actorId: "h2",
            actor: actor("h2", "hero"),
            parent: null
        };

        const allowed = isTokenCreationAllowed(tokenDoc, { scene: null });
        assert.equal(allowed, true);
    });
});
