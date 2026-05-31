import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DesignIssueScanner,
    scanDesignIssues
} from "../../module/ui/workspace-v2/panels/design-issues-scanner.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeToken(overrides = {}) {
    return {
        id: "token-1",
        name: "Inspector Ashworth",
        hasPlayerOwner: true,
        sight: { enabled: true },
        ...overrides
    };
}

function makeScene(overrides = {}) {
    return {
        id: "scene-1",
        name: "Whitechapel Alley",
        background: { src: "scenes/whitechapel.webp" },
        walls: { size: 12 },
        lights: { size: 0 },
        darkness: 0,
        // Provide one well-formed token by default so structural tests remain clean
        tokens: { contents: [makeToken()] },
        ...overrides
    };
}

function makeActor(overrides = {}) {
    return {
        id: "actor-1",
        name: "Inspector Ashworth",
        type: "hero",
        img: "actors/ashworth.webp",
        items: [{ id: "item-1", type: "profession" }],
        ...overrides
    };
}

function makeCombatant(overrides = {}) {
    return {
        id: "combatant-1",
        name: "Inspector Ashworth",
        initiative: 14,
        ...overrides
    };
}

function makeCombat(combatants = []) {
    return {
        id: "combat-1",
        combatants: { contents: combatants }
    };
}

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe("scanDesignIssues — empty inputs", () => {
    it("returns an empty array when called with no arguments", () => {
        const issues = scanDesignIssues();
        assert.deepEqual(issues, []);
    });

    it("returns an empty array when all inputs are null or empty", () => {
        const issues = scanDesignIssues({ scene: null, actors: [], combat: null });
        assert.deepEqual(issues, []);
    });
});

describe("DesignIssueScanner", () => {
    it("exposes category-specific scan methods for future rule expansion", () => {
        const scanner = new DesignIssueScanner();

        assert.equal(scanner.scanSceneIssues(makeScene()).length, 0);
        assert.equal(scanner.scanActorIssues([makeActor()]).length, 0);
        assert.equal(scanner.scanEncounterIssues(makeCombat()).length, 0);
    });
});

// ---------------------------------------------------------------------------
// Scene issues — background, walls, lighting
// ---------------------------------------------------------------------------

describe("scanDesignIssues — scene checks", () => {
    it("reports no issues for a well-formed scene", () => {
        const scene = makeScene({ darkness: 0, walls: { size: 4 }, lights: { size: 0 } });
        const issues = scanDesignIssues({ scene });
        assert.deepEqual(issues, []);
    });

    it("flags a scene with no background src", () => {
        const scene = makeScene({ background: { src: "" } });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-background"), "expected scene.no-background");
        const issue = issues.find((i) => i.id === "scene.no-background");
        assert.equal(issue.category, "scene");
        assert.equal(issue.severity, "warning");
        assert.equal(issue.subjectId, "scene-1");
        assert.equal(issue.subjectType, "Scene");
        assert.equal(issue.navigateAction, "navigate.scene.config");
    });

    it("flags a scene with null background", () => {
        const scene = makeScene({ background: null, img: null });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-background"));
    });

    it("accepts an old source img fallback as background without touching the Scene img getter", () => {
        const scene = makeScene({ background: null, _source: { img: "scenes/fallback.webp" } });
        Object.defineProperty(scene, "img", {
            get() {
                throw new Error("deprecated Scene#img getter was touched");
            }
        });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.no-background"), "should not flag source img fallback");
    });

    it("accepts live background data when an empty draft source has not caught up", () => {
        const scene = makeScene({
            _source: { background: { src: "" } },
            background: { src: "scenes/saved-map.webp" }
        });
        const issues = scanDesignIssues({ scene });

        assert.ok(!issues.some((i) => i.id === "scene.no-background"), "should not flag saved live background");
    });

    it("flags a scene with no walls", () => {
        const scene = makeScene({ walls: { size: 0 } });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-walls"), "expected scene.no-walls");
        const issue = issues.find((i) => i.id === "scene.no-walls");
        assert.equal(issue.severity, "info");
        assert.equal(issue.navigateAction, "navigate.scene.walls");
    });

    it("accepts a scene whose walls is an empty array as no-walls", () => {
        const scene = makeScene({ walls: [] });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-walls"));
    });

    it("flags a dark scene with no lights", () => {
        const scene = makeScene({ environment: { darknessLevel: 0.6 }, lights: { size: 0 } });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.dark-no-lights"), "expected scene.dark-no-lights");
        const issue = issues.find((i) => i.id === "scene.dark-no-lights");
        assert.equal(issue.severity, "warning");
        assert.match(issue.detail, /60%/);
        assert.equal(issue.navigateAction, "navigate.scene.lights");
    });

    it("uses environment.darknessLevel without touching deprecated scene.darkness", () => {
        const scene = makeScene({
            environment: { darknessLevel: 0.7 },
            lights: { size: 0 }
        });
        Object.defineProperty(scene, "darkness", {
            get() {
                throw new Error("deprecated darkness getter was accessed");
            }
        });

        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.dark-no-lights");

        assert.ok(issue, "expected scene.dark-no-lights");
        assert.match(issue.detail, /70%/);
    });

    it("does not flag darkness if lights are placed", () => {
        const scene = makeScene({ darkness: 0.8, lights: { size: 3 } });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.dark-no-lights"));
    });

    it("does not flag darkness if darkness is 0", () => {
        const scene = makeScene({ darkness: 0, lights: { size: 0 } });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.dark-no-lights"));
    });

    it("includes the scene name in issue detail text", () => {
        const scene = makeScene({ name: "Grimshaw Mausoleum", background: { src: "" } });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.no-background");
        assert.match(issue.detail, /Grimshaw Mausoleum/);
    });
});

