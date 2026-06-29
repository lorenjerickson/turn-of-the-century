import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EncounterNarrator } from "../../module/encounters/encounter-narrator.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNarrator(combatants = []) {
    const map = new Map(combatants.map((c) => [c.id, c]));
    return new EncounterNarrator({
        combatants: {
            get: (id) => map.get(id) ?? null,
            contents: combatants
        }
    });
}

function makeCombatant(id, name, items = []) {
    return {
        id,
        name,
        actor: {
            items: {
                get: (itemId) => items.find((i) => i.id === itemId) ?? null
            }
        }
    };
}

function makeEntry({ combatantId = "c1", combatantName = "Alice", tick = 1, action = {}, outcome = {}, ...rest } = {}) {
    return { combatantId, combatantName, tick, action, outcome, ...rest };
}

// ---------------------------------------------------------------------------
// buildTickNarrative
// ---------------------------------------------------------------------------

describe("EncounterNarrator.buildTickNarrative", () => {
    it("returns entries only for the matching tick", () => {
        const narrator = makeNarrator();
        const timeline = [
            makeEntry({ tick: 1, action: { type: "movement", movementFeet: 10 }, outcome: {} }),
            makeEntry({ tick: 2, action: { type: "movement", movementFeet: 10 }, outcome: {} }),
            makeEntry({ tick: 1, action: { type: "consumable", label: "Morphia" }, outcome: {} })
        ];

        const result = narrator.buildTickNarrative(timeline, 1);

        assert.equal(result.tick, 1);
        assert.equal(result.lines.length, 2);
    });

    it("returns empty lines when no entries match the tick", () => {
        const narrator = makeNarrator();
        const result = narrator.buildTickNarrative([], 3);
        assert.equal(result.lines.length, 0);
        assert.equal(result.summary, "");
    });

    it("joins lines into summary with spaces", () => {
        const narrator = makeNarrator();
        const timeline = [
            makeEntry({ tick: 1, action: { type: "movement", movementFeet: 10 }, outcome: {} }),
            makeEntry({ tick: 1, combatantName: "Bob", action: { type: "consumable", label: "Flask" }, outcome: {} })
        ];

        const { summary } = narrator.buildTickNarrative(timeline, 1);

        assert.ok(summary.includes("Alice"), `expected Alice in "${summary}"`);
        assert.ok(summary.includes("Bob"), `expected Bob in "${summary}"`);
    });
});

// ---------------------------------------------------------------------------
// describeEntry — movement
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — movement", () => {
    it("uses active order clause text for in-progress narration", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({
            action: { type: "movement", movementFeet: 10 },
            outcome: { result: "movementStep" },
            clauseText: "Close on Elias"
        });

        assert.equal(narrator.describeEntry(entry), "Alice: Close on Elias.");
    });

    it("describes a movement action using movementFeet", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ action: { type: "movement", movementFeet: 15 }, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "Alice moved 15 feet.");
    });

    it("falls back to movementFeetPerAp when movementFeet is absent", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ action: { type: "movement", movementFeetPerAp: 20 }, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "Alice moved 20 feet.");
    });

    it("uses movementStep outcome result as movement indicator", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({
            action: { movementFeet: 10 },
            outcome: { result: "movementStep" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice moved 10 feet.");
    });

    it("uses combatantName from the entry", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ combatantName: "Dr. Crane", action: { type: "movement", movementFeet: 5 }, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "Dr. Crane moved 5 feet.");
    });
});

// ---------------------------------------------------------------------------
// describeEntry — pursue / follow / avoid
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — pursue/follow/avoid", () => {
    for (const actionId of ["pursue", "follow", "avoid"]) {
        it(`describes ${actionId} as movement`, () => {
            const narrator = makeNarrator();
            const entry = makeEntry({
                action: { id: actionId, movementFeet: 10 },
                outcome: {}
            });
            assert.equal(narrator.describeEntry(entry), "Alice moved 10 feet.");
        });
    }
});

