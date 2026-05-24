import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_DESIGN_ACTION_REGISTRY,
    WorkspaceDesignActionRegistry
} from "../../module/ui/workspace-v2/design-action-registry.mjs";

describe("WorkspaceDesignActionRegistry", () => {
    it("returns defensive copies of registered actions", () => {
        const registry = new WorkspaceDesignActionRegistry({
            actions: [
                { id: "test.one", label: "One", contexts: ["map"], relevance: 1 }
            ]
        });

        const action = registry.get("test.one");
        action.label = "Changed";
        action.contexts.push("compendium");

        assert.equal(registry.get("test.one").label, "One");
        assert.deepEqual(registry.get("test.one").contexts, ["map"]);
    });

    it("filters actions by panel context and GM access", () => {
        const registry = new WorkspaceDesignActionRegistry({
            actions: [
                { id: "map.gm", label: "Map GM", contexts: ["map"], requiredRole: "gm", relevance: 10 },
                { id: "map.any", label: "Map Any", contexts: ["map"], requiredRole: "any", relevance: 8 },
                { id: "item.any", label: "Item Any", contexts: ["compendium"], requiredRole: "any", relevance: 6 }
            ]
        });

        assert.deepEqual(
            registry.getApplicableActions({ panelId: "map", isGM: false }).map((action) => action.id),
            ["map.any"]
        );
        assert.deepEqual(
            registry.getApplicableActions({ panelId: "map", isGM: true }).map((action) => action.id),
            ["map.gm", "map.any"]
        );
    });

    it("includes wildcard fallback actions for unknown panels", () => {
        const actions = DEFAULT_DESIGN_ACTION_REGISTRY.getApplicableActions({
            panelId: "unknown-panel",
            isGM: true
        });

        assert.deepEqual(actions.map((action) => action.id), ["inspect.context", "design.issues"]);
    });

    it("rejects duplicate action ids", () => {
        assert.throws(() => new WorkspaceDesignActionRegistry({
            actions: [
                { id: "duplicate", label: "First" },
                { id: "duplicate", label: "Second" }
            ]
        }), /Duplicate design action id/);
    });
});
