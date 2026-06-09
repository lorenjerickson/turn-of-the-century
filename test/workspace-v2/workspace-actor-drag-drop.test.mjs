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
        assert.match(workspaceRootSource, /data-actor-drop-preview="true"/);
    });

    it("wires actor list drag payloads to scene actor drops", () => {
        assert.match(workspaceRootSource, /buildActorListDragPayload\(\{/);
        assert.match(workspaceRootSource, /event\.dataTransfer\.setData\(ACTOR_LIST_DRAG_MIME, JSON\.stringify\(payload\)\)/);
        assert.match(workspaceRootSource, /this\.\#setActorDragImage\(event\.dataTransfer, payload\.actorIds\)/);
        assert.match(workspaceRootSource, /dataTransfer\.setDragImage\(dragImage, 20, 20\)/);
        assert.match(workspaceRootSource, /actor\?\.prototypeToken\?\.texture\?\.src \?\? actor\?\.img/);
        assert.match(workspaceRootSource, /parseActorListDragPayload\(rawPayload\)/);
        assert.match(workspaceRootSource, /this\.\#renderActorDropPreview\(target, \{ actors, scene, event \}\)/);
        assert.match(workspaceRootSource, /await this\.\#addActorsToScene\(actors, \{ scene, anchorPosition \}\)/);
        assert.match(workspaceRootSource, /buildSceneActorTokenData\(\{ actors: selectedActors, scene, anchorPosition \}\)/);
    });

    it("separates actor drops from workspace panel docking drags", () => {
        assert.match(workspaceRootSource, /const WORKSPACE_PANEL_DRAG_MIME = "application\/x-totc-workspace-panel";/);
        assert.match(workspaceRootSource, /event\.dataTransfer\?\.setData\(WORKSPACE_PANEL_DRAG_MIME, panelId \?\? ""\)/);
        assert.match(workspaceRootSource, /if \(!dataTransferHasType\(event\.dataTransfer, WORKSPACE_PANEL_DRAG_MIME\)\) return;[\s\S]*event\.preventDefault\(\);/);
        assert.match(workspaceRootSource, /if \(!dataTransferHasType\(event\.dataTransfer, ACTOR_LIST_DRAG_MIME\)\) return;[\s\S]*event\.stopPropagation\(\);/);
    });

    it("styles actor drag rows and map drop targets", () => {
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\.is-dragging\s*\{[\s\S]*opacity:\s*0\.56;/);
        assert.match(styles, /\.totc-v2-map-panel\.is-actor-drop-target\s*\{[\s\S]*border-color:\s*rgba\(251, 191, 36, 0\.72\);/);
        assert.match(styles, /\.totc-v2-map-panel__actor-drop-preview\s*\{[\s\S]*transform-origin:\s*0 0;/);
        assert.match(styles, /\.totc-v2-map-panel__actor-drop-square\s*\{[\s\S]*position:\s*absolute;/);
        assert.match(styles, /\.totc-v2-actor-drag-image\s*\{[\s\S]*display:\s*grid;/);
        assert.match(styles, /\.totc-v2-actor-drag-image img,[\s\S]*\.totc-v2-actor-drag-image span\s*\{[\s\S]*height:\s*2\.5rem;[\s\S]*width:\s*2\.5rem;/);
    });
});