// ---------------------------------------------------------------------------
// Scene issues — token checks
// ---------------------------------------------------------------------------

describe("scanDesignIssues — scene token checks", () => {
    it("flags a scene with no tokens placed", () => {
        const scene = makeScene({ tokens: { size: 0, contents: [] } });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.no-tokens");
        assert.ok(issue, "expected scene.no-tokens");
        assert.equal(issue.category, "scene");
        assert.equal(issue.severity, "info");
        assert.equal(issue.subjectType, "Scene");
        assert.equal(issue.navigateAction, "navigate.scene.tokens");
    });

    it("flags a scene with tokens array of length 0", () => {
        const scene = makeScene({ tokens: [] });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-tokens"));
    });

    it("does not flag no-tokens when tokens are present", () => {
        const scene = makeScene({ tokens: { contents: [makeToken()] } });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.no-tokens"));
    });

    it("does not report no-player-tokens or vision issues when no tokens exist (no-tokens takes precedence)", () => {
        const scene = makeScene({ tokens: [] });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.no-player-tokens"));
        assert.ok(!issues.some((i) => i.id.startsWith("scene.token-no-vision")));
    });

    it("flags a scene where all tokens have hasPlayerOwner false", () => {
        const token = makeToken({ hasPlayerOwner: false });
        const scene = makeScene({ tokens: { contents: [token] } });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.no-player-tokens");
        assert.ok(issue, "expected scene.no-player-tokens");
        assert.equal(issue.severity, "warning");
        assert.equal(issue.subjectType, "Scene");
        assert.equal(issue.navigateAction, "navigate.scene.tokens");
    });

    it("does not flag no-player-tokens when at least one token has hasPlayerOwner true", () => {
        const t1 = makeToken({ id: "t1", hasPlayerOwner: false });
        const t2 = makeToken({ id: "t2", hasPlayerOwner: true });
        const scene = makeScene({ tokens: { contents: [t1, t2] } });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id === "scene.no-player-tokens"));
    });

    it("flags each token with vision disabled", () => {
        const t1 = makeToken({ id: "t1", name: "Constable Webb", sight: { enabled: false } });
        const t2 = makeToken({ id: "t2", name: "Inspector Ashworth", sight: { enabled: true } });
        const scene = makeScene({ tokens: { contents: [t1, t2] } });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.token-no-vision.t1"), "expected vision issue for t1");
        assert.ok(!issues.some((i) => i.id === "scene.token-no-vision.t2"), "t2 has vision, should not be flagged");
    });

    it("token vision issue uses severity info and subjectType Token", () => {
        const t1 = makeToken({ id: "t1", name: "Pale Constable", sight: { enabled: false } });
        const scene = makeScene({ tokens: { contents: [t1] } });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.token-no-vision.t1");
        assert.equal(issue.severity, "info");
        assert.equal(issue.subjectType, "Token");
        assert.equal(issue.subjectId, "t1");
        assert.equal(issue.navigateAction, "navigate.scene.tokens");
    });

    it("token vision issue title includes the token name", () => {
        const t1 = makeToken({ id: "t1", name: "Grimshaw", sight: { enabled: false } });
        const scene = makeScene({ tokens: { contents: [t1] } });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.token-no-vision.t1");
        assert.match(issue.title, /Grimshaw/);
    });

    it("does not flag vision for a token with sight enabled", () => {
        const scene = makeScene({
            tokens: { contents: [makeToken({ sight: { enabled: true } })] }
        });
        const issues = scanDesignIssues({ scene });
        assert.ok(!issues.some((i) => i.id.startsWith("scene.token-no-vision")));
    });

    it("flags no-player-tokens AND vision issues together when both are present", () => {
        const t1 = makeToken({ id: "t1", hasPlayerOwner: false, sight: { enabled: false } });
        const scene = makeScene({ tokens: { contents: [t1] } });
        const issues = scanDesignIssues({ scene });
        assert.ok(issues.some((i) => i.id === "scene.no-player-tokens"));
        assert.ok(issues.some((i) => i.id === "scene.token-no-vision.t1"));
    });

    it("includes scene name in no-player-tokens detail", () => {
        const scene = makeScene({
            name: "Irongate Station",
            tokens: { contents: [makeToken({ hasPlayerOwner: false })] }
        });
        const issues = scanDesignIssues({ scene });
        const issue = issues.find((i) => i.id === "scene.no-player-tokens");
        assert.match(issue.detail, /Irongate Station/);
    });
});

