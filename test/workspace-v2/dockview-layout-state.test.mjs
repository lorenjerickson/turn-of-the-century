import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DOCKVIEW_WORKSPACE_LAYOUT_VERSION,
    DOCKVIEW_PANEL_COMPONENTS,
    collectDockviewPanelDescriptors,
    createDockviewPanelDescriptor,
    getDockviewWorkspaceState,
    getLegacyActiveCenterMapPanel,
    isDockviewWorkspaceLayout,
    isNativeMapPanel,
    normalizeDockviewSideEdgeGroupSizes,
    withDockviewWorkspaceState
} from "../../module/ui/workspace-v2/dockview-layout-state.mjs";

describe("dockview layout state", () => {
    it("recognizes native map panels by base id and scene panel ids", () => {
        assert.equal(isNativeMapPanel({ id: "map" }), true);
        assert.equal(isNativeMapPanel({ id: "map.scene-1" }), false);
        assert.equal(isNativeMapPanel({ id: "map:scene-1" }), true);
        assert.equal(isNativeMapPanel({ id: "scene-map", baseId: "map" }), true);
        assert.equal(isNativeMapPanel({ id: "codex" }), false);
    });

    it("creates Dockview descriptors for native map apertures and normal panels", () => {
        assert.deepEqual(createDockviewPanelDescriptor({
            id: "map:scene-1",
            title: "Lobby",
            baseId: "map",
            sceneId: "scene-1"
        }), {
            id: "map:scene-1",
            title: "Lobby",
            component: DOCKVIEW_PANEL_COMPONENTS.nativeMapAperture,
            renderer: "onlyWhenVisible",
            params: {
                panel: {
                    id: "map:scene-1",
                    title: "Lobby",
                    baseId: "map",
                    sceneId: "scene-1"
                }
            }
        });

        assert.equal(createDockviewPanelDescriptor({
            id: "codex",
            title: "Codex"
        }).component, DOCKVIEW_PANEL_COMPONENTS.workspacePanel);
    });

    it("collects unique panel descriptors from legacy dock and floating layout", () => {
        const layout = {
            root: {
                centerDock: {
                    stacks: [{ panels: [{ id: "map:scene-1", title: "Lobby", baseId: "map" }] }]
                },
                leftDock: {
                    stacks: [{ panels: [{ id: "gamemaster", title: "GM Assistant" }] }]
                },
                topDock: { stacks: [] },
                rightDock: {
                    stacks: [{ panels: [{ id: "codex", title: "Codex" }] }]
                },
                bottomDock: {
                    stacks: [{ panels: [{ id: "codex", title: "Codex" }] }]
                },
                floatingWindows: [{ panel: { id: "camp", title: "Camp" } }]
            }
        };

        assert.deepEqual(
            collectDockviewPanelDescriptors(layout).map((descriptor) => descriptor.id),
            ["map:scene-1", "gamemaster", "codex", "camp"]
        );
    });

    it("stores versioned Dockview state alongside the legacy layout shape", () => {
        const layout = { version: 1, root: { centerDock: { stacks: [] } } };
        const dockview = { grid: { root: { type: "branch" } } };
        const nextLayout = withDockviewWorkspaceState(layout, dockview);

        assert.equal(DOCKVIEW_WORKSPACE_LAYOUT_VERSION, 3);
        assert.equal(isDockviewWorkspaceLayout(nextLayout), true);
        assert.deepEqual(getDockviewWorkspaceState(nextLayout).dockview, dockview);
        assert.deepEqual(nextLayout.root, layout.root);
    });

    it("normalizes restored side edge group widths without mutating saved state", () => {
        const dockview = {
            edgeGroups: {
                left: { size: 58, visible: true, group: { id: "left" } },
                right: { size: 249, visible: true, group: { id: "right" } },
                top: { size: 90, visible: true, group: { id: "top" } }
            }
        };

        const normalized = normalizeDockviewSideEdgeGroupSizes(dockview, 250);

        assert.equal(normalized.edgeGroups.left.size, 250);
        assert.equal(normalized.edgeGroups.right.size, 250);
        assert.equal(normalized.edgeGroups.top.size, 90);
        assert.equal(dockview.edgeGroups.left.size, 58);
    });

    it("falls back to the active legacy center map panel before Dockview mounts", () => {
        const layout = {
            root: {
                centerDock: {
                    stacks: [{
                        activePanelId: "map:scene-2",
                        panels: [
                            { id: "codex", title: "Codex" },
                            { id: "map:scene-2", title: "Library", baseId: "map", sceneId: "scene-2" }
                        ]
                    }]
                }
            }
        };

        assert.deepEqual(getLegacyActiveCenterMapPanel(layout), {
            id: "map:scene-2",
            title: "Library",
            baseId: "map",
            sceneId: "scene-2"
        });
    });
});