// ---------------------------------------------------------------------------
// describeEntry — attack
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — attack", () => {
    it("describes a hit", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { result: "hit", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob and hits.");
    });

    it("describes a critical hit as a hit", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { result: "criticalHit", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob and hits.");
    });

    it("describes a miss", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { result: "miss", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob and misses.");
    });

    it("describes an interrupted attack as a miss", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { result: "interrupted", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob and misses.");
    });

    it("describes an attack with no outcome as neutral", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob.");
    });

    it("resolves weapon name from actor item", () => {
        const weapon = { id: "w1", name: "Webley Revolver" };
        const narrator = makeNarrator([makeCombatant("c1", "Alice", [weapon])]);
        const entry = makeEntry({
            action: { type: "attack", itemId: "w1", label: "Fallback", targetId: "c2" },
            outcome: { result: "hit", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Webley Revolver at Bob and hits.");
    });

    it("falls back to action label when item not found", () => {
        const narrator = makeNarrator([makeCombatant("c1", "Alice")]);
        const entry = makeEntry({
            action: { type: "attack", itemId: "missing", label: "Pistol", targetId: "c2" },
            outcome: { result: "hit", targetName: "Bob" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Pistol at Bob and hits.");
    });

    it("resolves target name from combatants map when targetName absent", () => {
        const narrator = makeNarrator([
            makeCombatant("c1", "Alice"),
            makeCombatant("c2", "Bob")
        ]);
        const entry = makeEntry({
            action: { type: "attack", label: "Revolver", targetId: "c2" },
            outcome: { result: "hit" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice fires Revolver at Bob and hits.");
    });
});

// ---------------------------------------------------------------------------
// describeEntry — consumable
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — consumable", () => {
    it("describes a consumable action by label", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ action: { type: "consumable", label: "Morphia" }, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "Alice uses Morphia.");
    });

    it("falls back to 'an item' when label is absent", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ action: { type: "consumable" }, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "Alice uses an item.");
    });
});

// ---------------------------------------------------------------------------
// describeEntry — recap format
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — recapFormat", () => {
    it("uses recapFormat when present, ignoring action type", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({
            combatantName: "Alice",
            action: { type: "movement", movementFeet: 10, recapFormat: "{{ Owner.name }} dashes forward." },
            outcome: {}
        });
        assert.equal(narrator.describeEntry(entry), "Alice dashes forward.");
    });

    it("substitutes Owner, Target, and outcome.result into recapFormat", () => {
        const narrator = makeNarrator([
            makeCombatant("c1", "Alice"),
            makeCombatant("c2", "Bob")
        ]);
        const entry = makeEntry({
            action: {
                type: "attack",
                label: "Knife",
                targetId: "c2",
                recapFormat: "{{ Owner.name }} slashes {{ Target.name }} and {{ action.hitResult }}."
            },
            outcome: { result: "hit" }
        });
        assert.equal(narrator.describeEntry(entry), "Alice slashes Bob and hits.");
    });

    it("returns empty string for missing template variable", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({
            action: { type: "movement", movementFeet: 5, recapFormat: "{{ Owner.name }} steps {{ noSuchField }}." },
            outcome: {}
        });
        assert.equal(narrator.describeEntry(entry), "Alice steps .");
    });
});

// ---------------------------------------------------------------------------
// describeEntry — fallback
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeEntry — fallback", () => {
    it("returns outcome.detail when action type is unrecognised", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({
            action: { type: "custom" },
            outcome: { detail: "Something happened." }
        });
        assert.equal(narrator.describeEntry(entry), "Something happened.");
    });

    it("returns empty string when no description is possible", () => {
        const narrator = makeNarrator();
        const entry = makeEntry({ action: {}, outcome: {} });
        assert.equal(narrator.describeEntry(entry), "");
    });
});

// ---------------------------------------------------------------------------
// describeHitResult
// ---------------------------------------------------------------------------

describe("EncounterNarrator.describeHitResult", () => {
    const narrator = makeNarrator();

    const cases = [
        ["hit", "hits"],
        ["criticalHit", "hits"],
        ["miss", "misses"],
        ["criticalFailure", "misses"],
        ["interrupted", "is interrupted"],
        ["outOfRange", "is out of range"],
        ["reacted", "is countered"],
        ["failed", "fails"],
        ["custom", "custom"],
        ["", ""]
    ];

    for (const [input, expected] of cases) {
        it(`maps "${input}" → "${expected}"`, () => {
            assert.equal(narrator.describeHitResult(input), expected);
        });
    }
});
