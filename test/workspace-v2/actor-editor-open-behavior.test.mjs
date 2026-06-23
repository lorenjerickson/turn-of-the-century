import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const actorFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/actor-management-feature.mjs"), "utf8");

describe("actor editor open behavior", () => {
    it("opens actor editor via panel restore instead of forcing below actor list", () => {
        assert.match(actorFeatureSource, /openActorEditor: \(\) => this\.#openActorEditorPanel\(\)/);
        assert.match(actorFeatureSource, /async #openActorEditorPanel\(\)/);
        assert.match(actorFeatureSource, /this\.layoutEngine\.restorePanel\(panelDef, \{ preferredDockId: panelDef\.defaultDock \?\? "rightDock" \}\)/);
        assert.doesNotMatch(actorFeatureSource, /#openActorEditorBelowList\(/);
        assert.doesNotMatch(actorFeatureSource, /zone: "local-bottom"/);
    });

    it("does not clear actor details from actor-list selection when no token is selected", () => {
        assert.match(actorFeatureSource, /#syncActorDetailsToTokenSelection\(scene\) \{/);
        assert.match(actorFeatureSource, /if \(!selectedTokenIds\.size\) return;/);
        assert.match(actorFeatureSource, /this\.actorWorkspaceController\.clearDetails\(\)/);
    });
});
