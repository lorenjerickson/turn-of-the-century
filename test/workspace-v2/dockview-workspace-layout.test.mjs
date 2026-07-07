import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

const rootDir = process.cwd();
const rootAppSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const dockviewFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/dockview-workspace-layout-feature.mjs"), "utf8");
const systemManifestSource = readFileSync(join(rootDir, "system.json"), "utf8");
const packageManifestSource = readFileSync(join(rootDir, "package.json"), "utf8");
const stylesheetSource = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("Dockview workspace layout integration", () => {
    it("uses the Dockview workspace layout feature in the root app", () => {
        assert.match(rootAppSource, /import \{ DockviewWorkspaceLayoutFeature \}/);
        assert.match(rootAppSource, /new DockviewWorkspaceLayoutFeature\(\{/);
        assert.doesNotMatch(rootAppSource, /new WorkspaceLayoutFeature\(\{/);
    });

    it("loads vendored Dockview assets through the Foundry manifest", () => {
        const manifest = JSON.parse(systemManifestSource);
        const packageManifest = JSON.parse(packageManifestSource);
        assert.ok(manifest.styles.includes("module/vendor/dockview/dockview.css"));
        assert.ok(manifest.styles.includes("styles/system-styles.css"));
        assert.equal(packageManifest.scripts["vendor:dockview"], "node scripts/vendor-dockview.mjs");
    });

    it("imports the vendored Dockview bundle and preserves the map aperture component", () => {
        assert.match(dockviewFeatureSource, /from "\.\.\/\.\.\/\.\.\/vendor\/dockview\/main\.esm\.mjs"/);
        assert.match(dockviewFeatureSource, /createDockview\(host/);
        assert.match(dockviewFeatureSource, /DOCKVIEW_PANEL_COMPONENTS\.nativeMapAperture/);
        assert.match(dockviewFeatureSource, /withDockviewWorkspaceState/);
    });

    it("configures edge groups and panel visibility without falling back to legacy docking defaults", () => {
        assert.match(dockviewFeatureSource, /const MIN_SIDE_DOCK_WIDTH = 250;/);
        assert.match(dockviewFeatureSource, /leftDock: \{ initialSize: 320, minimumSize: MIN_SIDE_DOCK_WIDTH/);
        assert.match(dockviewFeatureSource, /rightDock: \{ initialSize: 360, minimumSize: MIN_SIDE_DOCK_WIDTH/);
        assert.match(dockviewFeatureSource, /normalizeDockviewSideEdgeGroupSizes/);
        assert.match(dockviewFeatureSource, /#configureEdgeGroupConstraints/);
        assert.match(dockviewFeatureSource, /setConstraints\?\.\(\{ minimumWidth: MIN_SIDE_DOCK_WIDTH \}\)/);
        assert.match(dockviewFeatureSource, /setHeaderPosition/);
        assert.match(dockviewFeatureSource, /#wireDockviewPanelVisibilityHandlers/);
        assert.match(dockviewFeatureSource, /stopImmediatePropagation/);
        assert.match(dockviewFeatureSource, /#saveDockviewStateWithLegacyLayout/);
        assert.match(dockviewFeatureSource, /getEdgeGroup/);
        assert.match(dockviewFeatureSource, /addEdgeGroup/);
        assert.match(dockviewFeatureSource, /onDidRemoveView\(\(\) => \{/);
        assert.match(dockviewFeatureSource, /#collapseEmptyEdgeGroups/);
        assert.match(dockviewFeatureSource, /groupApi\.collapse/);
        assert.match(dockviewFeatureSource, /#configureEdgeGroupDropZones/);
        assert.match(dockviewFeatureSource, /\["top", "bottom", "center"\]/);
        assert.match(dockviewFeatureSource, /\["left", "right", "center"\]/);
        assert.match(dockviewFeatureSource, /pointerDropTarget\?\.setTargetZones/);
    });

    it("restores Dockview header controls for the active tab group", () => {
        assert.match(dockviewFeatureSource, /createRightHeaderActionComponent/);
        assert.match(dockviewFeatureSource, /dataset\.dockviewAction = action/);
        assert.match(dockviewFeatureSource, /#createDockviewHeaderButton\("minimize"/);
        assert.match(dockviewFeatureSource, /#createDockviewHeaderButton\("maximize"/);
        assert.match(dockviewFeatureSource, /#createDockviewHeaderButton\("detach"/);
        assert.match(dockviewFeatureSource, /#createDockviewHeaderButton\("close"/);
        assert.match(dockviewFeatureSource, /addFloatingGroup\?\.\(panel/);
        assert.match(dockviewFeatureSource, /removePanel\?\.\(panel\)/);
        assert.match(dockviewFeatureSource, /layoutEngine\?\.closePanel/);
    });

    it("detects the native aperture from grid groups instead of global active Dockview focus", () => {
        assert.match(dockviewFeatureSource, /#getActiveGridMapPanelEntry/);
        assert.match(dockviewFeatureSource, /group\?\.api\?\.location\?\.type !== "grid"/);
        assert.match(dockviewFeatureSource, /totc-v2-native-map-group/);
    });

    it("keeps the Dockview shell full height while preserving pointer passthrough", () => {
        assert.match(stylesheetSource, /\.totc-v2-dockview-host \{[\s\S]*height: 100%;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-host \.dv-shell,[\s\S]*\.totc-v2-dockview-host \.dv-split-view-container,[\s\S]*height: 100%;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-host \.dv-split-view-container \.dv-view-container \.dv-view \{[\s\S]*position: absolute;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-host \.dv-groupview \{[\s\S]*display: flex;/);
        assert.match(stylesheetSource, /\.totc-workspace-v2-shell--dockview \{[\s\S]*pointer-events: none;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-host,[\s\S]*pointer-events: auto;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-layout\.has-native-canvas-aperture[\s\S]*background: transparent;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-layout\.has-native-canvas-aperture \.totc-v2-dockview-host,[\s\S]*\.totc-v2-dockview-layout\.has-native-canvas-aperture \.dv-content-container \{[\s\S]*pointer-events: none;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-layout\.has-native-canvas-aperture \.dv-tabs-and-actions-container,[\s\S]*\.totc-v2-dockview-layout\.has-native-canvas-aperture \.dv-sash,[\s\S]*pointer-events: auto;/);
        assert.match(stylesheetSource, /--dv-sash-color: rgba\(180, 130, 52, 0\.28\);/);
        assert.match(stylesheetSource, /\.totc-v2-native-map-group,[\s\S]*background: transparent;/);
        assert.match(stylesheetSource, /\.dv-groupview:has\(\.totc-v2-dockview-panel--native-map\),[\s\S]*background: transparent;/);
        assert.match(stylesheetSource, /\.dv-default-tab \*,[\s\S]*pointer-events: auto;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-panel:not\(\.totc-v2-dockview-panel--native-map\) \{[\s\S]*pointer-events: auto;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-panel--native-map \* \{[\s\S]*pointer-events: none;/);
    });

    it("keeps Dockview regions full height while top-aligning panel view contents", () => {
        assert.match(stylesheetSource, /\.totc-v2-dockview-host \.dv-split-view-container \.dv-view-container \.dv-view \{[\s\S]*height: 100%;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-panel \{[\s\S]*height: 100%;[\s\S]*justify-content: flex-start;[\s\S]*padding: 6px;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-panel > :not\(\.totc-v2-map-panel\) \{[\s\S]*flex: 0 0 auto;[\s\S]*height: auto;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-panel > \.totc-v2-map-panel \{[\s\S]*flex: 1 1 auto;/);
        assert.match(stylesheetSource, /\.totc-v2-dockview-header-actions \{[\s\S]*display: flex;/);
    });
});