// ---------------------------------------------------------------------------
// Actor issues
// ---------------------------------------------------------------------------

describe("scanDesignIssues — actor checks", () => {
    it("reports no issues for a well-formed hero", () => {
        const actor = makeActor();
        const issues = scanDesignIssues({ actors: [actor] });
        assert.deepEqual(issues, []);
    });

    it("flags an actor with no portrait (null img)", () => {
        const actor = makeActor({ img: null });
        const issues = scanDesignIssues({ actors: [actor] });
        const issue = issues.find((i) => i.id === "actor.no-portrait.actor-1");
        assert.ok(issue, "expected actor.no-portrait");
        assert.equal(issue.category, "actor");
        assert.equal(issue.severity, "info");
        assert.equal(issue.subjectId, "actor-1");
        assert.equal(issue.subjectType, "Actor");
        assert.equal(issue.navigateAction, "navigate.actor");
    });

    it("flags an actor with the Foundry default mystery-man image", () => {
        const actor = makeActor({ img: "icons/svg/mystery-man.svg" });
        const issues = scanDesignIssues({ actors: [actor] });
        assert.ok(issues.some((i) => i.id === "actor.no-portrait.actor-1"));
    });

    it("flags an actor with an empty-string img", () => {
        const actor = makeActor({ img: "" });
        const issues = scanDesignIssues({ actors: [actor] });
        assert.ok(issues.some((i) => i.id === "actor.no-portrait.actor-1"));
    });

    it("flags a hero with no profession item", () => {
        const actor = makeActor({ items: [] });
        const issues = scanDesignIssues({ actors: [actor] });
        const issue = issues.find((i) => i.id === "actor.no-profession.actor-1");
        assert.ok(issue, "expected actor.no-profession");
        assert.equal(issue.severity, "warning");
        assert.equal(issue.navigateAction, "navigate.actor");
    });

    it("does not flag a villain for missing profession", () => {
        const actor = makeActor({ type: "villain", items: [] });
        const issues = scanDesignIssues({ actors: [actor] });
        assert.ok(!issues.some((i) => i.id.startsWith("actor.no-profession")));
    });

    it("does not flag a pawn for missing profession", () => {
        const actor = makeActor({ type: "pawn", items: [] });
        const issues = scanDesignIssues({ actors: [actor] });
        assert.ok(!issues.some((i) => i.id.startsWith("actor.no-profession")));
    });

    it("accepts items as a plain array (no .contents wrapper)", () => {
        const actor = makeActor({ items: [{ id: "item-1", type: "profession" }] });
        const issues = scanDesignIssues({ actors: [actor] });
        assert.ok(!issues.some((i) => i.id.startsWith("actor.no-profession")));
    });

    it("scopes issue ids to the actor id, allowing multiple actors to have the same issue type", () => {
        const a1 = makeActor({ id: "a1", img: null });
        const a2 = makeActor({ id: "a2", img: null });
        const issues = scanDesignIssues({ actors: [a1, a2] });
        assert.ok(issues.some((i) => i.id === "actor.no-portrait.a1"));
        assert.ok(issues.some((i) => i.id === "actor.no-portrait.a2"));
    });

    it("includes the actor name in issue title", () => {
        const actor = makeActor({ name: "Elspeth Crane", items: [] });
        const issues = scanDesignIssues({ actors: [actor] });
        const issue = issues.find((i) => i.id.startsWith("actor.no-profession"));
        assert.match(issue.title, /Elspeth Crane/);
    });
});

