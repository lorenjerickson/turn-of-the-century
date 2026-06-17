import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");

describe("actor editor open behavior", () => {
    it("opens actor editor via panel restore instead of forcing below actor list", () => {
        assert.match(workspaceRootSource, /openActorEditor: \(\) => this\.#openActorEditorPanel\(\),/);
        assert.match(workspaceRootSource, /async #openActorEditorPanel\(\)/);
        assert.match(workspaceRootSource, /this\.layoutEngine\.restorePanel\(panelDef, \{ preferredDockId: panelDef\.defaultDock \?\? "rightDock" \}\)/);
        assert.doesNotMatch(workspaceRootSource, /#openActorEditorBelowList\(/);
        assert.doesNotMatch(workspaceRootSource, /zone: "local-bottom"/);
    });

    it("does not clear actor details from actor-list selection when no token is selected", () => {
        assert.match(workspaceRootSource, /#syncActorDetailsToTokenSelection\(scene = canvas\?\.scene \?\? null\) \{/);
        assert.match(workspaceRootSource, /if \(!this\.selectedTokenIds\.size\) return;/);
        assert.match(workspaceRootSource, /this\.actorWorkspaceController\.clearDetails\(\)/);
    });
});
