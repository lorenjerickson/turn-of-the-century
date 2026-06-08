import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildDesignIssuesPanelModel,
    renderDesignIssuesPanel
} from "../../module/ui/workspace-v2/panels/design-issues-panel.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeToken(overrides = {}) {
    return {
        id: "token-1",
        name: "Dr. Verena Holt",
        hasPlayerOwner: true,
        sight: { enabled: true },
        ...overrides
    };
}

function makeScene(overrides = {}) {
    return {
        id: "scene-1",
        name: "Irongate Station",
        img: "scenes/irongate.webp",
        walls: { size: 8 },
        lights: { size: 0 },
        darkness: 0,
        // Provide one well-formed token by default so panel model tests stay clean
        tokens: { contents: [makeToken()] },
        ...overrides
    };
}

function makeActor(overrides = {}) {
    return {
        id: "actor-1",
        name: "Dr. Verena Holt",
        type: "hero",
        img: "actors/holt.webp",
        items: [{ id: "item-1", type: "profession" }],
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

describe("buildDesignIssuesPanelModel", () => {
    it("returns a clean model when no issues exist", () => {
        const model = buildDesignIssuesPanelModel({
            scene: makeScene(),
            actors: [makeActor()],
            combat: null
        });
        assert.equal(model.hasIssues, false);
        assert.equal(model.totalCount, 0);
        assert.deepEqual(model.categories, []);
    });

    it("groups issues into categories in scene → actor → encounter order", () => {
        const scene = makeScene({ img: "" });
        const actor = makeActor({ img: null });
        const model = buildDesignIssuesPanelModel({ scene, actors: [actor] });

        assert.equal(model.hasIssues, true);
        const catIds = model.categories.map((c) => c.id);
        // scene before actor
        assert.ok(catIds.indexOf("scene") < catIds.indexOf("actor"));
    });

    it("each category carries a human-readable label", () => {
        const scene = makeScene({ img: "" });
        const model = buildDesignIssuesPanelModel({ scene });
        const sceneCat = model.categories.find((c) => c.id === "scene");
        assert.equal(sceneCat.label, "Scene");
    });

    it("totalCount reflects the sum across all categories", () => {
        const scene = makeScene({ img: "", walls: { size: 0 } });
        const actor = makeActor({ img: null });
        const model = buildDesignIssuesPanelModel({ scene, actors: [actor] });
        assert.equal(model.totalCount, model.categories.reduce((sum, cat) => sum + cat.issues.length, 0));
    });
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function escape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

describe("renderDesignIssuesPanel", () => {
    it("renders the 'All clear' heading when there are no issues", () => {
        const model = buildDesignIssuesPanelModel({});
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.match(html, /All clear/);
        assert.match(html, /totc-v2-issues-panel__empty/);
    });

    it("renders issue count in the heading when issues exist", () => {
        const scene = makeScene({ img: "", walls: { size: 0 } });
        const model = buildDesignIssuesPanelModel({ scene });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.match(html, /2 issues found/);
    });

    it("renders singular 'issue' for a count of 1", () => {
        const scene = makeScene({ img: "" });
        const model = buildDesignIssuesPanelModel({ scene });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.match(html, /1 issue found/);
    });

    it("renders navigate-design-issue data-actions on issue buttons", () => {
        const scene = makeScene({ img: "" });
        const model = buildDesignIssuesPanelModel({ scene });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.match(html, /data-action="navigate-design-issue"/);
        assert.match(html, /data-navigate-action="navigate\.scene\.config"/);
    });

    it("escapes HTML in issue titles", () => {
        const scene = makeScene({ name: "Grim<shaw> & Sons" });
        // This will produce a detail mentioning the scene name — escaping must protect it
        const model = buildDesignIssuesPanelModel({
            scene: { ...scene, img: "" }
        });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.ok(!html.includes("<shaw>"), "unescaped HTML tag found in render output");
    });

    it("renders a warning severity class on warning issues", () => {
        const scene = makeScene({ img: "" });
        const model = buildDesignIssuesPanelModel({ scene });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        assert.match(html, /totc-v2-issues-panel__issue--warning/);
    });

    it("renders category sections in scene → actor → encounter order", () => {
        const scene = makeScene({ img: "" });
        const actor = makeActor({ img: null });
        const model = buildDesignIssuesPanelModel({ scene, actors: [actor] });
        const html = renderDesignIssuesPanel(model, { escapeHTML: escape });
        const scenePos = html.indexOf("Scene");
        const actorPos = html.indexOf("Actors");
        assert.ok(scenePos < actorPos, "scene category should appear before actor category");
    });
});