// ---------------------------------------------------------------------------
// Encounter issues
// ---------------------------------------------------------------------------

describe("scanDesignIssues — encounter checks", () => {
    it("returns no issues when all combatants have initiative", () => {
        const combat = makeCombat([
            makeCombatant({ id: "c1", initiative: 18 }),
            makeCombatant({ id: "c2", initiative: 7 })
        ]);
        const issues = scanDesignIssues({ combat });
        assert.deepEqual(issues, []);
    });

    it("flags a combatant with null initiative", () => {
        const combat = makeCombat([
            makeCombatant({ id: "c1", initiative: 12 }),
            makeCombatant({ id: "c2", name: "Pale Constable", initiative: null })
        ]);
        const issues = scanDesignIssues({ combat });
        const issue = issues.find((i) => i.id === "encounter.no-initiative.c2");
        assert.ok(issue, "expected encounter.no-initiative.c2");
        assert.equal(issue.category, "encounter");
        assert.equal(issue.severity, "warning");
        assert.equal(issue.subjectId, "c2");
        assert.equal(issue.subjectType, "Combatant");
        assert.equal(issue.navigateAction, "navigate.combat");
    });

    it("flags a combatant with undefined initiative", () => {
        const combat = makeCombat([makeCombatant({ id: "c1", initiative: undefined })]);
        const issues = scanDesignIssues({ combat });
        assert.ok(issues.some((i) => i.id === "encounter.no-initiative.c1"));
    });

    it("does not flag a combatant with initiative of 0", () => {
        const combat = makeCombat([makeCombatant({ id: "c1", initiative: 0 })]);
        const issues = scanDesignIssues({ combat });
        assert.ok(!issues.some((i) => i.id === "encounter.no-initiative.c1"));
    });

    it("accepts combatants as a plain array", () => {
        const combat = { id: "combat-1", combatants: [makeCombatant({ id: "c1", initiative: null })] };
        const issues = scanDesignIssues({ combat });
        assert.ok(issues.some((i) => i.id === "encounter.no-initiative.c1"));
    });

    it("falls back to token name and actor name when combatant has no name", () => {
        const combatant = { id: "c1", initiative: null, token: { name: "The Pale Kennel Jackal" } };
        const combat = makeCombat([combatant]);
        const issues = scanDesignIssues({ combat });
        assert.match(issues[0].title, /Pale Kennel Jackal/);
    });
});

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

describe("scanDesignIssues — combined output", () => {
    it("returns issues from all three categories in a single call", () => {
        const scene = makeScene({
            background: { src: "" },
            walls: { size: 0 },
            darkness: 0.5,
            lights: { size: 0 },
            tokens: { contents: [makeToken()] }
        });
        const actors = [makeActor({ img: null, items: [] })];
        const combat = makeCombat([makeCombatant({ id: "c1", initiative: null })]);
        const issues = scanDesignIssues({ scene, actors, combat });

        const categories = [...new Set(issues.map((i) => i.category))];
        assert.ok(categories.includes("scene"), "missing scene issues");
        assert.ok(categories.includes("actor"), "missing actor issues");
        assert.ok(categories.includes("encounter"), "missing encounter issues");
    });

    it("all returned issues have the required fields", () => {
        const scene = makeScene({ background: { src: "" } });
        const actors = [makeActor({ img: null })];
        const issues = scanDesignIssues({ scene, actors });
        for (const issue of issues) {
            assert.ok(typeof issue.id === "string" && issue.id, `missing id on ${JSON.stringify(issue)}`);
            assert.ok(typeof issue.category === "string", `missing category`);
            assert.ok(issue.severity === "warning" || issue.severity === "info", `invalid severity: ${issue.severity}`);
            assert.ok(typeof issue.title === "string" && issue.title, `missing title`);
            assert.ok(typeof issue.detail === "string" && issue.detail, `missing detail`);
            assert.ok(typeof issue.subjectId === "string", `missing subjectId`);
            assert.ok(typeof issue.subjectType === "string", `missing subjectType`);
            assert.ok("navigateAction" in issue, `missing navigateAction field`);
        }
    });
});
