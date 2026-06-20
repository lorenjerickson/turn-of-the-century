import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
    buildFoundryActorDragPayload,
    SceneActorDropController
} from "../../module/ui/workspace-v2/controllers/scene-actor-drop-controller.mjs";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const sceneActorDropControllerSource = readFileSync(
    join(rootDir, "module/ui/workspace-v2/controllers/scene-actor-drop-controller.mjs"),
    "utf8"
);
const actorWorkspaceControllerSource = readFileSync(
    join(rootDir, "module/ui/workspace-v2/controllers/actor-workspace-controller.mjs"),
    "utf8"
);
const workspacePanelHostSource = readFileSync(
    join(rootDir, "module/ui/workspace-v2/controllers/workspace-panel-host.mjs"),
    "utf8"
);
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("workspace actor drag and drop", () => {
    it("builds the native Foundry actor payload expected by canvas drops", () => {
        assert.deepEqual(buildFoundryActorDragPayload({ id: "actor-1", uuid: "Actor.actor-1" }), {
            type: "Actor",
            uuid: "Actor.actor-1"
        });
        assert.deepEqual(buildFoundryActorDragPayload({ id: "actor-2" }), {
            type: "Actor",
            uuid: "Actor.actor-2"
        });
        assert.equal(buildFoundryActorDragPayload(null), null);
    });

    it("writes a Foundry-compatible actor document to text/plain on dragstart", () => {
        const listeners = new Map();
        const row = {
            dataset: { actorId: "actor-1" },
            addEventListener: (type, handler) => listeners.set(type, handler),
            classList: { add() {}, remove() {} }
        };
        const writes = new Map();
        const dataTransfer = {
            types: [],
            setData(type, value) {
                writes.set(type, value);
                this.types.push(type);
            },
            setDragImage() {}
        };
        const controller = new SceneActorDropController({
            getActorById: () => ({ id: "actor-1", uuid: "Actor.actor-1", name: "Ada" }),
            documentRef: () => null,
            logger: { debug() {}, warn() {} }
        });

        controller.wireActorListDragHandlers({
            querySelectorAll: () => [row]
        });
        listeners.get("dragstart")({
            stopPropagation() {},
            dataTransfer
        });

        assert.deepEqual(JSON.parse(writes.get("text/plain")), {
            type: "Actor",
            uuid: "Actor.actor-1"
        });
        assert.deepEqual(JSON.parse(writes.get("application/x-totc-actor-list")), {
            actorIds: ["actor-1"]
        });
        assert.equal(dataTransfer.effectAllowed, "copy");
    });

    it("does not use workspace map panels as custom actor drop targets", () => {
        assert.match(workspacePanelHostSource, /data-native-canvas-panel="true"/);
        assert.match(workspacePanelHostSource, /data-scene-id="\$\{this\.escapeHTML\(sceneId\)\}"/);
        assert.doesNotMatch(workspacePanelHostSource, /data-map-viewport="true"/);
        assert.doesNotMatch(workspacePanelHostSource, /data-scene-actor-drop-target="true"/);
        assert.doesNotMatch(workspacePanelHostSource, /data-actor-drop-preview="true"/);
    });

    it("wires actor list drag payloads without workspace scene drop targets", () => {
        assert.match(workspaceRootSource, /this\.sceneActorDropController\.wireActorListDragHandlers\(this\.element\)/);
        assert.doesNotMatch(workspaceRootSource, /this\.sceneActorDropController\.wireSceneActorDropHandlers\(this\.element\)/);
        assert.match(sceneActorDropControllerSource, /buildActorListDragPayload\(\{/);
        assert.match(sceneActorDropControllerSource, /event\.dataTransfer\.setData\(ACTOR_LIST_DRAG_MIME, JSON\.stringify\(payload\)\)/);
        assert.match(sceneActorDropControllerSource, /event\.dataTransfer\.setData\("text\/plain", JSON\.stringify\(foundryPayload\)\)/);
        assert.match(sceneActorDropControllerSource, /this\.\#setDragImage\(event\.dataTransfer, payload\.actorIds\)/);
        assert.match(sceneActorDropControllerSource, /dataTransfer\.setDragImage\(dragImage, 20, 20\)/);
        assert.match(sceneActorDropControllerSource, /actor\?\.prototypeToken\?\.texture\?\.src \?\? actor\?\.img/);
        assert.doesNotMatch(sceneActorDropControllerSource, /renderActorDropPreview/);
        assert.doesNotMatch(sceneActorDropControllerSource, /data-scene-actor-drop-target/);
        assert.doesNotMatch(sceneActorDropControllerSource, /data-actor-drop-preview/);
        assert.match(workspaceRootSource, /getActorById: \(id\) => this\.\#getActorDocumentByReference\(id\)/);
        assert.match(workspaceRootSource, /#getActorDocumentByReference\(reference\)[\s\S]*id === actorUuid/);
        assert.match(workspaceRootSource, /logger: totcLogger/);
        assert.match(sceneActorDropControllerSource, /buildSceneActorTokenData\(\{ actors: selectedActors, scene, anchorPosition \}\)/);
    });

    it("separates actor drops from workspace panel docking drags", () => {
        assert.match(workspaceRootSource, /const WORKSPACE_PANEL_DRAG_MIME = "application\/x-totc-workspace-panel";/);
        assert.match(workspaceRootSource, /event\.dataTransfer\?\.setData\(WORKSPACE_PANEL_DRAG_MIME, panelId \?\? ""\)/);
        assert.match(workspaceRootSource, /if \(!dataTransferHasType\(event\.dataTransfer, WORKSPACE_PANEL_DRAG_MIME\)\) return;[\s\S]*event\.preventDefault\(\);/);
        assert.doesNotMatch(sceneActorDropControllerSource, /Workspace actor drop captured/);
    });

    it("styles actor drag rows without custom map drop target styles", () => {
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\.is-dragging\s*\{[\s\S]*opacity:\s*0\.56;/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__viewport\.is-actor-drop-target\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel\.is-actor-drop-target\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__actor-drop-preview\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__actor-drop-square\s*\{/);
        assert.match(styles, /\.totc-v2-actor-drag-image\s*\{[\s\S]*display:\s*grid;/);
        assert.match(styles, /\.totc-v2-actor-drag-image img,[\s\S]*\.totc-v2-actor-drag-image span\s*\{[\s\S]*height:\s*2\.5rem;[\s\S]*width:\s*2\.5rem;/);
    });

    it("supports compendium item drags onto actor editor forms", () => {
        assert.match(workspacePanelHostSource, /data-compendium-item-draggable="true"/);
        assert.match(workspacePanelHostSource, /draggable="true"[\s\S]*data-entry-uuid=/);
        assert.match(actorWorkspaceControllerSource, /const COMPENDIUM_ITEM_DRAG_MIME = "application\/x-totc-compendium-item";/);
        assert.match(actorWorkspaceControllerSource, /event\.dataTransfer\.setData\(COMPENDIUM_ITEM_DRAG_MIME, payload\)/);
        assert.match(actorWorkspaceControllerSource, /event\.dataTransfer\.setData\(TEXT_PLAIN_MIME, payload\)/);
        assert.match(actorWorkspaceControllerSource, /form\.addEventListener\("drop", async \(event\) => \{/);
        assert.match(actorWorkspaceControllerSource, /await this\.importItemToActor\(actor, payload\)/);
        assert.match(styles, /\.totc-v2-compendium-panel__entry\.is-dragging\s*\{[\s\S]*opacity:\s*0\.6;/);
        assert.match(styles, /\.totc-v2-actor-editor__form\.is-item-drop-target\s*\{[\s\S]*border-color:\s*rgba\(251, 191, 36, 0\.5\);/);
    });
});
