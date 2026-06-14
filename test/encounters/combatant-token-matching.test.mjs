import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    findCombatantForToken,
    getCombatantReferenceDiagnostics
} from "../../module/encounters/combatant-token-matching.mjs";

describe("combatant token matching", () => {
    it("matches combatants whose token id is stored on the token document", () => {
        const actor = { id: "actor-clicked", isOwner: true };
        const token = {
            id: "token-clicked",
            actor,
            document: {
                id: "token-clicked",
                actorId: actor.id,
                uuid: "Scene.scene-1.Token.token-clicked"
            }
        };
        const combatants = [
            { id: "combatant-other", tokenId: "token-other", actorId: "actor-other" },
            {
                id: "combatant-clicked",
                token: {
                    document: {
                        id: "token-clicked",
                        uuid: "Scene.scene-1.Token.token-clicked"
                    }
                },
                actor: { id: actor.id }
            }
        ];

        const combatant = findCombatantForToken({ combatants, token, actor });

        assert.equal(combatant?.id, "combatant-clicked");
    });

    it("matches synthetic token actors through their base actor references", () => {
        const actor = { id: "actor-base", uuid: "Actor.actor-base" };
        const token = {
            id: "token-clicked",
            actor: {
                id: "synthetic-actor",
                baseActor: actor
            },
            document: {
                id: "token-clicked",
                actorId: actor.id
            }
        };
        const combatants = [
            {
                id: "combatant-clicked",
                token: {
                    actor: {
                        id: "different-synthetic",
                        baseActor: actor
                    }
                }
            }
        ];

        const combatant = findCombatantForToken({ combatants, token, actor: token.actor });

        assert.equal(combatant?.id, "combatant-clicked");
    });

    it("reports useful combatant references for encounter planner diagnostics", () => {
        const refs = getCombatantReferenceDiagnostics([
            {
                id: "combatant-1",
                token: {
                    document: {
                        id: "token-1",
                        uuid: "Scene.scene-1.Token.token-1"
                    }
                },
                actor: {
                    id: "actor-1",
                    uuid: "Actor.actor-1"
                }
            }
        ]);

        assert.deepEqual(refs, [{
            id: "combatant-1",
            tokenId: "",
            tokenDocumentId: "token-1",
            tokenUuid: "Scene.scene-1.Token.token-1",
            actorId: "actor-1",
            actorUuid: "Actor.actor-1"
        }]);
    });
});
