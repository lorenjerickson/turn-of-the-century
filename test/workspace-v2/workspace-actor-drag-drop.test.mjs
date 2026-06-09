import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("workspace actor drag and drop", () => {
    it("marks map panels as actor drop targets with scene ids", () => {
        assert.match(workspaceRootSource, /data-scene-actor-drop-target="true"/);
        assert.match(workspaceRootSource, /data-scene-id="\$\{this\.\#escapeHTML\(sceneId\)\}"/);
    });

    it("wires actor list drag payloads to scene actor drops", () => {
        assert.match(workspaceRootSource, /buildActorListDragPayload\(\{/);
        assert.match(workspaceRootSource, /event\.dataTransfer\.setData\(ACTOR_LIST_DRAG_MIME, JSON\.stringify\(payload\)\)/);
        assert.match(workspaceRootSource, /parseActorListDragPayload\(rawPayload\)/);
        assert.match(workspaceRootSource, /await this\.\#addActorsToScene\(actors, \{ scene \}\)/);
    });

    it("styles actor drag rows and map drop targets", () => {
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\.is-dragging\s*\{[\s\S]*opacity:\s*0\.56;/);
        assert.match(styles, /\.totc-v2-map-panel\.is-actor-drop-target\s*\{[\s\S]*border-color:\s*rgba\(251, 191, 36, 0\.72\);/);
    });
});
